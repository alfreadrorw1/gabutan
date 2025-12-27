// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyAvgycWXMi3vr_Wtl0DNo--ThZP7PlPc_A",
    authDomain: "ttc-online-ddfca.firebaseapp.com",
    databaseURL: "https://ttc-online-ddfca-default-rtdb.firebaseio.com",
    projectId: "ttc-online-ddfca",
    storageBucket: "ttc-online-ddfca.firebasestorage.app",
    messagingSenderId: "955067485290",
    appId: "1:955067485290:web:a483da2db01195cef38e13",
    measurementId: "G-3K6VP0LC5M"
};

// ==================== GAME CONSTANTS ====================
const GAME_CONFIG = {
    TURN_TIME: 15, // detik
    MAX_PLAYERS: 2,
    WORD_LIST: [
        "sambung", "game", "multiplayer", "online", "real", "time",
        "kata", "huruf", "awal", "akhir", "giliran", "pemenang",
        "permainan", "seru", "menarik", "tantangan", "strategi",
        "kreatif", "cepat", "tepat", "benar", "salah", "menang",
        "kalah", "seri", "poin", "score", "timer", "waktu",
        "start", "finish", "round", "match", "player", "turn"
    ]
};

// ==================== GAME STATE ====================
let gameState = {
    currentPlayer: null,
    currentWord: null,
    usedWords: [],
    players: {},
    gameStatus: 'waiting', // waiting, playing, finished
    winner: null,
    startTime: null,
    turnStartTime: null
};

let localPlayer = {
    id: null,
    name: '',
    isHost: false,
    playerNumber: null
};

let firebase = null;
let database = null;
let roomRef = null;
let gameRef = null;
let timerInterval = null;
let turnTimer = null;

