// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBvr6owbrZS_9ltSIk_FJQ2XVva5fQjyr0",
    authDomain: "gabutan-alfread.firebaseapp.com",
    databaseURL: "https://gabutan-alfread-default-rtdb.firebaseio.com",
    projectId: "gabutan-alfread",
    storageBucket: "gabutan-alfread.firebasestorage.app",
    messagingSenderId: "626320232424",
    appId: "1:626320232424:web:7e292f036d8090a6b41e5d",
    measurementId: "G-P8FNLHHYX9"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Game State Variables
let currentPlayer = {
    id: null,
    name: '',
    isCreator: false,
    score: 0,
    roomCode: ''
};

let gameState = {
    currentScreen: 'lobby',
    currentRoom: null,
    questions: [],
    currentQuestionIndex: 0,
    timer: 30,
    timerInterval: null,
    hasAnswered: false
};

// DOM Elements
const screens = {
    lobby: document.getElementById('lobbyScreen'),
    waiting: document.getElementById('waitingScreen'),
    game: document.getElementById('gameScreen'),
    result: document.getElementById('resultScreen')
};

// Initialize Game
function initGame() {
    // Set up input event listeners
    document.getElementById('playerName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') showRoomType('create');
    });
    
    // Generate player ID
    currentPlayer.id = generatePlayerId();
    
    // Load global player count
    updateGlobalPlayerCount();
    
    // Set up firebase listeners
    setupFirebaseListeners();
    
    // Show lobby screen
    showScreen('lobby');
}

// Generate unique player ID
function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Generate random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('roomCodeCreate').value = code;
    return code;
}

// Show room creation/join section
function showRoomType(type) {
    const playerName = document.getElementById('playerName').value.trim();
    if (!playerName) {
        showToast('Masukkan nama pemain terlebih dahulu!');
        document.getElementById('playerName').focus();
        return;
    }
    
    currentPlayer.name = playerName;
    
    document.getElementById('roomCreateSection').classList.toggle('hidden', type !== 'create');
    document.getElementById('roomJoinSection').classList.toggle('hidden', type !== 'join');
    
    if (type === 'create') {
        if (!document.getElementById('roomCodeCreate').value) {
            generateRoomCode();
        }
    }
}

// Create new room
function createRoom() {
    let roomCode = document.getElementById('roomCodeCreate').value.trim().toUpperCase();
    const playerName = document.getElementById('playerName').value.trim();
    
    if (!roomCode) {
        roomCode = generateRoomCode();
    }
    
    if (!playerName) {
        showToast('Masukkan nama pemain terlebih dahulu!');
        return;
    }
    
    if (roomCode.length !== 6) {
        showToast('Kode room harus 6 karakter!');
        return;
    }
    
    // Check if room already exists
    const roomRef = database.ref('rooms/' + roomCode);
    
    roomRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            showToast('Kode room sudah digunakan!');
            return;
        }
        
        // Create room
        const roomData = {
            code: roomCode,
            creator: currentPlayer.id,
            status: 'waiting',
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            players: {},
            questions: getDefaultQuestions()
        };
        
        // Add creator as first player
        roomData.players[currentPlayer.id] = {
            name: playerName,
            score: 0,
            isCreator: true,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        roomRef.set(roomData).then(() => {
            currentPlayer.roomCode = roomCode;
            currentPlayer.isCreator = true;
            joinRoomSuccess(roomCode);
        });
    });
}

