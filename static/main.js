const boardElement = document.getElementById('chessBoard');
const statusElement = document.getElementById('status');
const turnElement = document.getElementById('turn');
const messageElement = document.getElementById('message');
const fenElement = document.getElementById('fen');
const pgnElement = document.getElementById('pgn');
const newGameBtn = document.getElementById('newGameBtn');
const gameDataElement = document.getElementById('game-data');
const API_BASE = 'http://127.0.0.1:5000';

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

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

currentFEN = normalizeFen(currentFEN);
if (!currentBoard.length) {
  currentBoard = parseFenToBoard(currentFEN);
}
if (fenElement) {
  fenElement.value = currentFEN;
}

function parseFenToBoard(fen) {
  const rows = [];
  const fields = fen.split(' ')[0].split('/');
  for (const row of fields) {
    const rank = [];
    for (const char of row) {
      if (Number.isInteger(parseInt(char, 10))) {
        const emptyCount = parseInt(char, 10);
        for (let i = 0; i < emptyCount; i++) {
          rank.push('');
        }
      } else {
        rank.push(getPieceFromFen(char));
      }
    }
    rows.push(rank);
  }
  return rows;
}

function getPieceFromFen(symbol) {
  const mapping = {
    'P': '\u2659', 'N': '\u2658', 'B': '\u2657', 'R': '\u2656', 'Q': '\u2655', 'K': '\u2654',
    'p': '\u265F', 'n': '\u265E', 'b': '\u265D', 'r': '\u265C', 'q': '\u265B', 'k': '\u265A',
  };
  return mapping[symbol] || '';
}

function normalizeFen(fen) {
  if (!fen || fen.includes('{{') || fen.includes('}}')) {
    return STARTING_FEN;
  }
  return fen;
}

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

function formatNetworkError(error) {
  const message = error && error.message ? error.message : String(error);
  if (message.includes('ERR_CONNECTION_REFUSED') || message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return `Cannot reach backend at ${API_BASE}. Start the Flask server and open the app from http://127.0.0.1:5000/`;
  }
  return message;
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
      console.error('Invalid /move response', response.status, response.statusText, text);
      throw new Error(`Server returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      const errorMessage = payload && payload.error ? payload.error : `Move rejected (${response.status})`;
      throw new Error(`Server error: ${errorMessage}`);
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
    const message = formatNetworkError(error);
    showStatus(`Move failed: ${message}`);
    selectedIndex = null;
    renderBoard(currentBoard);
  }
}

async function newGame() {
  showStatus('Starting new game...');
  try {
    const response = await fetch(`${API_BASE}/new_game`, {method: 'POST'});
    let payload;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      console.error('Invalid /new_game response', response.status, response.statusText, text);
      throw new Error(`Server returned non-JSON response (${response.status}): ${text.slice(0, 300)}`);
    }

    if (!response.ok) {
      const errorMessage = payload && payload.error ? payload.error : `Request failed (${response.status})`;
      throw new Error(`Server error: ${errorMessage}`);
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
  } catch (error) {
    const message = formatNetworkError(error);
    showStatus(`New game failed: ${message}`);
  }
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
