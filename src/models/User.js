const db = require('../config/db');
const bcrypt = require('bcryptjs');

const findUser = async (email) => {
    try {
        const [rows] = await db.query('SELECT id, name, email, password FROM admins WHERE email = ?', [email]);
        return rows.length ? rows[0] : null;
    } catch (error) {
        console.error('Error in findUser:', error);
        throw error;
    }
};

// Validate password using bcrypt compare
async function validatePassword(password, hashedPassword) {
    try {
        return await bcrypt.compare(password, hashedPassword);
    } catch (err) {
        console.error('Error validating password:', err);
        return false;
    }
}

async function saveToken(id, token) {
    const query = `UPDATE admins SET token = ? WHERE id = ?`;
    await db.execute(query, [token, id]);
}

module.exports = { findUser, validatePassword, saveToken };