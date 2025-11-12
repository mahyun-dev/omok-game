// 게임 상태
const BOARD_SIZE = 19;
let board = [];
let currentPlayer = 'black'; // 'black' or 'white'
let gameOver = false;
let moveHistory = [];
let isAIThinking = false;
let lastMove = null;

// 화점 위치 (19x19 바둑판)
const starPoints = [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15]
];

// 초기화
function initGame() {
    board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    currentPlayer = 'black';
    gameOver = false;
    moveHistory = [];
    lastMove = null;
    renderBoard();
    updateStatus();
    updateStoneCount();
}

// 바둑판 렌더링
function renderBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const intersection = document.createElement('div');
            intersection.className = 'intersection';
            intersection.dataset.row = row;
            intersection.dataset.col = col;

            // 화점 표시
            if (starPoints.some(point => point[0] === row && point[1] === col)) {
                intersection.classList.add('star-point');
            }

            // 돌이 있으면 표시
            if (board[row][col]) {
                intersection.classList.add('has-stone');
                const stone = document.createElement('div');
                stone.className = `stone ${board[row][col]}`;
                
                // 마지막 수 표시
                if (lastMove && lastMove.row === row && lastMove.col === col) {
                    stone.classList.add('last-move');
                }
                
                intersection.appendChild(stone);
            }

            intersection.addEventListener('click', () => handleIntersectionClick(row, col));
            boardElement.appendChild(intersection);
        }
    }
}

// 교점 클릭 처리
function handleIntersectionClick(row, col) {
    if (gameOver || isAIThinking || currentPlayer !== 'black') return;
    if (board[row][col] !== null) return;

    if (placeStone(row, col)) {
        renderBoard();
        
        if (!gameOver) {
            setTimeout(() => aiMove(), 500);
        }
    }
}

// 상태 업데이트
function updateStatus(winner = null) {
    const statusElement = document.getElementById('status');
    
    if (gameOver && winner) {
        const winnerText = winner === 'black' ? '흑돌' : '백돌';
        statusElement.textContent = `🎉 ${winnerText} 승리!`;
        statusElement.style.color = '#fbbf24';
    } else {
        statusElement.textContent = currentPlayer === 'black' ? '흑돌 차례' : '백돌 차례';
        statusElement.style.color = 'white';
    }
}

// 돌 개수 업데이트
function updateStoneCount() {
    let blackCount = 0;
    let whiteCount = 0;
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] === 'black') blackCount++;
            if (board[row][col] === 'white') whiteCount++;
        }
    }
    
    document.getElementById('blackCount').textContent = blackCount;
    document.getElementById('whiteCount').textContent = whiteCount;
}

// 버튼 이벤트 리스너
document.getElementById('newGame').addEventListener('click', () => {
    initGame();
});

document.getElementById('undo').addEventListener('click', () => {
    undoMove();
});

document.getElementById('hint').addEventListener('click', () => {
    getHint();
});

// cancel AI button (if present)
const cancelBtn = document.getElementById('cancelAI');
if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
        if (typeof cancelAI === 'function') cancelAI();
        // update UI
        const boardElement = document.getElementById('board');
        if (boardElement) boardElement.classList.remove('thinking');
        updateStatus();
    });
}

// 게임 시작
initGame();
