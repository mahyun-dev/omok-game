// 효율적인 보드 복사 (JSON 방식보다 빠름)
function cloneBoard(board) {
    return board.map(row => [...row]);
}

// 더 빠른 탐색을 위한 Zobrist 해싱 및 전이 표
let zobristTable = null;
let transpositionTable = new Map();
let historyHeuristic = new Map();
let killerMoves = [];
// 힌트 남용 방지를 위한 쿨다운
let hintCooldown = false;

function ensureZobrist() {
    if (zobristTable) return;
    zobristTable = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        zobristTable[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            // 플레이어 인덱스: white=0, black=1
            zobristTable[r][c] = [random32(), random32()];
        }
    }
}

function random32() {
    // 32비트 부호 없는 정수
    return (Math.floor(Math.random() * 0x100000000) >>> 0);
}

function computeZobristHash(board) {
    ensureZobrist();
    let h = 0 >>> 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const p = board[r][c];
            if (p === 'white') h = (h ^ zobristTable[r][c][0]) >>> 0;
            else if (p === 'black') h = (h ^ zobristTable[r][c][1]) >>> 0;
        }
    }
    return h >>> 0;
}

// 중앙 에러 핸들러
function handleAIError(error, context) {
    console.error(`AI Error in ${context}:`, error);
    return null;
}

