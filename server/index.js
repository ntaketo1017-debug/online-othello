const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Simple room and game state management
const rooms = {};

const INITIAL_BOARD = Array(8).fill(null).map(() => Array(8).fill(null));
INITIAL_BOARD[3][3] = 'W';
INITIAL_BOARD[3][4] = 'B';
INITIAL_BOARD[4][3] = 'B';
INITIAL_BOARD[4][4] = 'W';

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('create_room', (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: { B: socket.id, W: null },
        board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
        turn: 'B',
        history: [] // store previous moves
      };
      socket.join(roomId);
      socket.emit('room_created', { roomId, color: 'B' });
    } else {
      socket.emit('error', 'Room already exists');
    }
  });

  socket.on('join_room', (roomId) => {
    const room = rooms[roomId];
    if (room) {
      if (!room.players.W && room.players.B !== socket.id) {
        room.players.W = socket.id;
        socket.join(roomId);
        socket.emit('room_joined', { roomId, color: 'W' });
        io.to(roomId).emit('game_start', { board: room.board, turn: room.turn });
      } else {
        socket.emit('error', 'Room is full or you are already in it');
      }
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('place_stone', ({ roomId, row, col, color }) => {
    const room = rooms[roomId];
    if (room && room.turn === color) {
      // In a real app we would validate the move server-side.
      // For simplicity, we are assuming the client sends a valid board.
      // Wait, let's just let client handle the logic for now, or just send the move.
      // Easiest is frontend sends the new valid board state.
      // But let's actually just broadcast the move to the other player and let them update.
      socket.to(roomId).emit('stone_placed', { row, col, color });
    }
  });

  socket.on('update_board', ({ roomId, board, nextTurn }) => {
    const room = rooms[roomId];
    if (room) {
      room.board = board;
      room.turn = nextTurn;
      socket.to(roomId).emit('board_updated', { board, turn: nextTurn });
    }
  });

  socket.on('pass_turn', ({ roomId, nextTurn }) => {
      const room = rooms[roomId];
      if (room) {
        room.turn = nextTurn;
        socket.to(roomId).emit('turn_passed', { turn: nextTurn });
      }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Handle disconnection (notify other player)
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.B === socket.id || room.players.W === socket.id) {
        io.to(roomId).emit('player_disconnected');
        delete rooms[roomId]; // Simple cleanup
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
