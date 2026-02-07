const express = require('express');
const app = express();
const cors = require('cors');
const authRoutes = require('./src/routes/common.routes'); 
require('dotenv').config();
const path = require('path');

const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// expose io globally so other modules/controllers can emit events
global.io = io;

app.use(express.json());
app.use(cors());

io.on('connection', (socket) => {

  socket.on('join-admin-room', () => {
    socket.join('admin-room');
  });

  socket.on('disconnect', () => {
  });
});

// Use auth routes
app.use('/api/auth', authRoutes); 

// Default route
app.get('/', (req, res) => {
    res.send('Server is running...');
});

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => {
  console.log(`Server + Socket.IO running on port ${PORT}`);
});
