document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('create-user-form');
    const fullNameInput = document.getElementById('full-name');
    const personeelsnummerInput = document.getElementById('personeelsnummer');
    const roleSelect = document.getElementById('role');
    const passwordInput = document.getElementById('password');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    const showMessage = (text, type) => {
        messageText.textContent = text;
        messageBox.className = `message ${type}`;
        messageIcon.textContent = type === 'error' ? 'error_outline' : 'check_circle_outline';
        messageBox.style.display = 'flex';
    };

    let currentWinkelId = null;
    let currentUsers = [];
    let isEditing = false;
    let editingUserId = null;
    let loggedInUserId = null;

    const resetModalState = () => {
        isEditing = false;
        editingUserId = null;
        document.querySelector('.modal-header h2').textContent = 'Nieuwe Gebruiker Aanmaken';
        submitBtn.querySelector('span').textContent = 'Gebruiker Aanmaken';
        passwordInput.setAttribute('required', 'required');
        form.reset();
    };

    const loadUsers = async () => {
        if (!currentWinkelId) return;
        const tableBody = document.getElementById('users-table-body');
        const { data: users, error } = await window.supabase
            .from('user_data')
            .select('id, full_name, role, personeelsnummer')
            .eq('winkel', currentWinkelId)
            .neq('id', loggedInUserId);

        if (error || !users) {
            tableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">Fout bij het laden van gebruikers.</td></tr>';
            return;
        }

        currentUsers = users;

        if (users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">Geen gebruikers gevonden.</td></tr>';
            return;
        }

        tableBody.innerHTML = users.map(u => `
            <tr>
                <td>${u.full_name || ''}</td>
                <td>${u.personeelsnummer || ''}</td>
                <td>${u.role || ''}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn edit" data-id="${u.id}"><i class="material-icons">edit</i></button>
                        <button class="action-btn delete" data-id="${u.id}"><i class="material-icons">delete</i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    };

    const checkAuth = async () => {
        if (!window.supabase) {
            setTimeout(checkAuth, 50);
            return;
        }

        const { data: { session } } = await window.supabase.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        const { data, error } = await window.supabase.from('user_data').select('role, winkel').eq('id', session.user.id).single();
        if (error || !data || data.role !== 'beheerder') {
            window.location.href = 'index.html';
            return;
        }

        loggedInUserId = session.user.id;
        currentWinkelId = data.winkel;
        loadUsers();
    };

    checkAuth();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageBox.style.display = 'none';

        const full_name = fullNameInput.value.trim();
        const personeelsnummer = personeelsnummerInput.value.trim();
        const role = roleSelect.value;
        const password = passwordInput.value;

        if (!full_name || !personeelsnummer || !role || (!isEditing && !password)) {
            showMessage('Vul alle verplichte velden in.', 'error');
            return;
        }

        submitBtn.disabled = true;
        const btnText = submitBtn.querySelector('span');
        const originalText = btnText.textContent;
        btnText.textContent = 'Bezig met verwerken...';

        try {
            let result;
            if (isEditing) {
                const updates = { full_name, role, personeelsnummer };
                if (password) {
                    updates.password = password;
                }
                result = await window.supabase.functions.invoke('manage-user', {
                    body: { action: 'update', targetUserId: editingUserId, updates }
                });
            } else {
                result = await window.supabase.functions.invoke('create-user', {
                    body: { full_name, role, personeelsnummer, password }
                });
            }

            const { data, error } = result;

            if (error) {
                console.error("Volledige Functions Fout:", error);
                if (error.context && typeof error.context.json === 'function') {
                    try {
                        const errorBody = await error.context.json();
                        console.log("Database Details:", errorBody);
                        alert(`Fout: ${errorBody.error}\nDetails: ${errorBody.details || 'Geen details'}`);
                        showMessage(errorBody.error || 'Er ging iets mis.', 'error');
                    } catch (e) {
                        console.error("Kon fout-body niet parsen:", e);
                        alert("Er ging iets mis bij het verwerken van de gebruiker.");
                        showMessage("Er ging iets mis bij het verwerken van de gebruiker.", "error");
                    }
                } else {
                    alert("Er ging iets mis bij het verwerken van de gebruiker.");
                    showMessage(error.message, 'error');
                }
            } else {
                console.log("Succes:", data);
                alert(isEditing ? "Gebruiker succesvol aangepast!" : "Gebruiker succesvol aangemaakt!");
                showMessage(isEditing ? 'Gebruiker is succesvol aangepast!' : 'Gebruiker is succesvol aangemaakt!', 'success');
                resetModalState();
                loadUsers();
                setTimeout(() => {
                    userModal.classList.remove('open');
                }, 1000);
            }
        } catch (err) {
            showMessage('Er is een onverwachte netwerkfout opgetreden.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = originalText;
        }
    });

    const userModal = document.getElementById('userModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');

    openModalBtn.addEventListener('click', () => {
        resetModalState();
        userModal.classList.add('open');
        messageBox.style.display = 'none';
    });

    closeModalBtn.addEventListener('click', () => {
        userModal.classList.remove('open');
        resetModalState();
    });

    userModal.addEventListener('click', (e) => {
        if (e.target === userModal) {
            userModal.classList.remove('open');
            resetModalState();
        }
    });

    const tableBody = document.getElementById('users-table-body');
    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.action-btn.edit');
        const deleteBtn = e.target.closest('.action-btn.delete');

        if (deleteBtn) {
            const userId = deleteBtn.getAttribute('data-id');
            const user = currentUsers.find(u => u.id === userId);
            if (!user) return;

            const confirmed = confirm(`Weet je zeker dat je gebruiker "${user.full_name}" wilt verwijderen?`);
            if (!confirmed) return;

            try {
                const { data, error } = await window.supabase.functions.invoke('manage-user', {
                    body: { action: 'delete', targetUserId: userId }
                });

                if (error) {
                    if (error.context && typeof error.context.json === 'function') {
                        const errorBody = await error.context.json();
                        alert(`Fout: ${errorBody.error}\nDetails: ${errorBody.details || 'Geen details'}`);
                    } else {
                        alert(`Fout: ${error.message}`);
                    }
                } else {
                    alert("Gebruiker succesvol verwijderd!");
                    loadUsers();
                }
            } catch (err) {
                alert("Er is een netwerkfout opgetreden.");
            }
        }

        if (editBtn) {
            const userId = editBtn.getAttribute('data-id');
            const user = currentUsers.find(u => u.id === userId);
            if (!user) return;

            isEditing = true;
            editingUserId = userId;

            fullNameInput.value = user.full_name || '';
            personeelsnummerInput.value = user.personeelsnummer || '';
            roleSelect.value = user.role || '';
            passwordInput.value = '';
            passwordInput.removeAttribute('required');

            document.querySelector('.modal-header h2').textContent = 'Gebruiker Bewerken';
            submitBtn.querySelector('span').textContent = 'Opslaan';

            userModal.classList.add('open');
            messageBox.style.display = 'none';
        }
    });
});
