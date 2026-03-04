let nodemailer;

const {
  buildBookingCompletedEmail,
  buildBatchStatusChangedEmail,
  buildBatchCompletionSummaryEmail,
} = require('./templates');

function isMailEnabled() {
  return String(process.env.EMAIL_ENABLED || 'true').toLowerCase() !== 'false';
}

function getMissingConfig() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  return required.filter((key) => !process.env[key]);
}

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (!nodemailer) {
    try {
      nodemailer = require('nodemailer');
    } catch (error) {
      console.error('nodemailer dependency is missing. Install with: npm i nodemailer');
      return null;
    }
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
}

async function sendEmail({ to, subject, html, text, cc, bcc, replyTo }) {
  if (!isMailEnabled()) {
    return { sent: false, reason: 'disabled' };
  }

  const missing = getMissingConfig();
  if (missing.length > 0) {
    console.warn(`Email skipped: missing config: ${missing.join(', ')}`);
    return { sent: false, reason: 'misconfigured', missing };
  }

  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, reason: 'missing_dependency' };
  }

  const info = await mailer.sendMail({
    from: process.env.SMTP_FROM,
    to,
    cc,
    bcc,
    replyTo,
    subject,
    html,
    text,
  });

  return { sent: true, messageId: info.messageId };
}

async function sendBookingCompletedEmail(booking = {}) {
  if (!booking.customerEmail) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const template = buildBookingCompletedEmail(booking);

  return sendEmail({
    to: booking.customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

function getAdminRecipients() {
  const configured = process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_ALERT_EMAIL || process.env.SMTP_FROM || '';
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function sendBatchStatusChangedEmail(payload = {}) {
  if (!payload.customerEmail) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const template = buildBatchStatusChangedEmail(payload);
  return sendEmail({
    to: payload.customerEmail,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

async function sendBatchCompletionSummaryEmail(payload = {}) {
  const recipients = getAdminRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: 'missing_recipient' };
  }

  const template = buildBatchCompletionSummaryEmail(payload);
  return sendEmail({
    to: recipients,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

module.exports = {
  sendEmail,
  sendBookingCompletedEmail,
  sendBatchStatusChangedEmail,
  sendBatchCompletionSummaryEmail,
};
