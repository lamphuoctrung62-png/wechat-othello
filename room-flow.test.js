const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const PORT = 8092;
const BASE = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, body, method = "POST") {
  const options = { method, headers: { "content-type": "application/json" } };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BASE}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      await wait(100);
    }
  }
  throw new Error("Server did not start");
}

function count(board, disc) {
  return board.flat().filter((cell) => cell === disc).length;
}

async function main() {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });

  try {
    await waitForServer();

    const created = await request("/api/rooms", { clientId: "black-test" });
    const roomPath = `/api/rooms/${created.roomId}`;
    const joined = await request(`${roomPath}/join`, { clientId: "white-test" });
    assert.equal(created.player, 1);
    assert.equal(joined.player, 2);

    const moved = await request(`${roomPath}/move`, {
      clientId: "black-test",
      row: 2,
      col: 3,
    });
    assert.equal(count(moved.board, 1), 4);
    assert.equal(moved.currentPlayer, 2);

    const requestedUndo = await request(`${roomPath}/undo`, { clientId: "black-test" });
    assert.equal(count(requestedUndo.board, 1), 4);
    assert.equal(requestedUndo.undoRequest.requestedBy, 1);

    const approvedUndo = await request(`${roomPath}/undo`, { clientId: "white-test" });
    assert.equal(count(approvedUndo.board, 1), 2);
    assert.equal(approvedUndo.currentPlayer, 1);
    assert.equal(approvedUndo.undoRequest, null);

    const movedAgain = await request(`${roomPath}/move`, {
      clientId: "black-test",
      row: 2,
      col: 3,
    });
    assert.equal(count(movedAgain.board, 1), 4);
    assert.equal(movedAgain.currentPlayer, 2);

    console.log("Room undo flow tests passed.");
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
