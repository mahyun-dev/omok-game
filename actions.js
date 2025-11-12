// 돌 놓기
function placeStone(row, col) {
    if (board[row][col] !== null || gameOver) return false;
    
    // 현재 상태 저장 (무르기용)
    moveHistory.push({
        row,
        col,
        player: currentPlayer,
        boardState: board.map(r => [...r])
    });
    
    // 돌 배치
    board[row][col] = currentPlayer;
    lastMove = {row, col};
    
    // 승리 체크 (차례 변경 전에 체크)
    if (checkWin(row, col, currentPlayer)) {
        gameOver = true;
        // 승자 정보 저장
        const winner = currentPlayer;
        updateStatus(winner);
        updateStoneCount();
        return true;
    }
    
    // 차례 변경
    currentPlayer = currentPlayer === 'black' ? 'white' : 'black';
    updateStatus();
    updateStoneCount();
    
    return true;
}

// 무르기
function undoMove() {
    if (moveHistory.length === 0 || isAIThinking) return;
    
    // AI 턴이었다면 2수 무르기 (플레이어 + AI)
    const movesToUndo = currentPlayer === 'black' && moveHistory.length >= 2 ? 2 : 1;
    
    for (let i = 0; i < movesToUndo && moveHistory.length > 0; i++) {
        const lastMove = moveHistory.pop();
        board = lastMove.boardState.map(r => [...r]);
        currentPlayer = lastMove.player;
    }
    
    // 마지막 수 업데이트
    if (moveHistory.length > 0) {
        const prev = moveHistory[moveHistory.length - 1];
        lastMove = {row: prev.row, col: prev.col};
    } else {
        lastMove = null;
    }
    
    gameOver = false;
    renderBoard();
    updateStatus();
    updateStoneCount();
}