// Join existing room
function joinRoom() {
    const roomCode = document.getElementById('roomCodeJoin').value.trim().toUpperCase();
    const playerName = document.getElementById('playerName').value.trim();
    
    if (!playerName) {
        showToast('Masukkan nama pemain terlebih dahulu!');
        return;
    }
    
    if (!roomCode || roomCode.length !== 6) {
        showToast('Masukkan kode room yang valid (6 karakter)!');
        return;
    }
    
    const roomRef = database.ref('rooms/' + roomCode);
    
    roomRef.once('value').then((snapshot) => {
        if (!snapshot.exists()) {
            showToast('Room tidak ditemukan!');
            return;
        }
        
        const roomData = snapshot.val();
        
        if (roomData.status === 'playing') {
            showToast('Game sudah dimulai!');
            return;
        }
        
        if (Object.keys(roomData.players).length >= 8) {
            showToast('Room sudah penuh! (Maks 8 pemain)');
            return;
        }
        
        // Check if name already exists in room
        const existingPlayer = Object.values(roomData.players).find(p => p.name === playerName);
        if (existingPlayer) {
            showToast('Nama sudah digunakan di room ini!');
            return;
        }
        
        // Add player to room
        roomRef.child('players/' + currentPlayer.id).set({
            name: playerName,
            score: 0,
            isCreator: false,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            currentPlayer.roomCode = roomCode;
            currentPlayer.isCreator = false;
            joinRoomSuccess(roomCode);
        });
    });
}

// Successfully joined room
function joinRoomSuccess(roomCode) {
    currentPlayer.roomCode = roomCode;
    showScreen('waiting');
    updateWaitingRoom(roomCode);
    
    // Send chat message
    sendChatMessage(`🎮 ${currentPlayer.name} bergabung ke room!`, true);
}

// Leave room
function leaveRoom() {
    if (currentPlayer.roomCode) {
        const playerRef = database.ref(`rooms/${currentPlayer.roomCode}/players/${currentPlayer.id}`);
        playerRef.remove();
        
        // If creator leaves and no players left, delete room
        if (currentPlayer.isCreator) {
            const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
            roomRef.child('players').once('value').then((snapshot) => {
                if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
                    roomRef.remove();
                }
            });
        }
        
        currentPlayer.roomCode = '';
        currentPlayer.isCreator = false;
        showScreen('lobby');
    }
}

// Update waiting room display
function updateWaitingRoom(roomCode) {
    document.getElementById('currentRoomCode').textContent = roomCode;
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    
    const roomRef = database.ref(`rooms/${roomCode}`);
    
    // Listen for player changes
    roomRef.child('players').on('value', (snapshot) => {
        const players = snapshot.val() || {};
        updatePlayersList(players);
        
        // Update player count
        document.getElementById('playerCount').textContent = Object.keys(players).length;
        
        // Show/hide start button for creator
        const startBtn = document.getElementById('startBtn');
        const startSection = document.getElementById('startGameSection');
        
        if (currentPlayer.isCreator) {
            startSection.classList.remove('hidden');
            startBtn.disabled = Object.keys(players).length < 1;
            startBtn.innerHTML = `<i class="fas fa-play"></i> Mulai Game (${Object.keys(players).length}/8)`;
        } else {
            startSection.classList.add('hidden');
        }
    });
    
    // Listen for game status changes
    roomRef.child('status').on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'playing') {
            startGameForPlayers();
        }
    });
    
    // Listen for chat messages
    roomRef.child('chat').on('child_added', (snapshot) => {
        const message = snapshot.val();
        addChatMessage(message.text, message.sender, message.isSystem);
    });
}

// Update players list
function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    
    Object.entries(players).forEach(([playerId, player], index) => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        if (player.isCreator) playerCard.classList.add('creator');
        
        const firstLetter = player.name.charAt(0).toUpperCase();
        
        playerCard.innerHTML = `
            <div class="player-avatar">${firstLetter}</div>
            <div class="player-info">
                <h4>${player.name} ${player.isCreator ? '👑' : ''}</h4>
                <div class="player-status">Score: ${player.score || 0}</div>
            </div>
        `;
        
        playersList.appendChild(playerCard);
    });
}

// Start game (creator only)
function startGame() {
    if (!currentPlayer.isCreator) return;
    
    const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
    
    roomRef.update({
        status: 'playing',
        currentQuestion: 0,
        startTime: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // Clear chat
        roomRef.child('chat').remove();
        
        // Send system message
        sendChatMessage('🚀 Game dimulai!', true);
    });
}

