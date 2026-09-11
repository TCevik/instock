import { supabase, showModal, closeModal, showConfirmModal, showPromptModal, showToast, parseUserDisplay } from './main.js';
import { createDatePicker } from './datepicker.js';
import { createCustomSelect } from './select.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const ROLE_MAP = {
    1: 'Medewerker',
    2: 'Teamleider',
    3: 'Beheerder'
};

function formatDutchDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}-${month}-${year}`;
    }
    return dateStr;
}

function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

const PAGE_SIZE = 30;
let currentUsers = [];
let totalUsers = 0;
let currentPage = 1;
let currentRoleFilter = 'all';
let searchQuery = '';
let searchDebounceTimer = null;
let currentSortKey = 'name';
let currentSortDirection = 'asc';
let knownDepartments = new Set();

function getRoleLabel(role) {
    return ROLE_MAP[role] || String(role ?? 'Onbekend');
}

function parseUserDepartments(deptVal) {
    if (!deptVal) return [];
    if (Array.isArray(deptVal)) return deptVal.filter(Boolean);
    if (typeof deptVal === 'string') {
        try {
            const parsed = JSON.parse(deptVal);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch (_) {}
        return deptVal.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function renderDepartmentBadges(deptVal, maxVisible = 2, fallback = '-') {
    const depts = parseUserDepartments(deptVal);
    if (depts.length === 0) return fallback;
    const visible = depts.slice(0, maxVisible);
    const hiddenCount = depts.length - maxVisible;
    const badges = visible.map(d => `<span class="department-badge">${escapeHtml(d)}</span>`).join('');
    const more = hiddenCount > 0 ? `<span class="department-badge department-badge-more" title="${escapeHtml(depts.join(', '))}">+${hiddenCount}</span>` : '';
    return `<div class="departments-list">${badges}${more}</div>`;
}

async function loadDistinctDepartments() {
    const { data } = await supabase.from('user_data').select('departments');
    if (data) {
        data.forEach(u => {
            parseUserDepartments(u.departments).forEach(d => {
                if (d && String(d).trim()) {
                    knownDepartments.add(String(d).trim());
                }
            });
        });
    }
}

function getDistinctDepartments(extraDepts = []) {
    const set = new Set(knownDepartments);
    currentUsers.forEach(u => {
        const depts = parseUserDepartments(u.departments);
        depts.forEach(d => {
            if (d && String(d).trim()) {
                set.add(String(d).trim());
            }
        });
    });
    const extraArr = Array.isArray(extraDepts) ? extraDepts : (extraDepts ? [extraDepts] : []);
    extraArr.forEach(d => {
        if (d && String(d).trim()) {
            set.add(String(d).trim());
        }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getDepartmentOptions(selectedDepts = []) {
    const list = getDistinctDepartments(selectedDepts);
    return list.map(dept => ({
        value: dept,
        label: dept
    }));
}

async function promptNewDepartment(selectInstance) {
    const newDept = await showPromptModal({
        title: 'Nieuwe afdeling toevoegen',
        subtitle: 'Voer de naam van de nieuwe afdeling in',
        placeholder: 'Bijv. Kassa, Vulploeg, Bakkerij...',
        confirmText: 'Toevoegen',
        cancelText: 'Annuleren'
    });
    if (!newDept || !newDept.trim()) return;
    const cleanDept = newDept.trim();
    knownDepartments.add(cleanDept);
    const currentSelected = selectInstance.getValue();
    const nextSelected = Array.isArray(currentSelected) 
        ? (currentSelected.includes(cleanDept) ? currentSelected : [...currentSelected, cleanDept])
        : [cleanDept];
    const updatedOptions = getDepartmentOptions(nextSelected);
    selectInstance.setOptions(updatedOptions, nextSelected);
}

async function invokeUserManagement(action, payload) {
    const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action, ...payload }
    });

    if (error) {
        let msg = error.message || 'Er is een fout opgetreden';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const body = await error.context.json();
                if (body && body.error) msg = body.error;
            } catch (_) {}
        } else if (error.context && typeof error.context.text === 'function') {
            try {
                const text = await error.context.text();
                const parsed = JSON.parse(text);
                if (parsed && parsed.error) msg = parsed.error;
            } catch (_) {}
        }
        throw new Error(msg);
    }

    if (data && data.error) {
        throw new Error(data.error);
    }

    return data;
}

async function openCreateModal() {
    await loadDistinctDepartments();
    await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Nieuwe gebruiker</h2>
            <p class="modal-subtitle">Voeg een nieuwe gebruiker toe</p>
        </div>
        <form class="modal-form" id="createUserForm">
            <div class="form-group">
                <label for="createFullName">Volledige naam</label>
                <input type="text" id="createFullName" class="modal-input" placeholder="Bijv. Jan de Vries" required>
            </div>
            <div class="form-group">
                <label for="createUsername">Gebruikersnaam</label>
                <input type="text" id="createUsername" class="modal-input" placeholder="Bijv. jandevries" required>
            </div>
            <div class="form-group">
                <label>Afdelingen</label>
                <div id="createDepartmentSelect"></div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label>Rol</label>
                    <div id="createRoleSelect"></div>
                </div>
                <div class="form-group">
                    <label>Geboortedatum</label>
                    <div id="createBirthdayPicker"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="createPassword">Wachtwoord</label>
                <input type="password" id="createPassword" class="modal-input" placeholder="Wachtwoord" required minlength="6">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="cancelCreateModalBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveCreateBtn">Aanmaken</button>
            </div>
        </form>
    `);

    const roleContainer = document.getElementById('createRoleSelect');
    let roleSelect = null;
    if (roleContainer) {
        roleSelect = createCustomSelect(roleContainer, [
            { value: '1', label: 'Medewerker' },
            { value: '2', label: 'Teamleider' },
            { value: '3', label: 'Beheerder' }
        ], '1');
    }

    const deptContainer = document.getElementById('createDepartmentSelect');
    let deptSelect = null;
    if (deptContainer) {
        deptSelect = createCustomSelect(
            deptContainer,
            getDepartmentOptions([]),
            [],
            'Selecteer afdelingen...',
            null,
            {
                label: 'Nieuwe afdeling toevoegen...',
                icon: 'add',
                onClick: () => promptNewDepartment(deptSelect)
            },
            true
        );
    }

    const datePickerContainer = document.getElementById('createBirthdayPicker');
    let birthdayPicker = null;
    if (datePickerContainer) {
        birthdayPicker = createDatePicker(datePickerContainer, '');
    }

    const cancelBtn = document.getElementById('cancelCreateModalBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    const form = document.getElementById('createUserForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('saveCreateBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Aanmaken...';
            }

            const fullName = document.getElementById('createFullName')?.value.trim();
            const username = document.getElementById('createUsername')?.value.trim().toLowerCase();
            const password = document.getElementById('createPassword')?.value;
            const role = roleSelect ? Number(roleSelect.getValue()) : 1;
            const birthday = birthdayPicker ? birthdayPicker.getValue() : null;
            const departments = deptSelect ? deptSelect.getValue() : [];

            try {
                await invokeUserManagement('create', {
                    full_name: fullName,
                    username,
                    password,
                    role,
                    birthday: birthday || null,
                    departments: departments.length > 0 ? departments : null
                });
                closeModal();
                showToast('notification', 'Gebruiker succesvol aangemaakt');
                await loadUsers();
            } catch (err) {
                showToast('error', err.message || 'Fout bij aanmaken van gebruiker');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Aanmaken';
                }
            }
        });
    }
}

