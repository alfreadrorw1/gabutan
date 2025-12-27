alert("JS MASUK");
document.addEventListener("DOMContentLoaded", () => {
  console.log("GAME JS AKTIF");

  const usernameInput = document.getElementById("username-input");
  const loginBtn = document.getElementById("login-btn");

  if (!usernameInput || !loginBtn) {
    console.error("Element tidak ditemukan");
    return;
  }

  loginBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();

    if (!username) {
      alert("Username tidak boleh kosong");
      return;
    }

    console.log("Login sebagai:", username);

    // Simpan user online ke Firebase
    try {
      firebase.database().ref("onlineUsers/" + username).set({
        username: username,
        online: true,
        lastActive: Date.now()
      });

      alert("Berhasil masuk sebagai " + username);
    } catch (e) {
      console.error("Firebase error:", e);
      alert("Firebase belum siap. Cek console.");
    }
  });

});
