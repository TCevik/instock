document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const storeCodeInput = document.getElementById('store-code');
    const employeeIdInput = document.getElementById('employee-id');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMessage.style.display = 'none';

        const storeCode = storeCodeInput.value.trim().toLowerCase();
        const employeeId = employeeIdInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!storeCode || !employeeId || !password) {
            errorText.textContent = 'Vul alle velden in.';
            errorMessage.style.display = 'flex';
            return;
        }

        const email = `${employeeId}@${storeCode}.instock`;

        if (!window.supabase) {
            errorText.textContent = 'Supabase laadt nog. Probeer het over een moment opnieuw.';
            errorMessage.style.display = 'flex';
            return;
        }

        try {
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                errorText.textContent = error.message;
                errorMessage.style.display = 'flex';
            } else if (data.session) {
                window.location.href = 'index.html';
            }
        } catch (err) {
            errorText.textContent = 'Er is een onverwachte fout opgetreden.';
            errorMessage.style.display = 'flex';
        }
    });
});