async function openEditModal(userId) {
    await loadDistinctDepartments();
    let user = currentUsers.find(u => String(u.user_id) === String(userId));
    if (!user) {
        const { data } = await supabase
            .from('user_data')
            .select('user_id, full_name, username, role, departments, birthday, productivity, last_sign_in_at')
            .eq('user_id', userId)
            .maybeSingle();
        user = data;
    }
    if (!user) return;

    const fullName = escapeHtml(user.full_name || '');
    const username = escapeHtml(user.username || '');
    const birthday = user.birthday || '';
    const userRole = Number(user.role) || 1;
    const userDepartments = parseUserDepartments(user.departments);

    await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Gebruiker bewerken</h2>
            <p class="modal-subtitle">Pas de gegevens van de gebruiker aan</p>
        </div>
        <form class="modal-form" id="editUserForm">
            <div class="form-group">
                <label for="editFullName">Volledige naam</label>
                <input type="text" id="editFullName" class="modal-input" value="${fullName}">
            </div>
            <div class="form-group">
                <label for="editUsername">Gebruikersnaam</label>
                <input type="text" id="editUsername" class="modal-input" value="${username}" required>
            </div>
            <div class="form-group">
                <label>Afdelingen</label>
                <div id="editDepartmentSelect"></div>
            </div>
            <div class="modal-form-row">
                <div class="form-group">
                    <label>Rol</label>
                    <div id="editRoleSelect"></div>
                </div>
                <div class="form-group">
                    <label>Geboortedatum</label>
                    <div id="editBirthdayPicker"></div>
                </div>
            </div>
            <div class="form-group">
                <label for="editPassword">Wachtwoord</label>
                <input type="password" id="editPassword" class="modal-input" placeholder="Laat leeg om niet te wijzigen">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-danger" id="deleteUserBtn">
                    <span class="material-icons">delete</span>
                    <span>Verwijderen</span>
                </button>
                <button type="button" class="modal-btn-secondary" id="cancelEditModalBtn">Annuleren</button>
                <button type="submit" class="btn" id="saveEditBtn">Opslaan</button>
            </div>
        </form>
    `);

    const roleContainer = document.getElementById('editRoleSelect');
    let roleSelect = null;
    if (roleContainer) {
        roleSelect = createCustomSelect(roleContainer, [
            { value: '1', label: 'Medewerker' },
            { value: '2', label: 'Teamleider' },
            { value: '3', label: 'Beheerder' }
        ], String(userRole));
    }

    const deptContainer = document.getElementById('editDepartmentSelect');
    let deptSelect = null;
    if (deptContainer) {
        deptSelect = createCustomSelect(
            deptContainer,
            getDepartmentOptions(userDepartments),
            userDepartments,
            'Selecteer afdelingen...',
            null,
            {
                label: 'Nieuwe afdeling toevoegen...',
                icon: 'add',
                onClick: () => promptNewDepartment(deptSelect)
            },
            true
        );
    }

    const datePickerContainer = document.getElementById('editBirthdayPicker');
    let birthdayPicker = null;
    if (datePickerContainer) {
        birthdayPicker = createDatePicker(datePickerContainer, birthday);
    }

    const cancelBtn = document.getElementById('cancelEditModalBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    const deleteBtn = document.getElementById('deleteUserBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const userName = user.full_name || user.username || 'deze gebruiker';
            const confirmed = await showConfirmModal({
                title: 'Gebruiker verwijderen',
                message: `Weet je zeker dat je ${escapeHtml(userName)} wilt verwijderen?`,
                confirmText: 'Verwijderen',
                cancelText: 'Annuleren',
                isDanger: true
            });

            if (!confirmed) return;

            try {
                await invokeUserManagement('delete', { user_id: userId });
                closeModal();
                showToast('notification', 'Gebruiker succesvol verwijderd');
                await loadUsers();
            } catch (err) {
                showToast('error', err.message || 'Fout bij verwijderen van gebruiker');
            }
        });
    }

    const form = document.getElementById('editUserForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('saveEditBtn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Opslaan...';
            }

            const newFullName = document.getElementById('editFullName')?.value.trim();
            const newUsername = document.getElementById('editUsername')?.value.trim().toLowerCase();
            const newPassword = document.getElementById('editPassword')?.value;
            const newRole = roleSelect ? Number(roleSelect.getValue()) : userRole;
            const newBirthday = birthdayPicker ? birthdayPicker.getValue() : null;
            const newDepartments = deptSelect ? deptSelect.getValue() : [];

            const payload = {
                user_id: userId,
                full_name: newFullName,
                username: newUsername,
                role: newRole,
                birthday: newBirthday || null,
                departments: newDepartments.length > 0 ? newDepartments : null
            };

            if (newPassword) {
                payload.password = newPassword;
            }

            try {
                await invokeUserManagement('update', payload);
                closeModal();
                showToast('notification', 'Gebruiker succesvol bijgewerkt');
                await loadUsers();
            } catch (err) {
                showToast('error', err.message || 'Fout bij bijwerken van gebruiker');
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Opslaan';
                }
            }
        });
    }
}

function updateSortIcons() {
    const sortKeys = ['name', 'username', 'role', 'departments', 'birthday', 'last_sign_in_at'];
    sortKeys.forEach(key => {
        const icon = document.getElementById(`sortIcon_${key}`);
        if (!icon) return;

        if (currentSortKey === key) {
            icon.textContent = currentSortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward';
            icon.style.opacity = '1';
        } else {
            icon.textContent = 'unfold_more';
            icon.style.opacity = '0.35';
        }
    });
}

function getDbSortColumn(sortKey) {
    if (sortKey === 'name') return 'full_name';
    return sortKey;
}

async function loadUsers() {
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('user_data')
        .select('user_id, full_name, username, role, departments, birthday, last_sign_in_at', { count: 'exact' });

    if (currentRoleFilter && currentRoleFilter !== 'all') {
        query = query.eq('role', Number(currentRoleFilter));
    }

    const q = searchQuery.trim();
    if (q) {
        query = query.or(`full_name.ilike.%${q}%,username.ilike.%${q}%`);
    }

    const sortCol = getDbSortColumn(currentSortKey);
    query = query
        .order(sortCol, { ascending: currentSortDirection === 'asc', nullsFirst: false })
        .range(from, to);

    const { data: users, count, error } = await query;

    if (!error && users) {
        currentUsers = users;
        totalUsers = count ?? 0;
    } else {
        currentUsers = [];
        totalUsers = 0;
    }

    updateSortIcons();
    renderTable();
}


function renderTable() {
    const tbody = document.getElementById('usersTableBody');
    const cardsContainer = document.getElementById('usersCardsContainer');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationCurrent = document.getElementById('paginationCurrent');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!tbody) return;

    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + currentUsers.length, totalUsers);

    if (currentUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">Geen gebruikers gevonden</td>
            </tr>
        `;
        if (cardsContainer) {
            cardsContainer.innerHTML = `<div class="empty-state">Geen gebruikers gevonden</div>`;
        }
    } else {
        tbody.innerHTML = currentUsers.map(user => {
            const parsed = parseUserDisplay(user.full_name, user.username);
            const displayName = escapeHtml(parsed.title || '-');
            const username = escapeHtml(parsed.sub || '-');
            const role = escapeHtml(getRoleLabel(user.role));
            const departmentsHtml = renderDepartmentBadges(user.departments, 2, '-');
            const birthday = escapeHtml(formatDutchDate(user.birthday));
            const lastSignIn = escapeHtml(formatDateTime(user.last_sign_in_at));

            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar-sm">
                                <span class="material-icons">person</span>
                            </div>
                            <span class="user-full-name">${displayName}</span>
                        </div>
                    </td>
                    <td class="username-cell">${username}</td>
                    <td><span class="role-badge">${role}</span></td>
                    <td>${departmentsHtml}</td>
                    <td>${birthday}</td>
                    <td class="time-cell">${lastSignIn}</td>
                    <td class="td-actions">
                        <button type="button" class="action-btn edit-btn" data-user-id="${escapeHtml(user.user_id)}" title="Gebruiker Bewerken - Gegevens en rechten aanpassen">
                            <span class="material-icons">edit</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (cardsContainer) {
            cardsContainer.innerHTML = currentUsers.map(user => {
                const parsed = parseUserDisplay(user.full_name, user.username);
                const displayName = escapeHtml(parsed.title || parsed.sub || 'Gebruiker');
                const username = escapeHtml(parsed.title && parsed.sub ? parsed.sub : '');
                const role = escapeHtml(getRoleLabel(user.role));
                const departmentsHtml = renderDepartmentBadges(user.departments, 3, '');
                const birthday = escapeHtml(formatDutchDate(user.birthday));
                const hasBirthday = user.birthday && birthday !== '-';

                return `
                    <div class="user-list-item edit-btn" data-user-id="${escapeHtml(user.user_id)}">
                        <div class="user-avatar-sm">
                            <span class="material-icons">person</span>
                        </div>
                        <div class="user-list-content">
                            <div class="user-list-top">
                                <span class="user-full-name">${displayName}</span>
                                <span class="role-badge">${role}</span>
                            </div>
                            <div class="user-list-sub">
                                ${username ? `<span class="username-cell">${username}</span>` : ''}
                                ${hasBirthday ? `<span class="user-meta-dot">•</span><span class="user-meta-item"><span class="material-icons meta-icon">cake</span>${birthday}</span>` : ''}
                            </div>
                            ${departmentsHtml}
                        </div>
                        <span class="material-icons user-list-chevron">chevron_right</span>
                    </div>
                `;
            }).join('');
        }
    }

    if (paginationInfo) {
        if (totalUsers === 0) {
            paginationInfo.textContent = '0 gebruikers';
        } else {
            paginationInfo.textContent = `${startIndex + 1}-${endIndex} van ${totalUsers} gebruikers`;
        }
    }

    if (paginationCurrent) {
        paginationCurrent.textContent = `Pagina ${currentPage} van ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

const roleFilterContainer = document.getElementById('roleFilterContainer');
if (roleFilterContainer) {
    createCustomSelect(roleFilterContainer, [
        { value: 'all', label: 'Alle rollen' },
        { value: '1', label: 'Medewerker' },
        { value: '2', label: 'Teamleider' },
        { value: '3', label: 'Beheerder' }
    ], 'all', 'Filter op rol', (val) => {
        currentRoleFilter = val;
        currentPage = 1;
        loadUsers();
    });
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            currentPage = 1;
            loadUsers();
        }, 300);
    });
}

document.querySelectorAll('.th-sortable').forEach(th => {
    th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (!key) return;

        if (currentSortKey === key) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortKey = key;
            currentSortDirection = 'asc';
        }
        currentPage = 1;
        loadUsers();
    });
});

const createUserBtn = document.getElementById('createUserBtn');
if (createUserBtn) {
    createUserBtn.addEventListener('click', () => {
        openCreateModal();
    });
}

const prevPageBtn = document.getElementById('prevPageBtn');
if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadUsers();
        }
    });
}

const nextPageBtn = document.getElementById('nextPageBtn');
if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            loadUsers();
        }
    });
}

const usersTableBody = document.getElementById('usersTableBody');
if (usersTableBody) {
    usersTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const userId = editBtn.getAttribute('data-user-id');
            if (userId) {
                openEditModal(userId);
            }
        }
    });
}

const usersCardsContainer = document.getElementById('usersCardsContainer');
if (usersCardsContainer) {
    usersCardsContainer.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-btn');
        if (editBtn) {
            const userId = editBtn.getAttribute('data-user-id');
            if (userId) {
                openEditModal(userId);
            }
        }
    });
}

loadUsers();

