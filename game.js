// =====================================================================
// LetterLoom: a two-player crossword tile game.
//
// How this file is organized:
//   1. Settings      - board size, tile values, bonus squares
//   2. Game state    - one object that holds everything about the game
//   3. Setup         - making the bag, dealing tiles
//   4. Rules         - checking a move and scoring it
//   5. Actions       - what happens when you click a button
//   6. Drawing       - turning the state into HTML on the page
// =====================================================================


// ---------- 1. Settings ----------------------------------------------

const SIZE = 13;          // the board is 13 x 13
const CENTER = 6;         // middle square (counting from 0)
const RACK_SIZE = 7;      // tiles each player holds
const ALL_TILES_BONUS = 40; // bonus for using all 7 tiles in one move
const MAX_SCORELESS_TURNS = 4; // game ends after this many passes/swaps in a row

// letter: [how many in the bag, points]
const LETTERS = {
  A: [9, 1], B: [2, 4], C: [2, 3], D: [4, 2], E: [11, 1], F: [2, 4],
  G: [3, 2], H: [3, 3], I: [8, 1], J: [1, 7], K: [1, 6], L: [4, 1],
  M: [2, 3], N: [6, 1], O: [8, 1], P: [2, 3], Q: [1, 9], R: [6, 1],
  S: [5, 1], T: [6, 1], U: [4, 2], V: [2, 5], W: [2, 3], X: [1, 7],
  Y: [2, 3], Z: [1, 9],
};

// Bonus squares are defined for one corner of the board only.
// bonusAt() mirrors them so the board is symmetric in every direction.
// Keys are "a,b" where a <= b and both count in from the nearest edge.
const BONUS_PATTERN = {
  "0,0": "tw", "0,6": "tw",
  "1,1": "dw", "2,2": "dw", "3,3": "dw",
  "1,5": "tl", "5,5": "tl",
  "0,3": "dl", "2,6": "dl", "4,4": "dl", "3,5": "dl",
  "6,6": "dw", // the center star also doubles the first word
};

const BONUS_LABELS = { dl: "2L", tl: "3L", dw: "2W", tw: "3W" };

function bonusAt(row, col) {
  const a = Math.min(row, SIZE - 1 - row);
  const b = Math.min(col, SIZE - 1 - col);
  const key = Math.min(a, b) + "," + Math.max(a, b);
  return BONUS_PATTERN[key] || null;
}


// ---------- 2. Game state --------------------------------------------
// Everything that changes during the game lives in this one object.
// The drawing code only reads from it, which keeps things predictable.

let state;

function newState() {
  return {
    board: Array.from({ length: SIZE }, () => Array(SIZE).fill(null)),
    bag: [],
    players: [
      { name: "Player 1", score: 0, rack: [] },
      { name: "Player 2", score: 0, rack: [] },
    ],
    current: 0,          // index of the player whose turn it is
    pending: [],         // tiles placed this turn: { row, col, tile }
    selected: null,      // index of the selected tile in the rack
    scorelessTurns: 0,
    over: false,
    busy: false,         // true while we wait for the dictionary
  };
}


// ---------- 3. Setup -------------------------------------------------

let nextTileId = 1;

function makeBag() {
  const bag = [];
  for (const [letter, [count, value]] of Object.entries(LETTERS)) {
    for (let i = 0; i < count; i++) {
      bag.push({ id: nextTileId++, letter, value });
    }
  }
  return shuffle(bag);
}

// Fisher-Yates shuffle: the standard way to shuffle an array fairly.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillRack(player) {
  while (player.rack.length < RACK_SIZE && state.bag.length > 0) {
    player.rack.push(state.bag.pop());
  }
}

function startGame() {
  state = newState();
  state.bag = makeBag();
  state.players.forEach(refillRack);
  document.getElementById("log").innerHTML = "";
  say("Player 1 starts. Your first word must cover the star in the middle.");
  render();
}


