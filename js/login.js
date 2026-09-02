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

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const storecode = storecodeInput.value.trim().toLowerCase();
        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (rememberCheckbox && rememberCheckbox.checked) {
            localStorage.setItem('saved_storecode', storecodeInput.value.trim());
            localStorage.setItem('saved_username', usernameInput.value.trim());
        } else {
            localStorage.removeItem('saved_storecode');
            localStorage.removeItem('saved_username');
        }

        const email = `${username}@${storecode}.instock`;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showToast('error', error.message);
            return;
        }

        if (data.session) {
            window.location.replace('index.html');
        }
    });
}
