const CryptoJS = require('crypto-js');
require('dotenv').config();

// Use env var for response encryption secret (optional). Keep secret out of source.
// If absent, encryption/decryption will be a no-op passthrough to avoid runtime errors.
const RESPONSE_ENCRYPTION_KEY = process.env.RESPONSE_ENCRYPTION_KEY || '';

function encrypt(data) {
  if (!RESPONSE_ENCRYPTION_KEY) return JSON.stringify(data);
  try {
    return CryptoJS.AES.encrypt(JSON.stringify(data), RESPONSE_ENCRYPTION_KEY).toString();
  } catch (err) {
    console.error('Encrypt error:', err);
    return '';
  }
}

function decrypt(cipherText) {
  if (!RESPONSE_ENCRYPTION_KEY) {
    try {
      return JSON.parse(cipherText);
    } catch (e) {
      return null;
    }
  }
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, RESPONSE_ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Decrypt error:', err);
    return null;
  }
}

module.exports = { encrypt, decrypt };

