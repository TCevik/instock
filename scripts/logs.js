import { checkAuth, getSupabase, setupModal } from './main.js';
import { loadHeader } from './header.js';

const PAGE_SIZE = 50;
let currentPage = 0;
let totalPages = 1;
let currentLogs = [];
let storeId = null;

function parseJsonSafe(val) {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch {
        return val;
    }
}

function getLogAction(oldVal, newVal) {
    if (!oldVal && newVal) {
        return { key: 'create', label: 'Aangemaakt', badgeClass: 'badge-success', icon: 'add_circle' };
    }
    if (oldVal && !newVal) {
        return { key: 'delete', label: 'Verwijderd', badgeClass: 'badge-danger', icon: 'delete' };
    }
    return { key: 'update', label: 'Bijgewerkt', badgeClass: 'badge-warning', icon: 'edit' };
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('nl-NL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

async function loadTypes(supabase) {
    const typeFilter = document.getElementById('log-type-filter');
    if (!typeFilter || !storeId) return;

    const { data } = await supabase
        .from('logs')
        .select('type')
        .eq('store_id', storeId);

    const types = [...new Set((data || []).map(r => r.type).filter(Boolean))].sort();
    typeFilter.innerHTML = '<option value="">Alle types</option>';
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        typeFilter.appendChild(opt);
    });
}

function updatePaginationControls() {
    const pageJumpInput = document.getElementById('page-jump-input');
    const pageTotalLabel = document.getElementById('page-total-label');
    const firstPageBtn = document.getElementById('first-page-btn');
    const prev10PageBtn = document.getElementById('prev10-page-btn');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const next10PageBtn = document.getElementById('next10-page-btn');
    const lastPageBtn = document.getElementById('last-page-btn');

    if (pageJumpInput) {
        pageJumpInput.value = currentPage + 1;
        pageJumpInput.max = totalPages;
    }
    if (pageTotalLabel) {
        pageTotalLabel.textContent = `van ${totalPages || 1}`;
    }
    if (firstPageBtn) firstPageBtn.disabled = currentPage === 0;
    if (prev10PageBtn) prev10PageBtn.disabled = currentPage < 10;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 0;
    if (nextPageBtn) nextPageBtn.disabled = (currentPage + 1) >= totalPages;
    if (next10PageBtn) next10PageBtn.disabled = (currentPage + 10) >= totalPages;
    if (lastPageBtn) lastPageBtn.disabled = (currentPage + 1) >= totalPages;
}

function goToPage(pageIndex) {
    const target = Math.max(0, Math.min(pageIndex, totalPages - 1));
    if (target !== currentPage) {
        currentPage = target;
        loadLogs();
    }
}

