#!/usr/bin/env node
'use strict';

/**
 * CLI for iMessage integration.
 *
 * Usage:
 *   node src/cli.js send +1XXXXXXXXXX "Hello!"
 *   node src/cli.js conversations
 *   node src/cli.js messages [handle] [limit]
 *   node src/cli.js watch [handle]
 */

const imessage = require('./imessage');

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'send': {
      const [recipient, ...textParts] = args;
      const text = textParts.join(' ');
      if (!recipient || !text) {
        console.error('Usage: node src/cli.js send <recipient> <message>');
        process.exit(1);
      }
      await imessage.send(recipient, text);
      console.log(`Sent to ${recipient}: "${text}"`);
      break;
    }

    case 'conversations': {
      const convos = imessage.getConversations();
      if (convos.length === 0) {
        console.log('No conversations found.');
        break;
      }
      for (const c of convos) {
        const date = c.lastDate ? c.lastDate.toLocaleString() : '—';
        const from = c.lastFromMe ? 'You' : c.displayName;
        console.log(`[${date}] ${c.displayName}: ${from}: ${c.lastMessage ?? '(no text)'}`);
      }
      break;
    }

    case 'messages': {
      const [handle, limitStr] = args;
      const limit = limitStr ? parseInt(limitStr, 10) : 20;
      const messages = imessage.getMessages({ limit, handle });
      if (messages.length === 0) {
        console.log('No messages found.');
        break;
      }
      for (const m of messages.reverse()) {
        const date = m.date ? m.date.toLocaleString() : '—';
        const from = m.fromMe ? 'Me' : (m.handle || '?');
        console.log(`[${date}] ${from}: ${m.text ?? '(attachment)'}`);
      }
      break;
    }

    case 'watch': {
      const [handle] = args;
      console.log(`Watching for new messages${handle ? ` from ${handle}` : ''}… (Ctrl+C to stop)`);
      const watcher = imessage.watch((msgs, err) => {
        if (err) {
          console.error('Watch error:', err.message);
          return;
        }
        for (const m of msgs) {
          const date = m.date ? m.date.toLocaleString() : '—';
          const from = m.fromMe ? 'Me' : (m.handle || '?');
          console.log(`[${date}] ${from}: ${m.text ?? '(attachment)'}`);
        }
      }, { handle });

      process.on('SIGINT', () => {
        watcher.stop();
        console.log('\nStopped.');
        process.exit(0);
      });
      break;
    }

    default:
      console.log(`iMessage CLI

Commands:
  send <recipient> <message>   Send a message (phone/email)
  conversations                List all conversations
  messages [handle] [limit]    Show recent messages
  watch [handle]               Stream new messages in real time`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
