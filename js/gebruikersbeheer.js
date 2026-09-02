import { supabase } from './main.js';

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

const PAGE_SIZE = 30;
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;

function getRoleLabel(role) {
    return ROLE_MAP[role] || String(role ?? 'Onbekend');
}

function renderTable() {
    const tbody = document.getElementById('usersTableBody');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationCurrent = document.getElementById('paginationCurrent');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!tbody) return;

    const totalUsers = filteredUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, totalUsers);
    const pageUsers = filteredUsers.slice(startIndex, endIndex);

    if (pageUsers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">Geen gebruikers gevonden</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageUsers.map(user => {
            const displayName = escapeHtml(user.full_name?.trim() || user.username?.trim() || 'Gebruiker');
            const username = escapeHtml(user.username ? `@${user.username}` : '-');
            const role = escapeHtml(getRoleLabel(user.role));
            const birthday = escapeHtml(formatDutchDate(user.birthday));
            const productivity = user.productivity !== null && user.productivity !== undefined ? escapeHtml(String(user.productivity)) : '-';

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
                    <td>${birthday}</td>
                    <td>${productivity}</td>
                    <td class="td-actions">
                        <button type="button" class="action-btn edit-btn" data-user-id="${escapeHtml(user.user_id)}" title="Bewerken">
                            <span class="material-icons">edit</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
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

function filterUsers(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
        filteredUsers = [...allUsers];
    } else {
        filteredUsers = allUsers.filter(user => {
            const name = (user.full_name || '').toLowerCase();
            const username = (user.username || '').toLowerCase();
            const role = getRoleLabel(user.role).toLowerCase();
            return name.includes(q) || username.includes(q) || role.includes(q);
        });
    }
    currentPage = 1;
    renderTable();
}

async function loadUsers() {
    const { data: users, error } = await supabase
        .from('user_data')
        .select('user_id, full_name, username, role, birthday, productivity')
        .order('full_name', { ascending: true });

    if (error || !users) return;

    allUsers = users;
    filteredUsers = [...allUsers];
    renderTable();
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        filterUsers(e.target.value);
    });
}

const prevPageBtn = document.getElementById('prevPageBtn');
if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
}

const nextPageBtn = document.getElementById('nextPageBtn');
if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
}

loadUsers();
