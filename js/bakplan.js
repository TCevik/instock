import { supabase, showToast, invokeFn, showConfirmModal } from './main.js';

let bakplanData = [];
let undoStack = [];
let redoStack = [];
let isUndoRedoAction = false;

function saveState() {
    if (isUndoRedoAction) return;
    const currentState = JSON.stringify(bakplanData);
    if (undoStack.length === 0 || undoStack[undoStack.length - 1] !== currentState) {
        undoStack.push(currentState);
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
    }
}

function undo() {
    if (undoStack.length <= 1) return;
    isUndoRedoAction = true;
    redoStack.push(undoStack.pop());
    const previousState = undoStack[undoStack.length - 1];
    bakplanData = JSON.parse(previousState);
    const searchInput = document.getElementById('bakplan-search');
    renderCategories(searchInput ? searchInput.value : '');
    isUndoRedoAction = false;
    showToast('notification', 'Actie ongedaan gemaakt (Undo)');
}

function redo() {
    if (redoStack.length === 0) return;
    isUndoRedoAction = true;
    const nextState = redoStack.pop();
    undoStack.push(nextState);
    bakplanData = JSON.parse(nextState);
    const searchInput = document.getElementById('bakplan-search');
    renderCategories(searchInput ? searchInput.value : '');
    isUndoRedoAction = false;
    showToast('notification', 'Actie opnieuw uitgevoerd (Redo)');
}
let savedSnapshot = '[]';
let currentDay = 'maandag';

const DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

function getDayValue(item, field, day = currentDay) {
    if (item.days && item.days[day] && item.days[day][field] !== undefined) {
        return item.days[day][field];
    }
    return item[field] !== undefined ? item[field] : null;
}

function setDayValue(item, field, val, day = currentDay) {
    if (!item.days) item.days = {};
    if (!item.days[day]) item.days[day] = {};
    item.days[day][field] = val;
}

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
            const opl = parseFloat(getDayValue(item, 'opleggen')) || 0;
            const der = parseFloat(getDayValue(item, 'derving')) || 0;
            const pl = calculatePlaten(getDayValue(item, 'opleggen'), item.perPlaat);
            
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

function updateToggleAllButton() {
    const iconToggle = document.getElementById('icon-toggle-all');
    const textToggle = document.getElementById('text-toggle-all');
    if (!iconToggle || !textToggle) return;

    const anyCollapsed = bakplanData.some(c => c.collapsed);
    if (anyCollapsed) {
        iconToggle.textContent = 'unfold_more';
        textToggle.textContent = 'Alles uitklappen';
    } else {
        iconToggle.textContent = 'unfold_less';
        textToggle.textContent = 'Alles inklappen';
    }
}

