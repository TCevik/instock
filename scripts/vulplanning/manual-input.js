import { state, createPersonNameElement } from './state.js';
import { showToast } from '../toast.js';
import { showConfirmModal } from './modals.js';
import { triggerSave } from './storage.js';
import { initPadenModal } from '../main.js';

export const renderPeopleList = (names) => {
    const card = document.getElementById('people-card');
    const list = document.getElementById('people-list');
    if (!card || !list) return;

    list.innerHTML = '';
    names.forEach(name => {
        const label = document.createElement('label');
        label.className = 'person-checkbox-label';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = name;
        checkbox.autocomplete = 'off';

        checkbox.addEventListener('change', () => {
            const selected = [];
            const cbs = list.querySelectorAll('input[type="checkbox"]');
            cbs.forEach(cb => {
                if (cb.checked) {
                    selected.push(cb.value);
                }
            });
            state.selectedFillers = selected;
            document.getElementById('next-step-btn').disabled = selected.length === 0;
            triggerSave();
        });

        const nameEl = createPersonNameElement(name, 'person-name', 'person-subtitle', 'person-info');

        label.appendChild(checkbox);
        label.appendChild(nameEl);
        list.appendChild(label);
    });

    card.style.display = names.length > 0 ? 'block' : 'none';
};

export const createManualInputManager = ({ renderWorkspace, storeEmployees, getStoreDefaultPaden, setStoreDefaultPaden, supabase, storeId }) => {
    const manualFillersList = document.getElementById('manual-fillers-list');
    const manualPathsList = document.getElementById('manual-paths-list');
    const addFillerBtn = document.getElementById('add-manual-filler-btn');
    const startManualBtn = document.getElementById('start-manual-planning-btn');

    const setupFillerAutocomplete = (inputEl, listEl) => {
        let currentMatches = [];
        const render = () => {
            const val = inputEl.value.trim().toLowerCase();
            if (!val) {
                currentMatches = [...storeEmployees];
            } else {
                currentMatches = storeEmployees.filter(e => e.toLowerCase().includes(val)).sort((a, b) => {
                    const aLower = a.toLowerCase();
                    const bLower = b.toLowerCase();
                    const aStarts = aLower.startsWith(val);
                    const bStarts = bLower.startsWith(val);
                    if (aStarts && !bStarts) return -1;
                    if (!aStarts && bStarts) return 1;
                    return 0;
                });
            }
            if (!currentMatches.length) {
                listEl.style.display = 'none';
                return;
            }
            listEl.innerHTML = '';
            currentMatches.forEach((empName, index) => {
                const item = document.createElement('div');
                item.className = 'filler-autocomplete-item';
                item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 13px; color: var(--text-color);';
                const nameEl = createPersonNameElement(empName, 'person-name', 'person-subtitle', 'person-info');
                item.appendChild(nameEl);
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    inputEl.value = empName;
                    listEl.style.display = 'none';
                    const row = inputEl.closest('.manual-filler-row');
                    if (row) {
                        const startInput = row.querySelector('.manual-filler-start');
                        if (startInput) startInput.focus();
                    }
                });
                listEl.appendChild(item);
            });
            listEl.style.display = 'block';
        };

        inputEl.addEventListener('focus', () => render());
        inputEl.addEventListener('input', () => render());
        inputEl.addEventListener('blur', () => {
            setTimeout(() => { listEl.style.display = 'none'; }, 200);
        });
    };

    const addFillerRow = (nameVal = '', startVal = '', endVal = '', pauseVal = '') => {
        if (!manualFillersList) return null;
        const row = document.createElement('div');
        row.className = 'manual-filler-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px; position: relative;';
        row.innerHTML = `
            <div style="flex: 2; position: relative;">
                <input type="text" class="manual-filler-name form-input" placeholder="Naam medewerker..." value="${nameVal}" style="width: 100%;">
                <div class="filler-autocomplete-list" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; z-index: 100; max-height: 160px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></div>
            </div>
            <input type="text" class="manual-filler-start form-input" placeholder="00:00" value="${startVal}" style="flex: 1; text-align: center;" maxlength="5">
            <input type="text" class="manual-filler-end form-input" placeholder="00:00" value="${endVal}" style="flex: 1; text-align: center;" maxlength="5">
            <input type="number" class="manual-filler-pause form-input" placeholder="0" value="${pauseVal}" style="flex: 0.8; text-align: center;" min="0">
            <button type="button" class="action-btn remove-filler-btn" style="padding: 6px; color: var(--danger-color); background: none; border: none; cursor: pointer;" title="Verwijderen"><i class="material-icons">delete</i></button>
        `;

        const removeBtn = row.querySelector('.remove-filler-btn');
        removeBtn.addEventListener('click', () => {
            row.remove();
            if (manualFillersList.children.length === 0) {
                addFillerRow();
            }
        });

        const nameInput = row.querySelector('.manual-filler-name');
        const startInput = row.querySelector('.manual-filler-start');
        const endInput = row.querySelector('.manual-filler-end');
        const pauseInput = row.querySelector('.manual-filler-pause');

        const formatTimeInput = (input, nextInput) => {
            input.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val.length >= 3) {
                    val = val.substring(0, 2) + ':' + val.substring(2, 4);
                }
                if (val.length > 5) val = val.substring(0, 5);
                if (e.target.value !== val) {
                    input.value = val;
                }
                if (val.length === 4 && nextInput && !nextInput.value) {
                    nextInput.focus();
                }
            });
        };

        formatTimeInput(startInput, endInput);
        formatTimeInput(endInput, pauseInput);

        startInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                endInput.focus();
            } else if (e.key === 'Backspace' && !startInput.value) {
                e.preventDefault();
                nameInput.value = '';
                nameInput.focus();
            }
        });

        endInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                pauseInput.focus();
            } else if (e.key === 'Backspace' && !endInput.value) {
                e.preventDefault();
                startInput.value = '';
                startInput.focus();
            }
        });

        pauseInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const newRow = addFillerRow();
                if (newRow) {
                    const newNameInput = newRow.querySelector('.manual-filler-name');
                    if (newNameInput) newNameInput.focus();
                }
            } else if (e.key === 'Backspace' && !pauseInput.value) {
                e.preventDefault();
                endInput.value = '';
                endInput.focus();
            }
        });

        setupFillerAutocomplete(nameInput, row.querySelector('.filler-autocomplete-list'));
        manualFillersList.appendChild(row);
        return row;
    };

    const addCategoryRow = (tbody, catName = '', colli = '', norm = '', pathIdx = 0, headerTr = null) => {
        const tr = document.createElement('tr');
        tr.className = 'bakplan-row manual-category-row';
        tr.setAttribute('data-path-idx', pathIdx);
        tr.innerHTML = `
            <td style="padding: 6px 12px; font-weight: 500; width: 240px;">
                <input type="text" value="${catName}" class="manual-cat-name" readonly style="width: 100%; border: none; background: transparent; color: var(--text-color); font-weight: 500; font-size: 13px; outline: none; cursor: default;">
            </td>
            <td style="padding: 6px 12px; width: 120px;">
                <input type="number" placeholder="0" value="${colli}" class="manual-cat-colli" style="width: 100%; padding: 5px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px; font-weight: 600;">
            </td>
            <td style="padding: 6px 12px; width: 120px;">
                <input type="number" value="${norm}" class="manual-cat-norm" readonly style="width: 100%; border: none; background: transparent; color: var(--text-color-muted); font-size: 13px; outline: none; cursor: default;">
            </td>
        `;

        const colliInput = tr.querySelector('.manual-cat-colli');
        if (colliInput) {
            colliInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const allColliInputs = Array.from(tbody.querySelectorAll('.manual-cat-colli'));
                    const currentIndex = allColliInputs.indexOf(colliInput);
                    if (currentIndex !== -1 && currentIndex < allColliInputs.length - 1) {
                        allColliInputs[currentIndex + 1].focus();
                        allColliInputs[currentIndex + 1].select();
                    }
                }
            });
        }
        
        const existingRows = tbody.querySelectorAll(`tr.manual-category-row[data-path-idx="${pathIdx}"]`);
        if (existingRows.length > 0) {
            existingRows[existingRows.length - 1].after(tr);
        } else if (headerTr) {
            headerTr.after(tr);
        } else {
            tbody.appendChild(tr);
        }
    };

    const addPathBlock = (pathName = '', mirrorNorm = '') => {
        const tbody = document.getElementById('manual-paths-tbody') || manualPathsList;
        const pathIdx = Date.now() + Math.random();

        const headerTr = document.createElement('tr');
        headerTr.className = 'category-header-row manual-path-header';
        headerTr.setAttribute('data-path-idx', pathIdx);
        headerTr.innerHTML = `
            <td colspan="3" style="padding: 8px 12px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="text" value="${pathName}" class="manual-path-name" readonly style="border: none; background: transparent; color: var(--text-color); font-weight: 700; font-size: 14px; outline: none; cursor: default; width: auto; max-width: 220px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; margin-left: 8px;">(Spiegelnorm: ${mirrorNorm} min)</span>
                    <input type="hidden" value="${mirrorNorm}" class="manual-path-mirror-norm">
                </div>
            </td>
        `;

        tbody.appendChild(headerTr);

        const addCat = (cName = '', cColli = '', cNorm = '') => addCategoryRow(tbody, cName, cColli, cNorm, pathIdx, headerTr);

        return { addCategoryRow: addCat };
    };

    const initPathsTable = () => {
        manualPathsList.innerHTML = `
            <div class="table-container">
                <table class="users-table" style="width: 100%; max-width: 500px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; width: 240px;">Categorie</th>
                            <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; width: 120px;">Aantal Colli</th>
                            <th style="padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; width: 120px;">Norm (colli/u)</th>
                        </tr>
                    </thead>
                    <tbody id="manual-paths-tbody"></tbody>
                </table>
            </div>
        `;
    };

    const populatePaths = (padenList, categoryColliMap = {}) => {
        initPathsTable();
        if (Array.isArray(padenList) && padenList.length > 0) {
            padenList.forEach(p => {
                const pathRes = addPathBlock(p.name || '', p.mirrorNorm !== undefined ? p.mirrorNorm : '');
                if (Array.isArray(p.categories) && p.categories.length > 0) {
                    p.categories.forEach(c => {
                        const catKey = (c.name || '').toLowerCase();
                        const colliVal = categoryColliMap[catKey] !== undefined ? categoryColliMap[catKey] : '';
                        pathRes.addCategoryRow(c.name || '', colliVal, c.norm || '');
                    });
                }
            });
        }
    };

    if (addFillerBtn) addFillerBtn.addEventListener('click', () => addFillerRow());

    if (Object.keys(state.pathColli).length > 0) {
        initPathsTable();
        Object.entries(state.pathColli).forEach(([pathName, obj]) => {
            const pathRes = addPathBlock(pathName, obj.mirrorDuration !== undefined ? obj.mirrorDuration : '');
            const norm = obj.colli && obj.duration ? Math.round((obj.colli / (obj.duration / 60))) : '';
            pathRes.addCategoryRow(pathName, obj.colli || '', norm);
        });
    } else {
        populatePaths(getStoreDefaultPaden());
    }

    initPadenModal(supabase, storeId, (newPaden) => {
        setStoreDefaultPaden(newPaden);
        populatePaths(newPaden);
    });

    const padenHeaderBtn = document.getElementById('open-paden-header-btn');
    if (padenHeaderBtn) {
        padenHeaderBtn.addEventListener('click', () => {
            const openModalBtn = document.getElementById('open-paden-modal-btn');
            if (openModalBtn) openModalBtn.click();
        });
    }

    if (state.selectedFillers && state.selectedFillers.length > 0) {
        state.selectedFillers.forEach(displayName => {
            const match = displayName.match(/^(.+?)\s*-\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
            const pause = state.fillerBreaks && state.fillerBreaks[displayName] !== undefined ? state.fillerBreaks[displayName] : '';
            if (match) {
                addFillerRow(match[1], match[2], match[3], pause);
            } else {
                addFillerRow(displayName, '', '', pause);
            }
        });
    } else {
        addFillerRow('', '', '', '');
    }

    if (startManualBtn) {
        startManualBtn.addEventListener('click', () => {
            const fillerRows = manualFillersList.querySelectorAll('.manual-filler-row');
            const newFillers = [];
            const seenNames = new Set();
            let duplicateName = '';
            let missingTimes = false;
            let invalidTimes = false;
            fillerRows.forEach(r => {
                const nameInput = r.querySelector('.manual-filler-name');
                if (!nameInput) return;
                const name = nameInput.value.trim();
                const start = r.querySelector('.manual-filler-start')?.value || '';
                const end = r.querySelector('.manual-filler-end')?.value || '';
                const pauseVal = r.querySelector('.manual-filler-pause')?.value;
                if (name) {
                    const lowerName = name.toLowerCase();
                    if (seenNames.has(lowerName)) {
                        duplicateName = name;
                    }
                    seenNames.add(lowerName);

                    if (!start || !end) missingTimes = true;
                    if (start && end && start >= end) invalidTimes = true;
                    const displayName = `${name} - ${start} - ${end}`;
                    newFillers.push(displayName);
                    if (pauseVal !== undefined && pauseVal !== '') {
                        state.fillerBreaks[displayName] = parseInt(pauseVal, 10) || 0;
                    }
                }
            });

            if (duplicateName) {
                showToast(`Vuller "${duplicateName}" mag maar 1x worden toegevoegd.`, 'error');
                return;
            }

            if (!newFillers.length) {
                showToast('Voeg ten minste één vuller met naam toe.', 'error');
                return;
            }

            if (missingTimes) {
                showToast('Vul de begin- en eindtijd in voor alle vullers.', 'error');
                return;
            }

            if (invalidTimes) {
                showToast('De begintijd van een vuller moet vroeger zijn dan de eindtijd.', 'error');
                return;
            }

            const tbody = document.getElementById('manual-paths-tbody');
            const headerRows = tbody ? tbody.querySelectorAll('.manual-path-header') : [];
            if (!headerRows.length) {
                showToast('Voeg ten minste één pad toe.', 'error');
                return;
            }

            let missingPathName = false;
            let missingCatName = false;
            let missingNorm = false;

            const newPathColli = {};

            headerRows.forEach(headerTr => {
                const pathIdx = headerTr.getAttribute('data-path-idx');
                const pathName = headerTr.querySelector('.manual-path-name')?.value.trim() || '';
                if (!pathName) missingPathName = true;
                const mirrorNormVal = headerTr.querySelector('.manual-path-mirror-norm')?.value;
                const mirrorDur = mirrorNormVal !== undefined && mirrorNormVal !== '' ? parseFloat(mirrorNormVal) : 21;

                const catRows = tbody.querySelectorAll(`tr.manual-category-row[data-path-idx="${pathIdx}"]`);
                if (!catRows.length) missingCatName = true;

                let totalColli = 0;
                let weightedSumMinutes = 0;

                catRows.forEach(cr => {
                    const catName = cr.querySelector('.manual-cat-name')?.value.trim() || '';
                    if (!catName) missingCatName = true;

                    const colliVal = parseFloat(cr.querySelector('.manual-cat-colli')?.value) || 0;
                    const normVal = parseFloat(cr.querySelector('.manual-cat-norm')?.value) || 0;

                    if (!normVal || normVal <= 0) missingNorm = true;

                    totalColli += colliVal;
                    if (normVal > 0) {
                        weightedSumMinutes += (colliVal / normVal) * 60;
                    }
                });

                newPathColli[pathName] = {
                    colli: totalColli,
                    duration: Math.round(weightedSumMinutes),
                    mirrorDuration: mirrorDur
                };
            });

            if (missingPathName) {
                showToast('Vul een naam in voor elk pad.', 'error');
                return;
            }

            if (missingCatName) {
                showToast('Vul een naam in voor alle categorieën.', 'error');
                return;
            }

            if (missingNorm) {
                showToast('Vul een geldige norm in voor alle categorieën.', 'error');
                return;
            }

            const totalColliAll = Object.values(newPathColli).reduce((acc, p) => acc + p.colli, 0);
            if (totalColliAll <= 0) {
                showToast('Vul colli-aantallen in voor de paden.', 'error');
                return;
            }

            state.selectedFillers = newFillers;
            state.pathColli = newPathColli;
            state.fillerTasks = {};
            state.helpers = {};
            state.instanceTimes = {};
            state.actualEndTimes = {};

            document.getElementById('step-1-container').style.display = 'none';
            document.getElementById('step-2-container').style.display = 'block';
            const manualContainer = document.getElementById('manual-input-container');
            if (manualContainer) manualContainer.style.display = 'none';
            renderWorkspace();
            const resetBtn = document.getElementById('reset-planning-btn');
            const generateBtn = document.getElementById('generate-planning-btn');
            if (resetBtn) resetBtn.style.display = 'inline-block';
            if (generateBtn) generateBtn.style.display = 'flex';
            triggerSave();
        });
    }

    return { addFillerRow, populatePaths };
};
