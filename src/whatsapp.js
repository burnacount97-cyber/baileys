const { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const sessions = new Map();
const sessionStates = new Map();
const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

async function initSession(userId) {
  if (sessions.has(userId)) {
    const existingSocket = sessions.get(userId);
    try { existingSocket.end(); } catch (e) {}
    sessions.delete(userId);
  }

  const sessionPath = path.join(SESSIONS_DIR, userId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  sessionStates.set(userId, {
    status: 'connecting',
    qr_code: null,
    phone_number: null,
    device_info: null
  });

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }),
    browser: ['WABot Peru', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  sessions.set(userId, sock);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr, {
        width: 400,
        margin: 2,
        color: { dark: '#25D366', light: '#FFFFFF' }
      });

      sessionStates.set(userId, {
        ...sessionStates.get(userId),
        status: 'qr_ready',
        qr_code: qrDataUrl
      });
      console.log(`[${userId}] QR Code generated`);
    }

    if (connection === 'open') {
      const user = sock.user;
      sessionStates.set(userId, {
        status: 'connected',
        qr_code: null,
        phone_number: user?.id?.split(':')[0] || null,
        device_info: {
          platform: 'WhatsApp Web',
          version: version.join('.'),
          battery: 100
        }
      });
      console.log(`[${userId}] Connected successfully`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        setTimeout(() => initSession(userId), 3000);
      } else {
        sessionStates.set(userId, {
          status: 'disconnected',
          qr_code: null,
          phone_number: null,
          device_info: null
        });
        sessions.delete(userId);
        
        const sessionPath = path.join(SESSIONS_DIR, userId);
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true });
        }
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);
  return sessionStates.get(userId);
}

function getSessionStatus(userId) {
  return sessionStates.get(userId) || {
    status: 'disconnected',
    qr_code: null,
    phone_number: null,
    device_info: null
  };
}

async function disconnectSession(userId) {
  if (sessions.has(userId)) {
    const sock = sessions.get(userId);
    try { await sock.logout(); } catch (e) {}
    sessions.delete(userId);
  }

  sessionStates.set(userId, {
    status: 'disconnected',
    qr_code: null,
    phone_number: null,
    device_info: null
  });

  const sessionPath = path.join(SESSIONS_DIR, userId);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true });
  }

  return { success: true };
}

async function sendMessage(userId, to, message) {
  if (!sessions.has(userId)) throw new Error('Session not connected');
  const sock = sessions.get(userId);
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: message });
  return { success: true };
}

module.exports = { initSession, getSessionStatus, disconnectSession, sendMessage };
