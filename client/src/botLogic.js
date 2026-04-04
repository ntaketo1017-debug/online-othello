import { getValidMoves, getFlippableStones } from './gameLogic';

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

export function getBestBotMove(board, color, difficulty) {
  const validMoves = getValidMoves(board, color);
  if (validMoves.length === 0) return null;

  if (difficulty === 'easy') {
    // ランダム手
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
    // 盤面の位置の重み（ポジショナル戦略）をベースに選ぶ
    let maxScore = -Infinity;
    let bestMoves = [];

    for (const move of validMoves) {
      const flippable = getFlippableStones(board, move[0], move[1], color);
      const row = move[0];
      const col = move[1];
      
      // 角が取れるなら最優先、それ以外はスコア評価
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

  return validMoves[0];
}