// AI 진행 상황 표시
function updateAIProgress(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// AI 이동
function aiMove() {
    if (gameOver || currentPlayer !== 'white' || isAIThinking) return;

    isAIThinking = true;
    const boardElement = document.getElementById('board');
    const difficultyElement = document.getElementById('difficulty');
    
    // DOM 요소 검사 (에러 핸들링)
    if (!boardElement || !difficultyElement) {
        console.error('Required DOM elements not found');
        isAIThinking = false;
        return;
    }
    
    boardElement.classList.add('thinking');
    // AI가 생각을 시작했음을 즉시 표시 (Worker 메시지 지연에 대비)
    updateAIProgress('🤔 AI 생각 중...');

    const difficulty = parseInt(difficultyElement.value);

    setTimeout(() => {
        try {
            if (difficulty === 4) {
                // 전문가 모드: getBestMoveExpert는 비동기(Worker 사용)일 수 있으므로 Promise 결과를 처리합니다.
                const maybePromise = getBestMoveExpert('white', 12, 8000);
                if (maybePromise && typeof maybePromise.then === 'function') {
                    maybePromise.then(move => {
                        try {
                            if (move) {
                                placeStone(move.row, move.col);
                                renderBoard();
                            }
                        } catch (err) {
                            handleAIError(err, 'aiMove (worker result)');
                        } finally {
                            boardElement.classList.remove('thinking');
                            isAIThinking = false;
                            // AI 종료 후 UI 상태 텍스트를 일관되게 유지합니다
                            updateStatus();
                        }
                    }).catch(err => {
                        handleAIError(err, 'aiMove (worker)');
                        // 대체 동작: 랜덤으로 둡니다
                        const validMoves = getValidMoves();
                        if (validMoves.length > 0) {
                            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                            placeStone(randomMove.row, randomMove.col);
                            renderBoard();
                        }
                        boardElement.classList.remove('thinking');
                        isAIThinking = false;
                        updateStatus();
                    });
                    // 여기서 반환: 정리(cleanup)는 Promise 처리기에서 수행됨
                    return;
                } else {
                    // 동기 대체 경로
                    const move = maybePromise;
                    if (move) {
                        placeStone(move.row, move.col);
                        renderBoard();
                    }
                }
            } else {
                let move;
                switch (difficulty) {
                    case 1:
                        move = getBestMove(2);
                        break;
                    case 2:
                        move = getBestMove(4);
                        break;
                    case 3:
                        move = getBestMove(6);
                        break;
                    default:
                        move = getBestMove(4);
                }

                if (move) {
                    placeStone(move.row, move.col);
                    renderBoard();
                }
            }
        } catch (error) {
            handleAIError(error, 'aiMove');
            // 에러 발생 시 랜덤 이동
            const validMoves = getValidMoves();
            if (validMoves.length > 0) {
                const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                placeStone(randomMove.row, randomMove.col);
                renderBoard();
            }
        } finally {
            // 비동기 워커에서 반환하지 않은 경우에만 여기서 정리합니다
            boardElement.classList.remove('thinking');
            isAIThinking = false;
            updateStatus();
        }
    }, 500);
}

// 최선의 이동 찾기 (미니맥스 + 알파-베타 가지치기 + 반복 심화)
function getBestMove(maxDepth, player = 'white', timeLimit = 5000) {
    const validMoves = getValidMoves();
    if (validMoves.length === 0) return null;

    // 이동 정렬: 휴리스틱 평가를 통해 유망한 수부터 탐색
    const sortedMoves = orderMoves(validMoves, player);
    
    // 즉시 승리/방어 체크
    for (let move of sortedMoves) {
        board[move.row][move.col] = player;
        const patterns = analyzePosition(move.row, move.col, player);
        board[move.row][move.col] = null;
        
        // 5목 만들 수 있으면 즉시 리턴
        if (patterns.five > 0 || patterns.openFour > 0) {
            return move;
        }
    }
    
    // 상대방의 즉시 위협 체크
    const opponent = player === 'white' ? 'black' : 'white';
    for (let move of sortedMoves) {
        board[move.row][move.col] = opponent;
        const patterns = analyzePosition(move.row, move.col, opponent);
        board[move.row][move.col] = null;
        
        // 상대방이 5목 만들 수 있으면 방어
        if (patterns.five > 0 || patterns.openFour > 0) {
            return move;
        }
    }

    let bestMove = null;
    let bestScore = player === 'white' ? -Infinity : Infinity;
    const startTime = Date.now();
    
    // 반복 심화: 깊이를 점진적으로 증가시키며 탐색
    for (let depth = 1; depth <= maxDepth; depth++) {
        // 시간 제한 체크
        if (Date.now() - startTime > timeLimit) {
            break;
        }
        
        // 진행 상황 표시 (깊이 3 이상일 때)
        if (depth >= 3) {
            updateAIProgress(`🤔 AI 생각 중... (깊이 ${depth}/${maxDepth})`);
        }
        
        let depthBestMove = null;
        let depthBestScore = player === 'white' ? -Infinity : Infinity;

        for (let move of sortedMoves) {
            // 시간 제한 체크
            if (Date.now() - startTime > timeLimit) {
                break;
            }
            
            board[move.row][move.col] = player;
            const score = minimax(depth - 1, player === 'white' ? 'black' : 'white', -Infinity, Infinity, player === 'black');
            board[move.row][move.col] = null;

            if (player === 'white' && score > depthBestScore) {
                depthBestScore = score;
                depthBestMove = move;
            } else if (player === 'black' && score < depthBestScore) {
                depthBestScore = score;
                depthBestMove = move;
            }
        }
        
        // 이번 깊이의 최선 수를 저장
        if (depthBestMove) {
            bestMove = depthBestMove;
            bestScore = depthBestScore;
        }
    }

    return bestMove || sortedMoves[0];
}

// 전문가 탐색: 반복 심화(Iterative Deepening) negamax/alpha-beta + 전이 표
// 킬러 무브와 히스토리 휴리스틱 사용. timeBudget(ms)로 제한됩니다.
function getBestMoveExpert(player = 'white', maxDepth = 8, timeBudget = 1500) {
    ensureZobrist();
    transpositionTable.clear();
    historyHeuristic.clear();
    killerMoves = Array.from({ length: maxDepth + 2 }, () => []);

    // 무거운 전문가 탐색을 메인 스레드에서 분리하여 Worker에서 실행합니다.
    return new Promise((resolve) => {
        try {
            // Worker 지원 시 생성
            if (window.Worker) {
                // 이전 워커가 있으면 종료
                if (getBestMoveExpert._worker) {
                    try { getBestMoveExpert._worker.terminate(); } catch (e) {}
                }

                const worker = new Worker('search-worker.js');
                getBestMoveExpert._worker = worker;

                const timeout = setTimeout(() => {
                    // 타임아웃 대체: 워커 종료 후 빠른 대체 수로 해결
                    try { worker.terminate(); } catch (e) {}
                    getBestMoveExpert._worker = null;
                    const fallback = orderMoves(getValidMoves(), player)[0] || getValidMoves()[0] || null;
                    resolve(fallback);
                }, timeBudget + 300); // 짧은 여유 시간

                worker.onmessage = function(e) {
                    clearTimeout(timeout);
                    const data = e.data;
                    if (data && data.type === 'progress') {
                        // 경과 시간/남은 시간 표시
                        const elapsedMs = data.elapsed || 0;
                        const budget = data.timeBudget || timeBudget || 0;
                        const rem = Math.max(0, budget - elapsedMs);
                        const remSec = (rem / 1000).toFixed(1);
                        const elapsedSec = (elapsedMs / 1000).toFixed(1);
                        updateAIProgress(`🤔 AI 생각 중... (${elapsedSec}s / ${(budget/1000).toFixed(1)}s 남음: ${remSec}s)`);
                        return; // 계속 수신
                    }
                    if (data && data.type === 'result') {
                        resolve(data.move);
                    } else if (data && data.type === 'error') {
                        console.warn('Worker error:', data.message);
                        const fallback = orderMoves(getValidMoves(), player)[0] || getValidMoves()[0] || null;
                        resolve(fallback);
                    } else {
                        const fallback = orderMoves(getValidMoves(), player)[0] || getValidMoves()[0] || null;
                        resolve(fallback);
                    }
                    try { worker.terminate(); } catch (e) {}
                    getBestMoveExpert._worker = null;
                };

                // 보드 스냅샷과 파라미터 전송
                worker.postMessage({ type: 'search', board: cloneBoard(board), player, maxDepth, timeBudget });
            } else {
                // Worker 미지원 환경: 동기 탐색으로 대체(블로킹)
                const move = getBestMoveExpertSync(player, maxDepth, timeBudget);
                resolve(move);
            }
        } catch (err) {
            console.error('Failed to start worker search:', err);
            const fallback = orderMoves(getValidMoves(), player)[0] || getValidMoves()[0] || null;
            resolve(fallback);
        }
    });
}

// 실행 중인 전문가 워커를 취소하고 UI/상태를 갱신합니다
function cancelAI() {
    try {
        if (getBestMoveExpert._worker) {
            try { getBestMoveExpert._worker.terminate(); } catch (e) {}
            getBestMoveExpert._worker = null;
        }
    } catch (e) {
        console.warn('cancelAI error:', e);
    }

    // 생각중 플래그 및 UI 초기화
    isAIThinking = false;
    const boardElement = document.getElementById('board');
    if (boardElement) boardElement.classList.remove('thinking');
    updateAIProgress('AI 계산이 취소되었습니다.');
}

// 다른 스크립트에서 호출할 수 있도록 cancel 함수를 전역에 노출
window.cancelAI = cancelAI;
// Zobrist 해시와 간단한 전이 표를 사용하는 알파-베타 Negamax
function negamax(depth, player, alpha, beta, hash, color) {
    // color: 루트 플레이어=1, 상대방=-1 (evaluateBoard가 부호 있는 값을 반환할 때 사용)
    if (depth === 0 || gameOver) {
        return color * evaluateBoard();
    }

    // 전이표 조회
    const ttKey = `${hash}|${depth}|${player}`;
    const ttEntry = transpositionTable.get(ttKey);
    if (ttEntry && ttEntry.depth >= depth) {
        return ttEntry.value;
    }

    const moves = orderMoves(getValidMoves(), player);
    if (moves.length === 0) return 0;

    // 수 정렬: 킬러 무브 우선
    const km = killerMoves[depth] || [];
    moves.sort((a, b) => {
        const aKey = `${a.row},${a.col}`;
        const bKey = `${b.row},${b.col}`;
        if (km.includes(aKey) && !km.includes(bKey)) return -1;
        if (km.includes(bKey) && !km.includes(aKey)) return 1;
        const ha = historyHeuristic.get(aKey) || 0;
        const hb = historyHeuristic.get(bKey) || 0;
        return hb - ha; // 히스토리 점수가 높은 수 우선
    });

    let best = -Infinity;
    for (let move of moves) {
        const pieceIdx = player === 'white' ? 0 : 1;
    // 착수
        board[move.row][move.col] = player;
        const newHash = (hash ^ zobristTable[move.row][move.col][pieceIdx]) >>> 0;

        const val = -negamax(depth - 1, player === 'white' ? 'black' : 'white', -beta, -alpha, newHash, -color);

    // 착수 되돌리기
        board[move.row][move.col] = null;

        if (val > best) best = val;
        if (val > alpha) alpha = val;

        // 컷오프
        if (alpha >= beta) {
            // 킬러 무브 저장
            const key = `${move.row},${move.col}`;
            const k = killerMoves[depth] || [];
            if (!k.includes(key)) {
                k.unshift(key);
                if (k.length > 2) k.pop();
                killerMoves[depth] = k;
            }
            // 히스토리 휴리스틱 갱신
            const prev = historyHeuristic.get(key) || 0;
            historyHeuristic.set(key, prev + (1 << depth));

            // 전이표에 하한으로 저장
            transpositionTable.set(ttKey, { depth, value: val });
            return val;
        }
    }

    // 정확한 평가값 저장
    transpositionTable.set(ttKey, { depth, value: best });
    return best;
}

// 동기 대체 전문가 탐색 (Worker 비가용 시)
function getBestMoveExpertSync(player = 'white', maxDepth = 8, timeBudget = 1500) {
    // 기존 구현을 재사용하되 블로킹 방식으로 간단하게 유지
    ensureZobrist();
    transpositionTable.clear();
    historyHeuristic.clear();
    killerMoves = Array.from({ length: maxDepth + 2 }, () => []);

    const start = Date.now();
    let bestMove = null;
    let bestScore = -Infinity;
    let rootHash = computeZobristHash(board);
    const allValid = getValidMoves();
    for (let mv of allValid) {
        board[mv.row][mv.col] = player;
        if (checkWin(mv.row, mv.col, player)) { board[mv.row][mv.col] = null; return mv; }
        board[mv.row][mv.col] = null;
    }
    const opponent = player === 'white' ? 'black' : 'white';
    for (let mv of allValid) {
        board[mv.row][mv.col] = opponent;
        const patterns = analyzePosition(mv.row, mv.col, opponent);
        const oppWin = patterns.five > 0 || patterns.openFour > 0 || checkWin(mv.row, mv.col, opponent);
        board[mv.row][mv.col] = null;
        if (oppWin) return mv;
    }

    const moves = orderMoves(allValid, player).slice(0, 40);
    for (let depth = 1; depth <= maxDepth; depth++) {
        if (Date.now() - start > timeBudget) break;
        let localBest = null;
        let localBestScore = -Infinity;
        for (let move of moves) {
            if (Date.now() - start > timeBudget) break;
            board[move.row][move.col] = player;
            const pieceIdx = player === 'white' ? 0 : 1;
            rootHash = (rootHash ^ zobristTable[move.row][move.col][pieceIdx]) >>> 0;
            const score = -negamax(depth - 1, player === 'white' ? 'black' : 'white', -Infinity, Infinity, rootHash, 1);
            rootHash = (rootHash ^ zobristTable[move.row][move.col][pieceIdx]) >>> 0;
            board[move.row][move.col] = null;
            if (score > localBestScore) { localBestScore = score; localBest = move; }
        }
        if (localBest) { bestMove = localBest; bestScore = localBestScore; }
    }
    return bestMove || getValidMoves()[0] || null;
}

// 이동 정렬: 더 유망한 이동을 먼저 탐색하여 가지치기 효율 증가
function orderMoves(moves, player) {
    const opponent = player === 'white' ? 'black' : 'white';
    return moves.map(move => {
    // 플레이어의 이득
        board[move.row][move.col] = player;
        const myScore = evaluatePosition(move.row, move.col, player, false);
        board[move.row][move.col] = null;

    // 우리가 여기 두지 않으면 상대가 얻을 수 있는 잠재력 (방어 우선)
        board[move.row][move.col] = opponent;
        const oppScore = evaluatePosition(move.row, move.col, opponent, false);
        board[move.row][move.col] = null;

    // 가중치: 우리에게 유리한 수를 선호하되, 위험한 상대의 수를 차단하는 것을 강하게 우선시합니다
    const score = myScore + 1.2 * oppScore;
        return { move, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.move);
}

// 통합된 위치 평가 함수 (빠른 평가와 전체 평가 모두 지원)
function evaluatePosition(row, col, player, includePositional = true) {
    const patterns = analyzePosition(row, col, player);
    let score = 0;
    
    // 패턴별 점수
    score += patterns.five * 100000000;      // 5목 = 승리 (매우 큰 값)
    score += patterns.openFour * 50000;   // 열린 4 = 거의 승리
    score += patterns.four * 8000;        // 막힌 4
    score += patterns.openThree * 3000;    // 열린 3
    score += patterns.three * 600;        // 막힌 3
    
    if (includePositional) {
        score += patterns.openTwo * 100;   // 열린 2
        score += patterns.two * 20;       // 막힌 2
        // 위치 기반 가중치
        score += getPositionalScore(row, col);
    }
    
    return score;
}

// 미니맥스 알고리즘 (개선된 가지치기)
function minimax(depth, player, alpha, beta, isMaximizing) {
    if (depth === 0 || gameOver) {
        return evaluateBoard();
    }

    const validMoves = getValidMoves();
    if (validMoves.length === 0) {
        return 0;
    }

    // 이동 정렬로 가지치기 효율 향상
    const sortedMoves = orderMoves(validMoves, player);

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (let move of sortedMoves) {
            board[move.row][move.col] = player;
            const score = minimax(depth - 1, player === 'white' ? 'black' : 'white', alpha, beta, false);
            board[move.row][move.col] = null;

            maxScore = Math.max(maxScore, score);
            alpha = Math.max(alpha, score);
            if (alpha >= beta) break; // 베타 컷오프
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (let move of sortedMoves) {
            board[move.row][move.col] = player;
            const score = minimax(depth - 1, player === 'white' ? 'black' : 'white', alpha, beta, true);
            board[move.row][move.col] = null;

            minScore = Math.min(minScore, score);
            beta = Math.min(beta, score);
            if (alpha >= beta) break; // 알파 컷오프
        }
        return minScore;
    }
}

// Monte Carlo 트리 탐색 (MCTS) - 개선된 우선순위 평가
function getBestMoveWithMCTS(player, difficultyOrTime) {
    const validMoves = getValidMoves();
    if (validMoves.length === 0) return null;

    // 즉시 승리/방어 체크 (MCTS 전에 먼저 확인)
    const sortedMoves = orderMoves(validMoves, player);
    
    for (let move of sortedMoves) {
        board[move.row][move.col] = player;
        const patterns = analyzePosition(move.row, move.col, player);
        board[move.row][move.col] = null;
        
        if (patterns.five > 0 || patterns.openFour > 0) {
            return move;
        }
    }
    
    const opponent = player === 'white' ? 'black' : 'white';
    for (let move of sortedMoves) {
        board[move.row][move.col] = opponent;
        const patterns = analyzePosition(move.row, move.col, opponent);
        board[move.row][move.col] = null;
        
        if (patterns.five > 0 || patterns.openFour > 0) {
            return move;
        }
    }

    // difficultyOrTime은 난이도(1-4) 또는 ms 단위 시간 예산으로 사용할 수 있습니다
    let timeBudget = 1200; // 기본 ms
    let topCandidates = 15;
    let smartPlayoutRatio = 0.6; // simulateGameSmart 사용 비율
    let exploreC = 1.0; // UCB 탐험 계수

    if (typeof difficultyOrTime === 'number') {
        const d = difficultyOrTime;
        if (d >= 1 && d <= 4) {
            // 난이도 매핑: 짧은 시간 -> 빠르고 약함, 긴 시간 -> 강함
            const map = {
                1: { time: 120, candidates: 6, smart: 0.15, explore: 1.2 },
                2: { time: 350, candidates: 10, smart: 0.25, explore: 1.0 },
                3: { time: 800, candidates: 14, smart: 0.45, explore: 0.85 },
                4: { time: 1500, candidates: 20, smart: 0.95, explore: 0.6 }
            };
            const cfg = map[d] || map[2];
            timeBudget = cfg.time;
            topCandidates = cfg.candidates;
            smartPlayoutRatio = cfg.smart;
            exploreC = cfg.explore || exploreC;
        } else {
            // 숫자는 ms 단위 시간 예산으로 취급
            timeBudget = Math.max(50, d);
        }
    }

    // 후보 수 제한 및 준비
    const candidates = sortedMoves.slice(0, Math.min(topCandidates, sortedMoves.length));
    const stats = candidates.map(_ => ({ wins: 0, sims: 0 }));

    // 사전 시딩: 초기 통계에 편향을 주기 위해 간단한 휴리스틱 평가를 사용
    try {
        const priorScores = candidates.map(move => {
            board[move.row][move.col] = player;
            const s = evaluatePosition(move.row, move.col, player, true);
            board[move.row][move.col] = null;
            return Math.max(0, s);
        });
        const minS = Math.min(...priorScores);
        const maxS = Math.max(...priorScores);
    const priorSims = 2; // 선택 편향을 위한 작은 시드
        for (let i = 0; i < candidates.length; i++) {
            const normalized = (maxS - minS) > 0 ? (priorScores[i] - minS) / (maxS - minS) : 0.5;
            stats[i].sims = priorSims;
            stats[i].wins = Math.round(normalized * priorSims);
        }
    } catch (e) {
        // 사전 시딩 중 오류 발생 시 무시
        console.warn('Prior seeding failed:', e);
    }

    updateAIProgress(`🤔 AI 생각 중... (전문가 MCTS)`);

    // UCB 기반 선택을 사용한 가벼운 MCTS(플레이아웃 중심)
    const start = Date.now();
    let totalSims = 0;
    const C = exploreC; // 탐험 계수 (난이도별 조정)

    while (Date.now() - start < timeBudget) {
        // 선택: UCB1
        let bestIdx = 0;
        let bestUcb = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
            const s = stats[i];
            let ucb;
            if (s.sims === 0) {
                ucb = Infinity; // 한번은 꼭 시도
            } else {
                const winRate = s.wins / s.sims;
                ucb = winRate + C * Math.sqrt(Math.log(totalSims + 1) / s.sims);
            }

            if (ucb > bestUcb) {
                bestUcb = ucb;
                bestIdx = i;
            }
        }

        // 시뮬레이션 실행
    // 전문가 레벨에서는 smart 플레이라이트 비율이 매우 높을 경우 결정론적으로 스마트 플레이라이트를 사용
    const useSmart = smartPlayoutRatio >= 0.9 ? true : (Math.random() < smartPlayoutRatio);
        const candidateMove = candidates[bestIdx];
    const result = useSmart ? simulateGameSmart(candidateMove, player, Math.max(0.35, smartPlayoutRatio)) : simulateGame(candidateMove, player);

        stats[bestIdx].sims++;
        totalSims++;
        if (result === player) stats[bestIdx].wins++;

        // 주기적 진행표시(과도하지 않게)
        if (totalSims % 200 === 0) {
            updateAIProgress(`🤔 AI 생각 중... (${Math.min(timeBudget, Date.now()-start)}ms/${timeBudget}ms)`);
        }
    }

    // 결과 선택: 승률 높은 후보
    let bestMove = candidates[0];
    let bestRate = -1;
    for (let i = 0; i < candidates.length; i++) {
        const s = stats[i];
        const rate = s.sims > 0 ? (s.wins + 0.5 * (s.sims - s.wins)) / s.sims : 0;
        if (rate > bestRate) {
            bestRate = rate;
            bestMove = candidates[i];
        }
    }

    return bestMove;
}

// 스마트 시뮬레이션 (우선순위 기반)
function simulateGameSmart(move, player, heuristicChance = 0.2) {
    let testBoard;
    
    try {
        testBoard = cloneBoard(board);
    } catch (error) {
        return handleAIError(error, 'simulateGameSmart - cloneBoard');
    }
    
    let testPlayer = player;
    testBoard[move.row][move.col] = player;

    // 보조 함수들이 시뮬레이션 보드에서 작동하도록 전역 board를 일시적으로 testBoard로 교체합니다
    const originalBoard = board;
    board = testBoard;

    let moveCount = 0;
    const maxMoves = BOARD_SIZE * BOARD_SIZE;
    
    while (!isGameOver(testBoard) && moveCount < maxMoves) {
        const validMoves = getValidMoves();
        if (validMoves.length === 0) break;

        // 20% 확률로 좋은 수를 선택, 80%는 랜덤
        let selectedMove;
    if (Math.random() < heuristicChance && validMoves.length > 1) {
            // 간단한 휴리스틱으로 좋은 수 선택
            const scored = validMoves.map(m => {
                testBoard[m.row][m.col] = testPlayer;
                const score = evaluatePosition(m.row, m.col, testPlayer, false);
                testBoard[m.row][m.col] = null;
                return { move: m, score };
            }).sort((a, b) => b.score - a.score);
            selectedMove = scored[0].move;
        } else {
            selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        }
        
        testBoard[selectedMove.row][selectedMove.col] = testPlayer;
        testPlayer = testPlayer === 'white' ? 'black' : 'white';
        moveCount++;
    }
    // 결과 반환 전에 원래의 전역 board로 복원합니다
    board = originalBoard;
    return getWinner(testBoard);
}

// 시뮬레이션 수행 (MCTS) - 개선된 보드 복사
function simulateGame(move, player) {
    let testBoard;
    
    // 효율적인 보드 복사
    try {
        testBoard = cloneBoard(board);
    } catch (error) {
        return handleAIError(error, 'simulateGame - cloneBoard');
    }
    
    let testPlayer = player;
    testBoard[move.row][move.col] = player;

    // 보조 함수들이 시뮬레이션 보드에서 작동하도록 전역 board를 일시적으로 testBoard로 교체합니다
    const originalBoard = board;
    board = testBoard;

    let moveCount = 0;
    const maxMoves = BOARD_SIZE * BOARD_SIZE; // 무한 루프 방지

    try {
        while (!isGameOver(testBoard) && moveCount < maxMoves) {
            const validMoves = getValidMoves();
            if (validMoves.length === 0) break;

            const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            testBoard[randomMove.row][randomMove.col] = testPlayer;
            testPlayer = testPlayer === 'white' ? 'black' : 'white';
            moveCount++;
        }

        return getWinner(testBoard); // 승자를 반환 (white, black, 또는 null)
    } finally {
        // 원래 전역 board로 복원
        board = originalBoard;
    }
}

// 게임 종료 여부 확인 (시뮬레이션용)
function isGameOver(testBoard) {
    // 승자가 있는지 확인
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (testBoard[row][col] !== null) {
                if (checkWinOnBoard(testBoard, row, col, testBoard[row][col])) {
                    return true;
                }
            }
        }
    }
    return false;
}

