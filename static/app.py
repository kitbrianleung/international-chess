from flask import Flask, render_template, request, jsonify
import chess
import random

app = Flask(__name__)

PIECE_UNICODE = {
    'P': '\u2659', 'N': '\u2658', 'B': '\u2657', 'R': '\u2656', 'Q': '\u2655', 'K': '\u2654',
    'p': '\u265F', 'n': '\u265E', 'b': '\u265D', 'r': '\u265C', 'q': '\u265B', 'k': '\u265A',
}

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}


def get_board_state(board):
    rows = []
    for rank in range(8, 0, -1):
        row = []
        for file in range(1, 9):
            square = chess.square(file - 1, rank - 1)
            piece = board.piece_at(square)
            row.append(PIECE_UNICODE[piece.symbol()] if piece else '')
        rows.append(row)
    return rows


def evaluate_board(board):
    if board.is_checkmate():
        return -999999 if board.turn == chess.WHITE else 999999
    if board.is_stalemate() or board.is_insufficient_material() or board.can_claim_draw():
        return 0

    score = 0
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            sign = 1 if piece.color == chess.WHITE else -1
            score += sign * PIECE_VALUES.get(piece.piece_type, 0)
    return score


def move_order(board, move):
    score = 0
    if board.is_capture(move):
        captured = board.piece_at(move.to_square)
        if captured:
            score += PIECE_VALUES.get(captured.piece_type, 0) * 10
    if move.promotion:
        score += 800
    return -score


def negamax(board, depth, alpha, beta):
    if depth == 0 or board.is_game_over():
        return evaluate_board(board)

    max_score = -999999
    for move in sorted(board.legal_moves, key=lambda m: move_order(board, m)):
        board.push(move)
        score = -negamax(board, depth - 1, -beta, -alpha)
        board.pop()
        if score >= beta:
            return score
        if score > max_score:
            max_score = score
        alpha = max(alpha, score)
    return max_score


def choose_robot_move(board):
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    best_move = None
    best_score = -999999
    search_depth = 3

    for move in sorted(legal_moves, key=lambda m: move_order(board, m)):
        board.push(move)
        score = -negamax(board, search_depth - 1, -999999, 999999)
        board.pop()
        if score > best_score:
            best_score = score
            best_move = move

    return best_move


def get_pgn_history(board, initial_fen):
    temp_board = chess.Board(initial_fen)
    moves = []
    for move in board.move_stack:
        moves.append(temp_board.san(move))
        temp_board.push(move)

    lines = []
    for index in range(0, len(moves), 2):
        move_number = index // 2 + 1
        white_move = moves[index]
        black_move = moves[index + 1] if index + 1 < len(moves) else ''
        line = f"{move_number}. {white_move}"
        if black_move:
            line += f" {black_move}"
        lines.append(line)

    return ' '.join(lines)


@app.route('/')
def index():
    board = chess.Board()
    return render_template('index.html', fen=board.fen(), board_state=get_board_state(board), pgn='')


@app.route('/new_game', methods=['POST'])
def new_game():
    board = chess.Board()
    return jsonify({
        'fen': board.fen(),
        'board': get_board_state(board),
        'pgn': get_pgn_history(board),
        'turn': 'white',
        'status': 'game_started',
        'message': 'New game started. Your move as White.'
    })


@app.route('/move', methods=['POST'])
def make_move():
    data = request.get_json() or {}
    fen = data.get('fen')
    uci = data.get('uci')

    if not fen or not uci:
        return jsonify({'error': 'Missing fen or uci move.'}), 400

    try:
        board = chess.Board(fen)
    except Exception as exc:
        return jsonify({'error': f'Invalid FEN: {exc}'}), 400

    try:
        move = chess.Move.from_uci(uci)
    except Exception:
        return jsonify({'error': 'Invalid UCI move format.'}), 400

    if move not in board.legal_moves:
        # If the user tries a pawn promotion without specifying the promotion piece,
        # try defaulting to a queen if a promotion move is legal.
        if len(uci) == 4 and board.piece_at(chess.parse_square(uci[:2])) == chess.PAWN:
            for promo in ['q', 'r', 'b', 'n']:
                promo_move = chess.Move.from_uci(uci + promo)
                if promo_move in board.legal_moves:
                    move = promo_move
                    break

    if move not in board.legal_moves:
        return jsonify({'error': 'Illegal move.'}), 400

    board.push(move)

    if board.is_game_over():
        return jsonify({
            'fen': board.fen(),
            'board': get_board_state(board),
            'pgn': get_pgn_history(board, fen),
            'turn': 'robot' if board.turn == chess.BLACK else 'white',
            'status': 'player_won' if board.result() == '1-0' else 'draw' if board.result() == '1/2-1/2' else 'robot_won',
            'message': f'Game over: {board.result()}.'
        })

    robot_move = choose_robot_move(board)
    if robot_move is None:
        return jsonify({'error': 'No legal robot move available.'}), 500

    board.push(robot_move)

    result = 'ongoing'
    message = f'Robot played {robot_move.uci()}. Your turn.'
    if board.is_game_over():
        result = 'robot_won' if board.result() == '0-1' else 'draw' if board.result() == '1/2-1/2' else 'player_won'
        message = f'Game over: {board.result()}.'

    return jsonify({
        'fen': board.fen(),
        'board': get_board_state(board),
        'pgn': get_pgn_history(board, fen),
        'robot_move': robot_move.uci(),
        'turn': 'white' if board.turn == chess.WHITE else 'black',
        'status': result,
        'message': message
    })


@app.after_request
def apply_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response


if __name__ == '__main__':
    app.run(debug=True, port=5000)