function renderCategories(filterText = '') {
    const container = document.getElementById('categories-container');
    if (!container) return;

    if (bakplanData.length === 0) {
        container.innerHTML = `<p class="bakplan-empty-state">Geen categorieën aanwezig. Klik op "+ Categorie toevoegen" om te beginnen.</p>`;
        updateSummaryStats();
        updateToggleAllButton();
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
            catPlatenCount += calculatePlaten(getDayValue(item, 'opleggen'), item.perPlaat);
        });

        const isCollapsed = cat.collapsed ? 'collapsed' : '';
        const enterClass = cat.isNew ? ' category-card-enter' : '';
        delete cat.isNew;

        const isOntdooi = cat.cartType === 'ontdooi';
        const cartBtnClass = isOntdooi ? 'btn-cart-type-toggle is-ontdooi' : 'btn-cart-type-toggle';
        const cartIcon = isOntdooi ? 'ac_unit' : 'shopping_cart';
        const cartText = isOntdooi ? 'Ontdooikar' : 'Normale kar';

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
                        <button type="button" class="${cartBtnClass}" data-cat-id="${cat.id}" title="Wissel type kar">
                            <span class="material-icons">${cartIcon}</span> ${cartText}
                        </button>
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
                                        <th class="th-num">Aantal / plaat</th>
                                        <th class="th-num">Prijs</th>
                                        <th class="th-num th-day">Promo <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Opleggen <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Platen <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-num th-day">Derving <span class="header-day-tag">${currentDay.slice(0, 2)}</span></th>
                                        <th class="th-actions"></th>
                                    </tr>
                                </thead>
                                <tbody>
        `;

        matchingItems.forEach(item => {
            const currentOpleggen = getDayValue(item, 'opleggen');
            const currentPromo = getDayValue(item, 'promo');
            const currentDerving = getDayValue(item, 'derving');

            const platen = calculatePlaten(currentOpleggen, item.perPlaat);
            const perPlaatVal = (item.perPlaat !== null && item.perPlaat !== undefined && item.perPlaat !== '') ? item.perPlaat : '';
            const prijsVal = (item.prijs !== null && item.prijs !== undefined && item.prijs !== '') ? parseFloat(item.prijs).toFixed(2) : '';
            const promoVal = (currentPromo !== null && currentPromo !== undefined && currentPromo !== '') ? parseFloat(currentPromo).toFixed(2) : '';
            const opleggenVal = (currentOpleggen !== null && currentOpleggen !== undefined && currentOpleggen !== '') ? currentOpleggen : '';
            const dervingVal = (currentDerving !== null && currentDerving !== undefined && currentDerving !== '') ? currentDerving : '';
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
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num" value="${perPlaatVal}" placeholder="0" data-field="perPlaat">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="0.01" class="bakplan-input input-num" value="${prijsVal}" placeholder="0.00" data-field="prijs">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="0.01" class="bakplan-input input-num input-day" value="${promoVal}" placeholder="-" data-field="promo" title="Rechtermuisknop om te synchroniseren naar andere dagen">
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num input-day" value="${opleggenVal}" placeholder="0" data-field="opleggen" title="Rechtermuisknop om te synchroniseren naar andere dagen">
                    </td>
                    <td class="td-num">
                        <span class="read-only-badge platen-val">${platen}</span>
                    </td>
                    <td class="td-num">
                        <input type="number" min="0" max="999999" step="1" class="bakplan-input input-num input-day" value="${dervingVal}" placeholder="0" data-field="derving" title="Rechtermuisknop om te synchroniseren naar andere dagen">
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
    updateToggleAllButton();
}

function findItem(itemId) {
    for (const cat of bakplanData) {
        const item = cat.items.find(i => i.id === itemId);
        if (item) return { item, cat };
    }
    return null;
}

function deleteCategory(catId) {
    saveState();
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

    saveState();
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

async function addCategory() {
    if (bakplanData.length === 50) {
        const confirmed = await showConfirmModal({
            title: 'Veel categorieën waarschuwing',
            message: 'Je staat op het punt om meer dan 50 categorieën toe te voegen. Dit kan mogelijke vertragingen of prestatieproblemen veroorzaken. Weet je zeker dat je door wilt gaan?',
            confirmText: 'Toevoegen',
            cancelText: 'Annuleren',
            isDanger: true
        });
        if (!confirmed) return;
    }

    saveState();
    const searchInput = document.getElementById('bakplan-search');
    const newId = 'cat-' + Date.now();
    const newCat = {
        id: newId,
        name: 'Nieuwe categorie',
        cartType: 'normaal',
        collapsed: false,
        isNew: true,
        items: [
            { id: 'item-' + Date.now(), omschrijving: '', perPlaat: null, prijs: null, promo: null, opleggen: null, derving: null, days: {} }
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
    let targetCat = bakplanData.find(c => c.id === catId);
    if (!targetCat) return;

    saveState();
    const searchInput = document.getElementById('bakplan-search');
    const newId = 'item-' + Date.now();
    targetCat.items.push({
        id: newId,
        omschrijving: '',
        perPlaat: null,
        prijs: null,
        promo: null,
        opleggen: null,
        derving: null,
        days: {}
    });
    renderCategories(searchInput ? searchInput.value : '');
    const newTr = document.querySelector(`tr[data-id="${newId}"]`);
    if (newTr) {
        const pageContainer = document.querySelector('.page-container');
        if (pageContainer) {
            pageContainer.scrollTop += Math.max(0, newTr.offsetHeight - 0);
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
    updateToggleAllButton();
}

function toggleCartType(catId) {
    const cat = bakplanData.find(c => c.id === catId);
    if (!cat) return;
    saveState();
    cat.cartType = cat.cartType === 'ontdooi' ? 'normaal' : 'ontdooi';
    const searchInput = document.getElementById('bakplan-search');
    renderCategories(searchInput ? searchInput.value : '');
}

function toggleAllCategories() {
    const anyCollapsed = bakplanData.some(c => c.collapsed);
    bakplanData.forEach(c => {
        c.collapsed = !anyCollapsed;
        const cardEl = document.querySelector(`.category-card[data-cat-id="${c.id}"]`);
        if (cardEl) {
            cardEl.classList.toggle('collapsed', !anyCollapsed);
        }
    });

    updateToggleAllButton();
}

let activeBakplanMenu = null;

function removeBakplanSyncMenu() {
    if (activeBakplanMenu) {
        activeBakplanMenu.remove();
        activeBakplanMenu = null;
    }
}

function showBakplanSyncMenu(x, y, item, field, value) {
    removeBakplanSyncMenu();

    const menu = document.createElement('div');
    menu.className = 'bakplan-sync-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const fieldNames = {
        promo: 'Promoprijs',
        opleggen: 'Aantal opleggen',
        derving: 'Aantal derving'
    };
    const fieldLabel = fieldNames[field] || field;
    const dayLabel = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);

    menu.innerHTML = `
        <div class="sync-menu-header">
            <span class="material-icons">sync</span>
            <span>Sync ${fieldLabel} (${dayLabel})</span>
        </div>
        <div class="sync-menu-item" data-action="sync-field-all">
            <span class="material-icons">copy_all</span>
            <span>Kopieer <strong>${fieldLabel}</strong> naar alle 7 dagen</span>
        </div>
        <div class="sync-menu-item" data-action="sync-item-all">
            <span class="material-icons">table_rows</span>
            <span>Kopieer <strong>alle dagwaardes</strong> van dit artikel naar alle dagen</span>
        </div>
        <div class="sync-menu-divider"></div>
        <div class="sync-menu-item" data-action="sync-field-workdays">
            <span class="material-icons">date_range</span>
            <span>Kopieer naar werkdagen (Ma - Vr)</span>
        </div>
        <div class="sync-menu-item" data-action="sync-field-weekend">
            <span class="material-icons">weekend</span>
            <span>Kopieer naar weekend (Za - Zo)</span>
        </div>
    `;

    menu.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.sync-menu-item');
        if (!itemEl) return;
        const action = itemEl.dataset.action;

        saveState();

        if (action === 'sync-field-all') {
            DAYS.forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar alle dagen`);
        } else if (action === 'sync-item-all') {
            const currentPromo = getDayValue(item, 'promo');
            const currentOpleggen = getDayValue(item, 'opleggen');
            const currentDerving = getDayValue(item, 'derving');

            DAYS.forEach(d => {
                setDayValue(item, 'promo', currentPromo, d);
                setDayValue(item, 'opleggen', currentOpleggen, d);
                setDayValue(item, 'derving', currentDerving, d);
            });
            showToast('notification', `Alle dagwaardes gekopieerd naar alle dagen`);
        } else if (action === 'sync-field-workdays') {
            ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'].forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar werkdagen`);
        } else if (action === 'sync-field-weekend') {
            ['zaterdag', 'zondag'].forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar het weekend`);
        }

        removeBakplanSyncMenu();
        const searchInput = document.getElementById('bakplan-search');
        renderCategories(searchInput ? searchInput.value : '');
    });

    document.body.appendChild(menu);
    activeBakplanMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 12}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 12}px`;
    }
}

