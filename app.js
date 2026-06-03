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

const boardEl = document.querySelector("#board");
const blackScoreEl = document.querySelector("#blackScore");
const whiteScoreEl = document.querySelector("#whiteScore");
const turnTextEl = document.querySelector("#turnText");
const turnDiscEl = document.querySelector("#turnDisc");
const gameMessageEl = document.querySelector("#gameMessage");
const passButton = document.querySelector("#passButton");
const newGameButton = document.querySelector("#newGameButton");
const undoButton = document.querySelector("#undoButton");
const shareButton = document.querySelector("#shareButton");
const blackScoreCard = document.querySelector("#blackScoreCard");
const whiteScoreCard = document.querySelector("#whiteScoreCard");
const roomLinkEl = document.querySelector("#roomLink");
const clientId = getClientId();
const urlParams = new URLSearchParams(window.location.search);

let board = createInitialBoard();
let currentPlayer = BLACK;
let lastMove = null;
let gameOver = false;
let legalMoves = new Map();
let history = [];
let changedCells = [];
let roomId = urlParams.get("room");
let roomVersion = 0;
let myPlayer = null;
let isRoomMode = Boolean(roomId);
let isPolling = false;

function createInitialBoard() {
  const nextBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  nextBoard[3][3] = WHITE;
  nextBoard[3][4] = BLACK;
  nextBoard[4][3] = BLACK;
  nextBoard[4][4] = WHITE;
  return nextBoard;
}

function opponentOf(player) {
  return player === BLACK ? WHITE : BLACK;
}

function playerName(player) {
  return player === BLACK ? "黑棋" : "白棋";
}

function getClientId() {
  const key = "othello-client-id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function isInside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function moveKey(row, col) {
  return `${row},${col}`;
}

function getFlipsForMove(nextBoard, row, col, player) {
  if (nextBoard[row][col] !== EMPTY) return [];

  const opponent = opponentOf(player);
  const flips = [];

  for (const [rowStep, colStep] of DIRECTIONS) {
    let cursorRow = row + rowStep;
    let cursorCol = col + colStep;
    const line = [];

    while (isInside(cursorRow, cursorCol) && nextBoard[cursorRow][cursorCol] === opponent) {
      line.push([cursorRow, cursorCol]);
      cursorRow += rowStep;
      cursorCol += colStep;
    }

    if (
      line.length > 0 &&
      isInside(cursorRow, cursorCol) &&
      nextBoard[cursorRow][cursorCol] === player
    ) {
      flips.push(...line);
    }
  }

  return flips;
}

function getLegalMoves(nextBoard, player) {
  const moves = new Map();

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const flips = getFlipsForMove(nextBoard, row, col, player);
      if (flips.length > 0) moves.set(moveKey(row, col), flips);
    }
  }

  return moves;
}

function countDiscs() {
  return board.flat().reduce(
    (counts, cell) => {
      if (cell === BLACK) counts.black += 1;
      if (cell === WHITE) counts.white += 1;
      return counts;
    },
    { black: 0, white: 0 },
  );
}

function cloneBoard(nextBoard) {
  return nextBoard.map((row) => [...row]);
}

function saveHistory() {
  history.push({
    board: cloneBoard(board),
    currentPlayer,
    lastMove: lastMove ? { ...lastMove } : null,
    gameOver,
  });
}

function canAct() {
  return !isRoomMode || (myPlayer && myPlayer === currentPlayer);
}

function renderBoard() {
  boardEl.replaceChildren();

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = document.createElement("button");
      const value = board[row][col];
      const key = moveKey(row, col);

      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", `${row + 1}行${col + 1}列`);

      if (value === BLACK || value === WHITE) {
        const piece = document.createElement("span");
        piece.className = `disc-piece ${value === BLACK ? "black" : "white"}`;
        piece.setAttribute("aria-hidden", "true");
        cell.append(piece);
      }

      if (!gameOver && canAct() && legalMoves.has(key)) cell.classList.add("legal");
      if (lastMove && lastMove.row === row && lastMove.col === col) {
        cell.classList.add("last-move");
      }

      cell.addEventListener("click", () => playMove(row, col));
      boardEl.append(cell);
    }
  }

  animateChangedCells();
}

