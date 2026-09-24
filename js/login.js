import { supabase } from "./supabase.js";
import { showToast } from "./toast.js";

const bgShapes = document.querySelector(".bg-shapes");
if (bgShapes) {
  const shapes = [
    '<rect x="3" y="3" width="18" height="18" rx="2" />',
    '<circle cx="12" cy="12" r="9" />',
    '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
    '<polygon points="12 3 22 21 2 21" />'
  ];
  for (let i = 1; i <= 30; i++) {
    bgShapes.insertAdjacentHTML("beforeend", `<svg class="shape shape-${i}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${shapes[(i - 1) % 4]}</svg>`);
  }
}

const loginForm = document.getElementById("loginForm");
const storecodeInput = document.getElementById("storecode");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const rememberCheckbox = document.getElementById("remember");
const passkeyBtn = document.getElementById("passkeyBtn");

const savedStorecode = localStorage.getItem("saved_storecode");
const savedUsername = localStorage.getItem("saved_username");

if (savedStorecode) {
  storecodeInput.value = savedStorecode;
}

if (savedUsername) {
  usernameInput.value = savedUsername;
}

if (passwordInput) {
  passwordInput.focus();
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const submitBtn = loginForm.querySelector('button[type="submit"]');

    const storecode = storecodeInput.value.trim().toLowerCase();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (submitBtn) {
      submitBtn.classList.add("btn-loading");
      submitBtn.disabled = true;
    }

    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem("saved_storecode", storecodeInput.value.trim());
      localStorage.setItem("saved_username", usernameInput.value.trim());
    } else {
      localStorage.removeItem("saved_storecode");
      localStorage.removeItem("saved_username");
    }

    const email = `${username}@${storecode}.instock`;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showToast("error", error.message);
        if (submitBtn) {
          submitBtn.classList.remove("btn-loading");
          submitBtn.disabled = false;
        }
        return;
      }

      if (data.session) {
        localStorage.setItem("instock_last_activity", Date.now().toString());
        window.location.replace("index");
      }
    } catch (err) {
      showToast("error", err.message || "Er is een fout opgetreden");
      if (submitBtn) {
        submitBtn.classList.remove("btn-loading");
        submitBtn.disabled = false;
      }
    }
  });
}

if (passkeyBtn) {
  passkeyBtn.addEventListener("click", async () => {
    passkeyBtn.classList.add("btn-loading");
    passkeyBtn.disabled = true;

    try {
      const signInFn =
        typeof supabase.auth.signInWithPasskey === "function"
          ? supabase.auth.signInWithPasskey.bind(supabase.auth)
          : supabase.auth.passkey?.signInWithPasskey?.bind(
              supabase.auth.passkey,
            );

      if (!signInFn) {
        throw new Error(
          "Passkey inloggen wordt niet ondersteund door deze client/browser.",
        );
      }

      const { data, error } = await signInFn();

      if (error) {
        showToast("error", error.message || "Inloggen met Passkey mislukt");
        passkeyBtn.classList.remove("btn-loading");
        passkeyBtn.disabled = false;
        return;
      }

      if (data?.session) {
        localStorage.setItem("instock_last_activity", Date.now().toString());
        window.location.replace("index");
      } else {
        passkeyBtn.classList.remove("btn-loading");
        passkeyBtn.disabled = false;
      }
    } catch (err) {
      showToast(
        "error",
        err.message || "Er is een fout opgetreden bij het inloggen met Passkey",
      );
      passkeyBtn.classList.remove("btn-loading");
      passkeyBtn.disabled = false;
    }
  });
}
