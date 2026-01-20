const express = require('express');
const router = express.Router();
const whatsapp = require('./whatsapp');

const getUserId = (req) => req.headers['x-user-id'] || 'default';

router.post('/session/init', async (req, res) => {
  try {
    const result = await whatsapp.initSession(getUserId(req));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/session/status', (req, res) => {
  try {
    res.json(whatsapp.getSessionStatus(getUserId(req)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/session/disconnect', async (req, res) => {
  try {
    res.json(await whatsapp.disconnectSession(getUserId(req)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/message/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'Missing to or message' });
    res.json(await whatsapp.sendMessage(getUserId(req), to, message));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
