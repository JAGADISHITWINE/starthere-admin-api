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

// services/bookingStatusService.js
async function updateCompletedBookings(req,res) {
  const conn = await db.getConnection();
  
  try {
    // Get bookings before update
    const [beforeUpdate] = await conn.execute(`
      SELECT b.id, b.booking_reference, b.customer_name, b.trek_name
      FROM bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      WHERE b.booking_status = 'confirmed'
        AND tb.end_date < NOW()
        AND b.cancelled_at IS NULL
    `);

    // Update bookings
    const [result] = await conn.execute(`
      UPDATE bookings b
      INNER JOIN trek_batches tb ON b.batch_id = tb.id
      SET b.booking_status = 'completed',
          b.updated_at = NOW()
      WHERE b.booking_status = 'confirmed'
        AND tb.end_date < NOW()
        AND b.cancelled_at IS NULL
    `);

    if (result.affectedRows > 0) {

      // Emit real-time update to all connected admins
      if (global.io) {
        beforeUpdate.forEach(booking => {
          global.io.to('admin-room').emit('booking-completed', {
            bookingId: booking.id,
            bookingReference: booking.booking_reference,
            customerName: booking.customer_name,
            trekName: booking.trek_name,
            completedAt: new Date()
          });
        });
      }
    }

    conn.release();
    return result.affectedRows;
    
  } catch (error) {
    if (conn) conn.release();
    throw error;
  }
}


module.exports = { getAllBookingData, updateCompletedBookings }