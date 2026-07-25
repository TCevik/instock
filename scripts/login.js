import { getSupabase, handleFormSubmit, setAppReady } from './main.js';
import { showToast } from './toast.js';

document.addEventListener('DOMContentLoaded', async () => {
    setAppReady();
    const form = document.getElementById('login-form');
    const storeCodeInput = document.getElementById('store-code');
    const gebruikersnaamInput = document.getElementById('gebruikersnaam');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const submitBtn = form.querySelector('.login-btn');
    const rememberMeCheckbox = document.getElementById('remember-me');

    const savedStoreCode = localStorage.getItem('remembered_store_code');
    const savedGebruikersnaam = localStorage.getItem('remembered_gebruikersnaam') || localStorage.getItem('remembered_employee_id');
    if (savedStoreCode && savedGebruikersnaam) {
        storeCodeInput.value = savedStoreCode;
        gebruikersnaamInput.value = savedGebruikersnaam;
        rememberMeCheckbox.checked = true;
    }

    const supabase = await getSupabase();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const storeCode = storeCodeInput.value.trim().toLowerCase();
        const gebruikersnaam = gebruikersnaamInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!storeCode || !gebruikersnaam || !password) {
            if (errorMessage) errorMessage.style.display = 'none';
            showToast('Vul alle velden in.', 'error');
            return;
        }

        const email = `${gebruikersnaam}@${storeCode}.instock`;

        await handleFormSubmit(submitBtn, 'Bezig met inloggen...', errorMessage, async () => {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                if (errorMessage) errorMessage.style.display = 'none';
                showToast(error.message, 'error');
            } else if (data.session) {
                if (rememberMeCheckbox.checked) {
                    localStorage.setItem('remembered_store_code', storeCodeInput.value.trim());
                    localStorage.setItem('remembered_gebruikersnaam', gebruikersnaamInput.value.trim());
                } else {
                    localStorage.removeItem('remembered_store_code');
                    localStorage.removeItem('remembered_gebruikersnaam');
                    localStorage.removeItem('remembered_employee_id');
                }
                window.location.href = 'index.html';
            }
        });
    });
});
