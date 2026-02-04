const db = require("../config/db");

async function getAllBookingData(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        customer_name AS customerName,
        customer_email AS email,
        customer_phone AS phone,
        trek_name AS trekName,
        CONCAT(
          DATE_FORMAT(start_date, '%d %b %Y'),
          ' - ',
          DATE_FORMAT(end_date, '%d %b %Y')
        ) AS date,
        participants,
        total_amount AS amount,
        booking_status AS status,
        payment_status AS paymentStatus,
        DATE_FORMAT(created_at, '%d %b %Y') AS bookingDate
      FROM bookings
      ORDER BY created_at DESC
    `);

    return res.status(200).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
}


module.exports = { getAllBookingData }