// ---------- 4. Rules -------------------------------------------------

const cellAt = (r, c) =>
  r >= 0 && r < SIZE && c >= 0 && c < SIZE ? state.board[r][c] : null;

const boardIsEmpty = () =>
  state.board.every((row) => row.every((cell) => !cell || !cell.locked));

// Starting at (r, c), walk backwards to the start of the word,
// then forwards collecting every letter. dr/dc give the direction.
function wordThrough(r, c, dr, dc) {
  while (cellAt(r - dr, c - dc)) { r -= dr; c -= dc; }
  const cells = [];
  while (cellAt(r, c)) {
    cells.push({ row: r, col: c, tile: cellAt(r, c) });
    r += dr; c += dc;
  }
  return cells;
}

// Checks the tiles placed this turn. Returns either
// { error: "..." } or { words: [...], score: number }.
function checkMove() {
  const placed = state.pending;
  if (placed.length === 0) return { error: "Place some tiles first." };

  const rows = new Set(placed.map((p) => p.row));
  const cols = new Set(placed.map((p) => p.col));
  if (rows.size > 1 && cols.size > 1) {
    return { error: "Tiles must all be in one row or one column." };
  }

  // Direction of the main word. A single tile defaults to across;
  // the "down" word for it is then picked up as a cross word.
  const across = rows.size === 1;
  const [dr, dc] = across ? [0, 1] : [1, 0];

  // No gaps allowed between the first and last placed tile
  // (gaps already filled by earlier tiles are fine).
  const line = placed.map((p) => (across ? p.col : p.row));
  const fixed = across ? placed[0].row : placed[0].col;
  for (let i = Math.min(...line); i <= Math.max(...line); i++) {
    const r = across ? fixed : i;
    const c = across ? i : fixed;
    if (!cellAt(r, c)) return { error: "Your tiles can't have gaps between them." };
  }

  if (boardIsEmpty()) {
    if (!placed.some((p) => p.row === CENTER && p.col === CENTER)) {
      return { error: "The first word must cover the star." };
    }
    if (placed.length < 2) return { error: "The first word needs at least 2 letters." };
  } else {
    const touches = placed.some((p) =>
      [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
        const n = cellAt(p.row + a, p.col + b);
        return n && n.locked;
      })
    );
    if (!touches) return { error: "Your word must connect to tiles already on the board." };
  }

  // Collect the main word plus every cross word made along the way.
  const words = [];
  const main = wordThrough(placed[0].row, placed[0].col, dr, dc);
  if (main.length > 1) words.push(main);
  for (const p of placed) {
    const cross = wordThrough(p.row, p.col, dc, dr); // swap = perpendicular
    if (cross.length > 1) words.push(cross);
  }
  if (words.length === 0) return { error: "That doesn't make a word of 2+ letters." };

  // Score: bonus squares only count for tiles placed this turn.
  let score = 0;
  const isNew = (cell) => placed.some((p) => p.row === cell.row && p.col === cell.col);
  const scored = words.map((cells) => {
    let sum = 0;
    let multiplier = 1;
    for (const cell of cells) {
      let value = cell.tile.value;
      if (isNew(cell)) {
        const bonus = bonusAt(cell.row, cell.col);
        if (bonus === "dl") value *= 2;
        if (bonus === "tl") value *= 3;
        if (bonus === "dw") multiplier *= 2;
        if (bonus === "tw") multiplier *= 3;
      }
      sum += value;
    }
    const text = cells.map((c) => c.tile.letter).join("");
    score += sum * multiplier;
    return { text, points: sum * multiplier };
  });

  if (placed.length === RACK_SIZE) score += ALL_TILES_BONUS;

  return { words: scored, score };
}

// Ask a free online dictionary whether a word exists.
// Results are remembered so we never look up the same word twice.
const dictionaryCache = {};