// Start game for all players
function startGameForPlayers() {
    showScreen('game');
    loadGameData();
}

// Load game data
function loadGameData() {
    const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
    
    roomRef.on('value', (snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Update game room code
        document.getElementById('gameRoomCode').textContent = roomData.code;
        
        // Load question
        if (roomData.currentQuestion !== undefined) {
            const questionIndex = roomData.currentQuestion;
            const questions = roomData.questions || getDefaultQuestions();
            
            if (questionIndex < questions.length) {
                displayQuestion(questions[questionIndex], questionIndex);
                
                // Update question counter
                document.getElementById('questionNumber').textContent = questionIndex + 1;
            } else {
                // Game finished
                endGame();
            }
        }
        
        // Update scoreboard
        updateScoreboard(roomData.players || {});
        
        // Start timer if not already running
        if (roomData.timer !== undefined && !gameState.timerInterval) {
            startTimer(roomData.timer);
        }
    });
}

// Display current question
function displayQuestion(question, index) {
    document.getElementById('questionText').textContent = question.text;
    document.getElementById('questionHint').innerHTML = `<i class="fas fa-lightbulb"></i> ${question.hint}`;
    
    // Reset answer buttons
    const answers = ['A', 'B', 'C', 'D'];
    answers.forEach((letter, i) => {
        const btn = document.getElementById(`answer${i + 1}`);
        btn.className = 'answer-btn';
        btn.innerHTML = `
            <span class="answer-letter">${letter}</span>
            <span class="answer-text">${question.options[i]}</span>
        `;
        
        // Update onclick with correct answer check
        btn.onclick = function() {
            submitAnswer(question.options[i]);
        };
    });
    
    // Reset answer status
    document.getElementById('answerStatus').innerHTML = '<i class="fas fa-clock"></i> Pilih jawabanmu!';
    gameState.hasAnswered = false;
}

// Submit answer
function submitAnswer(selectedAnswer) {
    if (gameState.hasAnswered) return;
    
    gameState.hasAnswered = true;
    
    const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
    
    roomRef.child('questions').once('value').then((snapshot) => {
        const questions = snapshot.val() || getDefaultQuestions();
        const currentQIndex = gameState.currentQuestionIndex;
        const question = questions[currentQIndex];
        
        const isCorrect = selectedAnswer === question.correctAnswer;
        
        // Highlight correct/wrong answers
        highlightAnswers(question.correctAnswer, selectedAnswer);
        
        // Update player score
        if (isCorrect) {
            const timeLeft = parseInt(document.getElementById('timer').textContent);
            const points = 10 + Math.floor(timeLeft / 3); // Bonus points for faster answers
            
            roomRef.child(`players/${currentPlayer.id}/score`).transaction((currentScore) => {
                return (currentScore || 0) + points;
            });
            
            document.getElementById('answerStatus').innerHTML = 
                `<i class="fas fa-check-circle" style="color:#4CAF50"></i> Benar! +${points} poin`;
        } else {
            document.getElementById('answerStatus').innerHTML = 
                `<i class="fas fa-times-circle" style="color:#f44336"></i> Salah! Jawaban benar: ${question.correctAnswer}`;
        }
        
        // Send chat message about answer
        sendChatMessage(
            `🎯 ${currentPlayer.name} ${isCorrect ? 'menjawab benar' : 'salah menjawab'}!`,
            true
        );
    });
}

// Highlight correct and wrong answers
function highlightAnswers(correctAnswer, selectedAnswer) {
    const answers = document.querySelectorAll('.answer-btn');
    
    answers.forEach(btn => {
        const answerText = btn.querySelector('.answer-text').textContent;
        
        if (answerText === correctAnswer) {
            btn.classList.add('correct');
        } else if (answerText === selectedAnswer && selectedAnswer !== correctAnswer) {
            btn.classList.add('wrong');
        }
        
        btn.classList.add('disabled');
    });
}

