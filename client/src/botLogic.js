import { getValidMoves, getFlippableStones, getOpponent } from './gameLogic';

// オセロの一般的な配置重み（角が一番大きく、角の斜め前が大きなマイナス）
const BOARD_WEIGHTS = [
  [120, -20,  20,   5,   5,  20, -20, 120],
  [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
  [120, -20,  20,   5,   5,  20, -20, 120]
];

// --- Minimax用 ヘルパー関数 ---
function simulateMove(board, row, col, color) {
  const flippable = getFlippableStones(board, row, col, color);
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = color;
  flippable.forEach(([fr, fc]) => {
    newBoard[fr][fc] = color;
  });
  return newBoard;
}

// ターゲット(myColor)視点での盤面の有利さをスコア化
function evaluateBoard(board, myColor) {
  let score = 0;
  const oppColor = getOpponent(myColor);
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell === myColor) {
        score += BOARD_WEIGHTS[r][c];
      } else if (cell === oppColor) {
        score -= BOARD_WEIGHTS[r][c];
      }
    }
  }
  return score;
}

// アルファベータ枝刈りを伴うMinimax再帰関数
function minimax(board, depth, alpha, beta, isMaximizing, myColor, oppColor, currentTurn) {
  if (depth === 0) {
    return evaluateBoard(board, myColor);
  }

  const validMoves = getValidMoves(board, currentTurn);

  if (validMoves.length === 0) {
    // 置ける場所がない場合はパス
    const oppMoves = getValidMoves(board, getOpponent(currentTurn));
    if (oppMoves.length === 0) {
      // 双方パス（ゲームオーバー）なら確実に評価を確定させる
      return evaluateBoard(board, myColor);
    }
    // 相手のターンとして探索を続行
    return minimax(board, depth - 1, alpha, beta, !isMaximizing, myColor, oppColor, getOpponent(currentTurn));
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], currentTurn);
      const ev = minimax(newBoard, depth - 1, alpha, beta, false, myColor, oppColor, oppColor);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break; // 枝刈り（これ以上計算しても意味がないルートを打ち切る）
    }
    return maxEval;
  } else {
    // 相手のターン（最もこちらが不利になる嫌な手を選んでくると仮定）
    let minEval = Infinity;
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], currentTurn);
      const ev = minimax(newBoard, depth - 1, alpha, beta, true, myColor, oppColor, myColor);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break; // 枝刈り
    }
    return minEval;
  }
}
// ---------------------------------

export function getBestBotMove(board, color, difficulty) {
  const validMoves = getValidMoves(board, color);
  if (validMoves.length === 0) return null;

  if (difficulty === 'easy') {
    // 完全ランダム手
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
  }

  if (difficulty === 'normal') {
    // ひっくり返せる枚数が最も多い手
    let maxFlips = -1;
    let bestMoves = [];
    for (const move of validMoves) {
      const flippable = getFlippableStones(board, move[0], move[1], color);
      if (flippable.length > maxFlips) {
        maxFlips = flippable.length;
        bestMoves = [move];
      } else if (flippable.length === maxFlips) {
        bestMoves.push(move);
      }
    }
    const randomIndex = Math.floor(Math.random() * bestMoves.length);
    return bestMoves[randomIndex];
  }

  if (difficulty === 'hard') {
    // 1手先読み（そのターンの盤面位置重みのみ）
    let maxScore = -Infinity;
    let bestMoves = [];
    for (const move of validMoves) {
      const flippable = getFlippableStones(board, move[0], move[1], color);
      const row = move[0];
      const col = move[1];
      const score = BOARD_WEIGHTS[row][col] + (flippable.length * 0.5);
      
      if (score > maxScore) {
        maxScore = score;
        bestMoves = [move];
      } else if (score === maxScore) {
        bestMoves.push(move);
      }
    }
    const randomIndex = Math.floor(Math.random() * bestMoves.length);
    return bestMoves[randomIndex];
  }

  if (difficulty === 'expert') {
    // 【最強モード】数手先読み（Minimax法 + Alpha-Beta枝刈り）
    const oppColor = getOpponent(color);
    let bestScore = -Infinity;
    let bestMoves = [];
    
    // ブラウザの負荷を考慮し4手先読みとする（十分に強い）
    const depth = 4;

    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], color);
      // 次は相手のターンになるため isMaximizing = false
      const score = minimax(newBoard, depth - 1, -Infinity, Infinity, false, color, oppColor, oppColor);
      
      // 同じスコアならランダム性を持たせるため配列に詰める
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }
    const randomIndex = Math.floor(Math.random() * bestMoves.length);
    return bestMoves[randomIndex];
  }

  return validMoves[0];
}