async function isRealWord(word) {
  const key = word.toLowerCase();
  if (key in dictionaryCache) return dictionaryCache[key];
  const res = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + key);
  if (res.status !== 200 && res.status !== 404) throw new Error("Dictionary unavailable");
  dictionaryCache[key] = res.status === 200;
  return dictionaryCache[key];
}


// ---------- 5. Actions -----------------------------------------------

const currentPlayer = () => state.players[state.current];

// A "source" says where a tile is right now:
//   { from: "rack", index }  or  { from: "board", row, col }
// takeTile() removes the tile from there and hands it back.
function takeTile(source) {
  if (source.from === "rack") return currentPlayer().rack.splice(source.index, 1)[0];
  const tile = state.board[source.row][source.col];
  state.board[source.row][source.col] = null;
  state.pending = state.pending.filter(
    (p) => !(p.row === source.row && p.col === source.col)
  );
  return tile;
}

function putOnBoard(tile, row, col) {
  tile.locked = false;
  state.board[row][col] = tile;
  state.pending.push({ row, col, tile });
}

function selectRackTile(index) {
  if (state.over || state.busy || justDragged) return;
  state.selected = state.selected === index ? null : index;
  render();
}

function clickCell(row, col) {
  if (state.over || state.busy || justDragged) return;
  const cell = state.board[row][col];

  if (cell && !cell.locked) {
    // Clicking a tile you placed this turn sends it back to your rack.
    currentPlayer().rack.push(takeTile({ from: "board", row, col }));
  } else if (!cell && state.selected !== null) {
    // Clicking an empty square places the selected tile there.
    putOnBoard(takeTile({ from: "rack", index: state.selected }), row, col);
    state.selected = null;
  } else {
    return;
  }
  render();
}

// Called when a dragged tile is let go. The target is a board square
// { to: "board", row, col }, a rack spot { to: "rack", index }, or
// null if it was dropped somewhere that doesn't count.
function dropTile(source, target) {
  if (!target) return;
  if (target.to === "board") {
    if (state.board[target.row][target.col]) return; // square already taken
    putOnBoard(takeTile(source), target.row, target.col);
  } else {
    // Dropped on the rack: put it back there, at the spot it landed on.
    const rack = currentPlayer().rack;
    const index = target.index ?? rack.length;
    rack.splice(index, 0, takeTile(source));
  }
  state.selected = null;
  render();
}

function recallTiles() {
  for (const p of state.pending) {
    state.board[p.row][p.col] = null;
    currentPlayer().rack.push(p.tile);
  }
  state.pending = [];
  state.selected = null;
}

async function submitMove() {
  if (state.over || state.busy) return;
  const result = checkMove();
  if (result.error) return say(result.error, "error");

  if (document.getElementById("opt-dictionary").checked) {
    state.busy = true;
    say("Checking words...");
    try {
      const checks = await Promise.all(result.words.map((w) => isRealWord(w.text)));
      const bad = result.words.filter((w, i) => !checks[i]).map((w) => w.text);
      if (bad.length) {
        state.busy = false;
        return say("Not in the dictionary: " + bad.join(", "), "error");
      }
    } catch {
      // If the dictionary can't be reached, we trust the players.
      say("Couldn't reach the dictionary, so the word was accepted.");
    }
    state.busy = false;
  }

  // The move is good: lock the tiles in and add the score.
  const player = currentPlayer();
  for (const p of state.pending) p.tile.locked = true;
  state.pending = [];
  player.score += result.score;
  state.scorelessTurns = 0;

  const wordList = result.words.map((w) => `${w.text} (${w.points})`).join(", ");
  const bonus = result.score > result.words.reduce((s, w) => s + w.points, 0)
    ? ` + ${ALL_TILES_BONUS} all-tiles bonus` : "";
  addLog(`${player.name}: ${wordList}${bonus} = ${result.score}`);
  say(`${player.name} scored ${result.score}!`, "ok");

  refillRack(player);
  if (player.rack.length === 0 && state.bag.length === 0) return endGame(state.current);
  nextTurn();
}

