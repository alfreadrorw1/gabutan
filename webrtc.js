class VoiceChat {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isCaller = false;
        this.isConnected = false;
        
        this.initElements();
        this.initEventListeners();
    }
    
    initElements() {
        this.startVoiceBtn = document.getElementById('startVoiceBtn');
        this.endVoiceBtn = document.getElementById('endVoiceBtn');
        this.voiceStatus = document.getElementById('voiceStatus');
        this.remoteAudio = document.getElementById('remoteAudio');
    }
    
    initEventListeners() {
        this.startVoiceBtn.addEventListener('click', () => this.startVoiceChat());
        this.endVoiceBtn.addEventListener('click', () => this.endVoiceChat());
    }
    
    async startVoiceChat() {
        if (!window.game || !window.game.roomId || !window.game.playerId) {
            alert('Silakan join game terlebih dahulu');
            return;
        }
        
        try {
            // Get local audio stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            // Create peer connection
            this.createPeerConnection();
            
            // Add local stream to connection
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Setup signaling
            this.setupSignaling();
            
            // Update UI
            this.startVoiceBtn.classList.add('hidden');
            this.endVoiceBtn.classList.remove('hidden');
            this.updateVoiceStatus('Menyiapkan koneksi...');
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Tidak dapat mengakses microphone. Pastikan izin diberikan.');
        }
    }
    
    createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ]
        };
        
        this.peerConnection = new RTCPeerConnection(configuration);
        
        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            this.remoteAudio.srcObject = this.remoteStream;
            this.updateVoiceStatus('Terhubung');
            this.isConnected = true;
        };
        
        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal('ice-candidate', event.candidate);
            }
        };
        
        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            
            switch (this.peerConnection.connectionState) {
                case 'connected':
                    this.updateVoiceStatus('Terhubung');
                    this.isConnected = true;
                    break;
                case 'disconnected':
                case 'failed':
                case 'closed':
                    this.updateVoiceStatus('Terputus');
                    this.isConnected = false;
                    this.cleanup();
                    break;
            }
        };
    }
    
    setupSignaling() {
        const roomId = window.game.roomId;
        const playerId = window.game.playerId;
        
        // Determine if we're the caller (player1 always initiates)
        this.isCaller = playerId === 'player1';
        
        // Listen for signals
        this.unsubscribeSignal = firebaseDB.onSignal(roomId, playerId, async (signal) => {
            await this.handleSignal(signal);
        });
        
        // If we're the caller, create and send offer
        if (this.isCaller) {
            setTimeout(() => this.createAndSendOffer(), 1000);
        }
    }
    
    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.sendSignal('offer', offer);
            this.updateVoiceStatus('Menunggu jawaban...');
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
    
    async handleSignal(signal) {
        try {
            switch (signal.type) {
                case 'offer':
                    await this.handleOffer(signal.data);
                    break;
                    
                case 'answer':
                    await this.handleAnswer(signal.data);
                    break;
                    
                case 'ice-candidate':
                    await this.handleIceCandidate(signal.data);
                    break;
            }
        } catch (error) {
            console.error('Error handling signal:', error);
        }
    }
    
    async handleOffer(offer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.sendSignal('answer', answer);
        this.updateVoiceStatus('Menghubungkan...');
    }
    
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
    
    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
    
    sendSignal(type, data) {
        const roomId = window.game.roomId;
        const targetPlayerId = window.game.playerId === 'player1' ? 'player2' : 'player1';
        
        firebaseDB.sendSignal(roomId, targetPlayerId, {
            type: type,
            data: data,
            timestamp: Date.now(),
            sender: window.game.playerId
        });
    }
    
    updateVoiceStatus(status) {
        this.voiceStatus.textContent = `Status: ${status}`;
    }
    
    endVoiceChat() {
        this.cleanup();
        
        // Update UI
        this.startVoiceBtn.classList.remove('hidden');
        this.endVoiceBtn.classList.add('hidden');
        this.updateVoiceStatus('Voice chat tidak aktif');
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
    }
    
    cleanup() {
        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Unsubscribe from signals
        if (this.unsubscribeSignal) {
            this.unsubscribeSignal();
            this.unsubscribeSignal = null;
        }
        
        // Clear remote audio
        if (this.remoteAudio) {
            this.remoteAudio.srcObject = null;
        }
        
        this.isConnected = false;
        this.isCaller = false;
    }
}

// Inisialisasi voice chat saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    window.voiceChat = new VoiceChat();
});