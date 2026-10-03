import makeWASocketPkg from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const makeWASocket = makeWASocketPkg.default || makeWASocketPkg;
const { useMultiFileAuthState, DisconnectReason } = makeWASocketPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_DIR = path.resolve(__dirname, '../../.wa_auth');

let sock = null;
let isConnected = false;
let currentQr = null;

/**
 * Initialize WhatsApp Web QR Bridge (100% Free - sends real messages from your own phone)
 */
export async function initWhatsAppQR() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        currentQr = qr;
        console.log('\n===============================================================');
        console.log('📲 SCAN THIS QR CODE WITH YOUR WHATSAPP (Linked Devices):');
        console.log('===============================================================');
        qrcode.generate(qr, { small: true });
        console.log('Settings > Linked Devices > Link a Device > Scan QR above.\n');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        isConnected = false;
        currentQr = null;
        console.log(`⚠️ WhatsApp bridge disconnected (status ${statusCode}). Reconnecting? ${shouldReconnect}`);
        if (shouldReconnect) {
          setTimeout(() => initWhatsAppQR(), 3000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        currentQr = null;
        console.log('\n✅ WHATSAPP WEB QR BRIDGE CONNECTED! Live messages will now dispatch to real WhatsApp.\n');
      }
    });

    return sock;
  } catch (err) {
    console.warn(`Could not start WhatsApp Web QR bridge: ${err.message}`);
    return null;
  }
}

/**
 * Send real WhatsApp message if QR is connected, otherwise logs safely
 */
export async function dispatchWhatsApp({ toPhone, messageText }) {
  // 1. Enterprise Tier: Official Meta WhatsApp Cloud API (Graph API v20.0)
  if (process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      let digits = (toPhone || '').replace(/\D/g, '');
      if (digits.length === 10) digits = `91${digits}`;

      const metaUrl = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: digits,
          type: 'text',
          text: { preview_url: false, body: messageText }
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Meta Cloud WhatsApp] Message dispatched successfully to +${digits}`);
        return {
          dispatched: true,
          mode: 'META_CLOUD_API',
          messageId: data.messages?.[0]?.id,
          recipient: digits
        };
      } else {
        const errText = await response.text();
        console.warn(`[Meta Cloud WhatsApp] Dispatch failed (${response.status}): ${errText}`);
      }
    } catch (err) {
      console.error(`[Meta Cloud WhatsApp] Error: ${err.message}`);
    }
  }

  // 2. Free Tier: WhatsApp Web QR Bridge (Baileys)
  if (!isConnected || !sock) {
    return {
      dispatched: false,
      mode: 'SIMULATED',
      reason: 'WhatsApp QR Bridge not scanned yet. Logged to internal database.'
    };
  }

  try {
    // Strip non-digits and ensure country code (default to India 91 if 10 digits)
    let digits = (toPhone || '').replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    const jid = `${digits}@s.whatsapp.net`;

    await sock.sendMessage(jid, { text: messageText });
    console.log(`[WhatsApp Live] Real message dispatched to ${jid}`);
    return {
      dispatched: true,
      mode: 'REAL_WHATSAPP_WEB',
      recipient: jid
    };
  } catch (err) {
    console.error(`Failed to send live WhatsApp message: ${err.message}`);
    return {
      dispatched: false,
      mode: 'ERROR',
      error: err.message
    };
  }
}

export function getWhatsAppStatus() {
  return {
    connected: isConnected,
    has_qr_pending: !!currentQr,
    qr_code: currentQr
  };
}
