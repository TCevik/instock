import { supabase, showToast } from './main.js';

let bakplanData = [];

function calculatePlaten(opleggen, perPlaat) {
    const numOpleggen = parseFloat(opleggen);
    const numPerPlaat = parseFloat(perPlaat);
    if (isNaN(numOpleggen) || isNaN(numPerPlaat) || numPerPlaat <= 0) return '-';
    return Math.ceil(numOpleggen / numPerPlaat);
}

function updateSummaryStats() {
    let totalItems = 0;
    let totalOpleggen = 0;
    let totalPlaten = 0;
    let totalDerving = 0;

    bakplanData.forEach(cat => {
        cat.items.forEach(item => {
            if (item.omschrijving && item.omschrijving.trim() !== '') {
                totalItems++;
            }
            const opl = parseFloat(item.opleggen) || 0;
            const der = parseFloat(item.derving) || 0;
            const pl = calculatePlaten(item.opleggen, item.perPlaat);
            
            totalOpleggen += opl;
            totalDerving += der;
            if (typeof pl === 'number') {
                totalPlaten += pl;
            }
        });
    });

    const elItems = document.getElementById('stat-total-items');
    const elOpleggen = document.getElementById('stat-total-opleggen');
    const elPlaten = document.getElementById('stat-total-platen');
    const elDerving = document.getElementById('stat-total-derving');

    if (elItems) elItems.textContent = totalItems;
    if (elOpleggen) elOpleggen.textContent = totalOpleggen;
    if (elPlaten) elPlaten.textContent = totalPlaten;
    if (elDerving) elDerving.textContent = totalDerving;
}

