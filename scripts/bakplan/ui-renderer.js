import { setupModal } from '../main.js';
import { DAYS, state, previousStateData, setPreviousStateData } from './state.js';
import { getPlateQuantity, syncStructureAcrossDays } from './logic.js';
import { triggerSave } from './storage.js';
import { pdfParser } from './pdf-handler.js';
import { showConfirmModal } from './modals.js';
import { openPrintableBakplan } from './printable-overview.js';

export const uiRenderer = {
    init() {
        const input = document.getElementById('bakplan-input');
        let selectedFile = null;
        const pdfModal = document.getElementById('pdf-upload-modal');
        const undoBtn = document.getElementById('undo-pdf-btn');

        const handlePdfParse = async (mode) => {
            if (!selectedFile) return;
            try {
                await pdfParser.parsePDF(selectedFile, mode);
                this.renderTabs();
                this.renderTable();
                triggerSave();
                if (undoBtn) undoBtn.style.display = 'inline-flex';
            } catch (err) {
                console.error(err);
            } finally {
                closePdfModal();
            }
        };

        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                selectedFile = file;
                if (pdfModal) {
                    pdfModal.style.display = 'flex';
                }
            });
        }

        const modalConfirmBtn = document.getElementById('pdf-modal-confirm-btn');
        if (modalConfirmBtn) {
            modalConfirmBtn.addEventListener('click', () => handlePdfParse('overwrite'));
        }

        const modalCancelBtn = document.getElementById('pdf-modal-cancel-btn');
        const closePdfModal = setupModal(pdfModal, [modalCancelBtn], () => {
            selectedFile = null;
            if (input) input.value = '';
        });

        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                if (previousStateData) {
                    state.daysData = JSON.parse(JSON.stringify(previousStateData));
                    setPreviousStateData(null);
                    this.renderTabs();
                    this.renderTable();
                    triggerSave();
                    undoBtn.style.display = 'none';
                }
            });
        }

        const addCatBtn = document.getElementById('add-category-btn');
        if (addCatBtn) {
            addCatBtn.addEventListener('click', () => {
                const dayList = state.daysData[state.selectedDay];
                let catIndex = dayList.length + 1;
                let newCatName = `Nieuwe Categorie ${catIndex}`;
                while (dayList.some(c => c.category === newCatName)) {
                    catIndex++;
                    newCatName = `Nieuwe Categorie ${catIndex}`;
                }
                dayList.push({
                    category: newCatName,
                    products: [{
                        ceNr: String(Date.now()).slice(-6),
                        description: 'Nieuw product',
                        price: '0.00',
                        promo: '',
                        gemVerk: '0',
                        derving: '0'
                    }]
                });
                syncStructureAcrossDays(state);
                this.renderTabs();
                this.renderTable();
                triggerSave();
            });
        }

        const cartsBtn = document.getElementById('bakplan-carts-btn');
        const cartsModal = document.getElementById('bakplan-carts-modal');
        const cartsCancelBtn = document.getElementById('carts-cancel-btn');
        const cartsSaveBtn = document.getElementById('carts-save-btn');
        const addCartRowBtn = document.getElementById('add-cart-row-btn');
        let tempCarts = [];

        if (cartsBtn && cartsModal) {
            cartsBtn.addEventListener('click', () => {
                tempCarts = JSON.parse(JSON.stringify(state.customCarts));
                this.renderCartsTable(tempCarts);
                cartsModal.style.display = 'flex';
            });
        }

        const closeCartsModal = setupModal(cartsModal, [cartsCancelBtn], () => {
            tempCarts = [];
        });

        if (cartsSaveBtn && cartsModal) {
            cartsSaveBtn.addEventListener('click', () => {
                state.customCarts = JSON.parse(JSON.stringify(tempCarts));
                closeCartsModal();
                triggerSave();
            });
        }

        if (addCartRowBtn) {
            addCartRowBtn.addEventListener('click', () => {
                const nextId = tempCarts.length > 0 ? Math.max(...tempCarts.map(c => c.id || 0)) + 1 : 1;
                tempCarts.push({
                    id: nextId,
                    name: `Kar ${nextId}`,
                    type: 'mixed',
                    capacity: 18,
                    oven: true,
                    desc: 'Custom kar'
                });
                this.renderCartsTable(tempCarts);
            });
        }

        const settingsBtn = document.getElementById('bakplan-settings-btn');
        const settingsModal = document.getElementById('bakplan-settings-modal');
        const settingsCancelBtn = document.getElementById('settings-cancel-btn');
        const settingsSaveBtn = document.getElementById('settings-save-btn');
        let tempConfig = {};

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                tempConfig = { ...state.productPlateConfig };
                this.renderSettingsTable(tempConfig);
                settingsModal.style.display = 'flex';
            });
        }

        const closeSettingsModal = setupModal(settingsModal, [settingsCancelBtn], () => {
            tempConfig = {};
        });

        if (settingsSaveBtn && settingsModal) {
            settingsSaveBtn.addEventListener('click', () => {
                state.productPlateConfig = { ...tempConfig };
                closeSettingsModal();
                this.renderTable();
                triggerSave();
            });
        }

        const generateBtn = document.getElementById('generate-bakplan-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                openPrintableBakplan(state.daysData, state.productPlateConfig, state.customCarts);
            });
        }

        const clearAllBtn = document.getElementById('clear-all-btn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Alles Verwijderen',
                    'Weet je zeker dat je alle categorieën en producten wilt verwijderen voor alle dagen?',
                    () => {
                        showConfirmModal(
                            'Definitief Bevestigen',
                            'Weet je het heel zeker? Alle gegevens uit het bakplan worden definitief gewist.',
                            () => {
                                DAYS.forEach(d => {
                                    state.daysData[d] = [];
                                });
                                state.productPlateConfig = {};
                                this.renderTabs();
                                this.renderTable();
                                triggerSave();
                            },
                            5
                        );
                    }
                );
            });
        }
    },

    getAllProducts() {
        const productsMap = new Map();
        DAYS.forEach(day => {
            const categories = state.daysData[day] || [];
            categories.forEach(catObj => {
                (catObj.products || []).forEach(prod => {
                    if (prod.description && !productsMap.has(prod.description.trim())) {
                        productsMap.set(prod.description.trim(), prod);
                    }
                });
            });
        });
        return Array.from(productsMap.values());
    },

    renderSettingsTable(tempConfig) {
        const tbody = document.getElementById('settings-table-body');
        if (!tbody) return;

        const products = this.getAllProducts();
        const activeProds = new Set(products.map(p => p.description.trim()));
        const oldKeys = Object.keys(tempConfig).filter(k => k.trim() && !activeProds.has(k.trim()));

        let html = `
            <tr class="category-header-row">
                <td colspan="2">Huidige producten</td>
            </tr>
        `;

        if (products.length === 0) {
            html += '<tr><td colspan="2" class="loading-cell">Geen huidige producten in bakplan.</td></tr>';
        } else {
            products.forEach(prod => {
                const desc = prod.description.trim();
                const plateQty = (!isNaN(parseInt(tempConfig[desc])) && parseInt(tempConfig[desc]) > 0) ? parseInt(tempConfig[desc]) : getPlateQuantity(desc, state.productPlateConfig);
                html += `
                    <tr>
                        <td>${desc}</td>
                        <td>
                            <input type="number" min="1" class="plate-input" data-desc="${desc}" value="${plateQty}" style="width: 100%; padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                        </td>
                    </tr>
                `;
            });
        }

        html += `
            <tr class="category-header-row">
                <td colspan="2">Oude producten (niet in bakplan)</td>
            </tr>
        `;

        if (oldKeys.length === 0) {
            html += '<tr><td colspan="2" class="loading-cell">Geen oude producten.</td></tr>';
        } else {
            oldKeys.forEach(desc => {
                const plateQty = (!isNaN(parseInt(tempConfig[desc])) && parseInt(tempConfig[desc]) > 0) ? parseInt(tempConfig[desc]) : 12;
                html += `
                    <tr>
                        <td style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span>${desc}</span>
                            <button type="button" class="action-btn delete remove-old-plate-btn" data-desc="${desc}" style="padding: 2px 6px; font-size: 12px; height: auto;" title="Verwijderen uit instellingen">
                                <i class="material-icons" style="font-size: 14px;">delete</i>
                            </button>
                        </td>
                        <td>
                            <input type="number" min="1" class="plate-input" data-desc="${desc}" value="${plateQty}" style="width: 100%; padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                        </td>
                    </tr>
                `;
            });
        }

        tbody.innerHTML = html;

        tbody.querySelectorAll('.plate-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const desc = e.target.dataset.desc;
                const val = parseInt(e.target.value);
                tempConfig[desc] = (!isNaN(val) && val > 0) ? val : 12;
            });
        });

        tbody.querySelectorAll('.remove-old-plate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const desc = e.target.closest('.remove-old-plate-btn').dataset.desc;
                delete tempConfig[desc];
                this.renderSettingsTable(tempConfig);
            });
        });
    },

    renderTabs() {
        const nav = document.querySelector('.day-navigation');
        if (!nav) return;

        nav.innerHTML = '';
        DAYS.forEach(day => {
            const btn = document.createElement('button');
            btn.className = 'day-nav-btn';

            if (day === state.selectedDay) {
                btn.classList.add('active');
            }

            btn.textContent = day.charAt(0) + day.slice(1).toLowerCase();
            btn.addEventListener('click', () => {
                state.selectedDay = day;
                this.renderTabs();
                this.renderTable();
            });
            nav.appendChild(btn);
        });
    },

    renderCartsTable(tempCarts) {
        const tbody = document.getElementById('carts-table-body');
        if (!tbody) return;

        if (tempCarts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">Geen karren aanwezig. Voeg een kar toe.</td></tr>';
            return;
        }

        let html = '';
        tempCarts.forEach((cart, idx) => {
            html += `
                <tr>
                    <td>
                        <input type="text" class="cart-name-input" data-idx="${idx}" value="${cart.name || 'Kar ' + (idx + 1)}" style="width: 100%; padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    </td>
                    <td>
                        <select class="cart-type-select" data-idx="${idx}" style="padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                            <option value="single" ${cart.type === 'single' ? 'selected' : ''}>1 Categorie</option>
                            <option value="mixed" ${cart.type === 'mixed' ? 'selected' : ''}>Gemixt</option>
                            <option value="thaw" ${cart.type === 'thaw' ? 'selected' : ''}>Ontdooien</option>
                        </select>
                    </td>
                    <td>
                        <input type="number" min="1" max="50" class="cart-capacity-input" data-idx="${idx}" value="${cart.capacity || 18}" style="width: 70px; padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    </td>
                    <td>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                            <input type="checkbox" class="cart-oven-check" data-idx="${idx}" ${cart.oven ? 'checked' : ''}>
                            <span>Oven</span>
                        </label>
                    </td>
                    <td style="text-align: right;">
                        <button type="button" class="action-btn delete remove-cart-btn" data-idx="${idx}" style="padding: 4px;" title="Kar Verwijderen">
                            <i class="material-icons" style="font-size: 16px;">delete</i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        tbody.querySelectorAll('.cart-name-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (tempCarts[idx]) tempCarts[idx].name = e.target.value;
            });
        });

        tbody.querySelectorAll('.cart-type-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (tempCarts[idx]) {
                    tempCarts[idx].type = e.target.value;
                    if (e.target.value === 'thaw') {
                        tempCarts[idx].oven = false;
                    } else {
                        tempCarts[idx].oven = true;
                    }
                    this.renderCartsTable(tempCarts);
                }
            });
        });

        tbody.querySelectorAll('.cart-capacity-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const val = parseInt(e.target.value);
                if (tempCarts[idx]) tempCarts[idx].capacity = (!isNaN(val) && val > 0) ? val : 18;
            });
        });

        tbody.querySelectorAll('.cart-oven-check').forEach(check => {
            check.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                if (tempCarts[idx]) tempCarts[idx].oven = e.target.checked;
            });
        });

        tbody.querySelectorAll('.remove-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.closest('.remove-cart-btn').dataset.idx);
                tempCarts.splice(idx, 1);
                this.renderCartsTable(tempCarts);
            });
        });
    },

    renderTable() {
        const tbody = document.getElementById('bakplan-table-body');
        if (!tbody) return;

        const categories = state.daysData[state.selectedDay] || [];

        if (categories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Geen gegevens beschikbaar. Voeg een product toe met \'Product Toevoegen\'.</td></tr>';
            return;
        }

        let html = '';
        categories.forEach((catObj, catIdx) => {
            const cat = catObj.category;
            const isThawChecked = !!catObj.thawInBatch1;
            html += `
                <tr class="category-header-row">
                    <td colspan="4" contenteditable="true" data-catidx="${catIdx}">
                        ${cat}
                    </td>
                    <td colspan="2" style="text-align: right; min-width: 160px; white-space: nowrap;">
                        <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: normal; text-transform: none; cursor: pointer; color: var(--text-color-muted);" title="Plaats deze categorie in Batch 1 op de ontdooikar">
                            <input type="checkbox" class="cat-thaw-check" data-catidx="${catIdx}" ${isThawChecked ? 'checked' : ''}>
                            <span>Ontdooien Batch 1</span>
                        </label>
                    </td>
                    <td style="text-align: right; display: flex; gap: 4px; justify-content: flex-end; align-items: center;">
                        <button class="action-btn add-prod-to-cat-btn" data-catidx="${catIdx}" style="padding: 4px; background-color: var(--accent-color); color: #fff;" title="Product Toevoegen aan Categorie">
                            <i class="material-icons" style="font-size: 16px;">add</i>
                        </button>
                        <button class="action-btn delete delete-cat-btn" data-catidx="${catIdx}" style="padding: 4px;" title="Categorie Verwijderen">
                            <i class="material-icons" style="font-size: 16px;">delete</i>
                        </button>
                    </td>
                </tr>
            `;

            (catObj.products || []).forEach((prod, index) => {
                const dervingClass = parseInt(prod.derving) < 0 ? 'class="derving-negative"' : '';
                const gemVerkNum = parseInt(prod.gemVerk) || 0;
                const plateQty = getPlateQuantity(prod.description, state.productPlateConfig);
                const platen = Math.round((gemVerkNum / plateQty) * 10) / 10;
                
                let rowClass = 'bakplan-row';
                if (prod._pdfMissing) {
                    rowClass += ' row-pdf-flagged';
                } else if (prod._pdfNew) {
                    rowClass += ' row-pdf-new';
                }

                const isFlagged = prod._pdfMissing || prod._pdfNew;
                const titleText = prod._pdfMissing ? 'Dit product stond niet meer in het geüploade PDF bestand' : (prod._pdfNew ? 'Nieuw product uit PDF bestand' : '');

                let badgeHtml = '';
                if (prod._pdfNew) {
                    badgeHtml = '<span class="status-badge new" contenteditable="false">Nieuw in PDF</span>';
                } else if (prod._pdfMissing) {
                    badgeHtml = '<span class="status-badge missing" contenteditable="false">Niet meer in PDF</span>';
                }

                const actionButtonsHtml = isFlagged ? `
                    <button class="action-btn approve-row-btn" data-catidx="${catIdx}" data-idx="${index}" style="height: 28px; padding: 0 12px; background-color: var(--accent-color); color: #fff; font-size: 13px; font-weight: 500; border-radius: 6px; border: none !important; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Product Houden">
                        Houden
                    </button>
                    <button class="action-btn delete delete-row-btn" data-catidx="${catIdx}" data-idx="${index}" style="height: 28px; padding: 0 12px; background-color: var(--danger-color); color: #fff; font-size: 13px; font-weight: 500; border-radius: 6px; border: none !important; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;" title="Verwijderen">
                        Verwijderen
                    </button>
                ` : `
                    <button class="action-btn delete delete-row-btn" data-catidx="${catIdx}" data-idx="${index}" style="height: 28px; width: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px;" title="Verwijderen">
                        <i class="material-icons" style="font-size: 16px;">delete</i>
                    </button>
                `;

                html += `
                    <tr class="${rowClass}" ${titleText ? `title="${titleText}"` : ''}>
                        <td data-label="Productomschrijving"><span contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="description">${prod.description}</span> ${badgeHtml}</td>
                        <td data-label="Prijs" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="price">€ ${prod.price}</td>
                        <td data-label="Promo" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="promo">${prod.promo ? '€ ' + prod.promo : '-'}</td>
                        <td data-label="Opleggen" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="gemVerk">${prod.gemVerk}</td>
                        <td data-label="Platen">${platen}</td>
                        <td data-label="Derving" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="derving" ${dervingClass}>${prod.derving}</td>
                        <td data-label="Actie" style="display: flex; gap: 6px; align-items: center; justify-content: flex-end; min-height: 44px;">
                            ${actionButtonsHtml}
                        </td>
                    </tr>
                `;
            });
        });

        tbody.innerHTML = html;

        tbody.querySelectorAll('.cat-thaw-check').forEach(check => {
            check.addEventListener('change', (e) => {
                const catIdx = parseInt(e.target.dataset.catidx);
                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj) {
                    catObj.thawInBatch1 = e.target.checked;
                    syncStructureAcrossDays(state);
                    triggerSave();
                }
            });
        });

        tbody.querySelectorAll('.add-prod-to-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.add-prod-to-cat-btn');
                const catIdx = parseInt(targetBtn.dataset.catidx);
                const dayList = state.daysData[state.selectedDay];
                const catObj = dayList[catIdx];
                if (catObj) {
                    catObj.products.push({
                        ceNr: String(Date.now()).slice(-6),
                        description: 'Nieuw product',
                        price: '0.00',
                        promo: '',
                        gemVerk: '0',
                        derving: '0'
                    });
                    syncStructureAcrossDays(state);
                    this.renderTabs();
                    this.renderTable();
                    triggerSave();
                }
            });
        });

        tbody.querySelectorAll('.approve-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.approve-row-btn');
                const catIdx = parseInt(targetBtn.dataset.catidx);
                const idx = parseInt(targetBtn.dataset.idx);
                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj && catObj.products && catObj.products[idx]) {
                    const targetProd = catObj.products[idx];
                    const targetCeNr = targetProd.ceNr;
                    
                    DAYS.forEach(d => {
                        (state.daysData[d] || []).forEach(c => {
                            (c.products || []).forEach(p => {
                                if (p.ceNr === targetCeNr || (p.description && p.description === targetProd.description)) {
                                    delete p._pdfMissing;
                                    delete p._pdfNew;
                                }
                            });
                        });
                    });

                    this.renderTable();
                    triggerSave();
                }
            });
        });

        tbody.querySelectorAll('.delete-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.delete-cat-btn');
                const catIdx = parseInt(targetBtn.dataset.catidx);
                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj) {
                    showConfirmModal(
                        'Categorie Verwijderen',
                        `Weet je zeker dat je categorie "${catObj.category}" wilt verwijderen voor alle dagen?`,
                        () => {
                            state.daysData[state.selectedDay].splice(catIdx, 1);
                            syncStructureAcrossDays(state);
                            this.renderTabs();
                            this.renderTable();
                            triggerSave();
                        }
                    );
                }
            });
        });

        tbody.querySelectorAll('.category-header-row td[contenteditable="true"]').forEach(cell => {
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    cell.blur();
                }
            });

            cell.addEventListener('input', (e) => {
                const catIdx = parseInt(e.target.dataset.catidx);
                const newCat = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');
                if (state.daysData[state.selectedDay][catIdx]) {
                    state.daysData[state.selectedDay][catIdx].category = newCat;
                    syncStructureAcrossDays(state);
                    triggerSave();
                }
            });

            cell.addEventListener('blur', (e) => {
                const catIdx = parseInt(e.target.dataset.catidx);
                const newCat = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');
                if (!newCat && state.daysData[state.selectedDay][catIdx]) {
                    e.target.textContent = state.daysData[state.selectedDay][catIdx].category || 'Overig';
                } else {
                    this.renderTable();
                }
            });
        });

        tbody.querySelectorAll('.delete-row-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.target.closest('.delete-row-btn');
                const catIdx = parseInt(targetBtn.dataset.catidx);
                const idx = parseInt(targetBtn.dataset.idx);
                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj && catObj.products && catObj.products[idx]) {
                    const targetProd = catObj.products[idx];
                    const isFlagged = targetProd._pdfMissing || targetProd._pdfNew;
                    const doDelete = () => {
                        catObj.products.splice(idx, 1);
                        if (catObj.products.length === 0) {
                            state.daysData[state.selectedDay].splice(catIdx, 1);
                        }
                        syncStructureAcrossDays(state);
                        this.renderTabs();
                        this.renderTable();
                        triggerSave();
                    };

                    if (isFlagged) {
                        doDelete();
                    } else {
                        const prodName = targetProd.description || 'dit product';
                        showConfirmModal(
                            'Product Verwijderen',
                            `Weet je zeker dat je "${prodName}" wilt verwijderen voor alle dagen?`,
                            doDelete
                        );
                    }
                }
            });
        });

        const editableCells = Array.from(tbody.querySelectorAll('.bakplan-row [contenteditable="true"]'));
        editableCells.forEach((cell, idx) => {
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextCell = editableCells[idx + 1];
                    if (nextCell) {
                        nextCell.focus();
                    } else {
                        cell.blur();
                    }
                }
            });

            cell.addEventListener('input', (e) => {
                const catIdx = parseInt(e.target.dataset.catidx);
                const idx = parseInt(e.target.dataset.idx);
                const field = e.target.dataset.field;
                let text = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');

                if (field === 'price' || field === 'promo') {
                    text = text.replace('€', '').trim();
                    if (text === '-') text = '';
                }

                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj && catObj.products && catObj.products[idx]) {
                    catObj.products[idx][field] = text;
                    if (field === 'description') {
                        syncStructureAcrossDays(state);
                    }
                    if (field === 'gemVerk' || field === 'description') {
                        const currentProd = catObj.products[idx];
                        const gemVerkNum = parseInt(currentProd.gemVerk) || 0;
                        const plateQty = getPlateQuantity(currentProd.description, state.productPlateConfig);
                        const platen = Math.round((gemVerkNum / plateQty) * 10) / 10;
                        const row = e.target.closest('tr');
                        if (row) {
                            const platenCell = row.querySelector('td[data-label="Platen"]');
                            if (platenCell) platenCell.textContent = platen;
                        }
                    }
                    triggerSave();
                }
            });

            cell.addEventListener('contextmenu', (e) => {
                const catIdx = parseInt(e.target.dataset.catidx);
                const prodIdx = parseInt(e.target.dataset.idx);
                const field = e.target.dataset.field;
                if (!isNaN(catIdx) && !isNaN(prodIdx) && field) {
                    window.openContextMenu(e, catIdx, prodIdx, field);
                }
            });
        });
    }
};
