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

const rooms = {};

const INITIAL_BOARD = Array(8).fill(null).map(() => Array(8).fill(null));
INITIAL_BOARD[3][3] = 'W';
INITIAL_BOARD[3][4] = 'B';
INITIAL_BOARD[4][3] = 'B';
INITIAL_BOARD[4][4] = 'W';

io.on('connection', (socket) => {
  socket.on('create_room', ({ roomId, username }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: { B: { id: socket.id, name: username || 'Player 1' }, W: null },
        board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
        turn: 'B',
      };
      socket.join(roomId);
      socket.emit('room_created', { roomId, color: 'B' });
    } else {
      socket.emit('error', 'Room already exists');
    }
  });

  socket.on('join_room', ({ roomId, username }) => {
    const room = rooms[roomId];
    if (room) {
      if (!room.players.W) {
        const p2Name = username || 'Player 2';
        room.players.W = { id: socket.id, name: p2Name };
        socket.join(roomId);
        socket.emit('room_joined', { roomId, color: 'W' });
        
        io.to(roomId).emit('game_start', { 
            board: room.board, 
            turn: room.turn,
            players: { B: room.players.B.name, W: p2Name }
        });
      } else if (room.players.W.id === socket.id || room.players.B.id === socket.id) {
        socket.emit('error', 'You are already in this room');
      } else {
        socket.emit('error', 'Room is full');
      }
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('place_stone', ({ roomId, row, col, color }) => {
    socket.to(roomId).emit('stone_placed', { row, col, color });
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

  // Undo features
  socket.on('undo_request', (roomId) => socket.to(roomId).emit('undo_requested'));
  socket.on('undo_accept', (roomId) => socket.to(roomId).emit('undo_accepted'));
  socket.on('undo_reject', (roomId) => socket.to(roomId).emit('undo_rejected'));

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players.B?.id === socket.id || room.players.W?.id === socket.id) {
        io.to(roomId).emit('player_disconnected');
        delete rooms[roomId]; 
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
