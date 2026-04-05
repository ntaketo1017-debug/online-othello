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

function simulateMove(board, row, col, color) {
  const flippable = getFlippableStones(board, row, col, color);
  const newBoard = board.map(r => [...r]);
  newBoard[row][col] = color;
  flippable.forEach(([fr, fc]) => {
    newBoard[fr][fc] = color;
  });
  return newBoard;
}

// シンプルなポジションスコア
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

// 高度なスコア（ポジションスコア ＋ モビリティ（着手可能数）の評価）
function evaluateBoardAdvanced(board, myColor) {
  let positionalScore = evaluateBoard(board, myColor);
  
  const oppColor = getOpponent(myColor);
  const myMovesCount = getValidMoves(board, myColor).length;
  const oppMovesCount = getValidMoves(board, oppColor).length;
  
  // 自分が打てる場所が多く、相手が打てないほど高い加点
  // 重み: 着手手数1つにつき 10点 とする（角に匹敵するほど中盤で重要）
  const mobilityScore = (myMovesCount - oppMovesCount) * 10;
  
  return positionalScore + mobilityScore;
}

function minimax(board, depth, alpha, beta, isMaximizing, myColor, oppColor, currentTurn, useAdvanced = false) {
  if (depth === 0) {
    return useAdvanced ? evaluateBoardAdvanced(board, myColor) : evaluateBoard(board, myColor);
  }

  const validMoves = getValidMoves(board, currentTurn);

  if (validMoves.length === 0) {
    const oppMoves = getValidMoves(board, getOpponent(currentTurn));
    if (oppMoves.length === 0) {
      // 完全終了時は、石の数の純粋な差に絶対的な価値を置く
      let myCount = 0;
      let oppCount = 0;
      for(let r=0; r<8; r++){
        for(let c=0; c<8; c++){
          if(board[r][c] === myColor) myCount++;
          else if(board[r][c] === oppColor) oppCount++;
        }
      }
      return (myCount - oppCount) * 1000; 
    }
    return minimax(board, depth - 1, alpha, beta, !isMaximizing, myColor, oppColor, getOpponent(currentTurn), useAdvanced);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], currentTurn);
      const ev = minimax(newBoard, depth - 1, alpha, beta, false, myColor, oppColor, oppColor, useAdvanced);
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], currentTurn);
      const ev = minimax(newBoard, depth - 1, alpha, beta, true, myColor, oppColor, myColor, useAdvanced);
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function getBestBotMove(board, color, difficulty) {
  const validMoves = getValidMoves(board, color);
  if (validMoves.length === 0) return null;

  if (difficulty === 'easy') {
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
  }

  if (difficulty === 'normal') {
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
    // 【最強】深さ4・ポジションスコアベース
    const oppColor = getOpponent(color);
    let bestScore = -Infinity;
    let bestMoves = [];
    const depth = 4;
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], color);
      const score = minimax(newBoard, depth - 1, -Infinity, Infinity, false, color, oppColor, oppColor, false);
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

  if (difficulty === 'grandmaster') {
    // 【超人（覚醒）】深さ5・高度なモビリティ評価込み
    const oppColor = getOpponent(color);
    let bestScore = -Infinity;
    let bestMoves = [];
    const depth = 5; 
    for (const move of validMoves) {
      const newBoard = simulateMove(board, move[0], move[1], color);
      const score = minimax(newBoard, depth - 1, -Infinity, Infinity, false, color, oppColor, oppColor, true);
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
