const API_BASE = 'http://127.0.0.1:5000';
const boardElement = document.getElementById('chessBoard');
const statusElement = document.getElementById('status');
const turnElement = document.getElementById('turn');
const messageElement = document.getElementById('message');
const fenElement = document.getElementById('fen');
const pgnElement = document.getElementById('pgn');
const newGameBtn = document.getElementById('newGameBtn');
const gameDataElement = document.getElementById('game-data');

let currentFEN = boardElement.dataset.fen;
let selectedIndex = null;
let currentBoard = [];
let currentPgn = '';
let pendingMoveSquares = [];

if (gameDataElement) {
  try {
    currentBoard = JSON.parse(gameDataElement.getAttribute('data-board')) || [];
  } catch (error) {
    currentBoard = [];
  }
  try {
    currentPgn = JSON.parse(gameDataElement.getAttribute('data-pgn')) || '';
  } catch (error) {
    currentPgn = '';
  }
}

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function renderBoard(boardState) {
  boardElement.innerHTML = '';
  boardState.forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      const squareIndex = rowIndex * 8 + colIndex;
      const file = files[colIndex];
      const rank = 8 - rowIndex;
      const sq = `${file}${rank}`;
      const square = document.createElement('button');
      square.type = 'button';
      square.className = `square ${((rowIndex + colIndex) % 2 === 0) ? 'light' : 'dark'}`;
      square.dataset.square = sq;
      square.innerText = piece;
      square.addEventListener('click', () => onSquareClick(sq, squareIndex));
      boardElement.appendChild(square);
    });
  });
}

function onSquareClick(square, index) {
  const piece = currentBoard[Math.floor(index / 8)][index % 8];

  if (selectedIndex === null) {
    if (!piece) {
      showStatus('Select a piece first.');
      return;
    }
    selectedIndex = index;
    markSelection(index);
    showStatus('Select destination square.');
    return;
  }

  if (selectedIndex === index) {
    selectedIndex = null;
    renderBoard(currentBoard);
    showStatus('Selection cleared.');
    return;
  }

  const from = squareNameFromIndex(selectedIndex);
  const to = square;
  const uci = `${from}${to}`;
  sendMove(uci);
}

function squareNameFromIndex(index) {
  const row = Math.floor(index / 8);
  const col = index % 8;
  return `${files[col]}${8 - row}`;
}

function showStatus(text) {
  statusElement.innerText = text;
}

async function sendMove(uci) {
  showStatus('Sending move...');
  try {
    const response = await fetch(`${API_BASE}/move`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({fen: currentFEN, uci})
    });

    let payload;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Server returned non-JSON response: ${text}`);
    }
    if (!response.ok) {
      throw new Error(payload.error || 'Move rejected');
    }

    currentFEN = payload.fen;
    currentBoard = payload.board;
    currentPgn = payload.pgn || '';
    fenElement.value = currentFEN;
    pgnElement.value = currentPgn;
    renderBoard(currentBoard);
    selectedIndex = null;
    showStatus(payload.message);
    turnElement.innerText = payload.turn === 'white' ? 'White' : 'Black';

    if (payload.status !== 'ongoing') {
      setTimeout(() => {
        showStatus(payload.message);
      }, 10);
    }
  } catch (error) {
    showStatus(error.message);
    selectedIndex = null;
    renderBoard(currentBoard);
  }
}

async function newGame() {
  const response = await fetch(`${API_BASE}/new_game`, {method: 'POST'});
  let payload;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    const text = await response.text();
    throw new Error(`Server returned non-JSON response: ${text}`);
  }
  currentFEN = payload.fen;
  currentBoard = payload.board;
  currentPgn = payload.pgn || '';
  fenElement.value = currentFEN;
  pgnElement.value = currentPgn;
  turnElement.innerText = 'White';
  renderBoard(currentBoard);
  selectedIndex = null;
  showStatus(payload.message);
}

function markSelection(index) {
  renderBoard(currentBoard);
  const squareButtons = boardElement.querySelectorAll('.square');
  if (squareButtons[index]) {
    squareButtons[index].classList.add('selected');
  }
}

newGameBtn.addEventListener('click', newGame);
pgnElement.value = currentPgn;
renderBoard(currentBoard);
showStatus('Click a piece to start.');
