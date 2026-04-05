import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import toast, { Toaster } from 'react-hot-toast';
import { INITIAL_BOARD, getFlippableStones, getValidMoves, getCounts, getOpponent } from './gameLogic';
import { getBestBotMove } from './botLogic';
import { playPlaceSound, playFlipSound, playWinSound } from './soundEffects';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [board, setBoard] = useState(INITIAL_BOARD);
  const [turn, setTurn] = useState('B');
  const [roomId, setRoomId] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [players, setPlayers] = useState({ B: '', W: null });
  const [playerColor, setPlayerColor] = useState(null);
  const [statusText, setStatusText] = useState('ルームに参加または作成してください');
  const [theme, setTheme] = useState('glass');
  const [flippedStones, setFlippedStones] = useState([]);
  
  // 1人プレイモード
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState('normal');

  // 履歴保存用
  const [history, setHistory] = useState([]);
  const boardRef = useRef(board);
  const turnRef = useRef(turn);
  const playersRef = useRef(players); // Track dynamically for waiting CPU status

  useEffect(() => {
    boardRef.current = board;
    turnRef.current = turn;
    playersRef.current = players;
  }, [board, turn, players]);

  // URLパラメータからのルーム入室
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setInputRoomId(roomParam);
      toast('招待リンクから来ましたね！参加を押してください。', { icon: '👋' });
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 待機中のCPU戦フラグ（動的評価用）
  const getIsWaitingMiniGame = () => (!isSinglePlayer && roomId && !playersRef.current.W);

  // ソケット通信
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
      toast.success('対戦相手が見つかりました！ゲーム開始！', { icon: '⚔️', duration: 4000 });
    });

    socket.on('stone_placed', ({ row, col, color }) => {
      if (!isSinglePlayer && !getIsWaitingMiniGame()) {
          handleMove(row, col, color, false);
      }
    });

    socket.on('board_updated', ({ board: newBoard, turn: nextTurn }) => {
      if (!isSinglePlayer && !getIsWaitingMiniGame()) {
        setBoard(newBoard);
        setTurn(nextTurn);
        updateStatus(nextTurn, newBoard);
      }
    });

    socket.on('turn_passed', ({ turn: nextTurn }) => {
      if (!isSinglePlayer && !getIsWaitingMiniGame()) {
        setTurn(nextTurn);
        toast('相手がパスしました', { icon: '⏭️' });
        setStatusText(`パスされました。${nextTurn === 'B' ? '黒' : '白'}のターン`);
      }
    });

    socket.on('undo_requested', () => {
      if (isSinglePlayer || getIsWaitingMiniGame()) return;
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
      revertHistory(false);
    });

    socket.on('undo_rejected', () => {
      toast.error('「待った」は拒否されました...');
    });

    socket.on('error', (msg) => {
      toast.error(msg);
    });

    socket.on('player_disconnected', () => {
      if (!isSinglePlayer && !getIsWaitingMiniGame()) {
        toast.error('相手との通信が切断されました', { duration: 5000 });
        setStatusText('相手との通信が切断されました');
      }
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
  }, [roomId, history, isSinglePlayer]); 

  // シングルプレイ・待機中の CPU ターン監視
  useEffect(() => {
    const isWaitingMiniGame = getIsWaitingMiniGame();
    if ((isSinglePlayer || isWaitingMiniGame) && turn === 'W' && playerColor === 'B') {
      
      const difficultyToUse = isWaitingMiniGame ? 'expert' : botDifficulty;
      
      const timer = setTimeout(() => {
        // もしこの1秒の間に相手が入ってきて waiting 状態が解除されたら打たない
        if (getIsWaitingMiniGame() === false && isSinglePlayer === false) return;

        const botMove = getBestBotMove(boardRef.current, 'W', difficultyToUse);
        if (botMove) {
          handleMove(botMove[0], botMove[1], 'W', false);
        } else {
          toast('CPUがパスしました', { icon: '⏭️' });
          const nextTurn = 'B';
          setTurn(nextTurn);
          updateStatus(nextTurn, boardRef.current);
          checkAutoPass(boardRef.current, 'B', isWaitingMiniGame);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [turn, isSinglePlayer, players.W, roomId, playerColor, botDifficulty]);

  const revertHistory = (localOnly = false) => {
    if (history.length > 0) {
      const isWaitingMiniGame = getIsWaitingMiniGame();
      if (isSinglePlayer || isWaitingMiniGame) {
        let pops = 2;
        if (history.length < 2) pops = 1;
        
        const prevIndex = Math.max(0, history.length - pops);
        const prev = history[prevIndex];
        setHistory(history.slice(0, prevIndex));
        setBoard(prev.board);
        setTurn('B'); 
        updateStatus('B', prev.board);
      } else {
        const prev = history[history.length - 1];
        setHistory(history.slice(0, -1));
        setBoard(prev.board);
        setTurn(prev.turn);
        if (!localOnly) {
          socket.emit('update_board', { roomId, board: prev.board, nextTurn: prev.turn });
        }
        updateStatus(prev.turn, prev.board);
      }
    }
  };

  const requestUndo = () => {
    if (history.length === 0) {
      toast.error('戻れる履歴がありません');
      return;
    }
    
    const isWaitingMiniGame = getIsWaitingMiniGame();
    if (isSinglePlayer || isWaitingMiniGame) {
      revertHistory(true);
      toast.success(isWaitingMiniGame ? 'ミニゲームの手を戻しました' : '待った！手元を戻しました');
      return;
    }

    toast('相手に「待った」をリクエストしました...', { icon: '⏳' });
    socket.emit('undo_request', roomId);
  };

  const updateStatus = (currentTurn, currentBoard) => {
    const counts = getCounts(currentBoard);
    if (getValidMoves(currentBoard, 'B').length === 0 && getValidMoves(currentBoard, 'W').length === 0) {
      playWinSound(); 
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

    const isWaitingMiniGame = getIsWaitingMiniGame();

    if (isLocal && !isSinglePlayer && !isWaitingMiniGame) {
      socket.emit('place_stone', { roomId, row: r, col: c, color });
      socket.emit('update_board', { roomId, board: newBoard, nextTurn });
    }

    checkAutoPass(newBoard, nextTurn, isWaitingMiniGame);
  };

  const checkAutoPass = (currentBoard, currentTurn, currentIsWaitingMiniGame) => {
    if (getValidMoves(currentBoard, currentTurn).length === 0) {
      const nextTurn = getOpponent(currentTurn);
      if (getValidMoves(currentBoard, nextTurn).length > 0) {
        setTimeout(() => {
          toast.error(`${currentTurn === 'B' ? '黒' : '白'}は置ける場所がないためパスになります`);
          setTurn(nextTurn);
          if (!isSinglePlayer && currentTurn === playerColor && !currentIsWaitingMiniGame) {
             socket.emit('pass_turn', { roomId, nextTurn });
          }
          updateStatus(nextTurn, currentBoard);
        }, 800);
      }
    }
  };

  const onCellClick = (r, c) => {
    if (!playerColor || turn !== playerColor) return; 
    if (board[r][c] !== null) return;
    
    // 待機中であっても操作可能とし、自動的にミニゲームとして処理される
    handleMove(r, c, playerColor, true);
  };

  const startSinglePlayer = () => {
    setIsSinglePlayer(true);
    setRoomId('CPU_MATCH');
    setPlayerColor('B');
    setPlayers({ 
      B: 'あなた', 
      W: `CPU (${botDifficulty === 'easy' ? '弱い' : botDifficulty === 'normal' ? '普通' : botDifficulty === 'hard' ? '強い' : botDifficulty === 'expert' ? '最強' : '覚醒'})` 
    });
    setBoard(INITIAL_BOARD);
    setTurn('B');
    setHistory([]);
    setStatusText('CPU対戦開始！黒（あなた）のターン');
    toast.success('CPU対戦を開始します！', { icon: '🔥' });
  };

  const createRoom = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setIsSinglePlayer(false);
    socket.emit('create_room', { roomId: id, username: 'Player 1' });
  };

  const joinRoom = () => {
    if (inputRoomId) {
      setIsSinglePlayer(false);
      socket.emit('join_room', { roomId: inputRoomId.toUpperCase(), username: 'Player 2' });
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

  const quitGame = () => {
     window.location.href = '/';
  }

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
            
            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <h3 style={{marginTop: 0, textAlign: 'center'}}>🔥 ひとりで遊ぶ</h3>
              <select style={{marginBottom: '10px'}} value={botDifficulty} onChange={e => setBotDifficulty(e.target.value)}>
                <option value="easy">難易度：弱い</option>
                <option value="normal">難易度：普通</option>
                <option value="hard">難易度：強い</option>
                <option value="expert">難易度：最強 (4手読み)</option>
                <option value="grandmaster">難易度：覚醒 (5手＋戦術)</option>
              </select>
              <button className="btn" onClick={startSinglePlayer} style={{background: '#e91e63'}}>CPUと対戦する</button>
            </div>

            <div style={{ padding: '15px', background: 'rgba(0,0,0,0.1)', borderRadius: '10px' }}>
              <h3 style={{marginTop: 0, textAlign: 'center'}}>🌐 誰かと遊ぶ</h3>
              <button className="btn" onClick={createRoom} style={{marginBottom: '10px'}}>新しく部屋を作成する</button>
              <div style={{ textAlign: 'center', opacity: 0.8, fontSize: '0.9rem', marginBottom: '10px' }}>--- または ---</div>
              <input 
                type="text" 
                placeholder="ルームIDを入力" 
                value={inputRoomId} 
                onChange={e => setInputRoomId(e.target.value)} 
                style={{marginBottom: '10px'}}
              />
              <button className="btn" onClick={joinRoom} style={{background: 'var(--p2-stone)', color: 'var(--bg-color)'}}>
                入力した部屋に参加する
              </button>
            </div>
            
            <div className="status" style={{ fontSize: '1rem', marginTop: '10px' }}>{statusText}</div>
          </div>
        ) : (
          <>
            <div className="status">{statusText}</div>
            
            {!players.W && roomId && !isSinglePlayer && (
              <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                <p style={{ margin: '0 0 5px 0' }}>ルームID: <strong>{roomId}</strong></p>
                <button onClick={copyInviteLink} style={{ padding: '6px', cursor: 'pointer', borderRadius: '5px', background: 'var(--button-bg)', border: 'none', color: '#fff' }}>
                  📋 招待リンクをコピー
                </button>
                <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '7px', fontWeight: 'bold' }}>
                  💡待機中はCPU(最強)と盤面で遊べます↓
                </div>
              </div>
            )}

            <div className="info-bar" style={{fontSize: '1rem', marginBottom: '10px'}}>
              <div style={{textAlign: 'left'}}>
                <span className="color-indicator B"></span> {players.B || '待機中...'}<br/>
                <span style={{fontSize:'1.5rem'}}>{counts.bCount}</span>
              </div>
              <div style={{textAlign: 'right'}}>
                <span className="color-indicator W"></span> {(!players.W && roomId && !isSinglePlayer) ? 'CPU(待機中)' : (players.W || '待機中...') }<br/>
                <span style={{fontSize:'1.5rem'}}>{counts.wCount}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '5px', fontSize: '1rem' }}>
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

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '5px' }}>
              <button 
                onClick={requestUndo} 
                disabled={history.length === 0}
                style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: '#e0e0e0', color: '#333', cursor: history.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                ↩️ 待った
              </button>
              <button 
                onClick={quitGame}
                style={{ padding: '8px 15px', borderRadius: '8px', border: 'none', background: '#f44336', color: '#fff', cursor: 'pointer' }}
              >
                終了する
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
