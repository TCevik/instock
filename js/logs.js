import { supabase, showModal, closeModal } from './main.js';
import { createCustomSelect } from './select.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
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

const PAGE_SIZE = 50;
let allLogs = [];
let usersMap = new Map();
let filteredLogs = [];
let currentPage = 1;
let sortAscending = false;
let currentActionFilter = 'all';
let searchQuery = '';

function getLogTime(log) {
    const raw = log.happened_at || log.created_at;
    if (!raw) return 0;
    return new Date(raw).getTime();
}

function renderTable() {
    const tbody = document.getElementById('logsTableBody');
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationCurrent = document.getElementById('paginationCurrent');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (!tbody) return;

    const totalLogs = filteredLogs.length;
    const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, totalLogs);
    const pageLogs = filteredLogs.slice(startIndex, endIndex);

    if (pageLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">Geen logs gevonden</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageLogs.map((log, idx) => {
            const user = usersMap.get(log.user_id);
            const fullName = user?.full_name?.trim();
            const username = user?.username ? `@${user.username}` : '';
            const displayName = fullName || username || (log.user_id ? 'Onbekende gebruiker' : 'Systeem');
            const subName = fullName && username ? username : '';

            const action = log.action || 'Onbekende actie';
            const isDanger = action.toLowerCase().includes('verwijderd');
            const timeStr = formatDateTime(log.happened_at || log.created_at);
            const globalIndex = startIndex + idx;

            return `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar-sm">
                                <span class="material-icons">person</span>
                            </div>
                            <div class="user-info-stacked">
                                <span class="user-full-name">${escapeHtml(displayName)}</span>
                                ${subName ? `<span class="user-subname">${escapeHtml(subName)}</span>` : ''}
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="action-badge ${isDanger ? 'danger' : ''}">${escapeHtml(action)}</span>
                    </td>
                    <td class="time-cell">${escapeHtml(timeStr)}</td>
                    <td class="td-actions">
                        <button type="button" class="action-btn view-details-btn" data-index="${globalIndex}" title="Details bekijken">
                            <span class="material-icons">visibility</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    if (paginationInfo) {
        if (totalLogs === 0) {
            paginationInfo.textContent = '0 logs';
        } else {
            paginationInfo.textContent = `${startIndex + 1}-${endIndex} van ${totalLogs} logs`;
        }
    }

    if (paginationCurrent) {
        paginationCurrent.textContent = `Pagina ${currentPage} van ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function applyFiltersAndSort() {
    let result = [...allLogs];

    if (currentActionFilter && currentActionFilter !== 'all') {
        result = result.filter(log => String(log.action || '').trim().toLowerCase() === currentActionFilter.toLowerCase());
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
        result = result.filter(log => {
            const user = usersMap.get(log.user_id);
            const name = (user?.full_name || '').toLowerCase();
            const uname = (user?.username || '').toLowerCase();
            return name.includes(q) || uname.includes(q);
        });
    }

    result.sort((a, b) => {
        const timeA = getLogTime(a);
        const timeB = getLogTime(b);
        return sortAscending ? timeA - timeB : timeB - timeA;
    });

    filteredLogs = result;
    currentPage = 1;
    renderTable();
}

function openDetailsModal(log) {
    const user = usersMap.get(log.user_id);
    const fullName = user?.full_name?.trim();
    const username = user?.username ? `@${user.username}` : '';
    const displayName = fullName || username || (log.user_id ? 'Onbekende gebruiker' : 'Systeem');
    const timeStr = formatDateTime(log.happened_at || log.created_at);
    const action = log.action || 'Onbekende actie';

    let detailsHtml = '';
    const oldVal = log.old_value;
    const newVal = log.new_value;

    const allKeys = new Set([
        ...(oldVal && typeof oldVal === 'object' ? Object.keys(oldVal) : []),
        ...(newVal && typeof newVal === 'object' ? Object.keys(newVal) : [])
    ]);

    if (allKeys.size === 0) {
        if (oldVal !== null && oldVal !== undefined) {
            detailsHtml += `
                <div class="log-detail-item">
                    <span class="log-detail-label">Oude waarde</span>
                    <span class="log-detail-single">${escapeHtml(typeof oldVal === 'object' ? JSON.stringify(oldVal, null, 2) : String(oldVal))}</span>
                </div>
            `;
        }
        if (newVal !== null && newVal !== undefined) {
            detailsHtml += `
                <div class="log-detail-item">
                    <span class="log-detail-label">Nieuwe waarde</span>
                    <span class="log-detail-single">${escapeHtml(typeof newVal === 'object' ? JSON.stringify(newVal, null, 2) : String(newVal))}</span>
                </div>
            `;
        }
    } else {
        allKeys.forEach(key => {
            const oldField = oldVal ? oldVal[key] : null;
            const newField = newVal ? newVal[key] : null;

            const formatVal = (v) => {
                if (v === null || v === undefined) return '-';
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
            };

            detailsHtml += `
                <div class="log-detail-item">
                    <span class="log-detail-label">${escapeHtml(key)}</span>
                    <div class="log-detail-diff">
                        ${oldField !== null && oldField !== undefined ? `<div class="log-detail-old"><span class="material-icons" style="font-size:14px;vertical-align:middle;">remove</span> ${escapeHtml(formatVal(oldField))}</div>` : ''}
                        ${newField !== null && newField !== undefined ? `<div class="log-detail-new"><span class="material-icons" style="font-size:14px;vertical-align:middle;">add</span> ${escapeHtml(formatVal(newField))}</div>` : ''}
                    </div>
                </div>
            `;
        });
    }

    if (!detailsHtml) {
        detailsHtml = `<div class="empty-state" style="padding: 20px 0;">Geen detailgegevens beschikbaar voor deze actie.</div>`;
    }

    showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Log details</h2>
            <p class="modal-subtitle">${escapeHtml(displayName)} • ${escapeHtml(timeStr)}</p>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label>Actie</label>
                <div><span class="action-badge">${escapeHtml(action)}</span></div>
            </div>
            <div class="form-group">
                <label>Wijzigingen / Gegevens</label>
                <div class="log-details-list">
                    ${detailsHtml}
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="modal-btn-secondary" id="closeDetailsModalBtn">Sluiten</button>
        </div>
    `);

    const closeBtn = document.getElementById('closeDetailsModalBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
}

async function loadData() {
    const [logsRes, usersRes] = await Promise.all([
        supabase.from('logs').select('*').order('happened_at', { ascending: false }),
        supabase.from('user_data').select('user_id, full_name, username')
    ]);

    if (usersRes.data) {
        usersMap = new Map(usersRes.data.map(u => [u.user_id, u]));
    }

    if (logsRes.data) {
        allLogs = logsRes.data;

        const uniqueActions = Array.from(new Set(allLogs.map(l => l.action).filter(Boolean))).sort();
        const actionFilterContainer = document.getElementById('actionFilterContainer');
        if (actionFilterContainer) {
            const selectOptions = [
                { value: 'all', label: 'Alle acties' },
                ...uniqueActions.map(act => ({ value: act, label: act }))
            ];
            createCustomSelect(actionFilterContainer, selectOptions, 'all', 'Filter op actie', (val) => {
                currentActionFilter = val;
                applyFiltersAndSort();
            });
        }
    }

    applyFiltersAndSort();
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        applyFiltersAndSort();
    });
}

const thTime = document.getElementById('thTime');
const sortTimeIcon = document.getElementById('sortTimeIcon');
if (thTime) {
    thTime.addEventListener('click', () => {
        sortAscending = !sortAscending;
        if (sortTimeIcon) {
            sortTimeIcon.textContent = sortAscending ? 'arrow_upward' : 'arrow_downward';
        }
        applyFiltersAndSort();
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
        const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
        }
    });
}

const logsTableBody = document.getElementById('logsTableBody');
if (logsTableBody) {
    logsTableBody.addEventListener('click', (e) => {
        const viewBtn = e.target.closest('.view-details-btn');
        if (viewBtn) {
            const index = Number(viewBtn.getAttribute('data-index'));
            const log = filteredLogs[index];
            if (log) {
                openDetailsModal(log);
            }
        }
    });
}

loadData();
