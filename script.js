// Game Sambung Kata Multiplayer dengan Voice Chat
// =================================================

// ============================================
// 1. KONFIGURASI DAN VARIABEL GLOBAL
// ============================================
class Game {
    constructor() {
        // State game
        this.gameState = {
            playerName: '',
            playerId: null,
            roomId: null,
            isHost: false,
            isInRoom: false,
            isGameActive: false,
            currentPlayer: null,
            usedWords: [],
            currentWord: '',
            timer: 10,
            timerInterval: null,
            
            // WebRTC
            localStream: null,
            remoteStream: null,
            peerConnection: null,
            isMuted: false,
            isVoiceConnected: false,
            dataChannel: null // Untuk pesan text melalui WebRTC
        };
        
        // STUN servers untuk WebRTC
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        // Database references
        this.db = firebase.database();
        this.roomRef = null;
        this.playersRef = null;
        this.gameRef = null;
        this.webrtcRef = null;
        
        // Inisialisasi
        this.init();
    }
    
    // ============================================
    // 2. INISIALISASI GAME
    // ============================================
    init() {
        console.log("Initializing game...");
        
        // Generate random player ID
        this.gameState.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup Firebase listeners
        this.setupFirebaseListeners();
        
        // Setup WebRTC
        this.setupWebRTC();
        
        console.log("Game initialized with player ID:", this.gameState.playerId);
    }
    
    // ============================================
    // 3. SETUP EVENT LISTENERS
    // ============================================
    setupEventListeners() {
        // Lobby buttons
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-room-btn').addEventListener('click', () => this.leaveRoom());
        
        // Microphone permission
        document.getElementById('request-mic-btn').addEventListener('click', () => this.requestMicrophone());
        
        // Game buttons
        document.getElementById('submit-word-btn').addEventListener('click', () => this.submitWord());
        document.getElementById('word-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitWord();
        });
        
        // Voice controls
        document.getElementById('mute-btn').addEventListener('click', () => this.toggleMute());
        document.getElementById('hangup-btn').addEventListener('click', () => this.hangUp());
        