// Start timer
function startTimer(initialTime) {
    clearInterval(gameState.timerInterval);
    gameState.timer = initialTime || 30;
    
    const timerElement = document.getElementById('timer');
    timerElement.textContent = gameState.timer;
    
    gameState.timerInterval = setInterval(() => {
        gameState.timer--;
        timerElement.textContent = gameState.timer;
        
        if (gameState.timer <= 0) {
            clearInterval(gameState.timerInterval);
            
            // Move to next question
            setTimeout(() => {
                nextQuestion();
            }, 2000);
        }
    }, 1000);
}

// Move to next question
function nextQuestion() {
    const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
    
    roomRef.child('currentQuestion').transaction((current) => {
        return (current || 0) + 1;
    });
    
    // Reset timer
    roomRef.child('timer').set(30);
}

// Update scoreboard
function updateScoreboard(players) {
    const scoreboard = document.getElementById('scoreboardList');
    scoreboard.innerHTML = '';
    
    // Convert players object to array and sort by score
    const playersArray = Object.entries(players)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    
    playersArray.forEach((player, index) => {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'score-item';
        
        if (player.id === currentPlayer.id) {
            scoreItem.style.background = '#f0f7ff';
        }
        
        scoreItem.innerHTML = `
            <div class="score-player">
                <div class="score-rank">${index + 1}</div>
                <div>
                    <div class="score-name">${player.name} ${player.id === currentPlayer.id ? '(Kamu)' : ''}</div>
                    <div class="score-time">${player.isCreator ? '👑 Creator' : 'Pemain'}</div>
                </div>
            </div>
            <div class="score-value">${player.score || 0} poin</div>
        `;
        
        scoreboard.appendChild(scoreItem);
    });
}

// End game
function endGame() {
    clearInterval(gameState.timerInterval);
    showScreen('result');
    
    const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
    
    roomRef.once('value').then((snapshot) => {
        const roomData = snapshot.val();
        if (!roomData) return;
        
        // Display final results
        displayFinalResults(roomData.players || {});
        
        // Update game stats
        updateGameStats(roomData);
    });
}

// Display final results
function displayFinalResults(players) {
    const rankings = document.getElementById('finalRankings');
    rankings.innerHTML = '';
    
    document.getElementById('resultRoomCode').textContent = currentPlayer.roomCode;
    
    // Convert players to array and sort
    const playersArray = Object.entries(players)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    
    playersArray.forEach((player, index) => {
        const rankingItem = document.createElement('div');
        rankingItem.className = 'ranking-item';
        if (index === 0) rankingItem.classList.add('winner');
        
        const firstLetter = player.name.charAt(0).toUpperCase();
        
        rankingItem.innerHTML = `
            <div class="ranking-rank">#${index + 1}</div>
            <div class="ranking-avatar">${firstLetter}</div>
            <div class="ranking-info">
                <div class="ranking-name">${player.name} ${player.id === currentPlayer.id ? '(Kamu)' : ''}</div>
                <div class="ranking-score">${player.score || 0} poin</div>
            </div>
        `;
        
        rankings.appendChild(rankingItem);
    });
    
    // Update stats
    document.getElementById('totalPlayers').textContent = playersArray.length;
    document.getElementById('totalQuestions').textContent = '5'; // Default 5 questions
    document.getElementById('highestScore').textContent = playersArray[0]?.score || 0;
}

// Update game statistics
function updateGameStats(roomData) {
    // You can add more detailed stats here
}

// Back to lobby
function backToLobby() {
    leaveRoom();
    showScreen('lobby');
}

