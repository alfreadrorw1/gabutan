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
let app;
let database;

try {
    // Cek apakah Firebase sudah diinisialisasi
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    
    database = firebase.database();
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
    alert("Error: Firebase tidak bisa diinisialisasi. Periksa konfigurasi.");
}

// ====================== FUNGSI UTILITAS ======================
const firebaseUtils = {
    // Generate ID yang aman untuk Firebase
    generateId: () => {
        return database.ref().push().key;
    },
    
    // Cek apakah username sudah ada
    checkUsernameExists: async (username) => {
        try {
            if (!database) {
                throw new Error("Firebase database not initialized");
            }
            
            const snapshot = await database.ref(`users/${username}`).once('value');
            const userData = snapshot.val();
            
            // Return true hanya jika user online
            return userData && userData.online === true;
        } catch (error) {
            console.error('Error checking username:', error);
            return false;
        }
    },
    
    // Cleanup user data saat logout
    cleanupUserData: async (username) => {
        if (!username || !database) return;
        
        try {
            // Update status menjadi offline
            await database.ref(`users/${username}`).update({
                online: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            
            // Hapus data user setelah 3 detik
            setTimeout(() => {
                database.ref(`users/${username}`).remove().catch(() => {});
            }, 3000);
            
        } catch (error) {
            console.error('Error in cleanupUserData:', error);
        }
    }
};

// ====================== ERROR HANDLER GLOBAL ======================
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
});

window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error);
});