function renderStatus(message) {
  const counts = countDiscs();
  const myTurn = canAct();
  blackScoreEl.textContent = counts.black;
  whiteScoreEl.textContent = counts.white;
  turnDiscEl.className = `disc tiny ${currentPlayer === BLACK ? "black" : "white"}`;
  turnTextEl.textContent = gameOver ? "本局结束" : `${playerName(currentPlayer)}行棋`;
  blackScoreCard.classList.toggle("is-active", !gameOver && currentPlayer === BLACK);
  whiteScoreCard.classList.toggle("is-active", !gameOver && currentPlayer === WHITE);
  passButton.disabled = gameOver || legalMoves.size > 0 || !myTurn;
  undoButton.disabled = history.length === 0 || (isRoomMode && !myPlayer);
  newGameButton.disabled = isRoomMode && !myPlayer;
  gameMessageEl.textContent = message;
}

function refresh(message = "绿色提示点是当前可落子位置。") {
  legalMoves = getLegalMoves(board, currentPlayer);
  const otherMoves = getLegalMoves(board, opponentOf(currentPlayer));

  if (legalMoves.size === 0 && otherMoves.size === 0) {
    endGame();
    return;
  }

  if (legalMoves.size === 0) {
    renderBoard();
    renderStatus(`${playerName(currentPlayer)}没有合法位置，可以点“跳过”。`);
    return;
  }

  renderBoard();
  renderStatus(message);
}

function renderSyncedState(message) {
  legalMoves = getLegalMoves(board, currentPlayer);
  renderBoard();
  renderStatus(message);
}

async function playMove(row, col) {
  if (gameOver) return;

  const key = moveKey(row, col);
  const flips = legalMoves.get(key);
  if (!flips) {
    animateInvalidMove(row, col);
    return;
  }

  if (isRoomMode) {
    if (!canAct()) {
      animateInvalidMove(row, col);
      gameMessageEl.textContent = myPlayer ? "还没轮到你。" : "本局已有两位玩家，你正在观战。";
      return;
    }

    await roomAction("move", { row, col });
    return;
  }

  saveHistory();
  board[row][col] = currentPlayer;
  for (const [flipRow, flipCol] of flips) {
    board[flipRow][flipCol] = currentPlayer;
  }

  lastMove = { row, col };
  changedCells = [[row, col], ...flips];
  currentPlayer = opponentOf(currentPlayer);
  refresh(`${playerName(opponentOf(currentPlayer))}落子，翻转${flips.length}枚棋子。`);
}

async function passTurn() {
  if (gameOver || legalMoves.size > 0) return;
  if (isRoomMode) {
    await roomAction("pass");
    return;
  }
  currentPlayer = opponentOf(currentPlayer);
  refresh(`${playerName(opponentOf(currentPlayer))}跳过，轮到${playerName(currentPlayer)}。`);
}

async function undoMove() {
  if (isRoomMode) {
    await roomAction("undo");
    return;
  }

  const previous = history.pop();
  if (!previous) return;

  board = cloneBoard(previous.board);
  currentPlayer = previous.currentPlayer;
  lastMove = previous.lastMove;
  gameOver = previous.gameOver;
  changedCells = [];
  refresh("已悔棋，回到上一步。");
}

function endGame() {
  gameOver = true;
  legalMoves = new Map();

  const counts = countDiscs();
  let message = `终局：黑棋${counts.black}，白棋${counts.white}。`;
  if (counts.black > counts.white) message += "黑棋获胜。";
  if (counts.white > counts.black) message += "白棋获胜。";
  if (counts.white === counts.black) message += "平局。";

  renderBoard();
  renderStatus(message);
}

async function newGame() {
  if (isRoomMode) {
    await roomAction("reset");
    return;
  }

  board = createInitialBoard();
  currentPlayer = BLACK;
  lastMove = null;
  gameOver = false;
  history = [];
  changedCells = [];
  refresh("新的一局开始，黑棋先手。");
}

function applyRoomState(state, animate = false) {
  board = state.board;
  currentPlayer = state.currentPlayer;
  lastMove = state.lastMove;
  gameOver = state.gameOver;
  roomVersion = state.version;
  myPlayer = state.player;
  history = Array.from({ length: state.historyLength }, () => null);
  changedCells = animate ? state.changedCells || [] : [];

  const roleText = myPlayer ? `你执${playerName(myPlayer)}。` : "本局已有两位玩家，你正在观战。";
  const waitingText = state.players.whiteJoined ? "" : " 等白棋加入。";
  roomLinkEl.textContent = `房间 ${state.roomId}。${roleText}${waitingText}`;
  renderSyncedState(state.message);
}

