// Web Audio API Synthesized dopamine sound effects for Duolingo style catur
export function playSound(type: 'move' | 'capture' | 'check' | 'win' | 'lose' | 'error') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    switch (type) {
      case 'move':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.11);
        break;
        
      case 'capture':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.setValueAtTime(90, now + 0.04);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
        
      case 'check':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.setValueAtTime(494, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.26);
        break;
        
      case 'win':
        // Major chord arpeggio
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.18, now);
        osc.frequency.setValueAtTime(261.63, now); // C4
        osc.frequency.setValueAtTime(329.63, now + 0.1); // E4
        osc.frequency.setValueAtTime(392.00, now + 0.18); // G4
        osc.frequency.setValueAtTime(523.25, now + 0.28); // C5
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.62);
        break;
        
      case 'lose':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.45);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.46);
        break;
        
      case 'error':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.setValueAtTime(110, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.21);
        break;
    }
  } catch (err) {
    console.warn('Audio Context failed to play sound:', err);
  }
}

// Convert board row/col to algebraic string
export function toSquare(row: number, col: number): string {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  return files[col] + ranks[row];
}

// Convert algebraic string to board row/col
export function fromSquare(square: string): { row: number; col: number } {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  
  const col = files.indexOf(square[0]);
  const row = ranks.indexOf(square[1]);
  return { row, col };
}

// Chess pieces weight for evaluation:
const PIECE_VALUES: Record<string, number> = {
  p: 10,
  n: 30,
  b: 30,
  r: 50,
  q: 90,
  k: 900
};

// Evaluate the board: positive favors Black (AI), negative favors White (Player)
function evaluateBoard(chessBoard: any[][]): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = chessBoard[r][c];
      if (square) {
        const val = PIECE_VALUES[square.type.toLowerCase()] || 0;
        if (square.color === 'b') {
          score += val;
        } else {
          score -= val;
        }
      }
    }
  }
  return score;
}

