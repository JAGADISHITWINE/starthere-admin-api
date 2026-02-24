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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['Set-Cookie']
  })
);

/* =================================
   SECURITY MIDDLEWARE
================================= */

// Hide x-powered-by
app.disable('x-powered-by');

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

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
  console.log('User connected:', socket.id);

  socket.on('join-admin-room', () => {
    socket.join('admin-room');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

/* =================================
   ROUTES
================================= */

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Server + Socket.IO running...');
});

/* =================================
   STATIC UPLOADS
================================= */

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

/* =================================
   START SERVER
================================= */

const PORT = process.env.PORT || 4001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});