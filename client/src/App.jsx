import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { INITIAL_BOARD, getFlippableStones, getValidMoves, getCounts, getOpponent } from './gameLogic';
import { playPlaceSound, playFlipSound, playWinSound } from './soundEffects';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [turn, setTurn] = useState('B');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [players, setPlayers] = useState({ B: 'Player 1', W: 'Player 2' });
  const [playerColor, setPlayerColor] = useState(null);
  const [statusText, setStatusText] = useState('ルームに参加または作成してください');
  const [theme, setTheme] = useState('glass');
  const [flippedStones, setFlippedStones] = useState([]);
  
  // 履歴保存用
  const [history, setHistory] = useState([]);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);

  useEffect(() => {
    boardRef.current = board;
    turnRef.current = turn;
  }, [board, turn]);

  // URLパラメータからのルームID取得
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInputRoomId(roomParam);
      toast('招待リンクから来ましたね！名前を入れて参加を押してください。', { icon: '👋' });
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    socket.on('room_created', ({ roomId, color }) => {
      setRoomId(roomId);
      setPlayerColor(color);
      toast.success('ルームを作成しました！');
      setStatusText(`ルームIDを共有して相手を待機中...`);
    });

    socket.on('room_joined', ({ roomId, color }) => {
      setRoomId(roomId);
      setPlayerColor(color);
      toast.success('ルームに参加しました！');
    });

    socket.on('game_start', ({ board, turn, players: newPlayers }) => {
      setBoard(board);
      setTurn(turn);
      setPlayers(newPlayers);
      setHistory([]);
      setStatusText('対戦開始！黒のターン');
      toast.success('対戦相手が見つかりました！ゲーム開始！');
    });

    socket.on('stone_placed', ({ row, col, color }) => {
      handleMove(row, col, color, false);
    });

    socket.on('board_updated', ({ board: newBoard, turn: nextTurn }) => {
      setBoard(newBoard);
      setTurn(nextTurn);
      updateStatus(nextTurn, newBoard);
    });

    socket.on('turn_passed', ({ turn: nextTurn }) => {
      setTurn(nextTurn);
      toast('相手がパスしました', { icon: '⏭️' });
      setStatusText(`パスされました。${nextTurn === 'B' ? '黒' : '白'}のターン`);
    });

    // 「待った」の受信系
    socket.on('undo_requested', () => {
      toast((t) => (
        <span>
          相手から「待った」のリクエストが来ました！許可しますか？
          <button onClick={() => { socket.emit('undo_accept', roomId); toast.dismiss(t.id); }} style={{margin:'0 10px', padding:'5px', background:'#4caf50', color:'#fff', border:'none', borderRadius:'4px'}}>許可</button>
          <button onClick={() => { socket.emit('undo_reject', roomId); toast.dismiss(t.id); }} style={{padding:'5px', background:'#f44336', color:'#fff', border:'none', borderRadius:'4px'}}>拒否</button>
        </span>
      ), { duration: 60000 });
    });

    socket.on('undo_accepted', () => {
      toast.success('「待った」が許可されました');
      revertHistory();
    });

    socket.on('undo_rejected', () => {
      toast.error('「待った」は拒否されました...');
    });

    socket.on('error', (msg) => {
      toast.error(msg);
    });

    socket.on('player_disconnected', () => {
      toast.error('相手との通信が切断されました', { duration: 5000 });
      setStatusText('相手との通信が切断されました');
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('game_start');
      socket.off('stone_placed');
      socket.off('board_updated');
      socket.off('turn_passed');
      socket.off('undo_requested');
      socket.off('undo_accepted');
      socket.off('undo_rejected');
      socket.off('error');
      socket.off('player_disconnected');
    };
  }, [roomId, history]); // Dependencies needed for revertHistory

  const revertHistory = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory(history.slice(0, -1));
      setBoard(prev.board);
      setTurn(prev.turn);
      socket.emit('update_board', { roomId, board: prev.board, nextTurn: prev.turn });
      updateStatus(prev.turn, prev.board);
    }
  };

  const requestUndo = () => {
    if (history.length === 0) {
      toast.error('戻れる履歴がありません');
      return;
    }
    toast('相手に「待った」をリクエストしました...', { icon: '⏳' });
    socket.emit('undo_request', roomId);
  };

  const updateStatus = (currentTurn, currentBoard) => {
    const counts = getCounts(currentBoard);
    if (getValidMoves(currentBoard, 'B').length === 0 && getValidMoves(currentBoard, 'W').length === 0) {
      playWinSound(); // 試合終了音
      if (counts.bCount > counts.wCount) setStatusText('黒の勝ち！');
      else if (counts.wCount > counts.bCount) setStatusText('白の勝ち！');
      else setStatusText('引き分け！');
    } else {
      setStatusText(`${currentTurn === 'B' ? '黒' : '白'}のターン`);
    }
  };

  const handleMove = (r, c, color, isLocal) => {
    const currentBoard = boardRef.current;
    const currentTurn = turnRef.current;

    const flippable = getFlippableStones(currentBoard, r, c, color);
    if (flippable.length === 0) return;

    // 履歴を保存
    setHistory(prev => [...prev, { board: currentBoard, turn: currentTurn }]);

    playPlaceSound();
    setTimeout(() => playFlipSound(), 100);

    const newBoard = currentBoard.map(row => [...row]);
    newBoard[r][c] = color;
    flippable.forEach(([fr, fc]) => {
      newBoard[fr][fc] = color;
    });

    setFlippedStones(flippable.map(([fr, fc]) => `${fr}-${fc}`));
    setTimeout(() => setFlippedStones([]), 500);

    const nextTurn = getOpponent(color);
    setBoard(newBoard);
    setTurn(nextTurn);
    updateStatus(nextTurn, newBoard);

    if (isLocal) {
      socket.emit('place_stone', { roomId, row: r, col: c, color });
      socket.emit('update_board', { roomId, board: newBoard, nextTurn });
      
      checkAutoPass(newBoard, nextTurn);
    }
  };

  const checkAutoPass = (currentBoard, currentTurn) => {
    if (getValidMoves(currentBoard, currentTurn).length === 0) {
      const nextTurn = getOpponent(currentTurn);
      if (getValidMoves(currentBoard, nextTurn).length > 0) {
        setTimeout(() => {
          toast.error(`${currentTurn === 'B' ? '黒' : '白'}は置ける場所がないためパスになります`);
          setTurn(nextTurn);
          socket.emit('pass_turn', { roomId, nextTurn });
          updateStatus(nextTurn, currentBoard);
        }, 800);
      }
    }
  };

  const onCellClick = (r, c) => {
    if (!playerColor || turn !== playerColor) return; 
    if (board[r][c] !== null) return;
    handleMove(r, c, playerColor, true);
  };

  const createRoom = () => {
    if (!username.trim()) { toast.error('名前を入力してください'); return; }
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.emit('create_room', { roomId: id, username });
  };

  const joinRoom = () => {
    if (!username.trim()) { toast.error('名前を入力してください'); return; }
    if (inputRoomId) {
      socket.emit('join_room', { roomId: inputRoomId.toUpperCase(), username });
    }
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('招待リンクをコピーしました！友達に送ってください');
    }).catch(() => {
      toast.error('コピーに失敗しました');
    });
  };

  const validMoves = playerColor === turn ? getValidMoves(board, playerColor) : [];
  const counts = getCounts(board);

  return (
    <div className="app-container">
      <Toaster position="top-center" reverseOrder={false} />

      <select className="theme-selector" value={theme} onChange={e => setTheme(e.target.value)}>
        <option value="classic">Classic (Green)</option>
        <option value="glass">Dark Glassmorphism</option>
        <option value="cyberpunk">Cyberpunk</option>
      </select>

      <div className="glass-panel" style={{ position: 'relative' }}>
        <h1 className="header">Online Othello</h1>
        
        {!playerColor ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input 
              type="text" 
              placeholder="あなたの名前（表示名）" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              maxLength={15}
            />
            <button className="btn" onClick={createRoom}>新しく部屋を作成する</button>
            <div style={{ textAlign: 'center', opacity: 0.8, fontSize: '0.9rem' }}>--- または ---</div>
            <input 
              type="text" 
              placeholder="ルームIDを入力" 
              value={inputRoomId} 
              onChange={e => setInputRoomId(e.target.value)} 
            />
            <button className="btn" onClick={joinRoom} style={{background: 'var(--p2-stone)', color: 'var(--bg-color)'}}>
              入力した部屋に参加する
            </button>
            <div className="status" style={{ fontSize: '1rem', marginTop: '10px' }}>{statusText}</div>
          </div>
        ) : (
          <>
            <div className="status">{statusText}</div>
            
            {!players.W && roomId && (
              <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <p>ルームID: <strong>{roomId}</strong></p>
                <button onClick={copyInviteLink} style={{ padding: '8px', cursor: 'pointer', borderRadius: '5px', background: 'var(--button-bg)', border: 'none', color: '#fff' }}>
                  📋 招待リンクをコピー
                </button>
              </div>
            )}

            <div className="info-bar" style={{fontSize: '1rem', marginBottom: '10px'}}>
              <div style={{textAlign: 'left'}}>
                <span className="color-indicator B"></span> {players.B}<br/>
                <span style={{fontSize:'1.5rem'}}>{counts.bCount}</span>
              </div>
              <div style={{textAlign: 'right'}}>
                <span className="color-indicator W"></span> {players.W || '---' }<br/>
                <span style={{fontSize:'1.5rem'}}>{counts.wCount}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '10px', fontSize: '1.1rem' }}>
              あなたは <span className={`color-indicator ${playerColor}`}></span> です
            </div>
            
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

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '15px' }}>
              <button 
                onClick={requestUndo} 
                disabled={history.length === 0}
                style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: '#e0e0e0', color: '#333', cursor: history.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                ↩️ 待ったをリクエスト
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
