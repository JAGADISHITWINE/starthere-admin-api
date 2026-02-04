const db = require('../config/db');

async function getUsersData(req, res) {
    try {
        const [usersData] = await db.query(
            `SELECT
                u.id,
                u.full_name AS name,
                u.email,
                u.phone_number AS phone,
                CASE 
                WHEN u.is_active = 1 THEN 'active'
                WHEN u.is_active = 2 THEN 'inactive'
                ELSE 'blocked'
                END AS status,
                DATE_FORMAT(u.created_at, '%d %b %Y') AS joinDate,
                COUNT(b.id) AS totalBookings,
                COALESCE(SUM(b.total_amount), 0) AS totalSpent
                FROM users u
                LEFT JOIN bookings b
                ON u.id = b.user_id
                GROUP BY
                u.id,
                u.full_name,
                u.email,
                u.phone_number;
                `);

        return res.status(200).json({
            success: true,
            usersData,

        });

    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(200).json({
            success: false,
            message: 'Failed to fetch user data'
        });
    }
}

module.exports = { getUsersData };