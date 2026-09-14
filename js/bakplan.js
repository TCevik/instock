import { supabase, showToast, invokeFn, showConfirmModal } from './main.js';

let bakplanData = [];
let savedSnapshot = '[]';

function calculatePlaten(opleggen, perPlaat) {
    const numOpleggen = parseFloat(opleggen);
    const numPerPlaat = parseFloat(perPlaat);
    if (isNaN(numOpleggen) || isNaN(numPerPlaat) || numPerPlaat <= 0) return 0;
    return Math.ceil(numOpleggen / numPerPlaat);
}

function updateSummaryStats() {
    let totalItems = 0;
    let totalOpleggen = 0;
    let totalPlaten = 0;
    let totalDerving = 0;

    bakplanData.forEach(cat => {
        let catItems = 0;
        let catPlaten = 0;
        cat.items.forEach(item => {
            if (item.omschrijving && item.omschrijving.trim() !== '') {
                totalItems++;
                catItems++;
            }
            const opl = parseFloat(item.opleggen) || 0;
            const der = parseFloat(item.derving) || 0;
            const pl = calculatePlaten(item.opleggen, item.perPlaat);
            
            totalOpleggen += opl;
            totalDerving += der;
            catPlaten += pl;
            totalPlaten += pl;
        });

        const badgeEl = document.getElementById(`cat-badge-${cat.id}`);
        if (badgeEl) {
            badgeEl.textContent = `${catItems} artikelen · ${catPlaten} platen`;
        }
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

function renderCategories(filterText = '') {
    const container = document.getElementById('categories-container');
    if (!container) return;

    if (bakplanData.length === 0) {
        container.innerHTML = `<p class="bakplan-empty-state">Geen categorieën aanwezig. Klik op "+ Categorie toevoegen" om te beginnen.</p>`;
        updateSummaryStats();
        return;
    }

    const query = filterText.toLowerCase().trim();
    let html = '';

    bakplanData.forEach(cat => {
        const matchingItems = cat.items.filter(item => 
            !query || item.omschrijving.toLowerCase().includes(query)
        );

        if (query && matchingItems.length === 0) return;

        let catItemsCount = 0;
        let catPlatenCount = 0;
        cat.items.forEach(item => {
            if (item.omschrijving && item.omschrijving.trim() !== '') catItemsCount++;
            catPlatenCount += calculatePlaten(item.opleggen, item.perPlaat);
        });

        const isCollapsed = cat.collapsed ? 'collapsed' : '';
        const enterClass = cat.isNew ? ' category-card-enter' : '';
        delete cat.isNew;

        html += `
            <div class="category-card ${isCollapsed}${enterClass}" data-cat-id="${cat.id}">
                <div class="category-card-header" data-cat-id="${cat.id}">
                    <div class="cat-header-left">
                        <button type="button" class="btn-toggle-cat" data-cat-id="${cat.id}" title="Inklappen / Uitklappen">
                            <span class="material-icons chevron-icon">expand_less</span>
                        </button>
                        <span class="material-icons cat-icon">folder</span>
                        <input type="text" class="category-title-input" value="${cat.name}" data-cat-id="${cat.id}" placeholder="Categorie naam...">
                        <span class="cat-subtotal-badge" id="cat-badge-${cat.id}">${catItemsCount} artikelen · ${catPlatenCount} platen</span>
                    </div>
                    <div class="cat-header-right">
                        <button type="button" class="btn-delete-cat" data-cat-id="${cat.id}" title="Categorie verwijderen">
                            <span class="material-icons">delete_outline</span>
                        </button>
                    </div>
                </div>
                
                <div class="category-card-body">
                    <div class="category-card-body-inner">
                        <div class="table-responsive">
                            <table class="bakplan-table">
                                <thead>
                                    <tr>
                                        <th class="th-desc">Productomschrijving</th>
                                        <th class="th-num">Aantal per plaat</th>
                                        <th class="th-num">Prijs</th>
                                        <th class="th-num">Promo</th>
                                        <th class="th-num">Opleggen</th>
                                        <th class="th-num">Platen</th>
                                        <th class="th-num">Derving</th>
                                        <th class="th-actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

        matchingItems.forEach(item => {
            const platen = calculatePlaten(item.opleggen, item.perPlaat);
            const perPlaatVal = (item.perPlaat !== null && item.perPlaat !== undefined && item.perPlaat !== '') ? item.perPlaat : '';
            const prijsVal = (item.prijs !== null && item.prijs !== undefined && item.prijs !== '') ? parseFloat(item.prijs).toFixed(2) : '';
            const promoVal = (item.promo !== null && item.promo !== undefined && item.promo !== '') ? parseFloat(item.promo).toFixed(2) : '';
            const opleggenVal = (item.opleggen !== null && item.opleggen !== undefined && item.opleggen !== '') ? item.opleggen : '';
            const dervingVal = (item.derving !== null && item.derving !== undefined && item.derving !== '') ? item.derving : '';
            delete item.isNew;

            const isOnlyRow = cat.items.length <= 1;
            const deleteAttr = isOnlyRow ? ' disabled style="opacity:0.25; cursor:not-allowed;"' : '';
            const deleteTitle = isOnlyRow ? 'Minimaal 1 artikel verplicht per categorie' : 'Rij verwijderen';

            html += `
                <tr data-id="${item.id}" data-cat-id="${cat.id}">
                    <td class="td-desc">
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
                    <td class="td-num">
                        <span class="read-only-badge platen-val">${platen}</span>
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" step="1" class="bakplan-input input-num" value="${dervingVal}" placeholder="0" data-field="derving">
                    </td>
                    <td class="td-actions">
                        <button type="button" class="btn-delete-row" data-id="${item.id}" title="${deleteTitle}"${deleteAttr}>
                            <span class="material-icons">close</span>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
                                </tbody>
                            </table>
                        </div>
                        <div class="category-card-footer">
                            <button type="button" class="btn-add-row-in-cat" data-cat-id="${cat.id}">
                                <span class="material-icons">add</span> Artikel toevoegen
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateSummaryStats();
}

function findItem(itemId) {
    for (const cat of bakplanData) {
        const item = cat.items.find(i => i.id === itemId);
        if (item) return { item, cat };
    }
    return null;
}

function deleteCategory(catId) {
    const cardEl = document.querySelector(`.category-card[data-cat-id="${catId}"]`);
    if (cardEl) {
        cardEl.classList.add('category-card-exit');
        setTimeout(() => {
            bakplanData = bakplanData.filter(c => c.id !== catId);
            const searchInput = document.getElementById('bakplan-search');
            renderCategories(searchInput ? searchInput.value : '');
        }, 240);
    } else {
        bakplanData = bakplanData.filter(c => c.id !== catId);
        const searchInput = document.getElementById('bakplan-search');
        renderCategories(searchInput ? searchInput.value : '');
    }
}

function deleteRow(itemId) {
    const res = findItem(itemId);
    if (!res || res.cat.items.length <= 1) {
        if (typeof showToast === 'function') {
            showToast('Een categorie moet minimaal 1 artikel bevatten', 'error');
        }
        return;
    }

    const searchInput = document.getElementById('bakplan-search');
    for (const cat of bakplanData) {
        const idx = cat.items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            cat.items.splice(idx, 1);
            break;
        }
    }
    renderCategories(searchInput ? searchInput.value : '');
}

function addCategory() {
    const searchInput = document.getElementById('bakplan-search');
    const newId = 'cat-' + Date.now();
    const newCat = {
        id: newId,
        name: 'Nieuwe categorie',
        collapsed: false,
        isNew: true,
        items: [
            { id: 'item-' + Date.now(), omschrijving: '', perPlaat: null, prijs: null, promo: null, opleggen: null, derving: null }
        ]
    };
    bakplanData.push(newCat);
    renderCategories(searchInput ? searchInput.value : '');
    const newCard = document.querySelector(`.category-card[data-cat-id="${newId}"]`);
    if (newCard) {
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.scrollTo({ top: pageContainer.scrollHeight, behavior: 'smooth' });
        } else {
            newCard.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        const input = newCard.querySelector('.category-title-input');
        if (input) input.select();
    }
}

function addRowToCategory(catId) {
    const searchInput = document.getElementById('bakplan-search');
    let targetCat = bakplanData.find(c => c.id === catId);
    if (!targetCat) return;

    const newId = 'item-' + Date.now();
    targetCat.items.push({
        id: newId,
        omschrijving: '',
        perPlaat: null,
        prijs: null,
        promo: null,
        opleggen: null,
        derving: null
    });
    renderCategories(searchInput ? searchInput.value : '');
    const newTr = document.querySelector(`tr[data-id="${newId}"]`);
    if (newTr) {
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.scrollTop += Math.max(0, newTr.offsetHeight - -1);
        }
        const input = newTr.querySelector('.bakplan-input');
        if (input) input.focus();
    }
}

function toggleCategoryCollapse(catId) {
    const cat = bakplanData.find(c => c.id === catId);
    if (!cat) return;
    cat.collapsed = !cat.collapsed;
    const cardEl = document.querySelector(`.category-card[data-cat-id="${catId}"]`);
    if (cardEl) {
        cardEl.classList.toggle('collapsed', cat.collapsed);
    }
}

function toggleAllCategories() {
    const anyExpanded = bakplanData.some(c => !c.collapsed);
    bakplanData.forEach(c => {
        c.collapsed = anyExpanded;
        const cardEl = document.querySelector(`.category-card[data-cat-id="${c.id}"]`);
        if (cardEl) {
            cardEl.classList.toggle('collapsed', anyExpanded);
        }
    });

    const iconToggle = document.getElementById('icon-toggle-all');
    const textToggle = document.getElementById('text-toggle-all');
    if (iconToggle) iconToggle.textContent = anyExpanded ? 'unfold_more' : 'unfold_less';
    if (textToggle) textToggle.textContent = anyExpanded ? 'Alles uitklappen' : 'Alles inklappen';
}

function initEvents() {
    const container = document.getElementById('categories-container');
    const searchInput = document.getElementById('bakplan-search');
    const btnAddCat = document.getElementById('btn-add-category');
    const btnToggleAll = document.getElementById('btn-toggle-all');
    const btnSave = document.getElementById('btn-save-bakplan');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderCategories(e.target.value);
        });
    }

    if (btnAddCat) {
        btnAddCat.addEventListener('click', addCategory);
    }

    if (btnToggleAll) {
        btnToggleAll.addEventListener('click', toggleAllCategories);
    }

    if (btnSave) {
        btnSave.addEventListener('click', saveBakplan);
    }

    if (container) {
        container.addEventListener('input', (e) => {
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
                const platenBadge = tr.querySelector('.platen-val');
                if (platenBadge) {
                    platenBadge.textContent = calculatePlaten(item.opleggen, item.perPlaat);
                }
            }

            updateSummaryStats();
        });

        container.addEventListener('click', (e) => {
            const btnDelCat = e.target.closest('.btn-delete-cat');
            if (btnDelCat) {
                e.stopPropagation();
                const catId = btnDelCat.dataset.catId;
                deleteCategory(catId);
                return;
            }

            const btnToggleCat = e.target.closest('.btn-toggle-cat');
            if (btnToggleCat) {
                e.stopPropagation();
                const catId = btnToggleCat.dataset.catId;
                toggleCategoryCollapse(catId);
                return;
            }

            const cardHeader = e.target.closest('.category-card-header');
            if (cardHeader && !e.target.classList.contains('category-title-input')) {
                const catId = cardHeader.dataset.catId;
                toggleCategoryCollapse(catId);
                return;
            }

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
        });
    }
}

