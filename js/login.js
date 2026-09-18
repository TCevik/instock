import { supabase } from './supabase.js';
import { showToast } from './toast.js';

const loginForm = document.getElementById('loginForm');
const storecodeInput = document.getElementById('storecode');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberCheckbox = document.getElementById('remember');

const savedStorecode = localStorage.getItem('saved_storecode');
const savedUsername = localStorage.getItem('saved_username');

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
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const storecode = storecodeInput.value.trim().toLowerCase();
        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (submitBtn) {
            submitBtn.classList.add('btn-loading');
            submitBtn.disabled = true;
        }

        if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('saved_storecode', storecodeInput.value.trim());
            localStorage.setItem('saved_username', usernameInput.value.trim());
        } else {
            localStorage.removeItem('saved_storecode');
            localStorage.removeItem('saved_username');
        }

        const email = `${username}@${storecode}.instock`;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                showToast('error', error.message);
                if (submitBtn) {
                    submitBtn.classList.remove('btn-loading');
                    submitBtn.disabled = false;
                }
                return;
            }

            if (data.session) {
                localStorage.setItem('instock_last_activity', Date.now().toString());
                window.location.replace('index');
            }
        } catch (err) {
            showToast('error', err.message || 'Er is een fout opgetreden');
            if (submitBtn) {
                submitBtn.classList.remove('btn-loading');
                submitBtn.disabled = false;
            }
        }
    });
}