// 승자 확인 (시뮬레이션용)
function getWinner(testBoard) {
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (testBoard[row][col] !== null) {
                if (checkWinOnBoard(testBoard, row, col, testBoard[row][col])) {
                    return testBoard[row][col];
                }
            }
        }
    }
    return null;
}

// 특정 보드에서 승리 조건 체크
function checkWinOnBoard(testBoard, row, col, player) {
    const directions = [
        [0, 1],   // 가로
        [1, 0],   // 세로
        [1, 1],   // 대각선 \
        [1, -1]   // 대각선 /
    ];
    
    for (let [dx, dy] of directions) {
        let count = 1;
        
        // 양방향으로 체크
        count += countStonesOnBoard(testBoard, row, col, dx, dy, player);
        count += countStonesOnBoard(testBoard, row, col, -dx, -dy, player);
        
        if (count === 5) {
            return true;
        }
        
        if (count > 5) {
            return false;
        }
    }
    
    return false;
}

// 특정 보드에서 특정 방향으로 연속된 돌 개수 세기
function countStonesOnBoard(testBoard, row, col, dx, dy, player) {
    let count = 0;
    let newRow = row + dx;
    let newCol = col + dy;
    
    while (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE && 
           testBoard[newRow][newCol] === player) {
        count++;
        newRow += dx;
        newCol += dy;
    }
    
    return count;
}

