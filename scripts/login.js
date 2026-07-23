import { getSupabase, handleFormSubmit } from './main.js';
import { showToast } from './toast.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('login-form');
    const storeCodeInput = document.getElementById('store-code');
    const employeeIdInput = document.getElementById('employee-id');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const submitBtn = form.querySelector('.login-btn');
    const rememberMeCheckbox = document.getElementById('remember-me');

    const savedStoreCode = localStorage.getItem('remembered_store_code');
    const savedEmployeeId = localStorage.getItem('remembered_employee_id');
    if (savedStoreCode && savedEmployeeId) {
        storeCodeInput.value = savedStoreCode;
        employeeIdInput.value = savedEmployeeId;
        rememberMeCheckbox.checked = true;
    }

    const supabase = await getSupabase();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const storeCode = storeCodeInput.value.trim().toLowerCase();
        const employeeId = employeeIdInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!storeCode || !employeeId || !password) {
            if (errorMessage) errorMessage.style.display = 'none';
            showToast('Vul alle velden in.', 'error');
            return;
        }

        const email = `${employeeId}@${storeCode}.instock`;

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
                    localStorage.setItem('remembered_employee_id', employeeIdInput.value.trim());
                } else {
                    localStorage.removeItem('remembered_store_code');
                    localStorage.removeItem('remembered_employee_id');
                }
                window.location.href = 'index.html';
            }
        });
    });
});