function getBakplanSnapshot() {
    return JSON.stringify(bakplanData.map(cat => ({
        id: cat.id,
        name: cat.name,
        items: cat.items.map(item => ({
            id: item.id,
            omschrijving: item.omschrijving,
            perPlaat: item.perPlaat,
            prijs: item.prijs,
            promo: item.promo,
            opleggen: item.opleggen,
            derving: item.derving
        }))
    })));
}

function hasUnsavedChanges() {
    return savedSnapshot !== getBakplanSnapshot();
}

async function saveBakplan() {
    const btnSave = document.getElementById('btn-save-bakplan');
    if (btnSave) btnSave.disabled = true;
    try {
        const { data, error } = await invokeFn('manage-bakplan', {
            body: { data: bakplanData }
        });
        if (error) {
            showToast('error', error);
        } else {
            savedSnapshot = getBakplanSnapshot();
            showToast('notification', 'Het bakplan is succesvol opgeslagen!');
        }
    } catch (err) {
        showToast('error', err.message || 'Er is een fout opgetreden');
    } finally {
        if (btnSave) btnSave.disabled = false;
    }
}

async function loadBakplan() {
    const { data, error } = await supabase
        .from('bakplan')
        .select('data')
        .maybeSingle();

    if (!error && data && Array.isArray(data.data)) {
        bakplanData = data.data;
    }
    savedSnapshot = getBakplanSnapshot();
    renderCategories();
}

window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
    }
});

document.addEventListener('click', async (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    if (hasUnsavedChanges()) {
        e.preventDefault();
        const confirmed = await showConfirmModal({
            title: 'Niet opgeslagen wijzigingen',
            message: 'Je hebt wijzigingen gemaakt die nog niet zijn opgeslagen. Weet je zeker dat je de pagina wilt verlaten?',
            confirmText: 'Verlaten',
            cancelText: 'Blijven',
            isDanger: true
        });

        if (confirmed) {
            savedSnapshot = getBakplanSnapshot();
            window.location.href = href;
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadBakplan();
});