function getDifferences(oldVal, newVal) {
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) return null;

    if (typeof oldVal !== 'object' || typeof newVal !== 'object' || oldVal === null || newVal === null) {
        return { old: oldVal, new: newVal };
    }

    // Als het arrays zijn (zoals dagen of productlijsten), vergelijk ze op index of zoek naar objecten met een unieke sleutel (zoals ceNr of category)
    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
        const diffArrayOld = [];
        const diffArrayNew = [];
        let hasArrayChanges = false;

        const maxLen = Math.max(oldVal.length, newVal.length);
        for (let i = 0; i < maxLen; i++) {
            const oItem = oldVal[i];
            const nItem = newVal[i];

            if (JSON.stringify(oItem) !== JSON.stringify(nItem)) {
                // Probeer te kijken of het producten zijn op basis van ceNr of category
                if (oItem && nItem && typeof oItem === 'object' && typeof nItem === 'object') {
                    const identifier = oItem.ceNr || oItem.category || i;
                    const subDiff = getDifferences(oItem, nItem);
                    if (subDiff) {
                        diffArrayOld.push({ index: identifier, ...subDiff.old });
                        diffArrayNew.push({ index: identifier, ...subDiff.new });
                        hasArrayChanges = true;
                        continue;
                    }
                }
                diffArrayOld.push(oItem !== undefined ? oItem : null);
                diffArrayNew.push(nItem !== undefined ? nItem : null);
                hasArrayChanges = true;
            }
        }
        return hasArrayChanges ? { old: diffArrayOld, new: diffArrayNew } : null;
    }

    const diffOld = {};
    const diffNew = {};
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(oldVal || {}), ...Object.keys(newVal || {})]);

    allKeys.forEach(key => {
        const o = oldVal[key];
        const n = newVal[key];

        if (JSON.stringify(o) !== JSON.stringify(n)) {
            if (typeof o === 'object' && typeof n === 'object' && o !== null && n !== null) {
                const nested = getDifferences(o, n);
                if (nested) {
                    diffOld[key] = nested.old;
                    diffNew[key] = nested.new;
                    hasChanges = true;
                }
            } else {
                diffOld[key] = o;
                diffNew[key] = n;
                hasChanges = true;
            }
        }
    });

    return hasChanges ? { old: diffOld, new: diffNew } : null;
}
function openLogModal(log) {
    const modal = document.getElementById('logDetailsModal');
    const title = document.getElementById('modal-log-title');
    const content = document.getElementById('modal-log-content');
    if (!modal || !content) return;

    const action = getLogAction(log.old_value_parsed, log.new_value_parsed);
    const userName = log.user_data?.full_name || 'Onbekende gebruiker';
    const logType = log.type || 'Onbekend';

    if (title) {
        title.textContent = `Details (${action.label} - ${logType})`;
    }

    let displayOld = log.old_value_parsed;
    let displayNew = log.new_value_parsed;

    if (displayOld && displayNew) {
        const diffs = getDifferences(displayOld, displayNew);
        if (diffs) {
            displayOld = diffs.old;
            displayNew = diffs.new;
        }
    }

    const oldFormatted = displayOld ? JSON.stringify(displayOld, null, 2) : null;
    const newFormatted = displayNew ? JSON.stringify(displayNew, null, 2) : null;

    let modalHtml = `
        <div class="log-diff-container">
            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 8px;">
                <span class="badge ${action.badgeClass}"><i class="material-icons" style="font-size:14px;">${action.icon}</i> ${action.label}</span>
                <span class="badge badge-type">${logType}</span>
                <span style="color: var(--text-color-muted); font-size: 13px;">${formatDate(log.time)} door <strong>${userName}</strong></span>
            </div>
    `;

    if (oldFormatted && newFormatted) {
        modalHtml += `
            <div class="log-diff-grid">
                <div class="json-box-wrapper">
                    <div class="json-box-title">Oude waarden</div>
                    <pre class="json-viewer-box">${oldFormatted}</pre>
                </div>
                <div class="json-box-wrapper">
                    <div class="json-box-title">Nieuwe waarden</div>
                    <pre class="json-viewer-box">${newFormatted}</pre>
                </div>
            </div>
        `;
    } else if (newFormatted) {
        modalHtml += `
            <div class="json-box-wrapper">
                <div class="json-box-title">Nieuwe gegevens</div>
                <pre class="json-viewer-box">${newFormatted}</pre>
            </div>
        `;
    } else if (oldFormatted) {
        modalHtml += `
            <div class="json-box-wrapper">
                <div class="json-box-title">Verwijderde gegevens</div>
                <pre class="json-viewer-box">${oldFormatted}</pre>
            </div>
        `;
    } else {
        modalHtml += `<p style="color: var(--text-color-muted);">Geen JSON data beschikbaar.</p>`;
    }

    modalHtml += `</div>`;
    content.innerHTML = modalHtml;
    modal.classList.add('open');
}

function renderLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;

    if (currentLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Geen logs gevonden die voldoen aan de filters.</td></tr>';
        return;
    }

    tbody.innerHTML = currentLogs.map(log => {
        const action = getLogAction(log.old_value_parsed, log.new_value_parsed);
        const userName = log.user_data?.full_name || 'Onbekend';
        const typeLabel = log.type ? (log.type.charAt(0).toUpperCase() + log.type.slice(1)) : '-';

        return `
            <tr>
                <td data-label="Datum & Tijd">${formatDate(log.time)}</td>
                <td data-label="Gebruiker">${userName}</td>
                <td data-label="Actie">
                    <span class="badge ${action.badgeClass}">
                        <i class="material-icons" style="font-size: 14px;">${action.icon}</i>
                        ${action.label}
                    </span>
                </td>
                <td data-label="Type">
                    <span class="badge badge-type">${typeLabel}</span>
                </td>
                <td data-label="Details">
                    <button class="details-btn" data-log-id="${log.id}">
                        <i class="material-icons" style="font-size: 16px;">visibility</i>
                        <span>Details bekijken</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadLogs() {
    const tbody = document.getElementById('logs-table-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Logs laden...</td></tr>';
    }

    const typeFilter = document.getElementById('log-type-filter')?.value || '';
    const actionFilter = document.getElementById('log-action-filter')?.value || '';
    const searchFilter = document.getElementById('log-search-input')?.value.trim() || '';

    const supabase = await getSupabase();
    const selectStr = searchFilter ? '*, user_data!inner(full_name)' : '*, user_data(full_name)';

    let query = supabase
        .from('logs')
        .select(selectStr, { count: 'exact' })
        .eq('store_id', storeId);

    if (typeFilter) {
        query = query.eq('type', typeFilter);
    }

    if (actionFilter === 'create') {
        query = query.is('old_value', null).not('new_value', 'is', null);
    } else if (actionFilter === 'delete') {
        query = query.not('old_value', 'is', null).is('new_value', null);
    } else if (actionFilter === 'update') {
        query = query.not('old_value', 'is', null).not('new_value', 'is', null);
    }

    if (searchFilter) {
        query = query.ilike('user_data.full_name', `%${searchFilter}%`);
    }

    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    query = query.order('time', { ascending: false }).range(from, to);

    const { data: logs, count, error } = await query;

    if (error) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Fout bij het ophalen van logs.</td></tr>';
        return;
    }

    totalPages = Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
    if (currentPage >= totalPages) {
        currentPage = totalPages - 1;
    }

    currentLogs = (logs || []).map(log => ({
        ...log,
        old_value_parsed: parseJsonSafe(log.old_value),
        new_value_parsed: parseJsonSafe(log.new_value)
    }));

    updatePaginationControls();
    renderLogs();
}

async function initLogs() {
    loadHeader();

    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    storeId = auth.userData.winkel;

    const modal = document.getElementById('logDetailsModal');
    const closeModalBtn = document.getElementById('closeLogModalBtn');
    setupModal(modal, [closeModalBtn]);

    const tbody = document.getElementById('logs-table-body');
    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.details-btn');
            if (!btn) return;
            const id = btn.getAttribute('data-log-id');
            const targetLog = currentLogs.find(l => String(l.id) === String(id));
            if (targetLog) openLogModal(targetLog);
        });
    }

    const typeFilter = document.getElementById('log-type-filter');
    const actionFilter = document.getElementById('log-action-filter');
    const searchInput = document.getElementById('log-search-input');

    const handleFilterChange = () => {
        currentPage = 0;
        loadLogs();
    };

    if (typeFilter) typeFilter.addEventListener('change', handleFilterChange);
    if (actionFilter) actionFilter.addEventListener('change', handleFilterChange);

    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(handleFilterChange, 300);
        });
    }

    const firstPageBtn = document.getElementById('first-page-btn');
    const prev10PageBtn = document.getElementById('prev10-page-btn');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const next10PageBtn = document.getElementById('next10-page-btn');
    const lastPageBtn = document.getElementById('last-page-btn');
    const pageJumpInput = document.getElementById('page-jump-input');

    if (firstPageBtn) firstPageBtn.addEventListener('click', () => goToPage(0));
    if (prev10PageBtn) prev10PageBtn.addEventListener('click', () => goToPage(currentPage - 10));
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
    if (next10PageBtn) next10PageBtn.addEventListener('click', () => goToPage(currentPage + 10));
    if (lastPageBtn) lastPageBtn.addEventListener('click', () => goToPage(totalPages - 1));

    if (pageJumpInput) {
        pageJumpInput.addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value, 10);
            if (!isNaN(pageNum)) {
                goToPage(pageNum - 1);
            }
        });
    }

    const supabase = await getSupabase();
    await loadTypes(supabase);
    await loadLogs();
}

document.addEventListener('DOMContentLoaded', initLogs);
