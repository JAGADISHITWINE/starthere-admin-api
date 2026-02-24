const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const loginModel = require("../models/User");
const db = require("../config/db");
require("dotenv").config();
const { encrypt, decrypt } = require("../service/cryptoHelper");

async function login(req, res) {
  try {
    const { email, password } = req.body;

    // 1. Check if user exists
    const user = await loginModel.findUser(email);
    if (!user) {
      return res.status(401).json({
        response: false,
        message: "User not found",
      });
    }

    // 2. Validate password
    const isValid = await loginModel.validatePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({
        response: false,
        message: "Invalid credentials",
      });
    }

    // 3. Generate JWT token
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET not set in environment');
      return res.status(500).json({ response: false, message: 'Server misconfiguration' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 4. Save token to admins table
    await loginModel.saveToken(user.id, token); // <- make sure this function exists in your model

    // 5. Set HttpOnly cookie and send minimal user info
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    };

    res.cookie('token', token, cookieOptions);

    return res.status(200).json({
      response: true,
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}

async function logout(req, res) {
  try {
    // Clear cookie and optionally remove token from DB
    res.clearCookie('token');
    // If client sends user id, you could clear token in DB as well. For now, just clear cookie.
    return res.status(200).json({ response: true, message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}

async function me(req, res) {
  try {
    // Return user info from req.user (set by auth middleware)
    if (!req.user) return res.status(401).json({ response: false, message: 'Unauthorized' });
    // You may fetch fresh user details from DB if needed
    return res.status(200).json({ response: true, user: req.user });
  } catch (err) {
    console.error('Profile error:', err);
    return res.status(500).json({ response: false, message: 'Internal server error' });
  }
}

async function getDashboardData(req, res) {
  try {
    /* -------- COUNTS -------- */
    const [[userCount]] = await db.query(
      "SELECT COUNT(id) AS totalUsers FROM users",
    );
    const [[activeUserCount]] = await db.query(
      "SELECT COUNT(id) AS totalactiveUsers FROM users where is_active = 1",
    );
    const [[trekCount]] = await db.query(
      "SELECT COUNT(id) AS totaltrekCount FROM treks",
    );
    const [[bookingCount]] = await db.query(
      "SELECT COUNT(id) AS totalbookingCount FROM bookings",
    );
    const [[revenue]] = await db.query(
      "SELECT SUM(total_amount) AS totalRevenue FROM bookings WHERE payment_status = 'paid' AND booking_status = 'confirmed'",
    );
    const [[blogCount]] = await db.query(
      "SELECT COUNT(id) AS totalpostsCount FROM posts",
    );
    const [[commentCount]] = await db.query(
      "SELECT COUNT(id) AS totalCommentCount FROM comments",
    );

    /* -------- RECENT BOOKINGS -------- */
    const [recentBookings] = await db.query(`
      SELECT
        id,
        customer_name AS customerName,
        customer_email AS email,
        customer_phone AS phone,
        trek_name AS trekName,
        participants,
        total_amount AS amount,
        booking_status AS status,
        payment_status AS paymentStatus,
        DATE_FORMAT(created_at, '%d %b %Y') AS bookingDate
      FROM bookings
      ORDER BY created_at ASC
      LIMIT 5
    `);

      response = {
      totalUsers: userCount.totalUsers,
      totalactiveUsers: activeUserCount.totalactiveUsers,
      totaltrekCount: trekCount.totaltrekCount,
      totalbookingCount: bookingCount.totalbookingCount,
      totalRevenue: revenue.totalRevenue,
      recentBookings,
      totalBlog : blogCount.totalpostsCount,
      totalComments: commentCount.totalCommentCount 
    }

    const encryptedResponse = encrypt(response);

    /* -------- RESPONSE -------- */
    return res.status(200).json({
      success: true,
      data: encryptedResponse,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
    });
  }
}

module.exports = { login, logout, me, getDashboardData };
