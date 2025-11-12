// 8방향 체크 (가로, 세로, 대각선 2개)
const directions = [
    [0, 1],   // 가로
    [1, 0],   // 세로
    [1, 1],   // 대각선 \
    [1, -1]   // 대각선 /
];

// 승리 체크 (5개 연속)
function checkWin(row, col, player) {
    for (let [dx, dy] of directions) {
        let count = 1; // 현재 돌 포함
        
        // 양방향으로 체크
        count += countStones(row, col, dx, dy, player);
        count += countStones(row, col, -dx, -dy, player);
        
        if (count === 5) {
            return true;
        }
        
        // 6목은 패배 (선택적 규칙, 주석 처리하면 6목도 승리)
        if (count > 5) {
            return false;
        }
    }
    
    return false;
}

// 특정 방향으로 연속된 돌 개수 세기
function countStones(row, col, dx, dy, player) {
    let count = 0;
    let newRow = row + dx;
    let newCol = col + dy;
    
    while (isValidPosition(newRow, newCol) && board[newRow][newCol] === player) {
        count++;
        newRow += dx;
        newCol += dy;
    }
    
    return count;
}

// 유효한 위치인지 체크
function isValidPosition(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// 특정 위치의 연속 돌 패턴 분석 (AI 평가용)
function analyzePosition(row, col, player) {
    let patterns = {
        five: 0,      // 5개 (승리)
        openFour: 0,  // 열린 4 (양쪽 열림)
        four: 0,      // 4개
        openThree: 0, // 열린 3
        three: 0,     // 3개
        openTwo: 0,   // 열린 2
        two: 0        // 2개
    };
    
    for (let [dx, dy] of directions) {
        let count = 1;
        let leftBlocked = false;
        let rightBlocked = false;
        
        // 왼쪽 방향 체크
        let leftCount = 0;
        let lr = row - dx;
        let lc = col - dy;
        while (isValidPosition(lr, lc) && board[lr][lc] === player) {
            leftCount++;
            lr -= dx;
            lc -= dy;
        }
        if (!isValidPosition(lr, lc) || board[lr][lc] !== null) {
            leftBlocked = true;
        }
        
        // 오른쪽 방향 체크
        let rightCount = 0;
        let rr = row + dx;
        let rc = col + dy;
        while (isValidPosition(rr, rc) && board[rr][rc] === player) {
            rightCount++;
            rr += dx;
            rc += dy;
        }
        if (!isValidPosition(rr, rc) || board[rr][rc] !== null) {
            rightBlocked = true;
        }
        
        count = leftCount + rightCount + 1;
        
        // 패턴 분류
        if (count >= 5) {
            patterns.five++;
        } else if (count === 4) {
            if (!leftBlocked && !rightBlocked) {
                patterns.openFour++;
            } else {
                patterns.four++;
            }
        } else if (count === 3) {
            if (!leftBlocked && !rightBlocked) {
                patterns.openThree++;
            } else {
                patterns.three++;
            }
        } else if (count === 2) {
            if (!leftBlocked && !rightBlocked) {
                patterns.openTwo++;
            } else {
                patterns.two++;
            }
        }
    }
    
    return patterns;
}

// 빈 교점 근처에 돌이 있는지 체크 (탐색 최적화)
function hasNeighbor(row, col, range = 2) {
    for (let dr = -range; dr <= range; dr++) {
        for (let dc = -range; dc <= range; dc++) {
            if (dr === 0 && dc === 0) continue;
            const newRow = row + dr;
            const newCol = col + dc;
            if (isValidPosition(newRow, newCol) && board[newRow][newCol] !== null) {
                return true;
            }
        }
    }
    return false;
}

// 가능한 수 목록 생성 (근처에 돌이 있는 빈 교점만)
function getValidMoves() {
    const moves = [];
    
    // 첫 수는 중앙에
    let hasStone = false;
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] !== null) {
                hasStone = true;
                break;
            }
        }
        if (hasStone) break;
    }
    
    if (!hasStone) {
        const center = Math.floor(BOARD_SIZE / 2);
        return [{row: center, col: center}];
    }
    
    // 근처에 돌이 있는 빈 교점만 추가
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (board[row][col] === null && hasNeighbor(row, col)) {
                moves.push({row, col});
            }
        }
    }
    
    return moves;
}