// ==================== DOM ELEMENTS ====================
const elements = {
    // Screens
    loadingScreen: document.getElementById('loadingScreen'),
    lobbyScreen: document.getElementById('lobbyScreen'),
    gameScreen: document.getElementById('gameScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    
    // Lobby
    playerName: document.getElementById('playerName'),
    roomCode: document.getElementById('roomCode'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    roomJoinSection: document.getElementById('roomJoinSection'),
    confirmJoinBtn: document.getElementById('confirmJoinBtn'),
    activeRoomsList: document.getElementById('activeRoomsList'),
    
    // Game
    roomName: document.getElementById('roomName'),
    currentRoomCode: document.getElementById('currentRoomCode'),
    turnIndicator: document.getElementById('turnIndicator'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    
    // Players
    player1Card: document.getElementById('player1Card'),
    player2Card: document.getElementById('player2Card'),
    player1Name: document.getElementById('player1Name'),
    player2Name: document.getElementById('player2Name'),
    player1Status: document.getElementById('player1Status'),
    player2Status: document.getElementById('player2Status'),
    
    // Game Board
    currentWord: document.getElementById('currentWord'),
    lastLetter: document.getElementById('lastLetter'),
    wordInput: document.getElementById('wordInput'),
    submitWordBtn: document.getElementById('submitWordBtn'),
    timer: document.getElementById('timer'),
    timerFill: document.getElementById('timerFill'),
    timerText: document.getElementById('timerText'),
    timerLabel: document.getElementById('timerLabel'),
    usedWordsList: document.getElementById('usedWordsList'),
    
    // Game Over
    resultIcon: document.getElementById('resultIcon'),
    resultTitle: document.getElementById('resultTitle'),
    resultMessage: document.getElementById('resultMessage'),
    totalWords: document.getElementById('totalWords'),
    gameDuration: document.getElementById('gameDuration'),
    winnerName: document.getElementById('winnerName'),
    finalWordsList: document.getElementById('finalWordsList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    newRoomBtn: document.getElementById('newRoomBtn'),
    
    // Controls
    rematchBtn: document.getElementById('rematchBtn'),
    copyRoomBtn: document.getElementById('copyRoomBtn'),
    
    // Notification
    notification: document.getElementById('notification')
};

// ==================== FIREBASE INITIALIZATION ====================
function initializeFirebase() {
    try {
        firebase = window.firebase;
        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        console.log('Firebase initialized successfully');
        hideLoadingScreen();
    } catch (error) {
        console.error('Firebase initialization failed:', error);
        showNotification('Gagal menghubungkan ke server. Coba refresh halaman.', 'error');
    }
}

function hideLoadingScreen() {
    elements.loadingScreen.style.display = 'none';
    elements.lobbyScreen.style.display = 'block';
}

// ==================== GAME FUNCTIONS ====================
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function getRandomWord() {
    const words = GAME_CONFIG.WORD_LIST;
    return words[Math.floor(Math.random() * words.length)];
}

function getLastLetter(word) {
    // Handle kata dengan huruf terakhir yang diulang (seperti "kassa" -> ambil "s")
    word = word.toLowerCase().trim();
    // Remove trailing non-alphabet characters
    word = word.replace(/[^a-z]+$/, '');
    return word.charAt(word.length - 1);
}

function isValidWord(newWord, lastLetter) {
    newWord = newWord.toLowerCase().trim();
    
    // Cek panjang kata
    if (newWord.length < 3) {
        return false;
    }
    
    // Cek huruf pertama
    if (newWord.charAt(0) !== lastLetter.toLowerCase()) {
        return false;
    }
    
    // Cek apakah kata sudah dipakai
    if (gameState.usedWords.some(word => word.toLowerCase() === newWord)) {
        return false;
    }
    
    // Cek apakah kata valid (opsional: bisa ditambahkan dictionary)
    return true;
}

// ==================== ROOM MANAGEMENT ====================
async function createRoom() {
    const playerName = elements.playerName.value.trim();
    
    if (!playerName) {
        showNotification('Masukkan nama kamu dulu!', 'warning');
        return;
    }
    
    const roomCode = generateRoomCode();
    localPlayer.id = 'player_' + Date.now() + Math.random().toString(36).substr(2, 9);
    localPlayer.name = playerName;
    localPlayer.isHost = true;
    localPlayer.playerNumber = 1;
    
    try {
        roomRef = database.ref(`rooms/${roomCode}`);
        gameRef = database.ref(`rooms/${roomCode}/game`);
        
        // Create room
        await roomRef.set({
            code: roomCode,
            name: `${playerName}'s Room`,
            status: 'waiting',
            host: localPlayer.id,
            maxPlayers: GAME_CONFIG.MAX_PLAYERS,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Add player to room
        await roomRef.child('players').child(localPlayer.id).set({
            name: playerName,
            playerNumber: 1,
            isHost: true,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Initialize game
        const initialWord = getRandomWord();
        await gameRef.set({
            currentPlayer: localPlayer.id,
            currentWord: initialWord,
            usedWords: [initialWord],
            players: {
                [localPlayer.id]: {
                    name: playerName,
                    playerNumber: 1,
                    score: 0
                }
            },
            status: 'waiting',
            startTime: null,
            turnStartTime: null
        });
        
        // Listen for changes
        setupGameListeners();
        
        // Show game screen
        showGameScreen(roomCode);
        showNotification(`Room ${roomCode} berhasil dibuat!`, 'success');
        
    } catch (error) {
        console.error('Error creating room:', error);
        showNotification('Gagal membuat room. Coba lagi.', 'error');
    }
}

async function joinRoom() {
    const playerName = elements.playerName.value.trim();
    const roomCode = elements.roomCode.value.trim().toUpperCase();
    
    if (!playerName) {
        showNotification('Masukkan nama kamu dulu!', 'warning');
        return;
    }
    
    if (!roomCode || roomCode.length !== 6) {
        showNotification('Kode room harus 6 karakter!', 'warning');
        return;
    }
    
    try {
        // Check if room exists
        const roomSnapshot = await database.ref(`rooms/${roomCode}`).once('value');
        if (!roomSnapshot.exists()) {
            showNotification('Room tidak ditemukan!', 'error');
            return;
        }
        
        const roomData = roomSnapshot.val();
        
        // Check if room is full
        const players = roomData.players || {};
        if (Object.keys(players).length >= roomData.maxPlayers) {
            showNotification('Room sudah penuh!', 'error');
            return;
        }
        
        // Check if game already started
        const gameSnapshot = await database.ref(`rooms/${roomCode}/game`).once('value');
        const gameData = gameSnapshot.val();
        if (gameData.status === 'playing') {
            showNotification('Game sudah dimulai!', 'error');
            return;
        }
        
        localPlayer.id = 'player_' + Date.now() + Math.random().toString(36).substr(2, 9);
        localPlayer.name = playerName;
        localPlayer.isHost = false;
        localPlayer.playerNumber = 2;
        
        roomRef = database.ref(`rooms/${roomCode}`);
        gameRef = database.ref(`rooms/${roomCode}/game`);
        
        // Add player to room
        await roomRef.child('players').child(localPlayer.id).set({
            name: playerName,
            playerNumber: 2,
            isHost: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Add player to game
        await gameRef.child('players').child(localPlayer.id).set({
            name: playerName,
            playerNumber: 2,
            score: 0
        });
        
        // Start game if we have 2 players
        const playerCount = Object.keys(players).length + 1;
        if (playerCount >= roomData.maxPlayers) {
            await gameRef.update({
                status: 'playing',
                startTime: firebase.database.ServerValue.TIMESTAMP,
                turnStartTime: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        // Listen for changes
        setupGameListeners();
        
        // Show game screen
        showGameScreen(roomCode);
        showNotification(`Berhasil masuk room ${roomCode}!`, 'success');
        
    } catch (error) {
        console.error('Error joining room:', error);
        showNotification('Gagal masuk room. Coba lagi.', 'error');
    }
}

function showGameScreen(roomCode) {
    elements.lobbyScreen.style.display = 'none';
    elements.gameScreen.style.display = 'block';
    elements.gameOverScreen.style.display = 'none';
    
    elements.currentRoomCode.textContent = roomCode;
    elements.roomName.textContent = `${localPlayer.name}'s Game`;
}

function setupGameListeners() {
    // Listen for room changes
    roomRef.child('players').on('value', (snapshot) => {
        updatePlayersList(snapshot.val());
    });
    
    // Listen for game changes
    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (gameData) {
            updateGameState(gameData);
        }
    });
}

function updatePlayersList(players) {
    if (!players) return;
    
    const playerList = Object.values(players);
    playerList.sort((a, b) => a.playerNumber - b.playerNumber);
    
    // Update player 1
    if (playerList[0]) {
        elements.player1Name.textContent = playerList[0].name;
        elements.player1Status.textContent = playerList[0].isHost ? 'Host' : 'Player 1';
    }
    
    // Update player 2
    if (playerList[1]) {
        elements.player2Name.textContent = playerList[1].name;
        elements.player2Status.textContent = playerList[1].isHost ? 'Host' : 'Player 2';
    }
}

function updateGameState(gameData) {
    gameState = gameData;
    
    // Update UI
    updateCurrentWord();
    updateUsedWords();
    updateTurnIndicator();
    updatePlayerCards();
    
    // Handle game status
    if (gameData.status === 'playing') {
        startTurnTimer();
        enableInput();
    } else if (gameData.status === 'finished') {
        stopTurnTimer();
        disableInput();
        showGameOver();
    }
}

function updateCurrentWord() {
    if (gameState.currentWord) {
        const lastLetter = getLastLetter(gameState.currentWord);
        const restWord = gameState.currentWord.slice(1);
        
        elements.currentWord.innerHTML = `
            <span class="start-letter">${gameState.currentWord.charAt(0)}</span>
            <span class="rest-word">${restWord}</span>
        `;
        
        elements.lastLetter.innerHTML = `
            Huruf selanjutnya: <strong>${lastLetter.toUpperCase()}</strong>
        `;
    }
}

function updateUsedWords() {
    elements.usedWordsList.innerHTML = '';
    
    if (!gameState.usedWords || gameState.usedWords.length === 0) {
        elements.usedWordsList.innerHTML = '<div class="empty-list">Belum ada kata yang dipakai</div>';
        return;
    }
    
    gameState.usedWords.forEach((word, index) => {
        const wordElement = document.createElement('div');
        wordElement.className = 'word-tag';
        
        // Determine which player submitted this word
        if (index === 0) {
            wordElement.classList.add('player1');
        } else {
            wordElement.classList.add(index % 2 === 0 ? 'player1' : 'player2');
        }
        
        wordElement.textContent = word;
        elements.usedWordsList.appendChild(wordElement);
    });
}

function updateTurnIndicator() {
    if (gameState.status === 'waiting') {
        elements.turnIndicator.innerHTML = '<i class="fas fa-user-clock"></i><span>Menunggu lawan...</span>';
        elements.turnIndicator.className = 'turn-indicator';
        elements.timerLabel.textContent = 'Menunggu...';
    } else if (gameState.status === 'playing') {
        if (gameState.currentPlayer === localPlayer.id) {
            elements.turnIndicator.innerHTML = '<i class="fas fa-user-check"></i><span>Giliran KAMU!</span>';
            elements.turnIndicator.className = 'turn-indicator your-turn';
            elements.timerLabel.textContent = 'Giliran kamu';
        } else {
            elements.turnIndicator.innerHTML = '<i class="fas fa-user-clock"></i><span>Giliran LAWAN</span>';
            elements.turnIndicator.className = 'turn-indicator opponent-turn';
            elements.timerLabel.textContent = 'Giliran lawan';
        }
    }
}

function updatePlayerCards() {
    // Reset all cards
    elements.player1Card.classList.remove('active', 'winner');
    elements.player2Card.classList.remove('active', 'winner');
    
    // Highlight active player
    if (gameState.currentPlayer && gameState.players[gameState.currentPlayer]) {
        const activePlayer = gameState.players[gameState.currentPlayer];
        if (activePlayer.playerNumber === 1) {
            elements.player1Card.classList.add('active');
        } else {
            elements.player2Card.classList.add('active');
        }
    }
    
    // Highlight winner
    if (gameState.winner && gameState.players[gameState.winner]) {
        const winner = gameState.players[gameState.winner];
        if (winner.playerNumber === 1) {
            elements.player1Card.classList.add('winner');
        } else {
            elements.player2Card.classList.add('winner');
        }
    }
}

// ==================== TIMER FUNCTIONS ====================
function startTurnTimer() {
    stopTurnTimer();
    
    if (gameState.currentPlayer !== localPlayer.id) {
        // Not our turn, just show opponent's timer
        updateTimerDisplay(GAME_CONFIG.TURN_TIME);
        return;
    }
    
    let timeLeft = GAME_CONFIG.TURN_TIME;
    updateTimerDisplay(timeLeft);
    
    turnTimer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);
        
        if (timeLeft <= 0) {
            // Time's up!
            handleTimeout();
            clearInterval(turnTimer);
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }
}

function updateTimerDisplay(seconds) {
    const percentage = (seconds / GAME_CONFIG.TURN_TIME) * 100;
    elements.timerFill.style.background = `conic-gradient(var(--primary) ${percentage}%, transparent 0%)`;
    elements.timerText.textContent = seconds;
    
    // Change color when time is running out
    if (seconds <= 5) {
        elements.timerFill.style.background = `conic-gradient(var(--danger) ${percentage}%, transparent 0%)`;
    }
}

function handleTimeout() {
    if (gameState.currentPlayer === localPlayer.id) {
        showNotification('⏰ Waktu habis! Kamu kalah.', 'error');
        endGame('timeout');
    }
}

// ==================== GAME INPUT ====================
function enableInput() {
    if (gameState.currentPlayer === localPlayer.id && gameState.status === 'playing') {
        elements.wordInput.disabled = false;
        elements.submitWordBtn.disabled = false;
        elements.wordInput.focus();
    } else {
        disableInput();
    }
}

function disableInput() {
    elements.wordInput.disabled = true;
    elements.submitWordBtn.disabled = true;
}

async function submitWord() {
    const word = elements.wordInput.value.trim();
    
    if (!word) {
        showNotification('Masukkan kata dulu!', 'warning');
        return;
    }
    
    const lastLetter = getLastLetter(gameState.currentWord);
    
    if (!isValidWord(word, lastLetter)) {
        showNotification('Kata tidak valid! Periksa huruf awal dan pastikan kata belum dipakai.', 'error');
        elements.wordInput.value = '';
        elements.wordInput.focus();
        return;
    }
    
    try {
        // Update game state
        const newUsedWords = [...gameState.usedWords, word];
        const nextPlayer = getNextPlayer();
        
        await gameRef.update({
            currentWord: word,
            usedWords: newUsedWords,
            currentPlayer: nextPlayer,
            turnStartTime: firebase.database.ServerValue.TIMESTAMP,
            [`players.${localPlayer.id}.score`]: (gameState.players[localPlayer.id]?.score || 0) + 1
        });
        
        // Reset input
        elements.wordInput.value = '';
        
        // Check if word is a "killer" word (ends with uncommon letter)
        checkForGameEnd(word);
        
    } catch (error) {
        console.error('Error submitting word:', error);
        showNotification('Gagal mengirim kata. Coba lagi.', 'error');
    }
}

function getNextPlayer() {
    const playerIds = Object.keys(gameState.players);
    const currentIndex = playerIds.indexOf(gameState.currentPlayer);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    return playerIds[nextIndex];
}

function checkForGameEnd(word) {
    const lastLetter = getLastLetter(word);
    const wordsStartingWithLetter = GAME_CONFIG.WORD_LIST.filter(w => 
        w.toLowerCase().startsWith(lastLetter)
    );
    
    const unusedWords = wordsStartingWithLetter.filter(w => 
        !gameState.usedWords.some(used => used.toLowerCase() === w.toLowerCase())
    );
    
    if (unusedWords.length === 0) {
        // No more words starting with this letter
        setTimeout(() => {
            endGame('no_more_words');
        }, 1000);
    }
}

async function endGame(reason) {
    let winner = null;
    let message = '';
    
    if (reason === 'timeout') {
        winner = getNextPlayer(); // Player who didn't timeout wins
        message = `${gameState.players[winner]?.name} menang karena lawan timeout!`;
    } else if (reason === 'no_more_words') {
        winner = gameState.currentPlayer; // Current player loses
        message = `${gameState.players[getNextPlayer()]?.name} menang karena lawan tidak bisa melanjutkan!`;
    } else {
        // Default: player with most points wins
        const players = Object.entries(gameState.players);
        players.sort((a, b) => b[1].score - a[1].score);
        winner = players[0][0];
        message = `${gameState.players[winner]?.name} menang dengan skor tertinggi!`;
    }
    
    try {
        await gameRef.update({
            status: 'finished',
            winner: winner,
            endTime: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        console.error('Error ending game:', error);
    }
}

function showGameOver() {
    elements.gameScreen.style.display = 'none';
    elements.gameOverScreen.style.display = 'block';
    
    // Update result display
    if (gameState.winner === localPlayer.id) {
        elements.resultIcon.className = 'result-icon win';
        elements.resultIcon.innerHTML = '<i class="fas fa-trophy"></i>';
        elements.resultTitle.textContent = 'KAMU MENANG!';
        elements.resultMessage.textContent = 'Selamat! Kamu memenangkan permainan.';
    } else {
        elements.resultIcon.className = 'result-icon lose';
        elements.resultIcon.innerHTML = '<i class="fas fa-heart-broken"></i>';
        elements.resultTitle.textContent = 'KAMU KALAH';
        elements.resultMessage.textContent = 'Coba lagi di game berikutnya!';
    }
    
    // Update stats
    elements.totalWords.textContent = gameState.usedWords?.length || 0;
    
    const duration = gameState.endTime && gameState.startTime 
        ? Math.round((gameState.endTime - gameState.startTime) / 1000)
        : 0;
    elements.gameDuration.textContent = `${duration}s`;
    
    elements.winnerName.textContent = gameState.players[gameState.winner]?.name || '-';
    
    // Show final words
    elements.finalWordsList.innerHTML = '';
    if (gameState.usedWords) {
        gameState.usedWords.forEach(word => {
            const wordElement = document.createElement('div');
            wordElement.className = 'word-tag';
            wordElement.textContent = word;
            elements.finalWordsList.appendChild(wordElement);
        });
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Lobby buttons
    elements.createRoomBtn.addEventListener('click', createRoom);
    elements.joinRoomBtn.addEventListener('click', () => {
        elements.roomJoinSection.style.display = 'block';
        elements.roomCode.focus();
    });
    elements.confirmJoinBtn.addEventListener('click', joinRoom);
    
    // Game buttons
    elements.leaveRoomBtn.addEventListener('click', leaveRoom);
    elements.submitWordBtn.addEventListener('click', submitWord);
    elements.rematchBtn.addEventListener('click', startRematch);
    elements.copyRoomBtn.addEventListener('click', copyRoomLink);
    elements.playAgainBtn.addEventListener('click', startRematch);
    elements.newRoomBtn.addEventListener('click', goToLobby);
    
    // Word input
    elements.wordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            submitWord();
        }
    });
    
    // Enter key in lobby
    elements.playerName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.createRoomBtn.click();
        }
    });
    
    elements.roomCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            elements.confirmJoinBtn.click();
        }
    });
}

async function leaveRoom() {
    if (roomRef) {
        try {
            // Remove player from room
            if (localPlayer.id) {
                await roomRef.child('players').child(localPlayer.id).remove();
                
                // If host leaves, delete the room
                if (localPlayer.isHost) {
                    await roomRef.remove();
                }
            }
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    }
    
    // Reset state
    resetGameState();
    
    // Show lobby
    elements.gameScreen.style.display = 'none';
    elements.gameOverScreen.style.display = 'none';
    elements.lobbyScreen.style.display = 'block';
    
    showNotification('Keluar dari room', 'info');
}

async function startRematch() {
    if (!roomRef) return;
    
    try {
        const initialWord = getRandomWord();
        await gameRef.update({
            currentPlayer: localPlayer.isHost ? localPlayer.id : getNextPlayer(),
            currentWord: initialWord,
            usedWords: [initialWord],
            status: 'playing',
            winner: null,
            startTime: firebase.database.ServerValue.TIMESTAMP,
            turnStartTime: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Reset player scores
        const players = gameState.players;
        for (const playerId in players) {
            await gameRef.child(`players.${playerId}.score`).set(0);
        }
        
        showGameScreen(elements.currentRoomCode.textContent);
        showNotification('Game baru dimulai!', 'success');
        
    } catch (error) {
        console.error('Error starting rematch:', error);
        showNotification('Gagal memulai game baru', 'error');
    }
}

function copyRoomLink() {
    const roomCode = elements.currentRoomCode.textContent;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Link room disalin!', 'success');
    }).catch(() => {
        showNotification('Gagal menyalin link', 'error');
    });
}

function goToLobby() {
    elements.gameOverScreen.style.display = 'none';
    elements.lobbyScreen.style.display = 'block';
    resetGameState();
}

function resetGameState() {
    gameState = {
        currentPlayer: null,
        currentWord: null,
        usedWords: [],
        players: {},
        gameStatus: 'waiting',
        winner: null,
        startTime: null,
        turnStartTime: null
    };
    
    localPlayer = {
        id: null,
        name: '',
        isHost: false,
        playerNumber: null
    };
    
    if (roomRef) {
        roomRef.off();
        gameRef.off();
        roomRef = null;
        gameRef = null;
    }
    
    stopTurnTimer();
}

// ==================== UTILITY FUNCTIONS ====================
function showNotification(message, type = 'info') {
    elements.notification.textContent = message;
    elements.notification.className = `notification ${type}`;
    elements.notification.style.display = 'block';
    
    setTimeout(() => {
        elements.notification.style.display = 'none';
    }, 3000);
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    setupEventListeners();
    
    // Check for room code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
        elements.roomCode.value = roomCode;
        elements.roomJoinSection.style.display = 'block';
        showNotification(`Room ${roomCode} terdeteksi. Masukkan nama dan klik Gabung.`, 'info');
    }
});