        // Game controls
        document.getElementById('play-again-btn').addEventListener('click', () => this.playAgain());
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => this.backToLobby());
        document.getElementById('copy-room-id').addEventListener('click', () => this.copyRoomId());
        
        // Player name input
        document.getElementById('player-name').addEventListener('input', (e) => {
            this.gameState.playerName = e.target.value.trim();
        });
        
        // Room ID input
        document.getElementById('room-id').addEventListener('input', (e) => {
            this.gameState.roomId = e.target.value.trim().toUpperCase();
        });
    }
    
    // ============================================
    // 4. LOBBY & ROOM MANAGEMENT
    // ============================================
    createRoom() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        
        this.gameState.playerName = playerName;
        
        // Generate room ID (6 karakter)
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.gameState.roomId = roomId;
        this.gameState.isHost = true;
        
        this.joinRoom(roomId);
    }
    
    joinRoom(roomId = null) {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('Masukkan nama kamu terlebih dahulu!');
            return;
        }
        
        this.gameState.playerName = playerName;
        
        if (!roomId) {
            roomId = document.getElementById('room-id').value.trim().toUpperCase();
            if (!roomId) {
                alert('Masukkan kode room!');
                return;
            }
            if (roomId.length !== 6) {
                alert('Kode room harus 6 karakter!');
                return;
            }
        }
        
        this.gameState.roomId = roomId;
        
        // Setup Firebase references
        this.roomRef = this.db.ref(`rooms/${roomId}`);
        this.playersRef = this.roomRef.child('players');
        this.gameRef = this.roomRef.child('game');
        this.webrtcRef = this.roomRef.child('webrtc');
        
        // Check if room exists
        this.roomRef.once('value').then((snapshot) => {
            if (!snapshot.exists()) {
                if (!this.gameState.isHost) {
                    alert('Room tidak ditemukan!');
                    return;
                }
                // Create new room
                this.createNewRoom();
            } else {
                // Join existing room
                this.joinExistingRoom(snapshot);
            }
        });
    }
    
    createNewRoom() {
        const playerData = {
            id: this.gameState.playerId,
            name: this.gameState.playerName,
            isHost: true,
            joinedAt: Date.now()
        };
        
        const roomData = {
            id: this.gameState.roomId,
            hostId: this.gameState.playerId,
            status: 'waiting',
            createdAt: Date.now(),
            players: {
                [this.gameState.playerId]: playerData
            },
            game: {
                status: 'waiting',
                currentPlayer: null,
                currentWord: '',
                usedWords: [],
                lastLetter: ''
            }
        };
        
        this.roomRef.set(roomData).then(() => {
            console.log('Room created:', this.gameState.roomId);
            this.setupRoomListeners();
            this.showLobby(true);
        }).catch((error) => {
            console.error('Error creating room:', error);
            alert('Gagal membuat room. Coba lagi.');
        });
    }
    
    joinExistingRoom(snapshot) {
        const roomData = snapshot.val();
        
        // Check if room is full
        const players = roomData.players || {};
        if (Object.keys(players).length >= 2) {
            alert('Room sudah penuh!');
            return;
        }
        
        // Check if game is already active
        if (roomData.game && roomData.game.status === 'playing') {
            alert('Game sudah berjalan di room ini!');
            return;
        }
        
        // Add player to room
        const playerData = {
            id: this.gameState.playerId,
            name: this.gameState.playerName,
            isHost: false,
            joinedAt: Date.now()
        };
        
        this.playersRef.child(this.gameState.playerId).set(playerData).then(() => {
            console.log('Joined room:', this.gameState.roomId);
            this.setupRoomListeners();
            this.showLobby(true);
        }).catch((error) => {
            console.error('Error joining room:', error);
            alert('Gagal bergabung ke room. Coba lagi.');
        });
    }
    
    leaveRoom() {
        if (!this.gameState.isInRoom) return;
        
        // Remove player from room
        if (this.playersRef) {
            this.playersRef.child(this.gameState.playerId).remove();
        }
        
        // If host leaves, delete the room
        if (this.gameState.isHost && this.roomRef) {
            this.roomRef.remove();
        }
        
        // Clean up WebRTC
        this.hangUp();
        
        // Reset game state
        this.resetGameState();
        
        // Show lobby
        this.showLobby(false);
        
        console.log('Left room');
    }
    
    // ============================================
    // 5. FIREBASE LISTENERS
    // ============================================
    setupFirebaseListeners() {
        // Listen for room changes when joined
        this.setupRoomListeners = () => {
            if (!this.roomRef) return;
            
            // Listen for room data changes
            this.roomRef.on('value', (snapshot) => {
                if (!snapshot.exists()) {
                    // Room deleted
                    if (this.gameState.isInRoom) {
                        alert('Room telah dihapus oleh host!');
                        this.leaveRoom();
                    }
                    return;
                }
                
                const roomData = snapshot.val();
                this.updateRoomUI(roomData);
                
                // Update game state if game is active
                if (roomData.game && roomData.game.status === 'playing' && !this.gameState.isGameActive) {
                    this.startGameFromData(roomData.game);
                }
            });
            
            // Listen for player changes
            this.playersRef.on('value', (snapshot) => {
                const players = snapshot.val() || {};
                this.updatePlayersUI(players);
                
                // Check if we need to initiate WebRTC
                if (Object.keys(players).length === 2 && !this.gameState.isVoiceConnected) {
                    setTimeout(() => this.initiateWebRTC(), 1000);
                }
            });
            
            // Listen for WebRTC signaling
            this.webrtcRef.on('child_added', (snapshot) => {
                const data = snapshot.val();
                if (data.sender !== this.gameState.playerId) {
                    this.handleSignalingData(data);
                }
            });
        };
    }
    
    // ============================================
    // 6. WEBRTC VOICE CHAT
    // ============================================
    setupWebRTC() {
        console.log("WebRTC setup initialized");
    }
    
    async requestMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false 
            });
            
            this.gameState.localStream = stream;
            
            // Update UI
            document.getElementById('mic-status').textContent = '✅ Microphone diizinkan';
            document.getElementById('mic-status').style.color = '#4cc9f0';
            document.getElementById('request-mic-btn').disabled = true;
            document.getElementById('request-mic-btn').innerHTML = '<i class="fas fa-microphone"></i> Microphone Siap';
            
            console.log("Microphone access granted");
        } catch (error) {
            console.error("Error accessing microphone:", error);
            document.getElementById('mic-status').textContent = '❌ Gagal mengakses microphone';
            document.getElementById('mic-status').style.color = '#f72585';
            alert('Gagal mengakses microphone. Pastikan kamu memberikan izin.');
        }
    }
    
    async initiateWebRTC() {
        if (!this.gameState.localStream) {
            console.log("No local stream, requesting microphone...");
            await this.requestMicrophone();
            if (!this.gameState.localStream) return;
        }
        
        console.log("Initiating WebRTC connection...");
        
        // Create peer connection
        this.gameState.peerConnection = new RTCPeerConnection(this.iceServers);
        
        // Add local stream
        this.gameState.localStream.getTracks().forEach(track => {
            this.gameState.peerConnection.addTrack(track, this.gameState.localStream);
        });
        
        // Create data channel for game messages
        this.gameState.dataChannel = this.gameState.peerConnection.createDataChannel('game-data');
        this.setupDataChannel();
        
        // Handle incoming tracks
        this.gameState.peerConnection.ontrack = (event) => {
            console.log("Received remote track");
            this.gameState.remoteStream = event.streams[0];
            
            // Create audio element for remote stream
            const remoteAudio = document.createElement('audio');
            remoteAudio.srcObject = this.gameState.remoteStream;
            remoteAudio.autoplay = true;
            remoteAudio.volume = 1.0;
            
            // Store reference
            this.remoteAudio = remoteAudio;
            
            // Update UI
            this.updateVoiceStatus(true);
        };
        
        // Handle ICE candidates
        this.gameState.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignalingData({
                    type: 'candidate',
                    candidate: event.candidate,
                    sender: this.gameState.playerId
                });
            }
        };
        
        // Handle connection state
        this.gameState.peerConnection.onconnectionstatechange = () => {
            console.log("Connection state:", this.gameState.peerConnection.connectionState);
            if (this.gameState.peerConnection.connectionState === 'connected') {
                this.gameState.isVoiceConnected = true;
                this.updateVoiceStatus(true);
            } else if (this.gameState.peerConnection.connectionState === 'disconnected' || 
                       this.gameState.peerConnection.connectionState === 'failed') {
                this.gameState.isVoiceConnected = false;
                this.updateVoiceStatus(false);
            }
        };
        
        // Create offer if we're the second player (non-host joins)
        if (!this.gameState.isHost) {
            try {
                const offer = await this.gameState.peerConnection.createOffer();
                await this.gameState.peerConnection.setLocalDescription(offer);
                
                this.sendSignalingData({
                    type: 'offer',
                    sdp: offer.sdp,
                    sender: this.gameState.playerId
                });
            } catch (error) {
                console.error("Error creating offer:", error);
            }
        }
    }
    
    setupDataChannel() {
        if (!this.gameState.dataChannel) return;
        
        this.gameState.dataChannel.onopen = () => {
            console.log("Data channel opened");
        };
        
        this.gameState.dataChannel.onmessage = (event) => {
            console.log("Data channel message:", event.data);
            // Handle game messages through data channel
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'chat') {
                    this.showChatMessage(data.message);
                }
            } catch (e) {
                console.log("Raw message:", event.data);
            }
        };
    }
    
    async handleSignalingData(data) {
        if (!this.gameState.peerConnection) {
            await this.initiateWebRTC();
        }
        
        switch (data.type) {
            case 'offer':
                console.log("Received offer");
                await this.gameState.peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
                );
                
                const answer = await this.gameState.peerConnection.createAnswer();
                await this.gameState.peerConnection.setLocalDescription(answer);
                
                this.sendSignalingData({
                    type: 'answer',
                    sdp: answer.sdp,
                    sender: this.gameState.playerId
                });
                break;
                
            case 'answer':
                console.log("Received answer");
                await this.gameState.peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
                );
                break;
                
            case 'candidate':
                console.log("Received ICE candidate");
                try {
                    await this.gameState.peerConnection.addIceCandidate(
                        new RTCIceCandidate(data.candidate)
                    );
                } catch (error) {
                    console.error("Error adding ICE candidate:", error);
                }
                break;
        }
    }
    
    sendSignalingData(data) {
        if (!this.webrtcRef) return;
        
        this.webrtcRef.push(data).then(() => {
            // Remove old signaling data
            setTimeout(() => {
                this.webrtcRef.once('value', (snapshot) => {
                    snapshot.forEach((child) => {
                        const childData = child.val();
                        if (childData.sender === this.gameState.playerId || 
                            Date.now() - childData.timestamp > 30000) {
                            child.ref.remove();
                        }
                    });
                });
            }, 5000);
        });
    }
    
    toggleMute() {
        if (!this.gameState.localStream) return;
        
        this.gameState.isMuted = !this.gameState.isMuted;
        
        this.gameState.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.gameState.isMuted;
        });
        
        const muteBtn = document.getElementById('mute-btn');
        if (this.gameState.isMuted) {
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i> Unmute';
            muteBtn.classList.remove('btn-warning');
            muteBtn.classList.add('btn-success');
        } else {
            muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Mute';
            muteBtn.classList.remove('btn-success');
            muteBtn.classList.add('btn-warning');
        }
        
        console.log("Microphone", this.gameState.isMuted ? "muted" : "unmuted");
    }
    
    hangUp() {
        if (this.gameState.peerConnection) {
            this.gameState.peerConnection.close();
            this.gameState.peerConnection = null;
        }
        
        if (this.gameState.localStream) {
            this.gameState.localStream.getTracks().forEach(track => track.stop());
            this.gameState.localStream = null;
        }
        
        this.gameState.isVoiceConnected = false;
        this.gameState.dataChannel = null;
        
        this.updateVoiceStatus(false);
        
        console.log("WebRTC connection closed");
    }
    
    updateVoiceStatus(isConnected) {
        const statusText = document.getElementById('voice-status-text');
        const muteBtn = document.getElementById('mute-btn');
        const hangupBtn = document.getElementById('hangup-btn');
        
        if (isConnected) {
            statusText.textContent = '🟢 Voice chat aktif! Kamu bisa berbicara dengan lawan.';
            statusText.style.color = '#4cc9f0';
            muteBtn.disabled = false;
            hangupBtn.disabled = false;
        } else {
            statusText.textContent = '🔴 Voice chat belum aktif';
            statusText.style.color = '#f72585';
            muteBtn.disabled = true;
            hangupBtn.disabled = true;
        }
    }
    
    // ============================================
    // 7. GAME LOGIC
    // ============================================
    startGame() {
        if (!this.gameState.isHost) return;
        
        const gameData = {
            status: 'playing',
            currentPlayer: this.gameState.playerId, // Host starts first
            currentWord: '',
            usedWords: [],
            lastLetter: '',
            timer: 10,
            startedAt: Date.now()
        };
        
        this.gameRef.update(gameData).then(() => {
            console.log('Game started');
        }).catch((error) => {
            console.error('Error starting game:', error);
        });
    }
    
    startGameFromData(gameData) {
        this.gameState.isGameActive = true;
        this.gameState.currentPlayer = gameData.currentPlayer;
        this.gameState.currentWord = gameData.currentWord;
        this.gameState.usedWords = gameData.usedWords || [];
        this.gameState.lastLetter = gameData.lastLetter;
        
        // Show game section
        this.showGameSection();
        
        // Update UI
        this.updateGameUI();
        
        // Start timer if it's our turn
        if (this.gameState.currentPlayer === this.gameState.playerId) {
            this.startTurnTimer();
        }
        
        console.log('Game started from data');
    }
    
    submitWord() {
        if (!this.gameState.isGameActive) return;
        if (this.gameState.currentPlayer !== this.gameState.playerId) return;
        
        const wordInput = document.getElementById('word-input');
        const word = wordInput.value.trim().toLowerCase();
        
        if (!word) {
            alert('Masukkan kata terlebih dahulu!');
            return;
        }
        
        // Validate word
        if (!this.validateWord(word)) {
            alert('Kata tidak valid! Pastikan kata dimulai dengan huruf yang benar dan belum pernah digunakan.');
            wordInput.value = '';
            wordInput.focus();
            return;
        }
        
        // Add word to used words
        const newUsedWords = [...this.gameState.usedWords, word];
        const lastLetter = word.charAt(word.length - 1);
        
        // Determine next player
        const players = this.getPlayersInRoom();
        const playerIds = Object.keys(players);
        const currentIndex = playerIds.indexOf(this.gameState.playerId);
        const nextPlayerId = playerIds[(currentIndex + 1) % playerIds.length];
        
        // Update game state in Firebase
        const gameUpdate = {
            currentPlayer: nextPlayerId,
            currentWord: word,
            usedWords: newUsedWords,
            lastLetter: lastLetter,
            timer: 10
        };
        
        this.gameRef.update(gameUpdate).then(() => {
            // Clear input
            wordInput.value = '';
            wordInput.blur();
            
            // Stop timer
            this.stopTurnTimer();
            
            console.log('Word submitted:', word);
        }).catch((error) => {
            console.error('Error submitting word:', error);
        });
    }
    
    validateWord(word) {
        // Check if word is empty
        if (!word || word.length < 2) return false;
        
        // Check if word contains only letters
        if (!/^[a-z]+$/.test(word)) return false;
        
        // Check if word has been used before
        if (this.gameState.usedWords.includes(word)) return false;
        
        // If it's the first word, accept any word
        if (this.gameState.usedWords.length === 0) return true;
        
        // Check if word starts with the correct letter
        const requiredLetter = this.gameState.lastLetter;
        return word.charAt(0) === requiredLetter;
    }
    
    startTurnTimer() {
        this.stopTurnTimer(); // Clear existing timer
        
        this.gameState.timer = 10;
        this.updateTimerUI();
        
        this.gameState.timerInterval = setInterval(() => {
            this.gameState.timer--;
            this.updateTimerUI();
            
            if (this.gameState.timer <= 0) {
                this.timeout();
                this.stopTurnTimer();
            }
        }, 1000);
        
        // Enable input
        document.getElementById('word-input').disabled = false;
        document.getElementById('submit-word-btn').disabled = false;
        document.getElementById('word-input').focus();
        
        // Update hint
        const hint = this.gameState.usedWords.length === 0 
            ? 'Kata pertama bisa apa saja' 
            : `Kata harus dimulai dengan huruf "${this.gameState.lastLetter.toUpperCase()}"`;
        
        document.getElementById('word-input-hint').textContent = hint;
        document.getElementById('word-input').placeholder = `Kata dimulai dengan "${this.gameState.lastLetter.toUpperCase()}"...`;
    }
    
    stopTurnTimer() {
        if (this.gameState.timerInterval) {
            clearInterval(this.gameState.timerInterval);
            this.gameState.timerInterval = null;
        }
        
        // Disable input
        document.getElementById('word-input').disabled = true;
        document.getElementById('submit-word-btn').disabled = true;
    }
    
    timeout() {
        // Player loses due to timeout
        this.endGame(this.gameState.playerId === this.gameState.currentPlayer ? 'lose' : 'win');
    }
    
    endGame(result) {
        this.stopTurnTimer();
        
        // Update game state in Firebase
        const gameUpdate = {
            status: 'finished',
            winner: result === 'win' ? this.gameState.playerId : null,
            finishedAt: Date.now()
        };
        
        this.gameRef.update(gameUpdate).then(() => {
            this.gameState.isGameActive = false;
            
            // Show result
            this.showGameResult(result);
            
            console.log('Game ended:', result);
        });
    }
    
    // ============================================
    // 8. UI UPDATES
    // ============================================
    updateRoomUI(roomData) {
        const players = roomData.players || {};
        const game = roomData.game || {};
        
        // Update room status
        document.getElementById('display-room-id').textContent = this.gameState.roomId;
        document.getElementById('players-in-room').textContent = `${Object.keys(players).length}/2`;
        document.getElementById('room-status-text').textContent = game.status === 'playing' ? 'Game berlangsung' : 'Menunggu pemain';
        
        // Show/hide start button for host
        const startBtn = document.getElementById('start-game-btn');
        if (this.gameState.isHost && Object.keys(players).length === 2 && game.status !== 'playing') {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }
        
        // Update room status visibility
        const roomStatus = document.getElementById('room-status');
        roomStatus.classList.remove('hidden');
    }
    
    updatePlayersUI(players) {
        const playerIds = Object.keys(players);
        
        // Update player badges
        const player1Badge = document.getElementById('player1-badge');
        const player2Badge = document.getElementById('player2-badge');
        
        if (playerIds.length > 0) {
            const player1 = players[playerIds[0]];
            player1Badge.innerHTML = `<i class="fas fa-user"></i> <span>${player1.name} ${player1.isHost ? '(Host)' : ''}</span>`;
            player1Badge.classList.add('active');
        } else {
            player1Badge.innerHTML = '<i class="fas fa-user"></i> <span>Pemain 1: -</span>';
            player1Badge.classList.remove('active');
        }
        
        if (playerIds.length > 1) {
            const player2 = players[playerIds[1]];
            player2Badge.innerHTML = `<i class="fas fa-user"></i> <span>${player2.name}</span>`;
            player2Badge.classList.add('active');
        } else {
            player2Badge.innerHTML = '<i class="fas fa-user"></i> <span>Pemain 2: -</span>';
            player2Badge.classList.remove('active');
        }
        
        // Update game section player names
        if (this.gameState.isInRoom) {
            const myName = this.gameState.playerName;
            const opponentId = playerIds.find(id => id !== this.gameState.playerId);
            const opponentName = opponentId ? players[opponentId]?.name : '-';
            
            document.getElementById('your-name').textContent = myName;
            document.getElementById('opponent-name').textContent = opponentName || '-';
        }
    }
    
    updateGameUI() {
        // Update current word
        const wordDisplay = document.getElementById('current-word-display');
        wordDisplay.textContent = this.gameState.currentWord || '-';
        
        // Update next letter hint
        const nextLetter = document.getElementById('next-letter');
        nextLetter.textContent = this.gameState.lastLetter ? this.gameState.lastLetter.toUpperCase() : '-';
        
        // Update used words list
        const usedWordsList = document.getElementById('used-words-list');
        usedWordsList.innerHTML = '';
        
        if (this.gameState.usedWords.length === 0) {
            usedWordsList.innerHTML = '<p class="empty-words">Belum ada kata yang dimainkan</p>';
        } else {
            this.gameState.usedWords.forEach((word, index) => {
                const wordElement = document.createElement('div');
                wordElement.className = 'word-item';
                wordElement.textContent = `${index + 1}. ${word}`;
                usedWordsList.appendChild(wordElement);
            });
        }
        
        // Update used words count
        document.getElementById('used-words-count').textContent = this.gameState.usedWords.length;
        
        // Update turn indicators
        const isMyTurn = this.gameState.currentPlayer === this.gameState.playerId;
        
        const myIndicator = document.getElementById('your-turn-indicator');
        const opponentIndicator = document.getElementById('opponent-turn-indicator');
        
        if (isMyTurn) {
            myIndicator.innerHTML = '<i class="fas fa-play-circle"></i> GILIRAN KAMU!';
            myIndicator.classList.add('active');
            opponentIndicator.innerHTML = '<i class="fas fa-clock"></i> Menunggu giliran';
            opponentIndicator.classList.remove('active');
        } else {
            myIndicator.innerHTML = '<i class="fas fa-clock"></i> Menunggu giliran';
            myIndicator.classList.remove('active');
            opponentIndicator.innerHTML = '<i class="fas fa-play-circle"></i> GILIRAN LAWAN';
            opponentIndicator.classList.add('active');
        }
    }
    
    updateTimerUI() {
        document.getElementById('timer').textContent = this.gameState.timer;
        
        // Change color when time is running out
        const timerElement = document.getElementById('timer');
        if (this.gameState.timer <= 3) {
            timerElement.style.color = '#f72585';
            timerElement.style.animation = 'pulse 0.5s infinite';
        } else {
            timerElement.style.color = '#4cc9f0';
            timerElement.style.animation = 'none';
        }
    }
    
    showLobby(inRoom) {
        this.gameState.isInRoom = inRoom;
        
        const lobbySection = document.getElementById('lobby-section');
        const gameSection = document.getElementById('game-section');
        
        if (inRoom) {
            lobbySection.classList.remove('active');
            gameSection.classList.add('active');
            
            // Update game room ID
            document.getElementById('game-room-id').textContent = this.gameState.roomId;
        } else {
            lobbySection.classList.add('active');
            gameSection.classList.remove('active');
            
            // Reset UI elements
            document.getElementById('room-status').classList.add('hidden');
            document.getElementById('player-name').value = '';
            document.getElementById('room-id').value = '';
        }
    }
    
    showGameSection() {
        const lobbySection = document.getElementById('lobby-section');
        const gameSection = document.getElementById('game-section');
        
        lobbySection.classList.remove('active');
        gameSection.classList.add('active');
    }
    
    showGameResult(result) {
        const resultBox = document.getElementById('game-result');
        const resultTitle = document.getElementById('result-title');
        const resultMessage = document.getElementById('result-message');
        
        resultBox.classList.remove('hidden');
        resultBox.classList.remove('win', 'lose');
        resultBox.classList.add(result);
        
        if (result === 'win') {
            resultTitle.textContent = '🎉 KAMU MENANG! 🎉';
            resultMessage.textContent = 'Selamat! Kamu berhasil mengalahkan lawan.';
        } else {
            resultTitle.textContent = '😢 KAMU KALAH';
            resultMessage.textContent = 'Coba lagi! Kamu bisa lebih baik di game berikutnya.';
        }
    }
    
    // ============================================
    // 9. HELPER FUNCTIONS
    // ============================================
    getPlayersInRoom() {
        // This would be updated from Firebase data
        return {};
    }
    
    resetGameState() {
        this.gameState.isInRoom = false;
        this.gameState.isGameActive = false;
        this.gameState.isHost = false;
        this.gameState.roomId = null;
        this.gameState.currentPlayer = null;
        this.gameState.usedWords = [];
        this.gameState.currentWord = '';
        this.gameState.lastLetter = '';
        
        this.stopTurnTimer();
        
        // Reset Firebase references
        this.roomRef = null;
        this.playersRef = null;
        this.gameRef = null;
        this.webrtcRef = null;
    }
    
    playAgain() {
        // Reset game data
        if (this.gameState.isHost && this.gameRef) {
            const gameData = {
                status: 'playing',
                currentPlayer: this.gameState.playerId,
                currentWord: '',
                usedWords: [],
                lastLetter: '',
                timer: 10,
                startedAt: Date.now()
            };
            
            this.gameRef.update(gameData).then(() => {
                // Hide result
                document.getElementById('game-result').classList.add('hidden');
                
                console.log('New game started');
            });
        }
    }
    
    backToLobby() {
        this.leaveRoom();
    }
    
    copyRoomId() {
        navigator.clipboard.writeText(this.gameState.roomId).then(() => {
            const copyBtn = document.getElementById('copy-room-id');
            const originalHTML = copyBtn.innerHTML;
            
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            copyBtn.style.background = '#43aa8b';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.background = '';
            }, 2000);
        });
    }
    
    showChatMessage(message) {
        // Optional: Implement chat message display
        console.log("Chat:", message);
    }
}

// ============================================
// 10. INITIALIZE GAME WHEN PAGE LOADS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize game
    window.game = new Game();
    
    console.log("Game loaded successfully!");
});