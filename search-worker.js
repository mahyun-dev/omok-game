// search-worker.js
// Web Worker 컨텍스트에서 독립 실행되는 전문가 탐색을 수행합니다.

let BOARD_SIZE = 19;
let board = null;

// Zobrist 해시 테이블
let zobristTable = null;
function random32() { return (Math.floor(Math.random() * 0x100000000) >>> 0); }
function ensureZobrist() {
    if (zobristTable) return;
    zobristTable = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        zobristTable[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            // 각 칸에 대해 white/black 두 색상용 랜덤 값 생성
            zobristTable[r][c] = [random32(), random32()];
        }
    }
}

function computeZobristHash(b) {
    ensureZobrist();
    let h = 0 >>> 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = b[r][c];
            if (p === 'white') h = (h ^ zobristTable[r][c][0]) >>> 0;
            else if (p === 'black') h = (h ^ zobristTable[r][c][1]) >>> 0;
        }
    }
    return h >>> 0;
}

// 메인 스레드에서 복사/적용된 헬퍼 함수들
const directions = [[0,1],[1,0],[1,1],[1,-1]];
function isValidPosition(row, col) { return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE; }

function countStonesOnBoard(testBoard, row, col, dx, dy, player) {
    let count = 0;
    let newRow = row + dx;
    let newCol = col + dy;
    while (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE && testBoard[newRow][newCol] === player) {
        count++;
        newRow += dx; newCol += dy;
    }
    return count;
}

function checkWinOnBoard(testBoard, row, col, player) {
    for (let [dx, dy] of directions) {
        let count = 1;
        count += countStonesOnBoard(testBoard, row, col, dx, dy, player);
        count += countStonesOnBoard(testBoard, row, col, -dx, -dy, player);
        if (count === 5) return true;
        if (count > 5) return false;
    }
    return false;
}

function getWinner(testBoard) {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (testBoard[row][col] !== null) {
                if (checkWinOnBoard(testBoard, row, col, testBoard[row][col])) return testBoard[row][col];
            }
        }
    }
    return null;
}

function isGameOver(testBoard) {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (testBoard[row][col] !== null) {
                if (checkWinOnBoard(testBoard, row, col, testBoard[row][col])) return true;
            }
        }
    }
    return false;
}

function analyzePosition(row, col, player) {
    // 특정 위치에 돌을 놓았을 때 만들어지는 패턴(오목, 열린4, 4 등)을 분석
    let patterns = { five:0, openFour:0, four:0, openThree:0, three:0, openTwo:0, two:0 };
    for (let [dx, dy] of directions) {
        let leftCount=0, rightCount=0;
        let lr=row-dx, lc=col-dy;
        while (isValidPosition(lr,lc) && board[lr][lc]===player) { leftCount++; lr-=dx; lc-=dy; }
        let leftBlocked = !isValidPosition(lr,lc) || board[lr][lc]!==null;
        let rr=row+dx, rc=col+dy;
        while (isValidPosition(rr,rc) && board[rr][rc]===player) { rightCount++; rr+=dx; rc+=dy; }
        let rightBlocked = !isValidPosition(rr,rc) || board[rr][rc]!==null;
        const count = leftCount + rightCount + 1;
        if (count >=5) patterns.five++;
        else if (count ===4) { if (!leftBlocked && !rightBlocked) patterns.openFour++; else patterns.four++; }
        else if (count===3) { if (!leftBlocked && !rightBlocked) patterns.openThree++; else patterns.three++; }
        else if (count===2) { if (!leftBlocked && !rightBlocked) patterns.openTwo++; else patterns.two++; }
    }
    return patterns;
}

function getPositionalScore(row, col) {
    const center = Math.floor(BOARD_SIZE/2);
    let score = 0;
    const distanceFromCenter = Math.abs(row-center)+Math.abs(col-center);
    score += (BOARD_SIZE - distanceFromCenter) * 2;
    const starPoints = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    if (starPoints.some(p => p[0]===row && p[1]===col)) score += 5;
    return score;
}

