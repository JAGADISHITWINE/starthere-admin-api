const mysql = require('mysql2');
require('dotenv').config();

// Use environment variables with sensible defaults for local dev. DO NOT commit
// production credentials to source control. Ensure .env is in .gitignore.
const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || 'Itwinetech@1234';
const dbName = process.env.DB_NAME || 'starthere';
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

const db = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    port: dbPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
}).promise(); // Enables native promise support

// Test database connection
db.getConnection()
    .then((connection) => {
        console.log('✅ Connected to MySQL Database!');
        connection.release();
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err);
    });

module.exports = db; // Export connection as a promise
