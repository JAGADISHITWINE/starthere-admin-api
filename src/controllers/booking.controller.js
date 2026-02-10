const db = require("../config/db");
const { encrypt, decrypt } = require("../service/cryptoHelper");

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

    const encryptedResponse = encrypt(rows);


    return res.status(200).json({
      success: true,
      data: encryptedResponse
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

    const encryptedResponse = encrypt(result.affectedRows);
    conn.release();
    return encryptedResponse;
    
  } catch (error) {
    if (conn) conn.release();
    throw error;
  }
}


async function updateBatchCompleted(req, res) {
  const { batchId } = req.params;
  
  // Validate batchId
  if (!batchId || isNaN(batchId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid batch ID'
    });
  }

  let connection;
  
  try {
    // Get a connection from pool for transaction
    connection = await db.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    // 1. Check if batch exists and get details
    const [batchCheck] = await connection.query(
      `SELECT 
        tb.id, 
        tb.trek_id, 
        tb.status, 
        tb.start_date, 
        tb.end_date,
        t.name as trek_name
      FROM trek_batches tb
      JOIN treks t ON tb.trek_id = t.id
      WHERE tb.id = ?`,
      [batchId]
    );

    if (batchCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    const batch = batchCheck[0];

    // Check if batch is already completed
    if (batch.status === 'completed') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Batch is already marked as completed'
      });
    }

    // Check if batch end date has passed
    const endDate = new Date(batch.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate >= today) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot mark batch as completed before end date'
      });
    }

    // 2. Update trek_batches status to 'completed'
    const updateBatchQuery = `
      UPDATE trek_batches 
      SET status = 'completed', 
          updated_at = NOW() 
      WHERE id = ?
    `;
    await connection.query(updateBatchQuery, [batchId]);
    
    // 3. Update all confirmed bookings to 'completed'
    const updateBookingsQuery = `
      UPDATE bookings 
      SET booking_status = 'completed', 
          updated_at = NOW() 
      WHERE batch_id = ? 
        AND booking_status = 'confirmed'
    `;
    const [bookingResult] = await connection.query(updateBookingsQuery, [batchId]);
    
    // 4. Get updated statistics
    const [stats] = await connection.query(
      `SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN booking_status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
        SUM(CASE WHEN booking_status = 'completed' THEN participants ELSE 0 END) as completed_participants
      FROM bookings
      WHERE batch_id = ?`,
      [batchId]
    );

    // 5. Get batch details for response
    const [updatedBatch] = await connection.query(
      `SELECT 
        tb.*,
        t.name as trek_name
      FROM trek_batches tb
      JOIN treks t ON tb.trek_id = t.id
      WHERE tb.id = ?`,
      [batchId]
    );
    
    // Commit transaction
    await connection.commit();


    data = {
      updated_bookings: bookingResult.affectedRows,
      batch: updatedBatch[0],
      stats: stats[0]
    }
    
    const encryptedResponse = encrypt(data);
    
    // Send success response
    res.json({
      success: true,
      message: 'Batch marked as completed successfully',
      response : encryptedResponse
    });

    
  } catch (error) {
    // Rollback on error
    if (connection) {
      await connection.rollback();
    }
    
    console.error('Mark batch completed error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark batch as completed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // Release connection back to pool
    if (connection) {
      connection.release();
    }
  }
};

module.exports = { getAllBookingData, updateCompletedBookings, updateBatchCompleted }