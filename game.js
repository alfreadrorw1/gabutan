class WordDuelGame {
    constructor() {
        this.currentUser = null;
        this.currentSession = null;
        this.peerConnection = null;
        this.localStream = null;
        this.isMuted = false;
        
        this.gameState = {
            currentWord: '',
            lastLetter: '',
            yourScore: 0,
            opponentScore: 0,
            currentTurn: null,
            timer: 30,
            timerInterval: null,
            wordHistory: []
        };
        
        this.init();
    }
    
    init() {
        console.log("Initializing Word Duel Game...");
        
        // Cek apakah Firebase tersedia
        if (typeof firebase === 'undefined') {
            this.showError("Firebase SDK tidak ditemukan. Periksa koneksi internet.");
            return;
        }
        
        if (!database) {
            this.showError("Firebase database tidak terinisialisasi. Periksa konfigurasi.");
            return;
        }
        
        this.bindEvents();
        this.showScreen('login-screen');
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this.handleBeforeUnload();
        });
    }
    
    bindEvents() {
        // Login
        document.getElementById('login-btn').addEventListener('click', () => this.handleLogin());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
        
        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', () => this.handleLogout());
        
        // Game controls
        document.getElementById('submit-word')?.addEventListener('click', () => this.submitWord());
        document.getElementById('word-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.submitWord();
        });
        
        // Voice chat
        document.getElementById('mute-btn')?.addEventListener('click', () => this.toggleMute());
        document.getElementById('hangup-btn')?.addEventListener('click', () => this.hangUpCall());
        
        // Game navigation
        document.getElementById('leave-game-btn')?.addEventListener('click', () => this.leaveGame());
    }
    
    showError(message) {
        console.error(message);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #f72585;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            z-index: 10000;
            max-width: 80%;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        errorDiv.textContent = `Error: ${message}`;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                document.body.removeChild(errorDiv);
            }
        }, 5000);
    }
    
    async handleLogin() {
        const usernameInput = document.getElementById('username-input');
        const username = usernameInput.value.trim();
        const errorElement = document.getElementById('username-error');
        
        // Reset error
        errorElement.textContent = '';
        
        // Validasi dasar
        if (!username) {
            errorElement.textContent = 'Username tidak boleh kosong';
            return;
        }
        
        if (username.length < 3) {
            errorElement.textContent = 'Username minimal 3 karakter';
            return;
        }
        
        // Disable button
        const loginBtn = document.getElementById('login-btn');
        const originalText = loginBtn.innerHTML;
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memeriksa...';
        
        try {
            // Cek username
            const exists = await firebaseUtils.checkUsernameExists(username);
            
            if (exists) {
                errorElement.textContent = 'Username sudah digunakan';
                return;
            }
            
            // Simpan user
            await database.ref(`users/${username}`).set({
                username: username,
                online: true,
                joinedAt: firebase.database.ServerValue.TIMESTAMP,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Set sebagai user aktif
            this.currentUser = username;
            document.getElementById('current-user').textContent = username;
            
            // Pindah ke lobby
            this.showScreen('lobby-screen');
            
            // Setup listeners
            this.setupFirebaseListeners();
            
        } catch (error) {
            console.error('Login error:', error);
            errorElement.textContent = 'Terjadi kesalahan, coba lagi';
            
            if (error.message.includes('permission') || error.code === 'PERMISSION_DENIED') {
                errorElement.textContent += ' (Cek Firebase Rules)';
            }
        } finally {
            // Reset button
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalText;
        }
    }
    
    setupFirebaseListeners() {
        if (!this.currentUser || !database) return;
        
        // Listen untuk users online
        database.ref('users').on('value', (snapshot) => {
            try {
                this.updateOnlinePlayers(snapshot.val());
            } catch (error) {
                console.error('Error updating players:', error);
            }
        });
        
        // Listen untuk invites
        database.ref('invites').orderByChild('to').equalTo(this.currentUser)
            .on('value', (snapshot) => {
                try {
                    this.handleIncomingInvites(snapshot.val());
                } catch (error) {
                    console.error('Error handling invites:', error);
                }
            });
        
        // Listen untuk sessions
        database.ref('sessions').on('value', (snapshot) => {
            try {
                this.handleSessionUpdates(snapshot.val());
            } catch (error) {
                console.error('Error handling sessions:', error);
            }
        });
    }
    
    updateOnlinePlayers(users) {
        const container = document.getElementById('online-players-list');
        const countElement = document.getElementById('online-count');
        
        if (!users) {
            container.innerHTML = '<div class="empty-state">Tidak ada pemain online</div>';
            countElement.textContent = '0';
            return;
        }
        
        // Filter user online (bukan diri sendiri)
        const onlineUsers = Object.entries(users)
            .filter(([username, data]) => 
                data && data.online === true && username !== this.currentUser
            );
        
        countElement.textContent = onlineUsers.length;
        
        if (onlineUsers.length === 0) {
            container.innerHTML = '<div class="empty-state">Tidak ada pemain online selain Anda</div>';
            return;
        }
        
        // Render daftar pemain
        container.innerHTML = onlineUsers.map(([username, data]) => `
            <div class="player-item">
                <div class="player-info">
                    <div class="online-status"></div>
                    <span class="player-name">${username}</span>
                </div>
                <button class="btn-primary invite-btn" onclick="game.sendInvite('${username}')">
                    <i class="fas fa-gamepad"></i> Invite
                </button>
            </div>
        `).join('');
    }
    
    async sendInvite(targetUser) {
        if (!this.currentUser || !targetUser) return;
        
        try {
            const inviteId = firebaseUtils.generateId();
            
            await database.ref(`invites/${inviteId}`).set({
                id: inviteId,
                from: this.currentUser,
                to: targetUser,
                status: 'pending',
                createdAt: firebase.database.ServerValue.TIMESTAMP
            });
            
            this.showNotification(`Invite dikirim ke ${targetUser}`);
            
        } catch (error) {
            console.error('Error sending invite:', error);
            this.showNotification('Gagal mengirim invite');
        }
    }
    
    handleIncomingInvites(invites) {
        const container = document.getElementById('invite-notifications');
        
        if (!invites) {
            container.innerHTML = '<p class="empty-notification">Tidak ada notifikasi</p>';
            return;
        }
        
        // Filter invites untuk user ini yang masih pending
        const pendingInvites = Object.values(invites).filter(invite => 
            invite.to === this.currentUser && invite.status === 'pending'
        );
        
        if (pendingInvites.length === 0) {
            container.innerHTML = '<p class="empty-notification">Tidak ada notifikasi</p>';
            return;
        }
        
        // Render invites
        container.innerHTML = pendingInvites.map(invite => `
            <div class="invite-notification">
                <div class="notification-content">
                    <div>
                        <strong>${invite.from}</strong> mengajak Anda bermain
                    </div>
                    <div class="notification-actions">
                        <button class="btn-primary" onclick="game.acceptInvite('${invite.id}', '${invite.from}')">
                            <i class="fas fa-check"></i> Terima
                        </button>
                        <button class="btn-danger" onclick="game.rejectInvite('${invite.id}')">
                            <i class="fas fa-times"></i> Tolak
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async acceptInvite(inviteId, fromUser) {
        if (!inviteId || !fromUser || !this.currentUser) return;
        
        try {
            // Update invite status
            await database.ref(`invites/${inviteId}`).update({
                status: 'accepted'
            });
            
            // Buat session baru
            const sessionId = firebaseUtils.generateId();
            this.currentSession = sessionId;
            
            await database.ref(`sessions/${sessionId}`).set({
                id: sessionId,
                player1: fromUser,
                player2: this.currentUser,
                status: 'active',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                currentTurn: fromUser,
                currentWord: '',
                scores: {
                    [fromUser]: 0,
                    [this.currentUser]: 0
                }
            });
            
            // Pindah ke game screen
            this.showScreen('game-screen');
            
            // Setup WebRTC
            await this.setupWebRTC(sessionId, fromUser);
            
        } catch (error) {
            console.error('Error accepting invite:', error);
            this.showNotification('Gagal menerima invite');
        }
    }
    
    async rejectInvite(inviteId) {
        try {
            await database.ref(`invites/${inviteId}`).update({
                status: 'rejected'
            });
            
            this.showNotification('Invite ditolak');
            
        } catch (error) {
            console.error('Error rejecting invite:', error);
        }
    }
    
    async setupWebRTC(sessionId, otherPlayer) {
        try {
            // Get microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });
            
            // Add local stream
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Setup listeners
            this.peerConnection.ontrack = (event) => {
                // Remote stream received
                const remoteAudio = new Audio();
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play();
                document.getElementById('voice-status').textContent = 'Terhubung';
            };
            
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    database.ref(`sessions/${sessionId}/webrtc/${this.currentUser}_candidates`)
                        .push(event.candidate.toJSON());
                }
            };
            
            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            await database.ref(`sessions/${sessionId}/webrtc/${this.currentUser}_offer`).set(offer);
            
        } catch (error) {
            console.error('WebRTC error:', error);
            document.getElementById('voice-status').textContent = 'Voice chat gagal';
        }
    }
    
    toggleMute() {
        if (!this.localStream) return;
        
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });
        
        const btn = document.getElementById('mute-btn');
        if (this.isMuted) {
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i> Unmute';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-danger');
        } else {
            btn.innerHTML = '<i class="fas fa-microphone"></i> Mute';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-danger');
        }
    }
    
    hangUpCall() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        document.getElementById('voice-status').textContent = 'Koneksi ditutup';
    }
    
    handleSessionUpdates(sessions) {
        if (!sessions || !this.currentSession) return;
        
        const session = sessions[this.currentSession];
        if (!session) return;
        
        // Update game UI
        this.updateGameUI(session);
    }
    
    updateGameUI(session) {
        // Update player names
        document.getElementById('player-you').textContent = this.currentUser;
        document.getElementById('player-opponent').textContent = 
            session.player1 === this.currentUser ? session.player2 : session.player1;
        
        // Update scores
        document.getElementById('your-score').textContent = session.scores[this.currentUser] || 0;
        document.getElementById('opponent-score').textContent = 
            session.scores[session.player1 === this.currentUser ? session.player2 : session.player1] || 0;
        
        // Update turn
        const turnIndicator = document.getElementById('turn-indicator');
        if (session.currentTurn === this.currentUser) {
            turnIndicator.textContent = 'GILIRAN ANDA!';
            turnIndicator.style.color = '#4ade80';
            document.getElementById('word-input').disabled = false;
        } else {
            turnIndicator.textContent = `Giliran ${session.currentTurn}`;
            turnIndicator.style.color = '#f72585';
            document.getElementById('word-input').disabled = true;
        }
        
        // Update current word
        if (session.currentWord) {
            document.getElementById('current-word').textContent = session.currentWord;
            this.gameState.lastLetter = session.currentWord.slice(-1).toUpperCase();
        }
    }
    
    async submitWord() {
        if (!this.currentSession) return;
        
        const wordInput = document.getElementById('word-input');
        const word = wordInput.value.trim().toUpperCase();
        
        // Validation
        if (!word) {
            this.showNotification('Masukkan kata');
            return;
        }
        
        if (this.gameState.lastLetter && word[0] !== this.gameState.lastLetter) {
            this.showNotification(`Mulai dengan huruf "${this.gameState.lastLetter}"`);
            return;
        }
        
        try {
            const sessionRef = database.ref(`sessions/${this.currentSession}`);
            const snapshot = await sessionRef.once('value');
            const session = snapshot.val();
            
            // Tentukan giliran berikutnya
            const nextPlayer = session.currentTurn === session.player1 ? 
                session.player2 : session.player1;
            
            // Update session
            await sessionRef.update({
                currentWord: word,
                currentTurn: nextPlayer,
                [`scores.${this.currentUser}`]: (session.scores[this.currentUser] || 0) + 1
            });
            
            // Reset input
            wordInput.value = '';
            
        } catch (error) {
            console.error('Error submitting word:', error);
            this.showNotification('Gagal mengirim kata');
        }
    }
    
    async leaveGame() {
        if (this.currentSession) {
            try {
                await database.ref(`sessions/${this.currentSession}`).update({
                    status: 'ended'
                });
            } catch (error) {
                console.error('Error ending session:', error);
            }
            
            this.currentSession = null;
        }
        
        this.hangUpCall();
        this.showScreen('lobby-screen');
    }
    
    async handleLogout() {
        if (this.currentUser) {
            await firebaseUtils.cleanupUserData(this.currentUser);
            this.currentUser = null;
        }
        
        this.hangUpCall();
        this.showScreen('login-screen');
    }
    
    handleBeforeUnload() {
        if (this.currentUser) {
            // Coba update status offline sebelum keluar
            try {
                database.ref(`users/${this.currentUser}`).update({
                    online: false,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            } catch (error) {
                console.error('Beforeunload error:', error);
            }
        }
    }
    
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }
        
        // Focus appropriate input
        if (screenId === 'login-screen') {
            document.getElementById('username-input').focus();
        } else if (screenId === 'game-screen') {
            const wordInput = document.getElementById('word-input');
            if (wordInput && !wordInput.disabled) {
                wordInput.focus();
            }
        }
    }
    
    showNotification(message) {
        console.log("Notification:", message);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4361ee;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 9999;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes fa-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .fa-spinner {
        animation: fa-spin 1s infinite linear;
    }
`;
document.head.appendChild(style);

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    try {
        window.game = new WordDuelGame();
    } catch (error) {
        console.error('Failed to initialize game:', error);
        alert('Gagal memuat game. Periksa console untuk detail error.');
    }
});