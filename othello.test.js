const assert = require("node:assert/strict");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SIZE = 8;
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function createInitialBoard() {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  return board;
}

function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

function isInside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function getFlipsForMove(board, row, col, player) {
  if (board[row][col] !== EMPTY) return [];

  const opponent = opponentOf(player);
  const flips = [];

  for (const [rowStep, colStep] of DIRECTIONS) {
    let cursorRow = row + rowStep;
    let cursorCol = col + colStep;
    const line = [];

    while (isInside(cursorRow, cursorCol) && board[cursorRow][cursorCol] === opponent) {
      line.push([cursorRow, cursorCol]);
      cursorRow += rowStep;
      cursorCol += colStep;
    }

    if (line.length && isInside(cursorRow, cursorCol) && board[cursorRow][cursorCol] === player) {
      flips.push(...line);
    }
  }

  return flips;
}

function getLegalMoves(board, player) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const flips = getFlipsForMove(board, row, col, player);
      if (flips.length) moves.push({ row, col, flips });
    }
  }
  return moves;
}

const board = createInitialBoard();
const openingMoves = getLegalMoves(board, BLACK);
assert.equal(openingMoves.length, 4);
assert.deepEqual(
  openingMoves.map(({ row, col }) => [row, col]).sort(),
  [
    [2, 3],
    [3, 2],
    [4, 5],
    [5, 4],
  ],
);

const move = openingMoves.find(({ row, col }) => row === 2 && col === 3);
assert.equal(move.flips.length, 1);
board[2][3] = BLACK;
for (const [row, col] of move.flips) board[row][col] = BLACK;

const blackCount = board.flat().filter((cell) => cell === BLACK).length;
const whiteCount = board.flat().filter((cell) => cell === WHITE).length;
assert.equal(blackCount, 4);
assert.equal(whiteCount, 1);
assert.equal(getLegalMoves(board, WHITE).length, 3);

console.log("Othello rule tests passed.");
