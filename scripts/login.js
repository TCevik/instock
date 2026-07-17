document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("login-form");
    const loginMsg = document.getElementById("login-msg");
    const showForgotLink = document.getElementById("show-forgot");
    const forgotModal = document.getElementById("forgot-modal");
    const closeModalBtn = document.getElementById("close-modal-btn");

    showForgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        forgotModal.classList.remove("hidden");
    });

    closeModalBtn.addEventListener("click", () => {
        forgotModal.classList.add("hidden");
    });

    forgotModal.addEventListener("click", (e) => {
        if (e.target === forgotModal) {
            forgotModal.classList.add("hidden");
        }
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const winkelId = document.getElementById("login-winkel").value;
        const personeelsnummer = document.getElementById("login-personeelsnummer").value;
        const password = document.getElementById("login-password").value;
        const email = `${personeelsnummer}@${winkelId}.instock.local`;
        const btn = loginForm.querySelector("button");

        btn.disabled = true;
        loginMsg.className = "message-box";

        try {
            const client = await window.getSupabase();
            const { error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            window.location.href = "index.html";
        } catch (err) {
            loginMsg.textContent = err.message;
            loginMsg.classList.add("error");
            btn.disabled = false;
        }
    });

    const loadWinkels = async () => {
        try {
            const client = await window.getSupabase();
            const { data, error } = await client
                .from("winkels")
                .select("id, naam")
                .order("naam");
            if (error) throw error;
            const select = document.getElementById("login-winkel");
            data.forEach(winkel => {
                const opt = document.createElement("option");
                opt.value = winkel.id;
                opt.textContent = winkel.naam;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
        }
    };
    loadWinkels();
});
