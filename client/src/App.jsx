import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { INITIAL_BOARD, getFlippableStones, getValidMoves, getCounts, getOpponent } from './gameLogic';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [turn, setTurn] = useState('B');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [playerColor, setPlayerColor] = useState(null);
  const [statusText, setStatusText] = useState('ルームに参加または作成してください');
  const [theme, setTheme] = useState('glass');
  const [flippedStones, setFlippedStones] = useState([]); // Array of {r, c} for animation

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    socket.on('room_created', ({ roomId, color }) => {
      setRoomId(roomId);
      setPlayerColor(color);
      setStatusText(`ルームID: ${roomId} を共有して相手を待っています...`);
    });

    socket.on('room_joined', ({ roomId, color }) => {
      setRoomId(roomId);
      setPlayerColor(color);
      setStatusText(`対戦開始！あなたは ${color === 'B' ? '黒' : '白'} です`);
    });

    socket.on('game_start', ({ board, turn }) => {
      setBoard(board);
      setTurn(turn);
      setStatusText('対戦開始！黒のターン');
    });

    socket.on('stone_placed', ({ row, col, color }) => {
      handleMove(row, col, color, false);
    });

    socket.on('board_updated', ({ board, turn }) => {
      setBoard(board);
      setTurn(turn);
      updateStatus(turn, board);
    });

    socket.on('turn_passed', ({ turn }) => {
      setTurn(turn);
      setStatusText(`パスしました。${turn === 'B' ? '黒' : '白'}のターン`);
    });

    socket.on('error', (msg) => {
      alert(msg);
    });

    socket.on('player_disconnected', () => {
      setStatusText('相手との通信が切断されました');
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('game_start');
      socket.off('stone_placed');
      socket.off('board_updated');
      socket.off('turn_passed');
      socket.off('error');
      socket.off('player_disconnected');
    };
  }, [board, turn, playerColor]); // Wait, board dependency is tricky. We'll use a functional state update or just trust the latest handling

  const updateStatus = (currentTurn, currentBoard) => {
    const counts = getCounts(currentBoard);
    if (getValidMoves(currentBoard, 'B').length === 0 && getValidMoves(currentBoard, 'W').length === 0) {
      if (counts.bCount > counts.wCount) setStatusText('黒の勝ち！');
      else if (counts.wCount > counts.bCount) setStatusText('白の勝ち！');
      else setStatusText('引き分け！');
    } else {
      setStatusText(`${currentTurn === 'B' ? '黒' : '白'}のターン`);
    }
  };

  const handleMove = (r, c, color, isLocal) => {
    const flippable = getFlippableStones(board, r, c, color);
    if (flippable.length === 0) return;

    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = color;
    flippable.forEach(([fr, fc]) => {
      newBoard[fr][fc] = color;
    });

    setFlippedStones(flippable.map(([fr, fc]) => `${fr}-${fc}`));
    setTimeout(() => setFlippedStones([]), 500); // clear flip animation class

    const nextTurn = getOpponent(color);
    setBoard(newBoard);
    setTurn(nextTurn);
    updateStatus(nextTurn, newBoard);

    if (isLocal) {
      socket.emit('place_stone', { roomId, row: r, col: c, color });
      socket.emit('update_board', { roomId, board: newBoard, nextTurn });
      
      // Auto pass check for next player. But since both clients check it, we can just do it here.
      checkAutoPass(newBoard, nextTurn);
    }
  };

  const checkAutoPass = (currentBoard, currentTurn) => {
    if (getValidMoves(currentBoard, currentTurn).length === 0) {
      const nextTurn = getOpponent(currentTurn);
      if (getValidMoves(currentBoard, nextTurn).length > 0) {
        // Automatically pass
        setTimeout(() => {
          setTurn(nextTurn);
          socket.emit('pass_turn', { roomId, nextTurn });
          updateStatus(nextTurn, currentBoard);
          alert(`${currentTurn === 'B' ? '黒' : '白'}は置ける場所がないためパスになります。`);
        }, 500);
      }
    }
  };

  const onCellClick = (r, c) => {
    if (!playerColor || turn !== playerColor) return; // Not your turn or not in game
    if (board[r][c] !== null) return;
    
    handleMove(r, c, playerColor, true);
  };

  const createRoom = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('create_room', id);
  };

  const joinRoom = () => {
    if (inputRoomId) {
      socket.emit('join_room', inputRoomId);
    }
  };

  const validMoves = playerColor === turn ? getValidMoves(board, playerColor) : [];
  const counts = getCounts(board);

  return (
    <div className="app-container">
      <select className="theme-selector" value={theme} onChange={e => setTheme(e.target.value)}>
        <option value="classic">Classic (Green)</option>
        <option value="glass">Dark Glassmorphism</option>
        <option value="cyberpunk">Cyberpunk</option>
      </select>

      <div className="glass-panel">
        <h1 className="header">Online Othello</h1>
        
        {!playerColor ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button className="btn" onClick={createRoom}>部屋を作成する</button>
            <div style={{ textAlign: 'center' }}>または</div>
            <input 
              type="text" 
              placeholder="ルームIDを入力" 
              value={inputRoomId} 
              onChange={e => setInputRoomId(e.target.value)} 
            />
            <button className="btn" onClick={joinRoom}>部屋に参加する</button>
            <div className="status" style={{ fontSize: '1rem', marginTop: '10px' }}>{statusText}</div>
          </div>
        ) : (
          <>
            <div className="status">{statusText}</div>
            <div className="info-bar">
              <div><span className="color-indicator B"></span> 黒: {counts.bCount}</div>
              <div><span className="color-indicator W"></span> 白: {counts.wCount}</div>
            </div>
            {playerColor && (
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                あなたは <span className={`color-indicator ${playerColor}`}></span> です
              </div>
            )}
            
            <div className="board-container">
              <div className="board">
                {board.map((row, r) => 
                  row.map((cell, c) => {
                    const isValid = validMoves.some(([vr, vc]) => vr === r && vc === c);
                    const isFlipped = flippedStones.includes(`${r}-${c}`);
                    return (
                      <div 
                        key={`${r}-${c}`} 
                        className={`cell`} 
                        onClick={() => onCellClick(r, c)}
                      >
                        {isValid && <div className="valid-indicator"></div>}
                        {cell && (
                           <div className={`stone ${cell} ${isFlipped ? 'flip' : ''}`}></div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
