class Game {
    constructor() {
        this.playerName = '';
        this.playerId = null; // 'player1' atau 'player2'
        this.roomId = null;
        this.roomData = null;
        this.timerInterval = null;
        this.turnTime = 10; // 10 detik per giliran
        this.gameDuration = 0;
        
        this.initElements();
        this.initEventListeners();
        
        // Cek apakah ada room ID di URL
        this.checkUrlForRoomId();
    }
    
    initElements() {
        // Lobby elements
        this.lobbyScreen = document.getElementById('lobby');
        this.gameScreen = document.getElementById('game');
        this.resultScreen = document.getElementById('result');
        
        this.playerNameInput = document.getElementById('playerName');
        this.roomIdInput = document.getElementById('roomId');
        this.displayRoomId = document.getElementById('displayRoomId');
        this.waitingRoomId = document.getElementById('waitingRoomId');
        
        // Game elements
        this.currentRoomId = document.getElementById('currentRoomId');
        this.player1Name = document.getElementById('player1Name');
        this.player2Name = document.getElementById('player2Name');
        this.player1Status = document.getElementById('player1Status');
        this.player2Status = document.getElementById('player2Status');
        this.player1Turn = document.getElementById('player1Turn');
        this.player2Turn = document.getElementById('player2Turn');
        this.player1Card = document.getElementById('player1Card');
        this.player2Card = document.getElementById('player2Card');
        
        this.wordChain = document.getElementById('wordChain');
        this.lastLetter = document.getElementById('lastLetter');
        this.wordCount = document.getElementById('wordCount');
        
        this.wordInput = document.getElementById('wordInput');
        this.submitWordBtn = document.getElementById('submitWordBtn');
        
        this.timerCount = document.getElementById('timerCount');
        this.timerProgress = document.getElementById('timerProgress');
        
        // Voice elements
        this.voiceStatus = document.getElementById('voiceStatus');
        
        // Notification
        this.notification = document.getElementById('notification');
        
        // Result elements
        this.resultTitle = document.getElementById('resultTitle');
        this.resultMessage = document.getElementById('resultMessage');
        this.finalWordCount = document.getElementById('finalWordCount');
        this.gameDuration = document.getElementById('gameDuration');
    }
    
