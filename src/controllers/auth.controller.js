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
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // 4. Save token to admins table
    await loginModel.saveToken(user.id, token); // <- make sure this function exists in your model

    // 5. Send response
    return res.status(200).json({
      response: true,
      message: "Login successful",
      token: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(200).json({
      response: false,
      message: "Something went wrong. Please try again.",
    });
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

module.exports = { login, getDashboardData };
