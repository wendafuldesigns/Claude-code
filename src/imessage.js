'use strict';

/**
 * iMessage integration via AppleScript (send) and chat.db (receive).
 * Requires macOS with the Messages app signed in to iMessage.
 *
 * Permissions needed:
 *   - Full Disk Access for the process (to read ~/Library/Messages/chat.db)
 *   - Accessibility / Automation permission for "Messages" app (for AppleScript)
 */

const { execFile } = require('child_process');
const path = require('path');
const os = require('os');

const DB_PATH = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');

// Lazily opened db connection so the module is importable on Linux too.
let _db = null;

function getDb() {
  if (!_db) {
    try {
      const Database = require('better-sqlite3');
      _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
      // WAL mode journal may need this to see live writes from Messages app.
      _db.pragma('journal_mode = WAL');
    } catch (err) {
      throw new Error(
        `Cannot open iMessage database at ${DB_PATH}.\n` +
        'Grant "Full Disk Access" to your terminal / Node process in\n' +
        'System Settings → Privacy & Security → Full Disk Access.\n\n' +
        `Original error: ${err.message}`
      );
    }
  }
  return _db;
}

/**
 * Send an iMessage.
 *
 * @param {string} recipient  Phone number (+1XXXXXXXXXX) or Apple ID email.
 * @param {string} text       Message body.
 * @returns {Promise<void>}
 */
function send(recipient, text) {
  // Escape recipient and text for AppleScript string literals.
  const safeRecipient = recipient.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const script = `
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${safeRecipient}" of targetService
  send "${safeText}" to targetBuddy
end tell`;

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`AppleScript error: ${stderr || err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Fetch the most recent N messages across all conversations.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit=50]        Max messages to return.
 * @param {string} [opts.handle]          Filter to a specific phone/email.
 * @param {number} [opts.sinceRowid]      Only return messages with rowid > this value.
 * @returns {Array<Message>}
 */
function getMessages({ limit = 50, handle, sinceRowid } = {}) {
  const db = getDb();

  let where = 'WHERE 1=1';
  const params = [];

  if (handle) {
    where += ' AND h.id = ?';
    params.push(handle);
  }
  if (sinceRowid != null) {
    where += ' AND m.rowid > ?';
    params.push(sinceRowid);
  }

  const sql = `
    SELECT
      m.rowid,
      m.guid,
      m.text,
      m.date,
      m.is_from_me,
      h.id   AS handle_id,
      c.chat_identifier
    FROM message m
    LEFT JOIN handle h      ON m.handle_id = h.rowid
    LEFT JOIN chat_message_join cmj ON cmj.message_id = m.rowid
    LEFT JOIN chat c        ON c.rowid = cmj.chat_id
    ${where}
    ORDER BY m.rowid DESC
    LIMIT ?`;

  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  return rows.map(row => ({
    rowid: row.rowid,
    guid: row.guid,
    text: row.text,
    date: appleEpochToDate(row.date),
    fromMe: row.is_from_me === 1,
    handle: row.is_from_me ? 'me' : (row.handle_id || row.chat_identifier),
    chatId: row.chat_identifier,
  }));
}

/**
 * List all conversations with their most recent message.
 *
 * @returns {Array<Conversation>}
 */
function getConversations() {
  const db = getDb();

  const sql = `
    SELECT
      c.rowid  AS chat_rowid,
      c.chat_identifier,
      c.display_name,
      m.text   AS last_message,
      m.date   AS last_date,
      m.is_from_me
    FROM chat c
    LEFT JOIN chat_message_join cmj ON cmj.chat_id = c.rowid
    LEFT JOIN message m ON m.rowid = (
      SELECT cm2.message_id
      FROM chat_message_join cm2
      WHERE cm2.chat_id = c.rowid
      ORDER BY cm2.message_id DESC
      LIMIT 1
    )
    GROUP BY c.rowid
    ORDER BY last_date DESC`;

  return db.prepare(sql).all().map(row => ({
    chatId: row.chat_identifier,
    displayName: row.display_name || row.chat_identifier,
    lastMessage: row.last_message,
    lastDate: appleEpochToDate(row.last_date),
    lastFromMe: row.is_from_me === 1,
  }));
}

/**
 * Poll for new messages every `intervalMs` milliseconds and call `callback`
 * with each batch of new messages.
 *
 * @param {function(Message[]): void} callback
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=5000]
 * @param {string} [opts.handle]           Filter to a specific contact.
 * @returns {{ stop: function(): void }}   Call stop() to end polling.
 */
function watch(callback, { intervalMs = 5000, handle } = {}) {
  // Seed the cursor with the current max rowid so we only surface new messages.
  let lastRowid = getLatestRowid();

  const timer = setInterval(() => {
    try {
      const messages = getMessages({ limit: 100, handle, sinceRowid: lastRowid });
      if (messages.length > 0) {
        lastRowid = messages[0].rowid; // messages are DESC by rowid
        callback(messages.reverse()); // deliver oldest-first
      }
    } catch (err) {
      callback([], err);
    }
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

function getLatestRowid() {
  const db = getDb();
  const row = db.prepare('SELECT MAX(rowid) AS max FROM message').get();
  return row?.max ?? 0;
}

// Apple's epoch starts 2001-01-01; JS epoch starts 1970-01-01.
// Apple stores nanoseconds since its epoch.
const APPLE_EPOCH_OFFSET_MS = 978307200000;

function appleEpochToDate(appleNs) {
  if (appleNs == null) return null;
  return new Date(Math.floor(appleNs / 1e6) + APPLE_EPOCH_OFFSET_MS);
}

module.exports = { send, getMessages, getConversations, watch };