function renderTable(filterText = '') {
    const tbody = document.getElementById('bakplan-tbody');
    if (!tbody) return;

    updateSummaryStats();

    if (bakplanData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-color-muted); padding: 24px; font-style: italic;">Geen categorieën of rijen aanwezig. Klik op "+ Categorie toevoegen" om te beginnen.</td></tr>`;
        return;
    }

    const query = filterText.toLowerCase().trim();
    let html = '';

    bakplanData.forEach(cat => {
        const matchingItems = cat.items.filter(item => 
            !query || item.omschrijving.toLowerCase().includes(query)
        );

        if (query && matchingItems.length === 0) return;

        html += `
            <tr class="category-header-row" data-cat-id="${cat.id}">
                <td colspan="7">
                    <div class="category-header-left">
                        <span class="material-icons category-badge-icon">folder</span>
                        <input type="text" class="category-title-input" value="${cat.name}" data-cat-id="${cat.id}" placeholder="Categorie naam...">
                    </div>
                </td>
                <td class="td-actions">
                    <button type="button" class="btn-row-action btn-delete-cat" data-cat-id="${cat.id}" title="Categorie verwijderen">
                        <span class="material-icons">delete_outline</span>
                    </button>
                </td>
            </tr>
        `;

        matchingItems.forEach(item => {
            const platen = calculatePlaten(item.opleggen, item.perPlaat);
            const perPlaatVal = (item.perPlaat !== null && item.perPlaat !== undefined && item.perPlaat !== '') ? item.perPlaat : '';
            const prijsVal = (item.prijs !== null && item.prijs !== undefined && item.prijs !== '') ? parseFloat(item.prijs).toFixed(2) : '';
            const promoVal = (item.promo !== null && item.promo !== undefined && item.promo !== '') ? parseFloat(item.promo).toFixed(2) : '';
            const opleggenVal = (item.opleggen !== null && item.opleggen !== undefined && item.opleggen !== '') ? item.opleggen : '';
            const dervingVal = (item.derving !== null && item.derving !== undefined && item.derving !== '') ? item.derving : '';

            html += `
                <tr data-id="${item.id}" data-cat-id="${cat.id}">
                    <td>
                        <input type="text" class="bakplan-input" value="${item.omschrijving}" placeholder="Productomschrijving..." data-field="omschrijving">
                    </td>
                    <td class="td-num">
                        <input type="number" min="1" step="1" class="bakplan-input input-num" value="${perPlaatVal}" placeholder="0" data-field="perPlaat">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" step="0.01" class="bakplan-input input-num" value="${prijsVal}" placeholder="0.00" data-field="prijs">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" step="0.01" class="bakplan-input input-num" value="${promoVal}" placeholder="0.00" data-field="promo">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" step="1" class="bakplan-input input-num" value="${opleggenVal}" placeholder="0" data-field="opleggen">
                    </td>
                    <td class="td-num cell-read-only platen-val">${platen}</td>
                    <td class="td-num">
                        <input type="number" min="0" step="1" class="bakplan-input input-num" value="${dervingVal}" placeholder="0" data-field="derving">
                    </td>
                    <td class="td-actions">
                        <button type="button" class="btn-row-action btn-delete-row" data-id="${item.id}" title="Rij verwijderen">
                            <span class="material-icons">close</span>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
            <tr class="skeleton-add-row" data-cat-id="${cat.id}">
                <td colspan="8">
                    <button type="button" class="btn-skeleton-row btn-add-row-in-cat" data-cat-id="${cat.id}">
                        <span class="material-icons">add</span> Rij toevoegen aan ${cat.name || 'categorie'}
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function findItem(itemId) {
    for (const cat of bakplanData) {
        const item = cat.items.find(i => i.id === itemId);
        if (item) return { item, cat };
    }
    return null;
}

function deleteRow(itemId) {
    const searchInput = document.getElementById('bakplan-search');
    for (const cat of bakplanData) {
        const idx = cat.items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            cat.items.splice(idx, 1);
            break;
        }
    }
    renderTable(searchInput ? searchInput.value : '');
}

function addCategory() {
    const searchInput = document.getElementById('bakplan-search');
    const newCat = {
        id: 'cat-' + Date.now(),
        type: 'category',
        name: 'Nieuwe categorie',
        items: [
            { id: 'item-' + Date.now(), omschrijving: '', perPlaat: null, prijs: null, promo: null, opleggen: null, derving: null }
        ]
    };
    bakplanData.push(newCat);
    renderTable(searchInput ? searchInput.value : '');
}

function addRowToCategory(catId) {
    const searchInput = document.getElementById('bakplan-search');
    let targetCat = bakplanData.find(c => c.id === catId);
    if (!targetCat) {
        if (bakplanData.length === 0) {
            addCategory();
            return;
        }
        targetCat = bakplanData[bakplanData.length - 1];
    }
    targetCat.items.push({
        id: 'item-' + Date.now(),
        omschrijving: '',
        perPlaat: null,
        prijs: null,
        promo: null,
        opleggen: null,
        derving: null
    });
    renderTable(searchInput ? searchInput.value : '');
}

function initEvents() {
    const tbody = document.getElementById('bakplan-tbody');
    const searchInput = document.getElementById('bakplan-search');
    const btnAddCatBottom = document.getElementById('btn-add-category-bottom');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderTable(e.target.value);
        });
    }

    if (btnAddCatBottom) {
        btnAddCatBottom.addEventListener('click', addCategory);
    }

    if (tbody) {
        tbody.addEventListener('input', (e) => {
            const target = e.target;
            if (target.classList.contains('category-title-input')) {
                const catId = target.dataset.catId;
                const cat = bakplanData.find(c => c.id === catId);
                if (cat) cat.name = target.value;
                return;
            }

            const tr = target.closest('tr');
            if (!tr) return;

            const id = tr.dataset.id;
            const res = findItem(id);
            if (!res) return;

            const { item } = res;
            const field = target.dataset.field;
            if (!field) return;

            if (field === 'omschrijving') {
                item.omschrijving = target.value;
            } else {
                const val = target.value.trim();
                item[field] = val === '' ? null : parseFloat(val);
            }

            if (field === 'perPlaat' || field === 'opleggen') {
                const platenTd = tr.querySelector('.platen-val');
                if (platenTd) {
                    platenTd.textContent = calculatePlaten(item.opleggen, item.perPlaat);
                }
            }

            updateSummaryStats();
        });

        tbody.addEventListener('click', (e) => {
            const btnDeleteRow = e.target.closest('.btn-delete-row');
            if (btnDeleteRow) {
                const itemId = btnDeleteRow.dataset.id;
                deleteRow(itemId);
                return;
            }

            const btnAddRowInCat = e.target.closest('.btn-add-row-in-cat');
            if (btnAddRowInCat) {
                const catId = btnAddRowInCat.dataset.catId;
                addRowToCategory(catId);
                return;
            }

            const btnDelCat = e.target.closest('.btn-delete-cat');
            if (btnDelCat) {
                const catId = btnDelCat.dataset.catId;
                bakplanData = bakplanData.filter(c => c.id !== catId);
                renderTable(searchInput ? searchInput.value : '');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    initEvents();
});
