'use strict';

/**
 * REST API wrapper for the iMessage module.
 *
 * Endpoints:
 *   GET  /conversations              — list all conversations
 *   GET  /messages?handle=&limit=    — fetch recent messages (optionally filtered)
 *   POST /messages  { to, text }     — send a message
 *
 * Run with:  node src/server.js
 * Default port: 3000  (override with PORT env var)
 */

const express = require('express');
const imessage = require('./imessage');

const app = express();
app.use(express.json());

// GET /conversations
app.get('/conversations', (req, res) => {
  try {
    res.json(imessage.getConversations());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /messages?handle=+1XXXXXXXXXX&limit=50&sinceRowid=0
app.get('/messages', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const sinceRowid = req.query.sinceRowid ? parseInt(req.query.sinceRowid, 10) : undefined;
    const messages = imessage.getMessages({
      limit,
      handle: req.query.handle,
      sinceRowid,
    });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /messages  body: { to: "...", text: "..." }
app.post('/messages', async (req, res) => {
  const { to, text } = req.body ?? {};
  if (!to || !text) {
    return res.status(400).json({ error: '"to" and "text" are required' });
  }
  try {
    await imessage.send(to, text);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`iMessage REST API listening on http://localhost:${PORT}`);
  console.log('  GET  /conversations');
  console.log('  GET  /messages?handle=<phone|email>&limit=50');
  console.log('  POST /messages   { "to": "<phone|email>", "text": "<body>" }');
});