function passTurn() {
  if (state.over || state.busy) return;
  recallTiles();
  addLog(`${currentPlayer().name} passed.`);
  state.scorelessTurns++;
  if (state.scorelessTurns >= MAX_SCORELESS_TURNS) return endGame(null);
  say(`${currentPlayer().name} passed.`);
  nextTurn();
}

function swapTiles() {
  if (state.over || state.busy) return;
  recallTiles();
  const player = currentPlayer();
  if (state.bag.length < player.rack.length) {
    render();
    return say("Not enough tiles left in the bag to swap.", "error");
  }
  const old = player.rack;
  player.rack = [];
  refillRack(player);
  state.bag = shuffle(state.bag.concat(old));
  addLog(`${player.name} swapped tiles.`);
  state.scorelessTurns++;
  if (state.scorelessTurns >= MAX_SCORELESS_TURNS) return endGame(null);
  say(`${player.name} swapped tiles.`);
  nextTurn();
}

function nextTurn() {
  state.current = (state.current + 1) % state.players.length;
  state.selected = null;
  render();
}

// Leftover tiles count against you. If someone used up all their
// tiles, they also get the points left on the other racks.
function endGame(finisher) {
  recallTiles();
  let leftoverTotal = 0;
  for (const p of state.players) {
    const left = p.rack.reduce((sum, t) => sum + t.value, 0);
    p.score -= left;
    leftoverTotal += left;
  }
  if (finisher !== null) state.players[finisher].score += leftoverTotal;

  state.over = true;
  const [a, b] = state.players;
  const msg = a.score === b.score ? "It's a tie!"
    : `${(a.score > b.score ? a : b).name} wins!`;
  addLog(`Game over. ${a.name} ${a.score}, ${b.name} ${b.score}.`);
  say(msg + " Press New game to play again.", "ok");
  render();
}


// ---------- 5b. Drag and drop ----------------------------------------
// Pointer events cover mouse, touch and pen with one set of code.
// A press that moves less than DRAG_THRESHOLD pixels is left alone,
// so it still counts as a normal click.

const DRAG_THRESHOLD = 6;
let drag = null;          // info about the drag in progress, or null
let justDragged = false;  // stops the click that follows a drop

function startDrag(event, source) {
  if (state.over || state.busy || event.button !== 0) return;
  drag = {
    source,
    el: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    ghost: null,   // the floating copy that follows the pointer
    hover: null,   // the board square currently highlighted
  };
  document.addEventListener("pointermove", moveDrag);
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", cleanupDrag);
}

function moveDrag(event) {
  // Only start dragging once the pointer has moved a little.
  if (!drag.ghost) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < DRAG_THRESHOLD) return;
    const rect = drag.el.getBoundingClientRect();
    drag.ghost = drag.el.cloneNode(true);
    drag.ghost.className = "tile ghost";
    drag.ghost.style.width = rect.width + "px";
    drag.ghost.style.height = rect.height + "px";
    drag.ghost.style.fontSize = getComputedStyle(drag.el).fontSize;
    document.body.appendChild(drag.ghost);
    drag.el.classList.add("dragging");
  }

  drag.ghost.style.left = event.clientX + "px";
  drag.ghost.style.top = event.clientY + "px";

  // Highlight the empty square under the pointer.
  const target = findDropTarget(event.clientX, event.clientY);
  const cell = target && target.to === "board" ? target.el : null;
  if (cell !== drag.hover) {
    drag.hover?.classList.remove("drop-target");
    cell?.classList.add("drop-target");
    drag.hover = cell;
  }
}

// Works out what is under the pointer. The ghost tile ignores the
// pointer (see .ghost in style.css), so we see what's beneath it.
function findDropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cell = el.closest(".cell");
  if (cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (state.board[row][col]) return null;
    return { to: "board", row, col, el: cell };
  }
  if (el.closest("#rack-area")) {
    const tile = el.closest("#rack .tile");
    return { to: "rack", index: tile ? Number(tile.dataset.index) : undefined };
  }
  return null;
}