// Play again
function playAgain() {
    if (currentPlayer.isCreator) {
        const roomRef = database.ref(`rooms/${currentPlayer.roomCode}`);
        
        // Reset game state
        roomRef.update({
            status: 'waiting',
            currentQuestion: 0,
            timer: 30
        }).then(() => {
            // Reset player scores
            const updates = {};
            Object.keys(roomData.players || {}).forEach(playerId => {
                updates[`players/${playerId}/score`] = 0;
            });
            
            roomRef.update(updates).then(() => {
                showScreen('waiting');
                sendChatMessage('🔄 Game direset!', true);
            });
        });
    } else {
        showToast('Hanya pembuat room yang bisa mereset game!');
    }
}

// Share results
function shareResults() {
    const roomCode = currentPlayer.roomCode;
    const text = `Saya baru saja bermain game tebak-tebakan di room ${roomCode}!`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Hasil Game Tebak-Tebakan',
            text: text,
            url: window.location.href
        });
    } else {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Hasil disalin ke clipboard!');
        });
    }
}

// Chat Functions
function sendChatMessage(text, isSystem = false) {
    if (!currentPlayer.roomCode) return;
    
    const message = {
        text: text,
        sender: isSystem ? 'System' : currentPlayer.name,
        isSystem: isSystem,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    const chatRef = database.ref(`rooms/${currentPlayer.roomCode}/chat`);
    chatRef.push(message);
}

function addChatMessage(text, sender, isSystem) {
    const chatMessages = document.getElementById('chatMessages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = isSystem ? 'system-msg' : 'chat-message';
    
    if (isSystem) {
        messageDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${text}`;
    } else {
        messageDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleChatKey(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
        event.preventDefault();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (message && currentPlayer.roomCode) {
        sendChatMessage(message, false);
        input.value = '';
    }
}

// Copy room code
function copyRoomCode() {
    const roomCode = document.getElementById('roomCodeDisplay').textContent;
    navigator.clipboard.writeText(roomCode).then(() => {
        showToast('Kode room disalin!');
    });
}

// Show screen
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
    
    gameState.currentScreen = screenName;
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Update global player count
function updateGlobalPlayerCount() {
    const countRef = database.ref('global/playerCount');
    
    // Increment count when player joins
    countRef.transaction((current) => {
        return (current || 0) + 1;
    });
    
    // Update display
    countRef.on('value', (snapshot) => {
        const count = snapshot.val() || 0;
        document.getElementById('globalPlayerCount').textContent = `${count} pemain online`;
    });
}

// Setup Firebase listeners
function setupFirebaseListeners() {
    // Clean up old rooms periodically
    const roomsRef = database.ref('rooms');
    roomsRef.on('value', (snapshot) => {
        const rooms = snapshot.val() || {};
        const now = Date.now();
        
        Object.entries(rooms).forEach(([code, room]) => {
            // Delete rooms older than 24 hours
            if (room.createdAt && (now - room.createdAt) > 24 * 60 * 60 * 1000) {
                roomsRef.child(code).remove();
            }
        });
    });
}

// Get default questions
function getDefaultQuestions() {
    return [
        {
            text: "Ibukota Indonesia adalah?",
            options: ["Jakarta", "Bandung", "Surabaya", "Medan"],
            correctAnswer: "Jakarta",
            hint: "Kota terbesar di Indonesia"
        },
        {
            text: "Planet terdekat dari Matahari adalah?",
            options: ["Venus", "Mars", "Merkurius", "Bumi"],
            correctAnswer: "Merkurius",
            hint: "Planet terkecil di tata surya"
        },
        {
            text: "Warna campuran merah dan biru adalah?",
            options: ["Hijau", "Ungu", "Kuning", "Oranye"],
            correctAnswer: "Ungu",
            hint: "Warna kerajaan"
        },
        {
            text: "Berapa jumlah sisi pada segi enam?",
            options: ["4", "5", "6", "8"],
            correctAnswer: "6",
            hint: "Heksagon"
        },
        {
            text: "Hewan yang dikenal sebagai raja hutan adalah?",
            options: ["Harimau", "Singa", "Gajah", "Serigala"],
            correctAnswer: "Singa",
            hint: "Berasal dari Afrika"
        }
    ];
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initGame);