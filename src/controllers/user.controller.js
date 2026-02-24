const db = require("../config/db");
const { encrypt } = require("../service/cryptoHelper");

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
                `,
        );

        const encryptedResponse = encrypt(usersData);
        return res.status(200).json({
            success: true,
            data: encryptedResponse,
        });
    } catch (err) {
        console.error("Error fetching data:", err);
        return res.status(500).json({ success: false, message: 'Failed to fetch user data' });
    }
}

async function getUserById(req, res) {
    try {
        const { userid } = req.params;

        const [users] = await db.query(
            `SELECT id, full_name AS name, email, phone_number AS phone, 
                    is_active AS status, created_at AS joinDate
             FROM users WHERE id = ?`,
            [userid]
        );

        if (!users.length) {
            return res
                .status(404)
                .json({ response: false, message: "User not found" });
        }

        const user = users[0];
        user.status = user.status === 1 ? "active" : "blocked";

        const [bookings] = await db.query(
            `SELECT
                b.id AS booking_id,
                b.booking_reference,
                b.user_id,
                t.id AS trek_id,
                t.name AS trek_name,
                t.location,
                t.category,
                t.difficulty,
                b.start_date,
                b.end_date,
                b.participants,
                b.total_amount,
                b.payment_status,
                b.booking_status,
                b.created_at
             FROM bookings b
             JOIN treks t ON t.id = b.trek_id
             WHERE b.user_id = ?
             ORDER BY b.created_at DESC`,
            [userid]
        );

        // ✅ Calculate BEFORE encryption
        user.totalBookings = bookings.length;
        user.totalSpent = bookings.reduce(
            (sum, b) => sum + Number(b.total_amount || 0),
            0
        );

        const usersData = {
            user,
            bookings
        };

        const encryptedResponse = encrypt(usersData);

        return res.status(200).json({
            response: true,
            data: encryptedResponse
        });

    } catch (error) {
        console.error("Get user error:", error);
        return res.status(500).json({ response: false, message: 'Internal server error' });
    }
}


module.exports = { getUsersData, getUserById };
