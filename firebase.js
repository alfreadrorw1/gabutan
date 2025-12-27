// Konfigurasi Firebase
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

// Inisialisasi Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Export fungsi Firebase yang dibutuhkan
const firebaseDB = {
    database: database,
    
    // Fungsi untuk membuat room baru
    createRoom: async function(playerName) {
        const roomId = this.generateRoomId();
        const roomRef = database.ref(`rooms/${roomId}`);
        
        // Buat data room
        await roomRef.set({
            roomId: roomId,
            status: 'waiting',
            players: {
                player1: {
                    name: playerName,
                    id: this.generatePlayerId(),
                    status: 'online'
                }
            },
            game: {
                status: 'waiting',
                currentPlayer: null,
                lastWord: null,
                lastLetter: null,
                usedWords: {},
                turnStartTime: null,
                gameStartTime: null,
                winner: null
            },
            createdAt: Date.now()
        });
        
        return roomId;
    },
    
    // Fungsi untuk join room
    joinRoom: async function(roomId, playerName) {
        const roomRef = database.ref(`rooms/${roomId}`);
        const snapshot = await roomRef.once('value');
        
        if (!snapshot.exists()) {
            throw new Error('Room tidak ditemukan');
        }
        
        const roomData = snapshot.val();
        
        if (roomData.status !== 'waiting') {
            throw new Error('Room sudah penuh');
        }
        
        // Update room dengan player kedua
        await roomRef.update({
            status: 'full',
            players: {
                ...roomData.players,
                player2: {
                    name: playerName,
                    id: this.generatePlayerId(),
                    status: 'online'
                }
            },
            game: {
                ...roomData.game,
                status: 'starting',
                currentPlayer: 'player1',
                gameStartTime: Date.now()
            }
        });
        
        return roomId;
    },
    
    // Fungsi untuk mendengarkan perubahan di room
    onRoomUpdate: function(roomId, callback) {
        const roomRef = database.ref(`rooms/${roomId}`);
        return roomRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                callback(snapshot.val());
            }
        });
    },
    
    // Fungsi untuk mengirim kata
    submitWord: async function(roomId, playerId, word) {
        const roomRef = database.ref(`rooms/${roomId}`);
        const snapshot = await roomRef.once('value');
        const roomData = snapshot.val();
        
        if (!roomData) {
            throw new Error('Room tidak ditemukan');
        }
        
        // Validasi apakah ini giliran pemain
        if (roomData.game.currentPlayer !== playerId) {
            throw new Error('Bukan giliran kamu');
        }
        
        // Update data game
        const updates = {
            [`game/lastWord`]: word,
            [`game/lastLetter`]: word.charAt(word.length - 1).toLowerCase(),
            [`game/usedWords/${word.toLowerCase()}`]: true,
            [`game/currentPlayer`]: playerId === 'player1' ? 'player2' : 'player1',
            [`game/turnStartTime`]: Date.now()
        };
        
        await roomRef.update(updates);
    },
    
    // Fungsi untuk menandai pemain kalah
    playerLoses: async function(roomId, playerId) {
        const roomRef = database.ref(`rooms/${roomId}`);
        
        await roomRef.update({
            'game/status': 'finished',
            'game/winner': playerId === 'player1' ? 'player2' : 'player1',
            'game/endTime': Date.now()
        });
    },
    
    // Fungsi untuk update status pemain
    updatePlayerStatus: async function(roomId, playerId, status) {
        const roomRef = database.ref(`rooms/${roomId}`);
        
        await roomRef.update({
            [`players/${playerId}/status`]: status
        });
    },
    
    // Fungsi untuk menghapus room
    deleteRoom: async function(roomId) {
        const roomRef = database.ref(`rooms/${roomId}`);
        await roomRef.remove();
    },
    
    // Fungsi untuk signaling WebRTC
    onSignal: function(roomId, playerId, callback) {
        const signalRef = database.ref(`signaling/${roomId}/${playerId}`);
        return signalRef.on('child_added', (snapshot) => {
            const signal = snapshot.val();
            callback(signal);
            // Hapus signal setelah diproses
            snapshot.ref.remove();
        });
    },
    
    sendSignal: async function(roomId, targetPlayerId, signal) {
        const signalRef = database.ref(`signaling/${roomId}/${targetPlayerId}`);
        await signalRef.push(signal);
    },
    
    // Helper functions
    generateRoomId: function() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    },
    
    generatePlayerId: function() {
        return Math.random().toString(36).substring(2, 10);
    }
};