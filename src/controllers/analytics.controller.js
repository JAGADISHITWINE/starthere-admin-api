const db = require("../config/db");

async function getAllRevenueData(req, res) {
    try {
        const [[totalBooking]] = await db.query(
            "SELECT COUNT(id) AS totalbookingCount FROM bookings",
        );
        const [[totalRevenue]] = await db.query(
            "SELECT SUM(total_amount) AS totalRevenue FROM bookings WHERE payment_status = 'paid'",
        );

        const [[averageBookingValue]] = await db.query(`SELECT
            ROUND(
                COALESCE(SUM(total_amount), 0) /
                NULLIF(COUNT(id), 0),
                2
            ) AS averageBookingValue
            FROM bookings
            WHERE payment_status = 'paid'
            AND booking_status = 'confirmed';
        `)

        /* ---------------- MONTHLY DATA ---------------- */
        const [monthlyData] = await db.query(`
        SELECT
        DATE_FORMAT(month_start, '%b %Y') AS month,
        COUNT(*) AS bookings,
        SUM(amount) AS amount
        FROM (
        SELECT
            DATE_FORMAT(created_at, '%Y-%m-01') AS month_start,
            total_amount AS amount
        FROM bookings
        WHERE payment_status = 'paid'
            AND booking_status = 'confirmed'
        ) x
        GROUP BY month_start
        ORDER BY month_start;
    `);

        /* ---------------- TREK-WISE REVENUE ---------------- */
        const [trekRevenue] = await db.query(`
        SELECT
            trek_name AS name,
            COUNT(id) AS bookings,
            COALESCE(SUM(total_amount), 0) AS revenue
            FROM bookings
            WHERE payment_status = 'paid'
                AND booking_status = 'confirmed'
            GROUP BY trek_name
            ORDER BY revenue DESC
            `);
                const [rows] = await db.query(`
        SELECT
            DATE_FORMAT(created_at, '%Y-%m') AS month,
            SUM(total_amount) AS revenue
        FROM bookings
        WHERE payment_status = 'paid'
            AND booking_status = 'confirmed'
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month DESC
        LIMIT 2
        `);

        let monthlyGrowth = '0%';

        if (rows.length === 2) {
            const current = rows[0].revenue;
            const previous = rows[1].revenue;

            const growth = ((current - previous) / previous) * 100;
            monthlyGrowth = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
        }


        /* ---------------- FINAL RESPONSE ---------------- */
        return res.status(200).json({
            success: true,
            data: {
                totalBooking: totalBooking.totalbookingCount,
                totalRevenue: totalRevenue.totalRevenue,
                averageBookingValue: averageBookingValue.averageBookingValue,
                monthlyData,
                trekRevenue,
                monthlyGrowth
            },
        });
    } catch (err) {
        console.error("Error fetching data:", err);
        res.status(200).json({
            success: false,
            message: "Failed to fetch dashboard data",
        });
    }
}

module.exports = { getAllRevenueData };
