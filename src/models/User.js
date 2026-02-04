const db = require('../config/db');
const bcrypt = require('bcrypt');

const findUser = async (email) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, password FROM admins WHERE email = ?', [email]);
        return rows.length ? rows[0] : null;
    } catch (error) {
        console.error('Error in findUser:', error);
        throw error;
    }
};


// Validate password
async function validatePassword(password, hashedPassword) {
    return password === hashedPassword;
}

async function saveToken(id, token) {
  const query = `UPDATE admins SET token = ? WHERE id = ?`;
  await db.execute(query, [token, id]);
}

module.exports = { findUser, validatePassword, saveToken };