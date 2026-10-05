/**
 * Outgoing email. Optional: with no SMTP settings, nothing is sent and
 * password reset falls back to "ask your admin".
 */
const nodemailer = require('nodemailer');
const config = require('../../config');

let transport = null;

const mailEnabled = () => Boolean(config.smtp.host && config.smtp.from) && !config.isTest;

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled()) return false;
  try {
    await getTransport().sendMail({ from: config.smtp.from, to, subject, text, html });
    return true;
  } catch (err) {
    console.warn('[mail] send failed:', err.message);
    return false;
  }
}

module.exports = { sendMail, mailEnabled };
