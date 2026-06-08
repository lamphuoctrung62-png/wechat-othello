const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SIZE = 8;
const PORT = Number(process.env.PORT || 8080);
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

const rooms = new Map();
const staticTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

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

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function getFlipsForMove(board, row, col, player) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) return [];
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

    if (line.length > 0 && isInside(cursorRow, cursorCol) && board[cursorRow][cursorCol] === player) {
      flips.push(...line);
    }
  }

  return flips;
}

function getLegalMoves(board, player) {
  const moves = new Map();

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const flips = getFlipsForMove(board, row, col, player);
      if (flips.length > 0) moves.set(`${row},${col}`, flips);
    }
  }

  return moves;
}

function countDiscs(board) {
  return board.flat().reduce(
    (counts, cell) => {
      if (cell === BLACK) counts.black += 1;
      if (cell === WHITE) counts.white += 1;
      return counts;
    },
    { black: 0, white: 0 },
  );
}

function createRoom(hostClientId) {
  const roomId = crypto.randomBytes(4).toString("hex");
  const room = {
    id: roomId,
    board: createInitialBoard(),
    currentPlayer: BLACK,
    lastMove: null,
    gameOver: false,
    version: 1,
    message: "房间已创建，黑棋先手。",
    changedCells: [],
    history: [],
    undoRequest: null,
    players: { black: hostClientId, white: null },
    updatedAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

function joinRoom(room, clientId) {
  if (room.players.black === clientId) return BLACK;
  if (room.players.white === clientId) return WHITE;
  if (!room.players.white) {
    room.players.white = clientId;
    room.message = "白棋已加入，可以开始对局。";
    touch(room);
    return WHITE;
  }
  return null;
}

function playerFor(room, clientId) {
  if (room.players.black === clientId) return BLACK;
  if (room.players.white === clientId) return WHITE;
  return null;
}

function playerName(player) {
  return player === BLACK ? "黑棋" : "白棋";
}

function touch(room) {
  room.version += 1;
  room.updatedAt = Date.now();
}

function finalizeIfNeeded(room) {
  const currentMoves = getLegalMoves(room.board, room.currentPlayer);
  const otherMoves = getLegalMoves(room.board, opponentOf(room.currentPlayer));

  if (currentMoves.size === 0 && otherMoves.size === 0) {
    room.gameOver = true;
    const counts = countDiscs(room.board);
    room.message = `终局：黑棋${counts.black}，白棋${counts.white}。`;
    if (counts.black > counts.white) room.message += "黑棋获胜。";
    if (counts.white > counts.black) room.message += "白棋获胜。恭喜张文琪大王获胜。";
    if (counts.white === counts.black) room.message += "平局。";
    return;
  }

  if (currentMoves.size === 0) {
    room.message = `${playerName(room.currentPlayer)}没有合法位置，可以跳过。`;
  }
}

function serializeRoom(room, clientId) {
  return {
    roomId: room.id,
    board: room.board,
    currentPlayer: room.currentPlayer,
    lastMove: room.lastMove,
    gameOver: room.gameOver,
    version: room.version,
    message: room.message,
    changedCells: room.changedCells,
    historyLength: room.history.length,
    undoRequest: room.undoRequest,
    player: playerFor(room, clientId),
    players: {
      blackJoined: Boolean(room.players.black),
      whiteJoined: Boolean(room.players.white),
    },
  };
}

function saveHistory(room) {
  room.history.push({
    board: cloneBoard(room.board),
    currentPlayer: room.currentPlayer,
    lastMove: room.lastMove ? { ...room.lastMove } : null,
    gameOver: room.gameOver,
    message: room.message,
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const { clientId } = await readJson(req);
    if (!clientId) return sendError(res, 400, "缺少 clientId");
    const room = createRoom(clientId);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{8})(?:\/(join|move|pass|undo|reset))?$/);
  if (!match) return sendError(res, 404, "接口不存在");

  const [, roomId, action] = match;
  const room = rooms.get(roomId);
  if (!room) return sendError(res, 404, "房间不存在或已过期");

  if (req.method === "GET" && !action) {
    const clientId = url.searchParams.get("clientId");
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  const payload = await readJson(req);
  const { clientId } = payload;
  if (!clientId) return sendError(res, 400, "缺少 clientId");

  if (req.method === "POST" && action === "join") {
    joinRoom(room, clientId);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  const player = playerFor(room, clientId);
  if (!player) return sendError(res, 403, "本局已有两位玩家");

  if (req.method === "POST" && action === "move") {
    if (room.gameOver) return sendError(res, 409, "本局已结束");
    if (player !== room.currentPlayer) return sendError(res, 409, "还没轮到你");

    const flips = getFlipsForMove(room.board, payload.row, payload.col, player);
    if (flips.length === 0) return sendError(res, 400, "这里不能落子");

    saveHistory(room);
    room.undoRequest = null;
    room.board[payload.row][payload.col] = player;
    for (const [row, col] of flips) room.board[row][col] = player;
    room.lastMove = { row: payload.row, col: payload.col };
    room.currentPlayer = opponentOf(player);
    room.changedCells = [[payload.row, payload.col], ...flips];
    room.message = `${playerName(player)}落子，翻转${flips.length}枚棋子。`;
    finalizeIfNeeded(room);
    touch(room);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  if (req.method === "POST" && action === "pass") {
    if (room.gameOver) return sendError(res, 409, "本局已结束");
    if (player !== room.currentPlayer) return sendError(res, 409, "还没轮到你");
    if (getLegalMoves(room.board, player).size > 0) return sendError(res, 400, "你还有可落子位置，不能跳过");

    room.currentPlayer = opponentOf(player);
    room.changedCells = [];
    room.undoRequest = null;
    room.message = `${playerName(player)}跳过，轮到${playerName(room.currentPlayer)}。`;
    finalizeIfNeeded(room);
    touch(room);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  if (req.method === "POST" && action === "undo") {
    if (room.history.length === 0) return sendError(res, 400, "没有可悔棋步骤");

    const otherPlayer = opponentOf(player);
    const otherClientId = otherPlayer === BLACK ? room.players.black : room.players.white;
    if (!otherClientId) return sendError(res, 400, "需要对方加入后才能请求悔棋");

    if (!room.undoRequest) {
      room.undoRequest = {
        requestedBy: player,
        requestedByClientId: clientId,
      };
      room.changedCells = [];
      room.message = `${playerName(player)}请求悔棋，等待${playerName(otherPlayer)}同意。`;
      touch(room);
      return sendJson(res, 200, serializeRoom(room, clientId));
    }

    if (room.undoRequest.requestedByClientId === clientId) {
      return sendError(res, 409, "已发送悔棋请求，等待对方同意");
    }

    const previous = room.history.pop();

    room.board = cloneBoard(previous.board);
    room.currentPlayer = previous.currentPlayer;
    room.lastMove = previous.lastMove;
    room.gameOver = previous.gameOver;
    room.message = `${playerName(player)}已同意悔棋，回到上一步。`;
    room.changedCells = [];
    room.undoRequest = null;
    touch(room);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  if (req.method === "POST" && action === "reset") {
    room.board = createInitialBoard();
    room.currentPlayer = BLACK;
    room.lastMove = null;
    room.gameOver = false;
    room.message = "新的一局开始，黑棋先手。";
    room.changedCells = [];
    room.history = [];
    room.undoRequest = null;
    touch(room);
    return sendJson(res, 200, serializeRoom(room, clientId));
  }

  return sendError(res, 404, "接口不存在");
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(__dirname, `.${requestPath}`);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": staticTypes.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(content);
  });
}

function cleanupRooms() {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (now - room.updatedAt > day) rooms.delete(roomId);
  }
}

setInterval(cleanupRooms, 60 * 60 * 1000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      console.error(error);
      sendError(res, 500, "服务器开小差了");
    });
    return;
  }

  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Othello room server running at http://127.0.0.1:${PORT}/`);
});