function evaluatePosition(row, col, player, includePositional=true) {
    const patterns = analyzePosition(row,col,player);
    let score = 0;
    score += patterns.five * 100000000;
    score += patterns.openFour * 50000;
    score += patterns.four * 8000;
    score += patterns.openThree * 3000;
    score += patterns.three * 600;
    if (includePositional) {
        score += patterns.openTwo * 100;
        score += patterns.two * 20;
        score += getPositionalScore(row,col);
    }
    return score;
}

function hasNeighbor(b,row,col,range=2) {
    for (let dr=-range; dr<=range; dr++) for (let dc=-range; dc<=range; dc++) {
        if (dr===0 && dc===0) continue;
        const nr=row+dr, nc=col+dc;
        if (isValidPosition(nr,nc) && b[nr][nc]!==null) return true;
    }
    return false;
}

function getValidMovesWorker(b) {
    const moves=[];
    let hasStone=false;
    for (let r=0;r<BOARD_SIZE;r++){
        for (let c=0;c<BOARD_SIZE;c++){ if (b[r][c]!==null){ hasStone=true; break;} }
        if (hasStone) break;
    }
    // 보드가 비어있으면 중앙 위치 반환
    if (!hasStone) return [{row: Math.floor(BOARD_SIZE/2), col: Math.floor(BOARD_SIZE/2)}];
    for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) if (b[r][c]===null && hasNeighbor(b,r,c)) moves.push({row:r,col:c});
    return moves;
}

function orderMovesWorker(moves, player) {
    const opponent = player === 'white' ? 'black' : 'white';
    return moves.map(move => {
        // player's gain
        board[move.row][move.col] = player;
        const myScore = evaluatePosition(move.row, move.col, player, false);
        board[move.row][move.col] = null;
        // opponent's potential
        board[move.row][move.col] = opponent;
        const oppScore = evaluatePosition(move.row, move.col, opponent, false);
        board[move.row][move.col] = null;
        const score = myScore + 1.2 * oppScore;
        return { move, score };
    }).sort((a,b)=>b.score-a.score).map(x=>x.move);
}