// Simple heuristic AI move finder based on character difficulty.
// Returns a chosen move object, e.g., { from, to, promotion }
export function getAIMove(chess: any, difficulty: string): any {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  // 1. Zari: Sangat Mudah (Mostly random, bad play style)
  if (difficulty === 'Sangat Mudah') {
    if (Math.random() < 0.7) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
  }

  // 2. Duo: Mudah (Looks at captures 65% of the time, otherwise plays random)
  if (difficulty === 'Mudah') {
    const captures = moves.filter((m: any) => m.captured);
    if (captures.length > 0 && Math.random() < 0.65) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // 3. Lily: Sedang (1-ply Search to maximize score, defensive but calculated)
  if (difficulty === 'Sedang') {
    let bestScore = -Infinity;
    let selectedMovesArray: any[] = [];
    
    // Sort moves randomly first
    const shuffled = [...moves].sort(() => Math.random() - 0.5);
    
    for (const move of shuffled) {
      chess.move(move);
      const score = evaluateBoard(chess.board());
      chess.undo();
      
      if (score > bestScore) {
        bestScore = score;
        selectedMovesArray = [move];
      } else if (score === bestScore) {
        selectedMovesArray.push(move);
      }
    }
    return selectedMovesArray[Math.floor(Math.random() * selectedMovesArray.length)];
  }

  // 4. Oscar: Sulit (Prefers checks, checkmates, or 2-ply evaluation)
  // Check for immediate checkmates for Black (AI)
  const winningMove = moves.find((m: any) => m.san && (m.san.includes('#') || m.san.endsWith('#')));
  if (winningMove) return winningMove;

  let bestMove = moves[0];
  let bestScore = -Infinity;
  const shuffledMoves = [...moves].sort(() => Math.random() - 0.5);
  
  for (const move of shuffledMoves) {
    chess.move(move);
    
    // Basic evaluation after our move
    if (chess.isGameOver()) {
      chess.undo();
      return move; // Snatch immediate win
    }
    
    // Opponent response evaluation (assume Player responds optimally)
    let minOpponentScore = Infinity;
    const opponentMoves = chess.moves({ verbose: true });
    
    // Look at first 10 opponent moves to avoid performance hogging
    const sampledOpponentMoves = opponentMoves.slice(0, 10);
    for (const opMove of sampledOpponentMoves) {
      chess.move(opMove);
      const s = evaluateBoard(chess.board());
      chess.undo();
      if (s < minOpponentScore) {
        minOpponentScore = s;
      }
    }
    
    chess.undo();
    
    // We want to maximize our score
    if (minOpponentScore > bestScore) {
      bestScore = minOpponentScore;
      bestMove = move;
    }
  }
  
  return bestMove || moves[Math.floor(Math.random() * moves.length)];
}

// Highly responsive Chess Move Quality Evaluator
export function evaluateMoveQuality(
  move: any,
  isOpeningPhase: boolean,
  isRepeatedMove: boolean
): 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' {
  const san = move.san || '';
  const captured = move.captured;
  const piece = move.piece;
  const flags = move.flags || '';

  // 1. Brilliant (Brilian)
  // Checkmate is always brilliant! Also, a tactical sacrifice (captured piece value > my piece value)
  if (san.includes('#')) {
    return 'brilliant';
  }
  
  if (captured) {
    const PIECE_VALUES: Record<string, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    const valMyPiece = PIECE_VALUES[piece.toLowerCase()] || 0;
    const valCapturedPiece = PIECE_VALUES[captured.toLowerCase()] || 0;
    if (valCapturedPiece > valMyPiece && valMyPiece <= 30) {
      return 'brilliant'; // Sacrificing Knight/Bishop/Pawn for a higher value piece
    }
  }

  // 2. Book Move (Teori)
  // Famous standard opening lines in algebraic notation
  const bookMoves = ['e4', 'd4', 'Nf3', 'Nc3', 'e5', 'd5', 'Nf6', 'Nc6', 'c4', 'g3', 'Bg2', 'Bg5', 'Bc4', 'O-O', 'c6', 'e6', 'd6'];
  if (isOpeningPhase && bookMoves.includes(san)) {
    return 'book';
  }

  // 3. Great Move (Hebat)
  // Delivering checks or castling out of danger, or promotion path
  if (san.includes('+')) {
    return 'great';
  }
  if (flags.includes('k') || flags.includes('q')) {
    return 'great'; // Kingside or queenside castling
  }
  if (flags.includes('p')) { // Promotion
    return 'great';
  }

  // Heuristics for poor moves:
  // 4. Blunder / Mistake
  // Moving queen out extremely early in front of pawns, or hanging a piece
  const rngValue = Math.random();
  if (isOpeningPhase && piece === 'q' && !captured && rngValue < 0.4) {
    return 'inaccuracy'; // Early Queen moves are generally inaccurate
  }
  
  if (isRepeatedMove && rngValue < 0.6) {
    return 'inaccuracy'; // Shuffling pieces back and forth is inaccurate
  }

  // For computer/player blunders:
  // Randomly distribute remaining evaluations for an immersive game feel
  if (captured) {
    const PIECE_VALUES: Record<string, number> = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    const valMyPiece = PIECE_VALUES[piece.toLowerCase()] || 10;
    const valCapturedPiece = PIECE_VALUES[captured.toLowerCase()] || 10;
    if (valCapturedPiece === valMyPiece) {
      return 'best'; // Equal major exchanges are best moves
    }
    return 'excellent';
  }

  // Standard development moves (Knights & Bishops moving forward)
  if ((piece === 'n' || piece === 'b') && !san.includes('8') && !san.includes('1')) {
    return 'excellent';
  }

  // Normal progression
  if (rngValue < 0.1) return 'best';
  if (rngValue < 0.3) return 'excellent';
  if (rngValue < 0.65) return 'good';
  if (rngValue < 0.75) return 'inaccuracy';
  if (rngValue < 0.85) return 'mistake';
  
  // 5% default opportunity for a tactical blunder
  return 'blunder';
}

