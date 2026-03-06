const mysql = require('mysql2');
require('dotenv').config();

// Use environment variables with sensible defaults for local dev.
const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbName = process.env.DB_NAME || 'goWILDKarunadu';
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
const dbConnectTimeout = process.env.DB_CONNECT_TIMEOUT
    ? Number(process.env.DB_CONNECT_TIMEOUT)
    : 10000;

const db = mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    port: dbPort,
    connectTimeout: dbConnectTimeout,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
}).promise();

// Test database connection once during startup.
db.getConnection()
    .then((connection) => {
        console.log(`Connected to MySQL Database (${dbHost}:${dbPort}/${dbName})`);
        connection.release();
    })
    .catch((err) => {
        const hintByCode = {
            ETIMEDOUT: `Network timeout to ${dbHost}:${dbPort}. Verify DB_HOST/DB_PORT and whether MySQL accepts remote connections.`,
            ECONNREFUSED: `Connection refused on ${dbHost}:${dbPort}. Ensure the MySQL service is running and listening on this host/port.`,
            ER_ACCESS_DENIED_ERROR: `Authentication failed for DB_USER='${dbUser}'. Verify DB_USER/DB_PASSWORD.`,
            ER_BAD_DB_ERROR: `Database '${dbName}' does not exist. Create it or change DB_NAME.`,
        };

        console.error(`Database connection failed [${err.code || 'UNKNOWN'}]: ${err.message}`);
        if (hintByCode[err.code]) {
            console.error(`Hint: ${hintByCode[err.code]}`);
        }
    });

module.exports = db;