// 전문가용 negamax (워커 로컬 전이 표 사용)
function getBestMoveExpertWorker(player, maxDepth, timeBudget) {
    ensureZobrist();
    const start = Date.now();
    // progress reporter interval id
    let progressInterval = null;
    const movesAll = getValidMovesWorker(board);
    if (movesAll.length===0) return null;
    // 즉시 승리 수가 있으면 반환
    for (let mv of movesAll){ board[mv.row][mv.col]=player; if (checkWinOnBoard(board,mv.row,mv.col,player)){ board[mv.row][mv.col]=null; return mv;} board[mv.row][mv.col]=null; }
    const opponent = player==='white'?'black':'white';
    for (let mv of movesAll){ board[mv.row][mv.col]=opponent; const patt=analyzePosition(mv.row,mv.col,opponent); const oppWin = patt.five>0||patt.openFour>0||checkWinOnBoard(board,mv.row,mv.col,opponent); board[mv.row][mv.col]=null; if (oppWin) return mv; }

    // 즉시 포크(이중 위협) 감지 및 위협 점수 계산(정렬용)
    const threatScores = new Map();
    let immediateFork = null;
    for (let mv of movesAll) {
        // simulate
        board[mv.row][mv.col] = player;
        const p = analyzePosition(mv.row, mv.col, player);
        // threat estimation: count strong threat lines (openFour counts strongly, openThree less)
        const strong = p.openFour + p.four;
        const medium = p.openThree;
        const threatScore = strong * 3 + medium * 1;
        threatScores.set(`${mv.row},${mv.col}`, threatScore);
        // immediate fork heuristic: at least two strong/medium threat lines
        const threatLines = (p.openFour > 0 ? p.openFour : 0) + (p.openThree > 0 ? p.openThree : 0);
        board[mv.row][mv.col] = null;
        if (threatLines >= 2) {
            immediateFork = mv;
            break;
        }
    }
    if (immediateFork) return immediateFork;

    // order candidates by threatScore first, then heuristic
    const candidates = orderMovesWorker(movesAll, player)
        .map(m => ({ m, t: threatScores.get(`${m.row},${m.col}`) || 0 }))
        .sort((a, b) => b.t - a.t)
        .map(x => x.m)
        .slice(0, 40);

    // 주기적 진행 보고 시작
    try {
        progressInterval = setInterval(() => {
            const elapsed = Date.now() - start;
            postMessage({ type: 'progress', elapsed, timeBudget });
        }, 300);
    } catch (e) {
        // ignore
    }
    let bestMove = candidates[0];
    let bestScore = -Infinity;
    const tt = new Map();
    const killerMoves = Array.from({length: maxDepth+2}, ()=>[]);
    const history = new Map();

    // 알파-베타 negamax 구현 (전이표, 킬러, 히스토리 휴리스틱 포함)
    function negamax(depth, side, alpha, beta, hash, color) {
        if (depth===0 || isGameOver(board)) return color * evaluateBoardLocal();
        const ttKey = `${hash}|${depth}|${side}`;
        const ttEntry = tt.get(ttKey);
        if (ttEntry && ttEntry.depth>=depth) return ttEntry.value;
        let moves = orderMovesWorker(getValidMovesWorker(board), side);
        if (moves.length===0) return 0;
        // 킬러 + 히스토리 기반 정렬
        const km = killerMoves[depth]||[];
        moves.sort((a,b)=>{ const ak=`${a.row},${a.col}`; const bk=`${b.row},${b.col}`; if (km.includes(ak)&&!km.includes(bk)) return -1; if (km.includes(bk)&&!km.includes(ak)) return 1; const ha=history.get(ak)||0; const hb=history.get(bk)||0; return hb-ha; });
        let best = -Infinity;
        for (let mv of moves) {
            const idx = side==='white'?0:1;
            board[mv.row][mv.col]=side;
            const newHash = (hash ^ zobristTable[mv.row][mv.col][idx])>>>0;
            const val = -negamax(depth-1, side==='white'?'black':'white', -beta, -alpha, newHash, -color);
            board[mv.row][mv.col]=null;
            if (val>best) best=val;
            if (val>alpha) alpha=val;
            if (alpha>=beta) {
                // 컷오프 발생: 킬러 / 히스토리 업데이트
                const key = `${mv.row},${mv.col}`;
                const k = killerMoves[depth]||[];
                if (!k.includes(key)) { k.unshift(key); if (k.length>2) k.pop(); killerMoves[depth]=k; }
                const prev = history.get(key)||0; history.set(key, prev + (1<<depth));
                tt.set(ttKey, {depth, value: val});
                return val;
            }
        }
        tt.set(ttKey,{depth,value:best});
        return best;
    }

    // 현재 보드 상태를 평가(화이트가 양수, 블랙이 음수)
    function evaluateBoardLocal() {
        let score=0;
        for (let r=0;r<BOARD_SIZE;r++) for (let c=0;c<BOARD_SIZE;c++) {
            if (board[r][c]==='white') score += evaluatePosition(r,c,'white',true);
            else if (board[r][c]==='black') score -= evaluatePosition(r,c,'black',true);
        }
        return score;
    }

    const rootHash = computeZobristHash(board);
    // 반복 심화: depth 1..maxDepth
    for (let depth=1; depth<=maxDepth; depth++) {
        if (Date.now()-start > timeBudget) break;
        let localBest=null; let localBestScore=-Infinity;
        for (let mv of candidates) {
            if (Date.now()-start > timeBudget) break;
            board[mv.row][mv.col]=player;
            const idx = player==='white'?0:1;
            const newHash = (rootHash ^ zobristTable[mv.row][mv.col][idx])>>>0;
            const score = -negamax(depth-1, player==='white'?'black':'white', -Infinity, Infinity, newHash, 1);
            board[mv.row][mv.col]=null;
            if (score>localBestScore) { localBestScore=score; localBest=mv; }
        }
        if (localBest) { bestMove=localBest; bestScore=localBestScore; }
    }
    // stop progress reports
    try { if (progressInterval) clearInterval(progressInterval); } catch (e) {}
    return bestMove;
}

// 워커 메시지 수신 처리
onmessage = function(e) {
    const data = e.data;
    if (data && data.type === 'search') {
        try {
            board = data.board;
            BOARD_SIZE = board.length || 19;
            const move = getBestMoveExpertWorker(data.player || 'white', data.maxDepth || 8, data.timeBudget || 1500);
            postMessage({ type: 'result', move });
        } catch (err) {
            postMessage({ type: 'error', message: String(err) });
        }
    }
};
