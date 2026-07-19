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
            .eq('winkel', currentWinkelId);

        if (error || !users) {
            tableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">Fout bij het laden van gebruikers.</td></tr>';
            return;
        }

        const loggedInUser = users.find(u => u.id === loggedInUserId);
        const otherUsers = users.filter(u => u.id !== loggedInUserId);
        const sortedUsers = loggedInUser ? [loggedInUser, ...otherUsers] : users;

        currentUsers = sortedUsers;

        if (sortedUsers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">Geen gebruikers gevonden.</td></tr>';
            return;
        }

        tableBody.innerHTML = sortedUsers.map(u => {
            const isSelf = u.id === loggedInUserId;
            return `
                <tr ${isSelf ? 'class="self-row"' : ''}>
                    <td data-label="Volledige Naam">${u.full_name || ''} ${isSelf ? '<strong>(Jij)</strong>' : ''}</td>
                    <td data-label="Personeelsnummer">${u.personeelsnummer || ''}</td>
                    <td data-label="Rol">${u.role || ''}</td>
                    <td data-label="Acties">
                        <div class="action-btns">
                            <button class="action-btn edit" data-id="${u.id}" ${isSelf ? 'disabled style="opacity: 0.3; pointer-events: none; cursor: not-allowed;"' : ''}><i class="material-icons">edit</i></button>
                            <button class="action-btn delete" data-id="${u.id}" ${isSelf ? 'disabled style="opacity: 0.3; pointer-events: none; cursor: not-allowed;"' : ''}><i class="material-icons">delete</i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
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
                resetModalState();
                loadUsers();
                userModal.classList.remove('open');
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

    const confirmModal = document.getElementById('confirmModal');
    const closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmUserName = document.getElementById('confirm-user-name');
    let userToDeleteId = null;

    const closeConfirmModal = () => {
        confirmModal.classList.remove('open');
        userToDeleteId = null;
    };

    closeConfirmModalBtn.addEventListener('click', closeConfirmModal);
    cancelDeleteBtn.addEventListener('click', closeConfirmModal);
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            closeConfirmModal();
        }
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!userToDeleteId) return;
        confirmDeleteBtn.disabled = true;
        const originalText = confirmDeleteBtn.textContent;
        confirmDeleteBtn.textContent = 'Verwijderen...';
        try {
            const { data, error } = await window.supabase.functions.invoke('manage-user', {
                body: { action: 'delete', targetUserId: userToDeleteId }
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
        } finally {
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = originalText;
            closeConfirmModal();
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

            userToDeleteId = userId;
            confirmUserName.textContent = user.full_name || '';
            confirmModal.classList.add('open');
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
