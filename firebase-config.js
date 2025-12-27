// Firebase Configuration
// NOTE: Ganti dengan konfigurasi Firebase project Anda
// Buka: https://console.firebase.google.com/
// 1. Buat project baru
// 2. Tambahkan web app
// 3. Salin konfigurasi ke sini

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

console.log("Firebase initialized");