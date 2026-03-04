const db = require('../config/db');
const { encrypt } = require('../service/cryptoHelper');

function normalizeDate(value) {
  return value ? new Date(value) : new Date(0);
}

async function ensureNotificationTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_notification_state (
      admin_id INT NOT NULL PRIMARY KEY,
      last_read_all_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_notification_reads (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      notification_id VARCHAR(120) NOT NULL,
      read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_admin_notification_read (admin_id, notification_id),
      KEY idx_admin_notification_read_admin (admin_id)
    )
  `);
}

async function getNotifications(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const adminId = Number(req?.user?.id);

    await ensureNotificationTables();

    const [bookingRows, paymentRows, commentRows] = await Promise.all([
      db.query(
        `SELECT
          b.id,
          b.booking_reference,
          b.customer_name,
          b.trek_name,
          b.booking_status,
          b.payment_status,
          b.created_at,
          b.updated_at
        FROM bookings b
        ORDER BY b.updated_at DESC
        LIMIT ?`,
        [limit]
      ),
      db.query(
        `SELECT
          p.id,
          p.booking_id,
          p.payment_method,
          p.transaction_id,
          p.amount,
          p.status,
          p.created_at,
          b.booking_reference,
          b.customer_name,
          b.trek_name
        FROM payments p
        LEFT JOIN bookings b ON b.id = p.booking_id
        ORDER BY p.created_at DESC
        LIMIT ?`,
        [limit]
      ),
      db.query(
        `SELECT
          c.id,
          c.author_name,
          c.content,
          c.created_at,
          p.id AS post_id,
          p.title AS post_title
        FROM comments c
        INNER JOIN posts p ON p.id = c.post_id
        ORDER BY c.created_at DESC
        LIMIT ?`,
        [limit]
      )
    ]);

    const bookingNotifications = bookingRows[0].map((row) => ({
      id: `booking-${row.id}`,
      entityId: row.id,
      type: 'booking',
      title: `${row.trek_name || 'Trek'} booking ${row.booking_status}`,
      message: `${row.customer_name || 'Customer'} (${row.booking_reference || `BK-${row.id}`})`,
      status: row.booking_status,
      paymentStatus: row.payment_status,
      createdAt: row.updated_at || row.created_at,
      read: false
    }));

    const paymentNotifications = paymentRows[0].map((row) => ({
      id: `payment-${row.id}`,
      entityId: row.id,
      type: 'payment',
      title: `Payment ${row.status || 'updated'}`,
      message: `${row.customer_name || 'Customer'} - INR ${Number(row.amount || 0).toFixed(2)}`,
      bookingReference: row.booking_reference,
      trekName: row.trek_name,
      paymentMethod: row.payment_method,
      transactionId: row.transaction_id,
      createdAt: row.created_at,
      read: false
    }));

    const commentNotifications = commentRows[0].map((row) => ({
      id: `comment-${row.id}`,
      entityId: row.id,
      type: 'comment',
      title: `New comment on ${row.post_title}`,
      message: `${row.author_name}: ${String(row.content || '').slice(0, 80)}`,
      postId: row.post_id,
      createdAt: row.created_at,
      read: false
    }));

    const merged = [...bookingNotifications, ...paymentNotifications, ...commentNotifications]
      .sort((a, b) => normalizeDate(b.createdAt) - normalizeDate(a.createdAt))
      .slice(0, limit);

    let lastReadAllAt = null;
    const readSet = new Set();

    if (Number.isInteger(adminId) && adminId > 0) {
      const [stateRows] = await db.query(
        `SELECT last_read_all_at FROM admin_notification_state WHERE admin_id = ? LIMIT 1`,
        [adminId]
      );
      if (Array.isArray(stateRows) && stateRows.length > 0) {
        lastReadAllAt = stateRows[0].last_read_all_at ? new Date(stateRows[0].last_read_all_at) : null;
      }

      const ids = merged.map((n) => n.id).filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const [readRows] = await db.query(
          `SELECT notification_id FROM admin_notification_reads WHERE admin_id = ? AND notification_id IN (${placeholders})`,
          [adminId, ...ids]
        );
        for (const row of readRows || []) {
          if (row?.notification_id) readSet.add(String(row.notification_id));
        }
      }
    }

    const notifications = merged.map((n) => {
      const createdAt = normalizeDate(n.createdAt);
      const fromReadAll = lastReadAllAt ? createdAt <= lastReadAllAt : false;
      const fromReadOne = readSet.has(n.id);
      return { ...n, read: fromReadAll || fromReadOne };
    });

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.status(200).json({
      success: true,
      data: encrypt({
        notifications,
        unreadCount
      })
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
}

async function markAllNotificationsRead(req, res) {
  try {
    const adminId = Number(req?.user?.id);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid admin user' });
    }

    await ensureNotificationTables();

    await db.query(
      `INSERT INTO admin_notification_state (admin_id, last_read_all_at)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE last_read_all_at = VALUES(last_read_all_at)`,
      [adminId]
    );

    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
}

async function markNotificationRead(req, res) {
  try {
    const adminId = Number(req?.user?.id);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid admin user' });
    }

    await ensureNotificationTables();

    const bodyIds = Array.isArray(req?.body?.ids)
      ? req.body.ids
      : req?.body?.id
        ? [req.body.id]
        : [];

    const ids = bodyIds
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0)
      .slice(0, 200);

    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Notification id is required' });
    }

    const values = ids.map((id) => [adminId, id]);
    await db.query(
      `INSERT IGNORE INTO admin_notification_reads (admin_id, notification_id) VALUES ?`,
      [values]
    );

    return res.status(200).json({ success: true, message: 'Notification(s) marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
}

module.exports = { getNotifications, markAllNotificationsRead, markNotificationRead };