async function roomRequest(path, payload, method = "POST") {
  const options = {
    method,
    headers: { "content-type": "application/json" },
  };

  if (payload) options.body = JSON.stringify({ clientId, ...payload });

  const response = await fetch(path, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "房间同步失败");
  }

  return data;
}

async function roomAction(action, payload = {}) {
  try {
    const state = await roomRequest(`/api/rooms/${roomId}/${action}`, payload);
    applyRoomState(state, true);
  } catch (error) {
    gameMessageEl.textContent = error.message;
  }
}

async function createRoom() {
  const state = await roomRequest("/api/rooms", {});
  roomId = state.roomId;
  isRoomMode = true;
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  window.history.replaceState({}, "", url);
  applyRoomState(state);
  startPolling();
  return url.toString();
}

async function joinRoom() {
  try {
    const state = await roomRequest(`/api/rooms/${roomId}/join`, {});
    applyRoomState(state);
    startPolling();
  } catch (error) {
    isRoomMode = false;
    roomLinkEl.textContent = "房间不存在或已过期，可以重新创建链接。";
    refresh(error.message);
  }
}

function startPolling() {
  if (isPolling) return;
  isPolling = true;

  const poll = async () => {
    if (!isRoomMode || !roomId) return;

    try {
      const response = await fetch(`/api/rooms/${roomId}?clientId=${encodeURIComponent(clientId)}`, {
        cache: "no-store",
      });
      const state = await response.json();
      if (response.ok && state.version !== roomVersion) {
        applyRoomState(state, true);
      }
    } catch {
      gameMessageEl.textContent = "正在重连房间...";
    } finally {
      window.setTimeout(poll, 900);
    }
  };

  window.setTimeout(poll, 900);
}

function animateChangedCells() {
  if (!window.gsap || changedCells.length === 0) return;

  for (const [index, [row, col]] of changedCells.entries()) {
    const piece = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"] .disc-piece`);
    if (!piece) continue;

    window.gsap.fromTo(
      piece,
      {
        rotationY: -180,
        scale: 0.72,
        y: -3,
        transformPerspective: 620,
      },
      {
        rotationY: 0,
        scale: 1,
        y: 0,
        duration: 0.46,
        delay: index * 0.025,
        ease: "back.out(1.7)",
      },
    );
  }

  changedCells = [];
}

function animateInvalidMove(row, col) {
  if (!window.gsap) return;

  const cell = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;

  window.gsap.fromTo(
    cell,
    { x: -3 },
    { x: 0, duration: 0.22, ease: "elastic.out(1, 0.35)", clearProps: "transform" },
  );
}

function wireButtonMotion() {
  if (!window.gsap) return;

  for (const button of document.querySelectorAll("button")) {
    button.addEventListener("pointerdown", () => {
      if (button.disabled) return;
      window.gsap.to(button, { scale: 0.96, duration: 0.08, ease: "power1.out" });
    });

    button.addEventListener("pointerup", () => {
      window.gsap.to(button, { scale: 1, duration: 0.18, ease: "back.out(2)" });
    });

    button.addEventListener("pointerleave", () => {
      window.gsap.to(button, { scale: 1, duration: 0.16, ease: "power1.out" });
    });
  }
}

async function copyInviteLink() {
  let inviteUrl = window.location.href;

  try {
    if (!isRoomMode) {
      inviteUrl = await createRoom();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      inviteUrl = url.toString();
    }

    await navigator.clipboard.writeText(inviteUrl);
    gameMessageEl.textContent = "房间链接已复制，发给她就能加入同一局。";
  } catch {
    roomLinkEl.textContent = inviteUrl;
    gameMessageEl.textContent = "当前浏览器不允许自动复制，链接已显示在下方。";
  }
}

passButton.addEventListener("click", passTurn);
newGameButton.addEventListener("click", newGame);
undoButton.addEventListener("click", undoMove);
shareButton.addEventListener("click", copyInviteLink);

wireButtonMotion();
if (isRoomMode) {
  joinRoom();
} else {
  roomLinkEl.textContent = "点击右上角分享按钮创建房间链接。";
  refresh();
}