function endDrag(event) {
  const wasDragging = drag.ghost !== null;
  const source = drag.source;
  const target = wasDragging ? findDropTarget(event.clientX, event.clientY) : null;
  cleanupDrag();
  if (wasDragging) {
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    dropTile(source, target);
  }
}

function cleanupDrag() {
  document.removeEventListener("pointermove", moveDrag);
  document.removeEventListener("pointerup", endDrag);
  document.removeEventListener("pointercancel", cleanupDrag);
  drag.ghost?.remove();
  drag.el.classList.remove("dragging");
  drag.hover?.classList.remove("drop-target");
  drag = null;
}


// ---------- 6. Drawing -----------------------------------------------

function say(text, kind = "") {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = kind;
}

function addLog(text) {
  const li = document.createElement("li");
  li.textContent = text;
  document.getElementById("log").appendChild(li);
}

function tileElement(tile) {
  const el = document.createElement("div");
  el.className = "tile";
  el.innerHTML = `${tile.letter}<span class="val">${tile.value}</span>`;
  return el;
}

function render() {
  // Scoreboard
  const sb = document.getElementById("scoreboard");
  sb.innerHTML = "";
  state.players.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "player" + (i === state.current && !state.over ? " active" : "");
    div.innerHTML = `<div class="name">${p.name}</div><div class="score">${p.score}</div>`;
    sb.appendChild(div);
  });
  const bag = document.createElement("div");
  bag.className = "bag";
  bag.textContent = `${state.bag.length} in bag`;
  sb.appendChild(bag);

  // Board
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      const bonus = bonusAt(r, c);
      cell.className = "cell" + (bonus ? " " + bonus : "");
      cell.dataset.row = r;
      cell.dataset.col = c;
      const tile = state.board[r][c];
      if (tile) {
        const t = tileElement(tile);
        t.classList.add(tile.locked ? "locked" : "pending");
        if (!tile.locked) {
          t.addEventListener("pointerdown", (e) => startDrag(e, { from: "board", row: r, col: c }));
        }
        cell.appendChild(t);
      } else if (r === CENTER && c === CENTER) {
        cell.classList.add("center");
      } else if (bonus) {
        cell.textContent = BONUS_LABELS[bonus];
      }
      cell.addEventListener("click", () => clickCell(r, c));
      board.appendChild(cell);
    }
  }

  // Rack (only the current player's tiles are shown)
  const rack = document.getElementById("rack");
  rack.innerHTML = "";
  if (!state.over) {
    currentPlayer().rack.forEach((tile, i) => {
      const t = tileElement(tile);
      if (i === state.selected) t.classList.add("selected");
      t.dataset.index = i;
      t.addEventListener("click", () => selectRackTile(i));
      t.addEventListener("pointerdown", (e) => startDrag(e, { from: "rack", index: i }));
      rack.appendChild(t);
    });
  }

  for (const id of ["btn-submit", "btn-recall", "btn-shuffle", "btn-swap", "btn-pass"]) {
    document.getElementById(id).disabled = state.over;
  }
}


// ---------- Wire up the buttons and start ----------------------------

document.getElementById("btn-submit").addEventListener("click", submitMove);
document.getElementById("btn-recall").addEventListener("click", () => {
  if (state.busy) return;
  recallTiles();
  render();
});
document.getElementById("btn-shuffle").addEventListener("click", () => {
  if (state.busy) return;
  shuffle(currentPlayer().rack);
  state.selected = null;
  render();
});
document.getElementById("btn-swap").addEventListener("click", swapTiles);
document.getElementById("btn-pass").addEventListener("click", passTurn);
document.getElementById("btn-new").addEventListener("click", startGame);

startGame();