// 전체 보드 평가 (개선된 위치 가중치)
function evaluateBoard() {
    let score = 0;
    
    // 모든 위치에 대해 평가
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] === 'white') {
                score += evaluatePosition(row, col, 'white', true);
            } else if (board[row][col] === 'black') {
                score -= evaluatePosition(row, col, 'black', true);
            }
        }
    }
    
    return score;
}

// 위치 기반 점수 계산
function getPositionalScore(row, col) {
    const center = Math.floor(BOARD_SIZE / 2);
    let score = 0;
    
    // 중앙 가중치 (초반에 중앙이 유리)
    const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
    score += (BOARD_SIZE - distanceFromCenter) * 2;
    
    // 화점 보너스
    const starPoints = [
        [3, 3], [3, 9], [3, 15],
        [9, 3], [9, 9], [9, 15],
        [15, 3], [15, 9], [15, 15]
    ];
    
    if (starPoints.some(point => point[0] === row && point[1] === col)) {
        score += 5;
    }
    
    return score;
}

// 힌트 표시 (개선된 에러 처리)
function getHint() {
    if (currentPlayer !== 'black' || gameOver || isAIThinking) return;
    if (hintCooldown) return; // 힌트 남용 방지

    try {
        const move = getBestMove(3, 'black');
        
        if (move) {
            renderBoard();
            
            const hintElement = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            if (hintElement) {
                hintElement.classList.add('hint-position');
                
                setTimeout(() => {
                    hintElement.classList.remove('hint-position');
                }, 3000);
            } else {
                console.warn('Hint element not found in DOM');
            }
            // 반복적인 완벽한 힌트 남용을 막기 위해 힌트 버튼을 잠시 비활성화
            hintCooldown = true;
            const hintBtn = document.getElementById('hint');
            if (hintBtn) hintBtn.disabled = true;
            setTimeout(() => {
                hintCooldown = false;
                if (hintBtn) hintBtn.disabled = false;
            }, 3000);
        }
    } catch (error) {
        handleAIError(error, 'getHint');
    }
}