document.addEventListener('click', (e) => {
    if (activeBakplanMenu && !e.target.closest('.bakplan-sync-menu')) {
        removeBakplanSyncMenu();
    }
});

function initEvents() {
    const container = document.getElementById('categories-container');
    const searchInput = document.getElementById('bakplan-search');
    const btnAddCat = document.getElementById('btn-add-category');
    const btnToggleAll = document.getElementById('btn-toggle-all');
    const btnSave = document.getElementById('btn-save-bakplan');
    const daysTabs = document.getElementById('bakplan-days-tabs');

    if (daysTabs) {
        daysTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.day-tab');
            if (!tab) return;
            const day = tab.dataset.day;
            if (!day || day === currentDay) return;

            daysTabs.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentDay = day;

            renderCategories(searchInput ? searchInput.value : '');
        });
    }

    document.addEventListener('keydown', (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        if (isCtrl && key === 'f') {
            if (searchInput) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        } else if (isCtrl && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        } else if (isCtrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    });

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
            saveState();
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
                let val = target.value.trim();
                let numVal = val === '' ? null : parseFloat(val);
                if (numVal !== null) {
                    if (numVal < 0) numVal = 0;
                    if (numVal > 999999) numVal = 999999;
                    target.value = numVal;
                }
                if (field === 'perPlaat' || field === 'prijs') {
                    item[field] = numVal;
                } else {
                    setDayValue(item, field, numVal);
                }
            }

            if (field === 'perPlaat' || field === 'opleggen') {
                const platenBadge = tr.querySelector('.platen-val');
                if (platenBadge) {
                    platenBadge.textContent = calculatePlaten(getDayValue(item, 'opleggen'), item.perPlaat);
                }
            }

            updateSummaryStats();
        });

        container.addEventListener('keydown', (e) => {
            const target = e.target;
            if (!target.classList.contains('bakplan-input')) return;

            if (e.key === 'Enter') {
                e.preventDefault();
                const tr = target.closest('tr');
                if (!tr) return;

                const field = target.dataset.field;
                const nextTr = tr.nextElementSibling;

                if (nextTr && nextTr.tagName === 'TR') {
                    const nextInput = nextTr.querySelector(`input[data-field="${field}"]`);
                    if (nextInput) {
                        nextInput.focus();
                        nextInput.select();
                        return;
                    }
                }

                const catId = tr.dataset.catId;
                if (catId) {
                    addRowToCategory(catId);
                }
            } else if (e.key === 'Tab') {
                const tr = target.closest('tr');
                if (!tr) return;
                const rowInputs = Array.from(tr.querySelectorAll('.bakplan-input'));
                const isLastInputInRow = (target === rowInputs[rowInputs.length - 1]);

                if (!e.shiftKey && isLastInputInRow) {
                    const nextTr = tr.nextElementSibling;
                    if (!nextTr || nextTr.tagName !== 'TR') {
                        e.preventDefault();
                        const catId = tr.dataset.catId;
                        if (catId) {
                            addRowToCategory(catId);
                        }
                    }
                }
            }
        });

        container.addEventListener('contextmenu', (e) => {
            const target = e.target;
            if (!target.classList.contains('input-day')) return;

            e.preventDefault();
            const tr = target.closest('tr');
            if (!tr) return;

            const itemId = tr.dataset.id;
            const res = findItem(itemId);
            if (!res) return;

            const { item } = res;
            const field = target.dataset.field;
            const currentVal = getDayValue(item, field);

            showBakplanSyncMenu(e.clientX, e.clientY, item, field, currentVal);
        });

        container.addEventListener('click', (e) => {
            const btnCartType = e.target.closest('.btn-cart-type-toggle');
            if (btnCartType) {
                e.stopPropagation();
                const catId = btnCartType.dataset.catId;
                toggleCartType(catId);
                return;
            }

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
        cartType: cat.cartType || 'normaal',
        items: cat.items.map(item => ({
            id: item.id,
            omschrijving: item.omschrijving,
            perPlaat: item.perPlaat,
            prijs: item.prijs,
            promo: item.promo,
            opleggen: item.opleggen,
            derving: item.derving,
            days: item.days || {}
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
        bakplanData = data.data.map(cat => ({
            ...cat,
            collapsed: false
        }));
    }
    savedSnapshot = getBakplanSnapshot();
    undoStack = [JSON.stringify(bakplanData)];
    redoStack = [];
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
