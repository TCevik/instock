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
        const winkelCode = document.getElementById("login-winkel-code").value.trim().toLowerCase();
        const personeelsnummer = document.getElementById("login-personeelsnummer").value;
        const password = document.getElementById("login-password").value;
        const btn = loginForm.querySelector("button");

        btn.disabled = true;
        loginMsg.className = "message-box";

        try {
            const client = await window.getSupabase();
            const { data: winkelData, error: winkelError } = await client
                .from("winkels")
                .select("id")
                .eq("winkel_code", winkelCode)
                .maybeSingle();

            if (winkelError) throw winkelError;
            if (!winkelData) {
                throw new Error("Winkelcode is onjuist of bestaat niet.");
            }

            const email = `${personeelsnummer}@${winkelData.id}.instock.local`;
            const { error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            window.location.href = "index.html";
        } catch (err) {
            loginMsg.textContent = err.message;
            loginMsg.classList.add("error");
            btn.disabled = false;
        }
    });
});
