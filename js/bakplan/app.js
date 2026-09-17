import { supabase, showToast, invokeFn, showConfirmModal } from '../main.js';
import { getBakplanData, setBakplanData, getCurrentDay, setCurrentDay, undo, redo, saveState, getBakplanSnapshot, setSavedSnapshot, hasUnsavedChanges, initUndoStack } from './state.js';
import { getDayValue, setDayValue, calculatePlaten, saveRememberedPerPlaat, syncBakplanPerPlaatMemory } from './utils.js';
import { updateSummaryStats, updateToggleAllButton, renderCategories } from './render.js';
import { findItem, deleteCategory, deleteRow, addCategory, addRowToCategory, toggleCategoryCollapse, toggleCartType, toggleAllCategories } from './actions.js';
import { showBakplanSyncMenu, initContextMenuDismiss } from './syncMenu.js';
import { parseBakplanPdf } from './pdf-handler.js';
import { openPrintableBakplan } from './printable-overview.js';
import { openCartsModal } from './carts-modal.js';

export async function saveBakplan() {
    const btnSave = document.getElementById('btn-save-bakplan');
    if (btnSave) btnSave.disabled = true;
    try {
        const bakplanData = getBakplanData();
        syncBakplanPerPlaatMemory(bakplanData);
        const { data, error } = await invokeFn('manage-bakplan', {
            body: { data: bakplanData }
        });
        if (error) {
            showToast('error', error);
        } else {
            setSavedSnapshot(getBakplanSnapshot());
            showToast('notification', 'Het bakplan is succesvol opgeslagen!');
        }
    } catch (err) {
        showToast('error', err.message || 'Er is een fout opgetreden');
    } finally {
        if (btnSave) btnSave.disabled = false;
    }
}

export async function loadBakplan() {
    const { data, error } = await supabase
        .from('bakplan')
        .select('data')
        .maybeSingle();

    if (!error && data && Array.isArray(data.data)) {
        const loaded = data.data.map(cat => ({
            ...cat,
            collapsed: false
        }));
        setBakplanData(loaded);
        syncBakplanPerPlaatMemory(loaded);
    }
    setSavedSnapshot(getBakplanSnapshot());
    initUndoStack(getBakplanData());
    renderCategories();
}

function handleUndoRedoRender() {
    const searchInput = document.getElementById('bakplan-search');
    renderCategories(searchInput ? searchInput.value : '');
}

export function initEvents() {
    const container = document.getElementById('categories-container');
    const searchInput = document.getElementById('bakplan-search');
    const btnAddCat = document.getElementById('btn-add-category');
    const btnToggleAll = document.getElementById('btn-toggle-all');
    const btnSave = document.getElementById('btn-save-bakplan');
    const btnUploadPdf = document.getElementById('btn-upload-pdf');
    const pdfInput = document.getElementById('bakplan-pdf-input');
    const btnGenerate = document.getElementById('btn-generate-bakplan');
    const daysTabs = document.getElementById('bakplan-days-tabs');

    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    initContextMenuDismiss();

    if (daysTabs) {
        daysTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.day-tab');
            if (!tab) return;
            const day = tab.dataset.day;
            if (!day || day === getCurrentDay()) return;

            daysTabs.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            setCurrentDay(day);

            renderCategories(searchInput ? searchInput.value : '');
        });
    }

    if (btnUploadPdf && pdfInput) {
        btnUploadPdf.addEventListener('click', () => {
            pdfInput.click();
        });

        pdfInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                btnUploadPdf.disabled = true;
                const updatedData = await parseBakplanPdf(file, getBakplanData());
                setBakplanData(updatedData);
                saveState();
                renderCategories(searchInput ? searchInput.value : '');
                showToast('notification', 'PDF succesvol geïmporteerd!');
            } catch (err) {
                showToast('error', err.message || 'Fout bij het lezen van PDF');
            } finally {
                btnUploadPdf.disabled = false;
                pdfInput.value = '';
            }
        });
    }

    if (btnGenerate) {
        btnGenerate.addEventListener('click', () => {
            openCartsModal(getBakplanData(), (carts) => {
                openPrintableBakplan(getBakplanData(), carts);
            });
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
            undo(handleUndoRedoRender);
        } else if (isCtrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo(handleUndoRedoRender);
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
        btnToggleAll.addEventListener('click', () => {
            toggleAllCategories();
            updateToggleAllButton();
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', saveBakplan);
    }

    if (container) {
        container.addEventListener('input', (e) => {
            saveState();
            const target = e.target;
            const bakplanData = getBakplanData();
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
                    if (field === 'derving') numVal = Math.abs(numVal);
                    else if (numVal < 0) numVal = 0;
                    if (numVal > 999999) numVal = 999999;
                    target.value = numVal;
                }
                if (field === 'perPlaat' || field === 'prijs') {
                    item[field] = numVal;
                    if (field === 'perPlaat') {
                        saveRememberedPerPlaat(item.omschrijving, numVal);
                    }
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
                updateToggleAllButton();
                return;
            }

            const cardHeader = e.target.closest('.category-card-header');
            if (cardHeader && !e.target.classList.contains('category-title-input')) {
                const catId = cardHeader.dataset.catId;
                toggleCategoryCollapse(catId);
                updateToggleAllButton();
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

window.addEventListener('beforeunload', (e) => {
    if (window.isLoggingOut) return;
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
            setSavedSnapshot(getBakplanSnapshot());
            window.location.href = href;
        }
    }
}, true);

document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    loadBakplan();
});
