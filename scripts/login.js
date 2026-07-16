document.addEventListener("DOMContentLoaded", () => {
    const loginView = document.getElementById("login-view");
    const registerView = document.getElementById("register-view");
    const forgotView = document.getElementById("forgot-view");

    const showRegisterLink = document.getElementById("show-register");
    const showLoginLink = document.getElementById("show-login");
    const showForgotLink = document.getElementById("show-forgot");
    const backToLoginLink = document.getElementById("back-to-login");

    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const forgotForm = document.getElementById("forgot-form");

    const loginMsg = document.getElementById("login-msg");
    const registerMsg = document.getElementById("register-msg");
    const forgotMsg = document.getElementById("forgot-msg");

    const switchView = (hide, show) => {
        hide.forEach(el => el.classList.add("hidden"));
        show.classList.remove("hidden");
        loginMsg.className = "message-box";
        registerMsg.className = "message-box";
        forgotMsg.className = "message-box";
    };

    showRegisterLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchView([loginView, forgotView], registerView);
    });

    showLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchView([registerView, forgotView], loginView);
    });

    showForgotLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchView([loginView, registerView], forgotView);
    });

    backToLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        switchView([registerView, forgotView], loginView);
    });

    const getSupabase = () => {
        return new Promise((resolve) => {
            if (window.supabaseClient) {
                resolve(window.supabaseClient);
                return;
            }
            const interval = setInterval(() => {
                if (window.supabaseClient) {
                    clearInterval(interval);
                    resolve(window.supabaseClient);
                }
            }, 100);
        });
    };

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        const btn = loginForm.querySelector("button");

        btn.disabled = true;
        loginMsg.className = "message-box";

        try {
            const client = await getSupabase();
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) throw error;
            window.location.href = "index.html";
        } catch (err) {
            loginMsg.textContent = err.message;
            loginMsg.classList.add("error");
            btn.disabled = false;
        }
    });

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("register-email").value;
        const password = document.getElementById("register-password").value;
        const btn = registerForm.querySelector("button");

        btn.disabled = true;
        registerMsg.className = "message-box";

        try {
            const client = await getSupabase();
            const { data, error } = await client.auth.signUp({ email, password });
            if (error) throw error;
            registerMsg.textContent = "Registratie succesvol! Controleer je e-mail voor de verificatielink.";
            registerMsg.classList.add("success");
            registerForm.reset();
        } catch (err) {
            registerMsg.textContent = err.message;
            registerMsg.classList.add("error");
        } finally {
            btn.disabled = false;
        }
    });

    forgotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("forgot-email").value;
        const btn = forgotForm.querySelector("button");

        btn.disabled = true;
        forgotMsg.className = "message-box";

        try {
            const client = await getSupabase();
            const { data, error } = await client.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/login.html"
            });
            if (error) throw error;
            forgotMsg.textContent = "Herstellink is verzonden naar je e-mailadres.";
            forgotMsg.classList.add("success");
            forgotForm.reset();
        } catch (err) {
            forgotMsg.textContent = err.message;
            forgotMsg.classList.add("error");
        } finally {
            btn.disabled = false;
        }
    });
});