    initEventListeners() {
        // Lobby buttons
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.showJoinRoom());
        document.getElementById('confirmJoinBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('copyRoomIdBtn').addEventListener('click', () => this.copyRoomId());
        
        // Game buttons
        document.getElementById('submitWordBtn').addEventListener('click', () => this.submitWord());
        document.getElementById('leaveGameBtn').addEventListener('click', () => this.leaveGame());
        
        // Voice buttons (akan diinisialisasi di webrtc.js)
        
        // Result buttons
        document.getElementById('playAgainBtn').addEventListener('click', () => this.playAgain());
        document.getElementById('backToLobbyBtn').addEventListener('click', () => this.backToLobby());
        
        // Input enter key
        this.wordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitWord();
            }
        });
    }
    
    checkUrlForRoomId() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');
        if (roomId) {
            this.roomIdInput.value = roomId;
            this.showJoinRoom();
        }
    }
    
    async createRoom() {
        this.playerName = this.playerNameInput.value.trim();
        
        if (!this.playerName) {
            this.showNotification('Masukkan nama kamu terlebih dahulu', 'error');
            return;
        }
        
        try {
            this.roomId = await firebaseDB.createRoom(this.playerName);
            this.playerId = 'player1';
            
            this.displayRoomId.textContent = this.roomId;
            this.waitingRoomId.textContent = this.roomId;
            
            // Update URL dengan room ID
            const url = new URL(window.location);
            url.searchParams.set('room', this.roomId);
            window.history.pushState({}, '', url);
            
            // Show waiting section
            document.getElementById('roomSection').classList.add('hidden');
            document.getElementById('waitingSection').classList.remove('hidden');
            
            // Listen for room updates
            this.unsubscribeRoom = firebaseDB.onRoomUpdate(this.roomId, (data) => {
                this.handleRoomUpdate(data);
            });
            
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    showJoinRoom() {
        document.getElementById('roomSection').classList.remove('hidden');
        document.getElementById('createRoomBtn').classList.add('hidden');
        document.getElementById('joinRoomBtn').classList.add('hidden');
    }
    
    async joinRoom() {
        this.playerName = this.playerNameInput.value.trim();
        this.roomId = this.roomIdInput.value.trim().toUpperCase();
        
        if (!this.playerName) {
            this.showNotification('Masukkan nama kamu terlebih dahulu', 'error');
            return;
        }
        
        if (!this.roomId || this.roomId.length !== 6) {
            this.showNotification('Kode room harus 6 karakter', 'error');
            return;
        }
        
        try {
            await firebaseDB.joinRoom(this.roomId, this.playerName);
            this.playerId = 'player2';
            
            // Update URL dengan room ID
            const url = new URL(window.location);
            url.searchParams.set('room', this.roomId);
            window.history.pushState({}, '', url);
            
            // Hide lobby, show game
            this.lobbyScreen.classList.remove('active');
            this.gameScreen.classList.add('active');
            
            // Listen for room updates
            this.unsubscribeRoom = firebaseDB.onRoomUpdate(this.roomId, (data) => {
                this.handleRoomUpdate(data);
            });
            
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    handleRoomUpdate(data) {
        this.roomData = data;
        
        // Update UI berdasarkan status room
        switch (data.status) {
            case 'waiting':
                this.updateWaitingScreen(data);
                break;
            case 'full':
                if (data.game.status === 'starting') {
                    this.startGame(data);
                } else {
                    this.updateGameScreen(data);
                }
                break;
        }
    }
    
    updateWaitingScreen(data) {
        // Update player info di waiting screen
        const player1 = data.players.player1;
        this.player1Name.textContent = player1.name;
        this.player1Status.textContent = 'Online';
        this.player1Status.classList.add('online');
    }
    
    startGame(data) {
        // Hide lobby, show game
        this.lobbyScreen.classList.remove('active');
        this.gameScreen.classList.add('active');
        
        // Update game UI
        this.updateGameScreen(data);
        
        // Show notification
        this.showNotification('Game dimulai!', 'success');
    }
    
    updateGameScreen(data) {
        // Update room info
        this.currentRoomId.textContent = data.roomId;
        
        // Update player info
        const player1 = data.players.player1;
        const player2 = data.players.player2;
        
        this.player1Name.textContent = player1.name;
        this.player2Name.textContent = player2.name;
        
        this.player1Status.textContent = player1.status;
        this.player2Status.textContent = player2.status;
        
        this.player1Status.classList.toggle('online', player1.status === 'online');
        this.player2Status.classList.toggle('online', player2.status === 'online');
        
        // Update game state
        this.updateGameState(data.game);
        
        // Update word chain
        this.updateWordChain(data.game);
    }
    
    updateGameState(game) {
        // Update turn indicators
        this.player1Card.classList.toggle('active', game.currentPlayer === 'player1');
        this.player2Card.classList.toggle('active', game.currentPlayer === 'player2');
        
        this.player1Turn.classList.toggle('hidden', game.currentPlayer !== 'player1');
        this.player2Turn.classList.toggle('hidden', game.currentPlayer !== 'player2');
        
        // Update last letter
        this.lastLetter.textContent = game.lastLetter ? game.lastLetter.toUpperCase() : '-';
        
        // Update word count
        const wordCount = Object.keys(game.usedWords || {}).length;
        this.wordCount.textContent = wordCount;
        
        // Enable/disable input berdasarkan giliran
        const isMyTurn = game.currentPlayer === this.playerId;
        this.wordInput.disabled = !isMyTurn;
        this.submitWordBtn.disabled = !isMyTurn;
        
        if (isMyTurn) {
            this.wordInput.focus();
            this.startTurnTimer(game.turnStartTime || Date.now());
            this.showNotification('Giliran kamu! Masukkan kata', 'info');
        } else {
            this.stopTurnTimer();
            this.showNotification(`Giliran ${this.getOpponentName()}`, 'info');
        }
        
        // Check if game is finished
        if (game.status === 'finished') {
            this.endGame(game);
        }
    }
    
    updateWordChain(game) {
        this.wordChain.innerHTML = '';
        
        if (game.usedWords) {
            Object.keys(game.usedWords).forEach(word => {
                const wordElement = document.createElement('div');
                wordElement.className = 'word-item';
                wordElement.textContent = word;
                this.wordChain.appendChild(wordElement);
            });
            
            // Scroll ke bawah
            this.wordChain.scrollTop = this.wordChain.scrollHeight;
        }
    }
    
    startTurnTimer(startTime) {
        this.stopTurnTimer();
        
        const updateTimer = () => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = this.turnTime - elapsed;
            
            if (remaining <= 0) {
                this.timeout();
                return;
            }
            
            // Update timer display
            this.timerCount.textContent = remaining;
            
            // Update progress circle
            const progress = (remaining / this.turnTime) * 283; // 2πr where r=45
            this.timerProgress.style.strokeDasharray = `${progress} 283`;
            
            // Change color based on time
            if (remaining <= 3) {
                this.timerProgress.style.stroke = '#ef4444'; // Red
            } else if (remaining <= 5) {
                this.timerProgress.style.stroke = '#fbbf24'; // Yellow
            } else {
                this.timerProgress.style.stroke = '#10b981'; // Green
            }
        };
        
        updateTimer();
        this.timerInterval = setInterval(updateTimer, 1000);
    }
    
    stopTurnTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    async submitWord() {
        const word = this.wordInput.value.trim().toLowerCase();
        
        if (!word) {
            this.showNotification('Masukkan kata terlebih dahulu', 'error');
            return;
        }
        
        // Validasi kata
        if (!this.validateWord(word)) {
            this.wordInput.value = '';
            this.wordInput.focus();
            return;
        }
        
        try {
            await firebaseDB.submitWord(this.roomId, this.playerId, word);
            this.wordInput.value = '';
            this.showNotification('Kata diterima!', 'success');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }
    
    validateWord(word) {
        const game = this.roomData.game;
        
        // Validasi 1: Kata minimal 2 huruf
        if (word.length < 2) {
            this.showNotification('Kata harus minimal 2 huruf', 'error');
            return false;
        }
        
        // Validasi 2: Kata harus dimulai dengan huruf terakhir sebelumnya
        if (game.lastLetter && word.charAt(0) !== game.lastLetter) {
            this.showNotification(`Kata harus dimulai dengan huruf "${game.lastLetter.toUpperCase()}"`, 'error');
            return false;
        }
        
        // Validasi 3: Kata tidak boleh diulang
        if (game.usedWords && game.usedWords[word]) {
            this.showNotification('Kata sudah digunakan', 'error');
            return false;
        }
        
        // Validasi 4: Kata harus valid (hanya huruf)
        if (!/^[a-z]+$/.test(word)) {
            this.showNotification('Kata hanya boleh mengandung huruf', 'error');
            return false;
        }
        
        return true;
    }
    
    async timeout() {
        this.stopTurnTimer();
        
        try {
            await firebaseDB.playerLoses(this.roomId, this.playerId);
            this.showNotification('Waktu habis! Kamu kalah.', 'error');
        } catch (error) {
            console.error('Error timeout:', error);
        }
    }
    
    endGame(game) {
        this.stopTurnTimer();
        
        // Tentukan pemenang
        const isWinner = game.winner === this.playerId;
        const opponentName = this.getOpponentName();
        
        // Update result screen
        this.resultTitle.textContent = isWinner ? 'Selamat! Kamu Menang!' : 'Kamu Kalah!';
        this.resultTitle.style.color = isWinner ? '#10b981' : '#ef4444';
        
        this.resultMessage.textContent = isWinner 
            ? `Kamu mengalahkan ${opponentName}!` 
            : `${opponentName} memenangkan game!`;
        
        const wordCount = Object.keys(game.usedWords || {}).length;
        this.finalWordCount.textContent = wordCount;
        
        const duration = game.endTime ? Math.floor((game.endTime - game.gameStartTime) / 1000) : 0;
        this.gameDuration.textContent = duration;
        
        // Show result screen
        this.gameScreen.classList.remove('active');
        this.resultScreen.classList.add('active');
    }
    
    getOpponentName() {
        if (!this.roomData) return 'Lawan';
        
        const opponentId = this.playerId === 'player1' ? 'player2' : 'player1';
        return this.roomData.players[opponentId]?.name || 'Lawan';
    }
    
    copyRoomId() {
        navigator.clipboard.writeText(this.roomId)
            .then(() => this.showNotification('Kode room disalin!', 'success'))
            .catch(() => this.showNotification('Gagal menyalin kode', 'error'));
    }
    
    async leaveGame() {
        if (confirm('Apakah kamu yakin ingin keluar dari game?')) {
            // Update status pemain
            if (this.roomId && this.playerId) {
                await firebaseDB.updatePlayerStatus(this.roomId, this.playerId, 'offline');
            }
            
            // Hapus room jika pemain keluar saat waiting
            if (this.roomData && this.roomData.status === 'waiting') {
                await firebaseDB.deleteRoom(this.roomId);
            }
            
            this.cleanup();
            this.backToLobby();
        }
    }
    
    playAgain() {
        // Reset game
        this.cleanup();
        
        // Kembali ke lobby
        this.resultScreen.classList.remove('active');
        this.lobbyScreen.classList.add('active');
        
        // Clear URL
        window.history.pushState({}, '', window.location.pathname);
    }
    
    backToLobby() {
        // Reset semua screen
        this.gameScreen.classList.remove('active');
        this.resultScreen.classList.remove('active');
        this.lobbyScreen.classList.add('active');
        
        // Reset form
        document.getElementById('roomSection').classList.add('hidden');
        document.getElementById('waitingSection').classList.add('hidden');
        document.getElementById('createRoomBtn').classList.remove('hidden');
        document.getElementById('joinRoomBtn').classList.remove('hidden');
        
        this.playerNameInput.value = '';
        this.roomIdInput.value = '';
        
        // Clear URL
        window.history.pushState({}, '', window.location.pathname);
    }
    
    cleanup() {
        this.stopTurnTimer();
        
        if (this.unsubscribeRoom) {
            this.unsubscribeRoom();
            this.unsubscribeRoom = null;
        }
        
        // Cleanup WebRTC
        if (window.voiceChat) {
            window.voiceChat.cleanup();
        }
        
        this.playerName = '';
        this.playerId = null;
        this.roomId = null;
        this.roomData = null;
    }
    
    showNotification(message, type) {
        this.notification.textContent = message;
        this.notification.className = 'notification';
        
        switch (type) {
            case 'success':
                this.notification.style.borderLeftColor = '#10b981';
                break;
            case 'error':
                this.notification.style.borderLeftColor = '#ef4444';
                break;
            case 'info':
                this.notification.style.borderLeftColor = '#3b82f6';
                break;
        }
        
        this.notification.classList.remove('hidden');
        
        // Auto hide after 3 seconds
        setTimeout(() => {
            this.notification.classList.add('hidden');
        }, 3000);
    }
}

// Inisialisasi game saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});