export const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

export const INITIAL_BOARD = Array(8).fill(null).map(() => Array(8).fill(null));
INITIAL_BOARD[3][3] = 'W';
INITIAL_BOARD[3][4] = 'B';
INITIAL_BOARD[4][3] = 'B';
INITIAL_BOARD[4][4] = 'W';

export function getOpponent(color) {
  return color === 'B' ? 'W' : 'B';
}

export function isValidPosition(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function getFlippableStones(board, r, c, color) {
  if (board[r][c] !== null) return [];

  const opponent = getOpponent(color);
  let flippable = [];

  for (const [dr, dc] of DIRECTIONS) {
    let r2 = r + dr;
    let c2 = c + dc;
    let currentDirFlippable = [];

    while (isValidPosition(r2, c2) && board[r2][c2] === opponent) {
      currentDirFlippable.push([r2, c2]);
      r2 += dr;
      c2 += dc;
    }

    if (isValidPosition(r2, c2) && board[r2][c2] === color && currentDirFlippable.length > 0) {
      flippable = flippable.concat(currentDirFlippable);
    }
  }

  return flippable;
}

export function getValidMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (getFlippableStones(board, r, c, color).length > 0) {
        moves.push([r, c]);
      }
    }
  }
  return moves;
}

export function getCounts(board) {
  let bCount = 0;
  let wCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === 'B') bCount++;
      if (board[r][c] === 'W') wCount++;
    }
  }
  return { bCount, wCount };
}
