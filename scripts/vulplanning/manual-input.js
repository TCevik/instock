import { state, createPersonNameElement, formatTimeInputValue, normalizeTimeString } from './state.js';
import { showToast } from '../toast.js';
import { showConfirmModal } from '../modal.js';
import { triggerSave } from './storage.js';
import { initPadenModal } from '../main.js';
import {
    matchEmployeeName,
    getEmployeeFullName,
    getEmployeeUsername,
    getEmployeeFirstName,
    parseNameAndSubtitle
} from './planning-logic.js';
import { initHistory } from './history.js';
import { HARDCODED_MIRROR_TIMES, HARDCODED_RESTANTEN_TIMES } from './plus/pdf-defaults.js';

export const setupFillerAutocomplete = (inputEl, listEl, employeesList, onSelect, getExcluded = null) => {
    let currentMatches = [];
    const getList = () => {
        if (typeof employeesList === 'function') return employeesList() || [];
        if (Array.isArray(employeesList) && employeesList.length > 0) return employeesList;
        return state.storeEmployees || [];
    };

    const render = () => {
        let list = getList();
        const excluded = typeof getExcluded === 'function' ? getExcluded() : null;
        if (excluded && excluded.size > 0) {
            list = list.filter(e => {
                const un = getEmployeeUsername(e).toLowerCase();
                if (un && (excluded.has(`@${un}`) || excluded.has(un))) return false;
                return true;
            });
        }
        const val = inputEl.value.trim().toLowerCase();
        if (!val) {
            currentMatches = [...list];
        } else {
            currentMatches = list.filter(e => {
                const fullName = getEmployeeFullName(e).toLowerCase();
                return fullName.includes(val);
            }).sort((a, b) => {
                const aName = getEmployeeFullName(a).toLowerCase();
                const bName = getEmployeeFullName(b).toLowerCase();
                const aStarts = aName.startsWith(val);
                const bStarts = bName.startsWith(val);
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
        currentMatches.forEach((emp) => {
            const fullName = getEmployeeFullName(emp);
            const username = getEmployeeUsername(emp);
            const item = document.createElement('div');
            item.className = 'filler-autocomplete-item';
            item.style.cssText = 'padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 13px; color: var(--text-color); display: flex; flex-direction: column; gap: 2px;';
            
            const nameEl = document.createElement('span');
            nameEl.style.fontWeight = '500';
            nameEl.textContent = fullName;
            item.appendChild(nameEl);

            if (username) {
                const userEl = document.createElement('span');
                userEl.style.fontSize = '11px';
                userEl.style.color = 'var(--text-color-muted)';
                userEl.textContent = `@${username}`;
                item.appendChild(userEl);
            }

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                inputEl.value = fullName;
                inputEl.dataset.username = username;
                listEl.style.display = 'none';
                if (onSelect) onSelect(emp);
            });
            listEl.appendChild(item);
        });
        listEl.style.display = 'block';
    };

    inputEl.addEventListener('focus', () => render());
    inputEl.addEventListener('input', () => {
        delete inputEl.dataset.username;
        render();
    });
    inputEl.addEventListener('blur', () => {
        setTimeout(() => { listEl.style.display = 'none'; }, 200);
    });

    return { render };
};

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

    const addFillerRow = (nameVal = '', startVal = '', endVal = '', pauseVal = '', matchInfo = null) => {
        if (!manualFillersList) return null;
        const row = document.createElement('div');
        row.className = 'manual-filler-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 18px; position: relative;';

        const initialName = typeof nameVal === 'object' ? getEmployeeFullName(nameVal) : (nameVal || '');
        const initialUsername = typeof nameVal === 'object' ? getEmployeeUsername(nameVal) : '';
        const origName = matchInfo ? matchInfo.originalName : '';

        row.innerHTML = `
            <div style="flex: 2; position: relative;">
                <div style="display: flex; align-items: center; gap: 4px;">
                    <input type="text" class="manual-filler-name form-input" placeholder="Naam medewerker..." value="${initialName}" ${initialUsername ? `data-username="${initialUsername}"` : ''} style="width: 100%;">
                    <button type="button" class="match-toggle-btn" style="padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); cursor: pointer; display: none; align-items: center; justify-content: center;">
                        <i class="material-icons match-icon" style="font-size: 16px;">cancel</i>
                    </button>
                </div>
                <div class="manual-filler-user-badge" style="display: none; position: absolute; top: calc(100% + 2px); left: 2px; font-size: 11px; color: var(--text-color-muted); white-space: nowrap; pointer-events: none;"></div>
                <div class="filler-autocomplete-list" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; z-index: 100; max-height: 160px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></div>
            </div>
            <input type="text" class="manual-filler-start form-input" placeholder="vanaf" value="${startVal}" style="flex: 1; text-align: center;" maxlength="5">
            <input type="text" class="manual-filler-end form-input" placeholder="tot" value="${endVal}" style="flex: 1; text-align: center;" maxlength="5">
            <input type="number" class="manual-filler-pause form-input" placeholder="pauze" value="${pauseVal}" style="flex: 0.8; text-align: center;" min="0">
            <button type="button" class="action-btn remove-filler-btn" style="padding: 6px; color: var(--danger-color); background: none; border: none; cursor: pointer;" title="Verwijderen"><i class="material-icons">delete</i></button>
        `;

        const nameInput = row.querySelector('.manual-filler-name');
        const matchToggleBtn = row.querySelector('.match-toggle-btn');
        const matchIcon = row.querySelector('.match-icon');
        const userBadge = row.querySelector('.manual-filler-user-badge');
        let currentMatchedState = false;
        const getOtherRows = () => {
            if (!manualFillersList) return [];
            return Array.from(manualFillersList.querySelectorAll('.manual-filler-row')).filter(r => r !== row);
        };

        const updateUIState = (val) => {
            const trimmed = (val || '').trim();
            const explicitUsername = nameInput.dataset.username || null;
            const { matchedUser, hasMultipleMatches, candidateMatches } = matchEmployeeName(trimmed, storeEmployees, explicitUsername);
            const matchedFullName = getEmployeeFullName(matchedUser);
            const isExactMatch = !!matchedUser && (matchedFullName.toLowerCase() === trimmed.toLowerCase() || !!explicitUsername);
            const u = isExactMatch ? getEmployeeUsername(matchedUser) : explicitUsername;

            if (trimmed) {
                const otherRows = getOtherRows();
                const isDuplicate = otherRows.some(r => {
                    const otherInp = r.querySelector('.manual-filler-name');
                    if (!otherInp) return false;
                    const otherUser = otherInp.dataset.username ? otherInp.dataset.username.toLowerCase() : '';
                    const otherVal = otherInp.value.trim().toLowerCase();
                    if (u && otherUser) {
                        return u.toLowerCase() === otherUser;
                    }
                    if (!u && !otherUser && trimmed && otherVal) {
                        return trimmed.toLowerCase() === otherVal;
                    }
                    return false;
                });

                if (isDuplicate) {
                    currentMatchedState = false;
                    nameInput.style.backgroundColor = 'var(--danger-bg)';
                    nameInput.style.borderColor = 'var(--danger-color)';
                    matchIcon.textContent = 'cancel';
                    matchIcon.style.color = 'var(--danger-color)';
                    matchToggleBtn.style.display = 'inline-flex';
                    matchToggleBtn.style.background = 'var(--danger-bg)';
                    matchToggleBtn.style.borderColor = 'var(--danger-color)';
                    matchToggleBtn.title = 'Deze medewerker staat al in de planning';
                    if (userBadge) {
                        userBadge.style.display = 'block';
                        userBadge.innerHTML = `<span style="color: var(--danger-color); font-weight: 500;">Staat al in de planning</span>`;
                    }
                    return;
                }
            }

            if (isExactMatch) {
                currentMatchedState = true;
                matchIcon.textContent = 'check_circle';
                matchIcon.style.color = 'var(--success-color)';
                matchToggleBtn.style.display = 'inline-flex';
                matchToggleBtn.style.background = 'var(--input-bg)';
                matchToggleBtn.style.borderColor = 'var(--border-color)';
                matchToggleBtn.title = u ? `Gekoppeld aan @${u} (klik voor undo)` : 'Gekoppeld met account (klik voor undo)';
                nameInput.style.backgroundColor = 'var(--success-bg)';
                nameInput.style.borderColor = 'var(--success-color)';
                if (userBadge) {
                    if (u) {
                        userBadge.style.display = 'block';
                        userBadge.innerHTML = `Gekoppeld account: <strong style="color: var(--accent-color-sidemenu);">@${u}</strong>`;
                    } else {
                        userBadge.style.display = 'none';
                    }
                }
            } else if (hasMultipleMatches) {
                currentMatchedState = false;
                matchIcon.textContent = 'cancel';
                matchIcon.style.color = 'var(--danger-color)';
                matchToggleBtn.style.display = 'inline-flex';
                matchToggleBtn.style.background = 'var(--danger-bg)';
                matchToggleBtn.style.borderColor = 'var(--danger-color)';
                const namesStr = candidateMatches && candidateMatches.length ? candidateMatches.map(c => {
                    const user = getEmployeeUsername(c);
                    return user ? `${getEmployeeFullName(c)} (@${user})` : getEmployeeFullName(c);
                }).join(', ') : '';
                matchToggleBtn.title = namesStr ? `Meerdere accounts gevonden (${namesStr}). Kies uit de lijst.` : 'Meerdere accounts gevonden. Kies uit de lijst.';
                nameInput.style.backgroundColor = 'var(--danger-bg)';
                nameInput.style.borderColor = 'var(--danger-color)';
            } else if (!trimmed) {
                currentMatchedState = false;
                matchToggleBtn.style.display = 'none';
                nameInput.style.backgroundColor = '';
                nameInput.style.borderColor = '';
                if (userBadge) userBadge.style.display = 'none';
            } else {
                currentMatchedState = false;
                matchIcon.textContent = 'cancel';
                matchIcon.style.color = 'var(--danger-color)';
                matchToggleBtn.style.display = 'inline-flex';
                matchToggleBtn.style.background = 'var(--danger-bg)';
                matchToggleBtn.style.borderColor = 'var(--danger-color)';
                matchToggleBtn.title = 'Niet gekoppeld aan een gebruikersaccount';
                nameInput.style.backgroundColor = '';
                nameInput.style.borderColor = '';
                if (userBadge) {
                    userBadge.style.display = 'block';
                    userBadge.innerHTML = `<span style="color: var(--danger-color); font-weight: 500;">Niet gekoppeld aan account</span>`;
                }
            }
        };

        nameInput.addEventListener('input', () => {
            updateUIState(nameInput.value);
        });

        if (matchToggleBtn) {
            matchToggleBtn.addEventListener('click', () => {
                if (currentMatchedState) {
                    currentMatchedState = false;
                    if (origName) {
                        nameInput.value = origName;
                    }
                    updateUIState(nameInput.value);
                } else {
                    nameInput.focus();
                    if (autocompleteManager) {
                        autocompleteManager.render();
                    }
                }
            });
        }

        updateUIState(initialName);

        const removeBtn = row.querySelector('.remove-filler-btn');
        removeBtn.addEventListener('click', () => {
            row.remove();
            if (manualFillersList.children.length === 0) {
                addFillerRow();
            }
        });

        const startInput = row.querySelector('.manual-filler-start');
        const endInput = row.querySelector('.manual-filler-end');
        const pauseInput = row.querySelector('.manual-filler-pause');

        const formatTimeInput = (input, nextInput) => {
            input.addEventListener('input', (e) => {
                const val = formatTimeInputValue(e.target.value);
                if (e.target.value !== val) {
                    input.value = val;
                }
                if (val.length === 5 && nextInput && !nextInput.value) {
                    nextInput.focus();
                }
            });
            input.addEventListener('blur', (e) => {
                const norm = normalizeTimeString(e.target.value);
                if (norm && e.target.value !== norm) {
                    input.value = norm;
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

        setupFillerAutocomplete(nameInput, row.querySelector('.filler-autocomplete-list'), storeEmployees, (emp) => {
            const u = getEmployeeUsername(emp);
            nameInput.value = getEmployeeFullName(emp);
            if (u) {
                nameInput.dataset.username = u;
            } else {
                delete nameInput.dataset.username;
            }
            updateUIState(nameInput.value);
            startInput.focus();
        }, () => {
            const used = new Set();
            getOtherRows().forEach(r => {
                const inp = r.querySelector('.manual-filler-name');
                if (!inp) return;
                const u = inp.dataset.username;
                if (u) {
                    used.add(u.toLowerCase());
                    used.add(`@${u.toLowerCase()}`);
                }
            });
            return used;
        });

        const parsedInitial = parseNameAndSubtitle(nameVal);
        if (parsedInitial.username) {
            nameInput.dataset.username = parsedInitial.username;
            nameInput.value = parsedInitial.name;
        }
        updateUIState(nameInput.value);

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

    const addPathBlock = (pathName = '', mirrorNorm = '', restantenNorm = '') => {
        const tbody = document.getElementById('manual-paths-tbody') || manualPathsList;
        const pathIdx = Date.now() + Math.random();

        const headerTr = document.createElement('tr');
        headerTr.className = 'category-header-row manual-path-header';
        headerTr.setAttribute('data-path-idx', pathIdx);
        headerTr.innerHTML = `
            <td colspan="3" style="padding: 8px 12px;">
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <input type="text" value="${pathName}" class="manual-path-name" readonly style="border: none; background: transparent; color: var(--text-color); font-weight: 700; font-size: 14px; outline: none; cursor: default; width: auto; max-width: 220px;">
                    <span style="font-size: 11px; font-weight: 600; color: var(--text-color-muted); text-transform: uppercase; margin-left: 8px;">(Spiegelen: ${mirrorNorm}m | Restanten: ${restantenNorm}m)</span>
                    <input type="hidden" value="${mirrorNorm}" class="manual-path-mirror-norm">
                    <input type="hidden" value="${restantenNorm}" class="manual-path-restanten-norm">
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
                const pathRes = addPathBlock(p.name || '', p.mirrorNorm !== undefined ? p.mirrorNorm : '', p.restantenNorm !== undefined ? p.restantenNorm : '');
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

    const defaultPadenList = getStoreDefaultPaden();
    populatePaths(defaultPadenList);

    if (Object.keys(state.pathColli).length > 0) {
        const tbody = document.getElementById('manual-paths-tbody');
        if (tbody) {
            Object.entries(state.pathColli).forEach(([pathName, obj]) => {
                const headerTrs = Array.from(tbody.querySelectorAll('.manual-path-header'));
                const matchedHeader = headerTrs.find(h => h.querySelector('.manual-path-name')?.value.trim().toLowerCase() === pathName.toLowerCase());
                if (matchedHeader) {
                    const pIdx = matchedHeader.getAttribute('data-path-idx');
                    const catRows = tbody.querySelectorAll(`tr.manual-category-row[data-path-idx="${pIdx}"]`);
                    if (catRows.length === 1 && obj.colli !== undefined) {
                        const colliInput = catRows[0].querySelector('.manual-cat-colli');
                        if (colliInput) colliInput.value = obj.colli;
                    }
                }
            });
        }
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
                const userFromInput = nameInput.dataset.username || '';
                const start = normalizeTimeString(r.querySelector('.manual-filler-start')?.value || '');
                const end = normalizeTimeString(r.querySelector('.manual-filler-end')?.value || '');
                const pauseVal = r.querySelector('.manual-filler-pause')?.value;
                if (name) {
                    const finalName = userFromInput ? `${name} (@${userFromInput})` : name;
                    const uniqueKey = userFromInput ? `@${userFromInput.toLowerCase()}` : finalName.toLowerCase();
                    if (seenNames.has(uniqueKey)) {
                        duplicateName = name;
                    }
                    seenNames.add(uniqueKey);

                    const toMin = (t) => {
                        const p = (t || '').split(':').map(Number);
                        return (p[0] || 0) * 60 + (p[1] || 0);
                    };
                    if (!start || !end) missingTimes = true;
                    if (start && end && toMin(start) >= toMin(end)) invalidTimes = true;
                    const displayName = `${finalName} - ${start} - ${end}`;
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
                showToast('De begintijd moet voor de eindtijd liggen.', 'error');
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
                const restantenNormVal = headerTr.querySelector('.manual-path-restanten-norm')?.value;
                const restantenDur = restantenNormVal !== undefined && restantenNormVal !== '' ? parseFloat(restantenNormVal) : 20;

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
                    mirrorDuration: mirrorDur,
                    restantenDuration: restantenDur
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

            const unlinkedFillers = [];
            newFillers.forEach(displayName => {
                const { name, username } = parseNameAndSubtitle(displayName);
                const isLinked = Array.isArray(storeEmployees) && storeEmployees.some(emp => {
                    const fn = getEmployeeFullName(emp).toLowerCase();
                    const un = getEmployeeUsername(emp).toLowerCase();
                    return (username && un === username.toLowerCase()) || fn === name.toLowerCase() || (un && un === name.toLowerCase());
                });
                if (!isLinked) {
                    unlinkedFillers.push(name);
                }
            });

            const proceedWithPlanning = () => {
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
                const finalizeBtn = document.getElementById('finalize-planning-btn');
                if (resetBtn) resetBtn.style.display = 'inline-block';
                if (generateBtn) generateBtn.style.display = 'flex';
                if (finalizeBtn) finalizeBtn.style.display = 'flex';
                initHistory();
                triggerSave();
            };

            if (unlinkedFillers.length > 0) {
                const namesList = unlinkedFillers.map(n => `<li>${n}</li>`).join('');
                showConfirmModal(
                    'Niet-gekoppelde Vullers',
                    `<p>De volgende vullers zijn niet gekoppeld aan een account:</p><ul style="margin: 8px 0; padding-left: 20px;">${namesList}</ul><p>Hier worden de eindtijden <strong>niet</strong> van opgeslagen.</p><p style="margin-top: 8px;">Wil je toch doorgaan met de planning?</p>`,
                    'Planning Starten',
                    proceedWithPlanning,
                    null,
                    'Aanpassen'
                );
            } else {
                proceedWithPlanning();
            }
        });
    }

    const recalculateStep1 = () => {
        if (!state.pathColli) state.pathColli = {};
        const tbody = document.getElementById('manual-paths-tbody');
        const headerRows = tbody ? tbody.querySelectorAll('.manual-path-header') : [];
        if (headerRows.length > 0) {
            headerRows.forEach(headerTr => {
                const pathIdx = headerTr.getAttribute('data-path-idx');
                const pathName = headerTr.querySelector('.manual-path-name')?.value.trim() || '';
                if (!pathName) return;
                const mirrorNormVal = headerTr.querySelector('.manual-path-mirror-norm')?.value;
                const mirrorDur = mirrorNormVal !== undefined && mirrorNormVal !== '' ? parseFloat(mirrorNormVal) : (HARDCODED_MIRROR_TIMES[pathName] !== undefined ? HARDCODED_MIRROR_TIMES[pathName] : 21);
                const restantenNormVal = headerTr.querySelector('.manual-path-restanten-norm')?.value;
                const restantenDur = restantenNormVal !== undefined && restantenNormVal !== '' ? parseFloat(restantenNormVal) : (HARDCODED_RESTANTEN_TIMES[pathName] !== undefined ? HARDCODED_RESTANTEN_TIMES[pathName] : 20);

                const catRows = tbody.querySelectorAll(`tr.manual-category-row[data-path-idx="${pathIdx}"]`);
                let totalColli = 0;
                let weightedSumMinutes = 0;

                catRows.forEach(cr => {
                    const colliVal = parseFloat(cr.querySelector('.manual-cat-colli')?.value) || 0;
                    const normVal = parseFloat(cr.querySelector('.manual-cat-norm')?.value) || 0;
                    totalColli += colliVal;
                    if (normVal > 0) {
                        weightedSumMinutes += (colliVal / normVal) * 60;
                    }
                });

                if (!state.pathColli[pathName]) {
                    state.pathColli[pathName] = { colli: totalColli, duration: Math.round(weightedSumMinutes) };
                }
                if (totalColli > 0 && weightedSumMinutes > 0) {
                    state.pathColli[pathName].colli = totalColli;
                    state.pathColli[pathName].duration = Math.round(weightedSumMinutes);
                }
                state.pathColli[pathName].mirrorDuration = mirrorDur;
                state.pathColli[pathName].restantenDuration = restantenDur;
            });
        }
        Object.keys(state.pathColli).forEach(pathName => {
            const item = state.pathColli[pathName];
            if (item) {
                if (HARDCODED_MIRROR_TIMES[pathName] !== undefined) {
                    item.mirrorDuration = HARDCODED_MIRROR_TIMES[pathName];
                } else if (item.mirrorDuration === undefined) {
                    item.mirrorDuration = 21;
                }
                if (HARDCODED_RESTANTEN_TIMES[pathName] !== undefined) {
                    item.restantenDuration = HARDCODED_RESTANTEN_TIMES[pathName];
                } else if (item.restantenDuration === undefined) {
                    item.restantenDuration = 20;
                }
            }
        });
    };

    return { addFillerRow, populatePaths, recalculateStep1 };
};
