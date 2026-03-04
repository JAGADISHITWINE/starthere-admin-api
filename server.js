require('dotenv').config();

const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);

const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
const rbacService = require('./src/service/rbac.service');
const couponService = require('./src/service/coupon.service');

const authRoutes = require('./src/routes/common.routes');

/* =================================
   CORS CONFIG (MUST BE FIRST)
================================= */

const allowedOrigins = [
  'http://localhost:4200',
  'http://localhost:4700',
  'https://cdn.jsdelivr.net'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Set-Cookie']
  })
);

/* =================================
   SECURITY MIDDLEWARE
================================= */

// Hide x-powered-by
app.disable('x-powered-by');

// Respect reverse proxy IPs (required for accurate limiter keys behind Nginx/Cloudflare)
app.set('trust proxy', 1);

// Helmet (important for images/uploads)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],

        "img-src": [
          "'self'",
          "data:",
          "http://localhost:4001"
        ],

        "connect-src": [
          "'self'",
          "http://localhost:4001",
          "ws://localhost:4001"
        ],

        "script-src": [
          "'self'",
          "https://cdn.jsdelivr.net"
        ],

        "style-src": [
          "'self'",
          "https://cdn.jsdelivr.net",
          "'unsafe-inline'"
        ]
      }
    }
  })
);

// Global rate limiting (base protection, relaxed for admin UI traffic)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (req, res) => {
    res.set('Retry-After', String(Math.ceil((15 * 60 * 1000) / 1000)));
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please retry shortly.'
    });
  }
});
app.use(limiter);

const adminReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET',
  handler: (req, res) => {
    res.set('Retry-After', '60');
    return res.status(429).json({
      success: false,
      message: 'Dashboard rate limit reached. Please retry in a moment.'
    });
  }
});

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =================================
   SOCKET.IO SETUP
================================= */

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Make io globally accessible
global.io = io;

io.on('connection', (socket) => {
  socket.on('join-admin-room', () => {
    socket.join('admin-room');
  });

  // Relay new booking events from internal producers (user API) to admin clients.
  socket.on('booking-created', (payload = {}, ack) => {
    const safePayload = {
      bookingId: payload.bookingId ?? null,
      bookingReference: payload.bookingReference ?? null,
      customerName: payload.customerName ?? null,
      trekName: payload.trekName ?? null,
      participants: payload.participants ?? null,
      totalAmount: payload.totalAmount ?? null,
      createdAt: payload.createdAt || new Date().toISOString()
    };

    io.to('admin-room').emit('booking-created', safePayload);

    if (typeof ack === 'function') {
      ack({ success: true });
    }
  });
});

/* =================================
   ROUTES
================================= */

app.use('/api/auth', (req, res, next) => {
  if (req.method !== 'GET') return next();

  // Heavier admin polling/read endpoints get a dedicated limiter bucket.
  const readHeavyPaths = [
    '/dashData',
    '/revenue',
    '/notifications',
    '/getUsers',
    '/postEditor',
    '/bookingData',
    '/treks',
    '/batches'
  ];

  const pathMatch = readHeavyPaths.some((p) => req.path.startsWith(p));
  return pathMatch ? adminReadLimiter(req, res, next) : next();
});

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Server + Socket.IO running...');
});

/* =================================
   STATIC UPLOADS
================================= */

const sharedUploadsRoot = process.env.SHARED_UPLOADS_DIR
  ? path.resolve(process.env.SHARED_UPLOADS_DIR)
  : path.resolve(__dirname, '../shared-uploads');
app.use('/uploads', express.static(sharedUploadsRoot));

/* =================================
   START SERVER
================================= */

const PORT = process.env.PORT || 4001;

rbacService.ensureRbacSchema().catch((error) => {
  console.error('RBAC bootstrap error:', error);
});
couponService.ensureCouponSchema().catch((error) => {
  console.error('Coupon bootstrap error:', error);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
