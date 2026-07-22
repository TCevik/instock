import { getSupabase, checkAuth, showMessage, setupModal, handleFormSubmit } from './main.js';
import { loadHeader } from './header.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('create-user-form');
    const fullNameInput = document.getElementById('full-name');
    const personeelsnummerInput = document.getElementById('personeelsnummer');
    const roleSelect = document.getElementById('role');
    const userAfdelingenContainer = document.getElementById('user-afdelingen-container');
    const passwordInput = document.getElementById('password');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    const openDeptModalBtn = document.getElementById('openDeptModalBtn');
    const deptModal = document.getElementById('deptModal');
    const closeDeptModalBtn = document.getElementById('closeDeptModalBtn');
    const addDeptForm = document.getElementById('add-dept-form');
    const newDeptNameInput = document.getElementById('new-dept-name');
    const addDeptBtn = document.getElementById('addDeptBtn');
    const deptListEl = document.getElementById('dept-list');
    const deptMessageBox = document.getElementById('dept-message-box');
    const deptMessageIcon = document.getElementById('dept-message-icon');
    const deptMessageText = document.getElementById('dept-message-text');

    loadHeader();

    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    const { session, userData } = auth;
    const loggedInUserId = session.user.id;
    const currentWinkelId = userData.winkel;
    const supabase = await getSupabase();

    const toggleViewBtn = document.getElementById('toggleViewBtn');

    let currentUsers = [];
    let currentStoreDepartments = [];
    let isEditing = false;
    let editingUserId = null;
    let viewMode = 'department';

    const loadStoreDepartments = async () => {
        if (!currentWinkelId) return [];
        const { data: storeInfo, error } = await supabase
            .from('stores_info')
            .select('afdelingen')
            .eq('id', currentWinkelId)
            .maybeSingle();

        if (error || !storeInfo) return [];
        
        let depts = [];
        if (Array.isArray(storeInfo.afdelingen)) {
            depts = storeInfo.afdelingen;
        } else if (typeof storeInfo.afdelingen === 'string' && storeInfo.afdelingen.trim()) {
            depts = storeInfo.afdelingen.split(',').map(s => s.trim()).filter(Boolean);
        }
        currentStoreDepartments = Array.from(new Set(depts.map(d => d.trim()).filter(Boolean))).sort();
        return currentStoreDepartments;
    };

    const renderDepartmentCheckboxes = (selectedDepts = []) => {
        if (!userAfdelingenContainer) return;
        if (currentStoreDepartments.length === 0) {
            userAfdelingenContainer.innerHTML = '<span style="color:var(--text-color-muted);font-size:14px;">Geen afdelingen aanwezig. Voeg er eerst een toe via "Afdelingen beheren".</span>';
            return;
        }

        userAfdelingenContainer.innerHTML = currentStoreDepartments.map(dept => {
            const isChecked = selectedDepts.includes(dept);
            return `
                <label class="checkbox-item">
                    <input type="checkbox" name="user-afdeling" value="${dept}" ${isChecked ? 'checked' : ''}>
                    <span>${dept}</span>
                </label>
            `;
        }).join('');
    };

    const renderDeptListModal = () => {
        if (!deptListEl) return;
        if (currentStoreDepartments.length === 0) {
            deptListEl.innerHTML = '<li style="color:var(--text-color-muted);font-size:14px;padding:8px 0;">Nog geen afdelingen ingesteld.</li>';
            return;
        }

        deptListEl.innerHTML = currentStoreDepartments.map(dept => `
            <li class="dept-list-item">
                <span>${dept}</span>
                <button class="action-btn delete delete-dept-btn" data-dept="${dept}">
                    <i class="material-icons">delete</i>
                </button>
            </li>
        `).join('');
    };

    const saveStoreDepartments = async (newDepts) => {
        const uniqueDepts = Array.from(new Set(newDepts.map(d => d.trim()).filter(Boolean))).sort();
        const afdelingenString = uniqueDepts.join(', ');
        
        const { error } = await supabase
            .from('stores_info')
            .upsert({ id: currentWinkelId, afdelingen: afdelingenString }, { onConflict: 'id' });

        if (!error) {
            currentStoreDepartments = uniqueDepts;
            renderDepartmentCheckboxes();
            renderDeptListModal();
            loadUsers();
        }
        return error;
    };

    const resetModalState = () => {
        isEditing = false;
        editingUserId = null;
        document.querySelector('.modal-header h2').textContent = 'Nieuwe Gebruiker Aanmaken';
        submitBtn.querySelector('span').textContent = 'Gebruiker Aanmaken';
        passwordInput.setAttribute('required', 'required');
        form.reset();
        renderDepartmentCheckboxes();
    };

    const getSelectedAfdelingen = () => {
        const checkboxes = document.querySelectorAll('input[name="user-afdeling"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    };

    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', () => {
            viewMode = viewMode === 'department' ? 'alphabetical' : 'department';
            if (viewMode === 'alphabetical') {
                toggleViewBtn.querySelector('i').textContent = 'domain';
                toggleViewBtn.querySelector('span').textContent = 'Afdelingsweergave';
            } else {
                toggleViewBtn.querySelector('i').textContent = 'sort_by_alpha';
                toggleViewBtn.querySelector('span').textContent = 'Alfabetische weergave';
            }
            renderUsers();
        });
    }

    const sortUsersByRole = (users) => {
        return [...users].sort((a, b) => {
            const roleA = (a.role || '').toLowerCase() === 'beheerder' ? 0 : 1;
            const roleB = (b.role || '').toLowerCase() === 'beheerder' ? 0 : 1;
            if (roleA !== roleB) return roleA - roleB;
            return (a.full_name || '').localeCompare(b.full_name || '', 'nl', { sensitivity: 'base' });
        });
    };

    const renderUsers = () => {
        const container = document.getElementById('department-sections-container');
        if (!container) return;

        if (currentUsers.length === 0) {
            container.innerHTML = '<div class="table-container"><table class="users-table"><tbody><tr><td colspan="5" class="loading-cell">Geen gebruikers gevonden.</td></tr></tbody></table></div>';
            return;
        }

        if (viewMode === 'alphabetical') {
            const sortedAlphabetical = sortUsersByRole(currentUsers);

            const rowsHtml = sortedAlphabetical.map(u => {
                const isSelf = u.id === loggedInUserId;
                const formattedAfdeling = Array.isArray(u.afdeling) ? u.afdeling.join(', ') : (u.afdeling || '-');
                return `
                    <tr ${isSelf ? 'class="self-row"' : ''}>
                        <td data-label="Volledige Naam">${u.full_name || ''} ${isSelf ? '<strong>(Jij)</strong>' : ''}</td>
                        <td data-label="Personeelsnummer">${u.personeelsnummer || ''}</td>
                        <td data-label="Rol">${u.role || ''}</td>
                        <td data-label="Afdeling">${formattedAfdeling}</td>
                        <td data-label="Acties">
                            <div class="action-btns">
                                <button class="action-btn edit" data-id="${u.id}"><i class="material-icons">edit</i></button>
                                <button class="action-btn delete" data-id="${u.id}" ${isSelf ? 'disabled' : ''}><i class="material-icons">delete</i></button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            container.innerHTML = `
                <div class="table-container">
                    <table class="users-table">
                        <thead>
                            <tr>
                                <th>Volledige Naam</th>
                                <th>Personeelsnummer</th>
                                <th>Rol</th>
                                <th>Afdeling</th>
                                <th>Acties</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
            return;
        }

        const departmentMap = {};
        currentUsers.forEach(u => {
            let deptList = [];
            if (Array.isArray(u.afdeling)) {
                deptList = u.afdeling;
            } else if (typeof u.afdeling === 'string' && u.afdeling.trim()) {
                deptList = u.afdeling.split(',').map(s => s.trim()).filter(Boolean);
            }
            if (deptList.length === 0) {
                deptList = ['Overig'];
            }

            deptList.forEach(dept => {
                if (!departmentMap[dept]) {
                    departmentMap[dept] = [];
                }
                departmentMap[dept].push(u);
            });
        });

        const allDeptKeys = Array.from(new Set([...currentStoreDepartments, ...Object.keys(departmentMap)])).sort();

        container.innerHTML = allDeptKeys.map(deptName => {
            const deptUsers = sortUsersByRole(departmentMap[deptName] || []);
            const rowsHtml = deptUsers.length > 0 ? deptUsers.map(u => {
                const isSelf = u.id === loggedInUserId;
                const formattedAfdeling = Array.isArray(u.afdeling) ? u.afdeling.join(', ') : (u.afdeling || '-');
                return `
                    <tr ${isSelf ? 'class="self-row"' : ''}>
                        <td data-label="Volledige Naam">${u.full_name || ''} ${isSelf ? '<strong>(Jij)</strong>' : ''}</td>
                        <td data-label="Personeelsnummer">${u.personeelsnummer || ''}</td>
                        <td data-label="Rol">${u.role || ''}</td>
                        <td data-label="Afdeling">${formattedAfdeling}</td>
                        <td data-label="Acties">
                            <div class="action-btns">
                                <button class="action-btn edit" data-id="${u.id}"><i class="material-icons">edit</i></button>
                                <button class="action-btn delete" data-id="${u.id}" ${isSelf ? 'disabled' : ''}><i class="material-icons">delete</i></button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" class="loading-cell">Geen medewerkers in deze afdeling.</td></tr>';

            return `
                <div class="department-section">
                    <h3 class="department-title">
                        <i class="material-icons">storefront</i>
                        <span>${deptName}</span>
                    </h3>
                    <div class="table-container">
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>Volledige Naam</th>
                                    <th>Personeelsnummer</th>
                                    <th>Rol</th>
                                    <th>Afdeling</th>
                                    <th>Acties</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }).join('');
    };

    const loadUsers = async () => {
        if (!currentWinkelId) return;
        await loadStoreDepartments();
        renderDepartmentCheckboxes();

        const container = document.getElementById('department-sections-container');
        const { data: users, error } = await supabase
            .from('user_data')
            .select('id, full_name, role, personeelsnummer, afdeling')
            .eq('winkel', currentWinkelId);

        if (error || !users) {
            container.innerHTML = '<div class="table-container"><table class="users-table"><tbody><tr><td colspan="5" class="loading-cell">Fout bij het laden van gebruikers.</td></tr></tbody></table></div>';
            return;
        }

        currentUsers = sortUsersByRole(users);
        renderUsers();
    };

    loadUsers();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const full_name = fullNameInput.value.trim();
        const personeelsnummer = personeelsnummerInput.value.trim();
        const role = roleSelect.value;
        const selectedDepts = getSelectedAfdelingen();
        const afdeling = selectedDepts.join(', ');
        const password = passwordInput.value;

        if (!full_name || !personeelsnummer || !role || (!isEditing && !password)) {
            showMessage(messageBox, messageText, messageIcon, 'Vul alle verplichte velden in.', 'error');
            return;
        }

        await handleFormSubmit(submitBtn, 'Bezig met verwerken...', messageBox, async () => {
            let { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession || (currentSession.expires_at && currentSession.expires_at * 1000 < Date.now() + 60000)) {
                const { data: refreshed } = await supabase.auth.refreshSession();
                currentSession = refreshed?.session || currentSession;
            }
            const headers = currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {};

            let result;
            if (isEditing) {
                const updates = { full_name, role, personeelsnummer, afdeling };
                if (password) {
                    updates.password = password;
                }
                result = await supabase.functions.invoke('manage-user', {
                    body: { action: 'update', targetUserId: editingUserId, updates },
                    headers
                });
            } else {
                result = await supabase.functions.invoke('create-user', {
                    body: { full_name, role, personeelsnummer, password, afdeling },
                    headers
                });
            }

            const { data, error } = result;

            if (error) {
                console.error("Volledige Functions Fout:", error);
                if (error.context && typeof error.context.json === 'function') {
                    try {
                        const errorBody = await error.context.json();
                        console.log("Database Details:", errorBody);
                        showMessage(messageBox, messageText, messageIcon, `${errorBody.error || 'Er ging iets mis.'} ${errorBody.details || ''}`, 'error');
                    } catch (e) {
                        console.error("Kon fout-body niet parsen:", e);
                        showMessage(messageBox, messageText, messageIcon, "Er ging iets mis bij het verwerken van de gebruiker.", "error");
                    }
                } else {
                    showMessage(messageBox, messageText, messageIcon, error.message, 'error');
                }
            } else {
                console.log("Succes:", data);
                showMessage(messageBox, messageText, messageIcon, isEditing ? "Gebruiker succesvol aangepast!" : "Gebruiker succesvol aangemaakt!", "success");
                setTimeout(() => {
                    closeUserModal();
                    loadUsers();
                }, 1000);
            }
        });
    });

    const userModal = document.getElementById('userModal');
    const openModalBtn = document.getElementById('openModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');

    openModalBtn.addEventListener('click', () => {
        resetModalState();
        userModal.classList.add('open');
        messageBox.style.display = 'none';
    });

    const closeUserModal = setupModal(userModal, [closeModalBtn], resetModalState);

    openDeptModalBtn.addEventListener('click', async () => {
        await loadStoreDepartments();
        renderDeptListModal();
        deptModal.classList.add('open');
        deptMessageBox.style.display = 'none';
    });

    setupModal(deptModal, [closeDeptModalBtn], () => {
        addDeptForm.reset();
    });

    addDeptForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newDept = newDeptNameInput.value.trim();
        if (!newDept) return;

        if (currentStoreDepartments.some(d => d.toLowerCase() === newDept.toLowerCase())) {
            showMessage(deptMessageBox, deptMessageText, deptMessageIcon, 'Deze afdeling bestaat al.', 'error');
            return;
        }

        await handleFormSubmit(addDeptBtn, '...', deptMessageBox, async () => {
            const updated = [...currentStoreDepartments, newDept];
            const error = await saveStoreDepartments(updated);
            if (error) {
                showMessage(deptMessageBox, deptMessageText, deptMessageIcon, 'Fout bij opslaan van afdeling.', 'error');
            } else {
                showMessage(deptMessageBox, deptMessageText, deptMessageIcon, 'Afdeling succesvol toegevoegd!', 'success');
                newDeptNameInput.value = '';
            }
        });
    });

    deptListEl.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-dept-btn');
        if (!deleteBtn) return;
        const deptToDelete = deleteBtn.getAttribute('data-dept');
        if (!deptToDelete) return;

        await handleFormSubmit(deleteBtn, '...', deptMessageBox, async () => {
            const updated = currentStoreDepartments.filter(d => d !== deptToDelete);
            const error = await saveStoreDepartments(updated);
            if (error) {
                showMessage(deptMessageBox, deptMessageText, deptMessageIcon, 'Fout bij verwijderen van afdeling.', 'error');
            } else {
                showMessage(deptMessageBox, deptMessageText, deptMessageIcon, 'Afdeling succesvol verwijderd!', 'success');
            }
        });
    });

    const confirmModal = document.getElementById('confirmModal');
    const closeConfirmModalBtn = document.getElementById('closeConfirmModalBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const confirmUserName = document.getElementById('confirm-user-name');
    let userToDeleteId = null;

    const closeConfirmModal = setupModal(confirmModal, [closeConfirmModalBtn, cancelDeleteBtn], () => {
        userToDeleteId = null;
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        if (!userToDeleteId) return;
        await handleFormSubmit(confirmDeleteBtn, 'Verwijderen...', messageBox, async () => {
            let { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession || (currentSession.expires_at && currentSession.expires_at * 1000 < Date.now() + 60000)) {
                const { data: refreshed } = await supabase.auth.refreshSession();
                currentSession = refreshed?.session || currentSession;
            }
            const headers = currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {};

            const { data, error } = await supabase.functions.invoke('manage-user', {
                body: { action: 'delete', targetUserId: userToDeleteId },
                headers
            });

            if (error) {
                let errorMsg = error.message;
                if (error.context && typeof error.context.json === 'function') {
                    const errorBody = await error.context.json();
                    errorMsg = `${errorBody.error || ''} ${errorBody.details || ''}`;
                }
                showMessage(messageBox, messageText, messageIcon, `Fout: ${errorMsg}`, "error");
            } else {
                showMessage(messageBox, messageText, messageIcon, "Gebruiker succesvol verwijderd!", "success");
                loadUsers();
            }
            closeConfirmModal();
        });
    });

    const container = document.getElementById('department-sections-container');
    container.addEventListener('click', async (e) => {
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
            
            const userDepts = Array.isArray(user.afdeling)
                ? user.afdeling
                : (typeof user.afdeling === 'string' ? user.afdeling.split(',').map(s => s.trim()) : []);

            renderDepartmentCheckboxes(userDepts);

            passwordInput.value = '';
            passwordInput.removeAttribute('required');

            document.querySelector('.modal-header h2').textContent = 'Gebruiker Bewerken';
            submitBtn.querySelector('span').textContent = 'Opslaan';

            userModal.classList.add('open');
            messageBox.style.display = 'none';
        }
    });
});
