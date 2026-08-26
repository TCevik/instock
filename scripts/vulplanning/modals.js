import { setupModal, showConfirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import {
    state,
    getTaskDuration,
    getTaskAssignment,
    getAvailableTime,
    getFillerTotalTime,
    removeTaskFromAll,
    formatTimeInputValue,
    getFillerPause,
    getFillerStartTime,
    getFillerEndTime
} from './state.js';
import {
    parseNameAndSubtitle,
    formatTimeOfDay,
    matchEmployeeName,
    getEmployeeFullName,
    getEmployeeUsername,
    getEmployeeFirstName,
    removeFillerFromPlanning,
    normalizeTimeString
} from './planning-logic.js';
import { setupFillerAutocomplete } from './manual-input.js';
import { triggerSave } from './storage.js';

let activeTaskId = null;
let activeDurationTaskId = null;
let activeEditFiller = null;
let renderWorkspaceCallback = null;

export const setRenderWorkspaceCallback = (cb) => {
    renderWorkspaceCallback = cb;
};

const renderWorkspace = () => {
    if (renderWorkspaceCallback) renderWorkspaceCallback();
};

export function checkHelperValidity() {
    const select = document.getElementById('helper-select');
    const durationInput = document.getElementById('helper-duration');
    const saveBtn = document.getElementById('modal-save-btn');
    if (!activeTaskId || !select || !durationInput || !saveBtn) return;
    const hasHelper = !!select.value;
    const hasDuration = parseInt(durationInput.value) > 0;
    saveBtn.disabled = hasHelper && !hasDuration;
    saveBtn.classList.toggle('disabled', saveBtn.disabled);
}

export function updateDynamicDuration() {
    const select = document.getElementById('helper-select');
    const maxCheckbox = document.getElementById('helper-max-checkbox');
    const halfCheckbox = document.getElementById('helper-half-checkbox');
    const durationInput = document.getElementById('helper-duration');
    const errorMsg = document.getElementById('helper-error-msg');
    if (!activeTaskId || !select || !maxCheckbox || !halfCheckbox || !durationInput || !errorMsg) return;
    const helperName = select.value;
    if (!helperName) {
        if (maxCheckbox.checked || halfCheckbox.checked) {
            errorMsg.style.display = 'none';
            showToast('Kies eerst een vuller om de tijd te zien', 'error');
            maxCheckbox.checked = false;
            halfCheckbox.checked = false;
        }
        checkHelperValidity();
        return;
    }

    errorMsg.style.display = 'none';
    if (!maxCheckbox.checked && !halfCheckbox.checked) {
        checkHelperValidity();
        return;
    }

    const duration = getTaskDuration(activeTaskId.replace('_helper', ''));
    const assignee = getTaskAssignment(activeTaskId);
    if (assignee) {
        const existingHelper = state.helpers[activeTaskId];
        const curDur = existingHelper ? ((existingHelper.isMax || existingHelper.isHalf) ? (existingHelper.calculatedDuration || 0) : Math.min(duration, existingHelper.duration || 0)) : 0;

        const limitA = getAvailableTime(assignee);
        const limitH = getAvailableTime(helperName);

        const totalA = getFillerTotalTime(assignee) - (existingHelper ? (duration - curDur) : duration);
        const totalH = getFillerTotalTime(helperName) - (existingHelper && existingHelper.helperName === helperName ? curDur : 0);

        const minHelperDur = isFinite(limitA) ? Math.max(0, totalA + duration - limitA) : 0;
        const maxHelperDur = isFinite(limitH) ? Math.max(0, limitH - totalH) : duration;

        let optimal = duration / 2;
        if (maxCheckbox.checked) {
            optimal = Math.min(duration, maxHelperDur);
        } else if (halfCheckbox.checked) {
            optimal = duration / 2;
        }
        durationInput.value = halfCheckbox.checked ? Math.floor(optimal) : Math.round(optimal);
    }
    checkHelperValidity();
}

export const openHelperModal = (taskId) => {
    activeTaskId = taskId;
    const modal = document.getElementById('helper-modal');
    const select = document.getElementById('helper-select');
    const durationInput = document.getElementById('helper-duration');
    const maxCheckbox = document.getElementById('helper-max-checkbox');
    const halfCheckbox = document.getElementById('helper-half-checkbox');
    const errorMsg = document.getElementById('helper-error-msg');
    if (!modal || !select || !durationInput || !maxCheckbox || !halfCheckbox || !errorMsg) return;

    select.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Kies helper...';
    select.appendChild(defaultOpt);

    const currentAssignee = getTaskAssignment(taskId);
    const allAvailablePeople = [...new Set([...state.selectedFillers, ...(state.hiddenFillers || [])])];
    allAvailablePeople.forEach(filler => {
        if (filler !== currentAssignee) {
            const opt = document.createElement('option');
            opt.value = filler;
            opt.textContent = filler.split(' - ')[0];
            select.appendChild(opt);
        }
    });

    const existing = state.helpers[taskId];
    if (existing) {
        select.value = existing.helperName || '';
        durationInput.value = existing.duration || '';
        maxCheckbox.checked = !!existing.isMax;
        halfCheckbox.checked = !!existing.isHalf;
    } else {
        select.value = '';
        durationInput.value = '';
        maxCheckbox.checked = false;
        halfCheckbox.checked = false;
    }
    errorMsg.style.display = 'none';
    durationInput.disabled = false;

    if (maxCheckbox.checked || halfCheckbox.checked) {
        updateDynamicDuration();
    } else {
        checkHelperValidity();
    }

    modal.style.display = 'flex';
};

export const openAddFillerModal = () => {
    const modal = document.getElementById('add-filler-modal');
    const nameInput = document.getElementById('add-filler-name-input');
    const startInput = document.getElementById('add-filler-start-input');
    const endInput = document.getElementById('add-filler-end-input');
    const pauseInput = document.getElementById('add-filler-pause-input');
    const alertEl = document.getElementById('add-filler-status-alert');
    const matchBtn = document.getElementById('add-filler-match-btn');
    const autocompleteList = document.getElementById('add-filler-autocomplete-list');
    if (!modal || !nameInput || !startInput || !endInput || !pauseInput) return;

    delete nameInput.dataset.username;
    nameInput.value = '';
    nameInput.style.backgroundColor = '';
    nameInput.style.borderColor = '';
    startInput.value = '';
    endInput.value = '';
    pauseInput.value = '';
    if (alertEl) alertEl.style.display = 'none';
    if (matchBtn) matchBtn.style.display = 'none';
    if (autocompleteList) autocompleteList.style.display = 'none';

    modal.style.display = 'flex';
    nameInput.focus();
};

let updateEditFillerMatchStatusFn = null;

export const openEditFillerModal = (filler) => {
    activeEditFiller = filler;
    const modal = document.getElementById('edit-filler-modal');
    const nameInput = document.getElementById('edit-filler-name-input');
    const startInput = document.getElementById('edit-filler-start-input');
    const endInput = document.getElementById('edit-filler-end-input');
    const pauseInput = document.getElementById('edit-filler-pause-input');
    const autocompleteList = document.getElementById('edit-filler-autocomplete-list');
    if (!modal || !nameInput || !startInput || !endInput || !pauseInput) return;

    const { name, username } = parseNameAndSubtitle(filler);
    const startMin = getFillerStartTime(filler);
    const endMin = getFillerEndTime(filler);
    const pauseMin = getFillerPause(filler);

    if (username) {
        nameInput.dataset.username = username;
    } else {
        delete nameInput.dataset.username;
    }
    nameInput.value = name;
    startInput.value = formatTimeOfDay(startMin);
    endInput.value = isFinite(endMin) ? formatTimeOfDay(endMin) : '';
    pauseInput.value = pauseMin || 0;
    if (autocompleteList) autocompleteList.style.display = 'none';

    if (updateEditFillerMatchStatusFn) {
        updateEditFillerMatchStatusFn(name, username);
    }

    modal.style.display = 'flex';
};

export const openDurationModal = (taskId) => {
    activeDurationTaskId = taskId;
    const modal = document.getElementById('duration-modal');
    const input = document.getElementById('task-duration-input');
    if (!modal || !input) return;

    const [pathName, type] = taskId.split('_');

    if (taskId.includes('_inst-') || state.instanceTimes[taskId] !== undefined) {
        const dur = state.instanceTimes[taskId] !== undefined ? state.instanceTimes[taskId] : (state.otherTimes[pathName] || getTaskDuration(taskId));
        input.value = dur > 0 ? dur : '';
    } else if (type === 'fill' && state.pathColli[pathName]) {
        const dur = state.pathColli[pathName].duration !== undefined ? state.pathColli[pathName].duration : getTaskDuration(taskId);
        input.value = dur > 0 ? dur : '';
    } else if (type === 'mirror' && state.pathColli[pathName]) {
        const dur = state.pathColli[pathName].mirrorDuration !== undefined ? state.pathColli[pathName].mirrorDuration : 21;
        input.value = dur > 0 ? dur : '';
    } else if (type === 'restanten' && state.pathColli[pathName]) {
        const dur = state.pathColli[pathName].restantenDuration !== undefined ? state.pathColli[pathName].restantenDuration : 20;
        input.value = dur > 0 ? dur : '';
    } else {
        const dur = state.otherTimes[pathName] || getTaskDuration(taskId) || 0;
        input.value = dur > 0 ? dur : '';
    }

    modal.style.display = 'flex';
};

const setupFillerModalMatching = ({ nameInput, matchBtn, matchIcon, alertEl, selectedUserEl, selectedUsernameEl, autocompleteList, onSelect, getExcluded = null }) => {
    const updateMatchStatus = (nameVal, explicitUsername = null) => {
        const trimmed = (nameVal || '').trim();
        const username = explicitUsername || (nameInput ? nameInput.dataset.username : null);
        if (!trimmed) {
            if (alertEl) alertEl.style.display = 'none';
            if (matchBtn) matchBtn.style.display = 'none';
            if (selectedUserEl) selectedUserEl.style.display = 'none';
            if (nameInput) {
                nameInput.style.backgroundColor = '';
                nameInput.style.borderColor = '';
            }
            return;
        }

        const { matchedUser, hasMultipleMatches, candidateMatches } = matchEmployeeName(trimmed, state.storeEmployees || [], username);
        const matchedFullName = getEmployeeFullName(matchedUser);
        const isExactMatch = !!matchedUser && (matchedFullName.toLowerCase() === trimmed.toLowerCase() || !!username);
        const u = isExactMatch ? getEmployeeUsername(matchedUser) : username;

        if (trimmed && getExcluded) {
            const excluded = typeof getExcluded === 'function' ? getExcluded() : getExcluded;
            const isDup = u ? (excluded.has(u.toLowerCase()) || excluded.has(`@${u.toLowerCase()}`)) : excluded.has(trimmed.toLowerCase());
            if (isDup) {
                if (nameInput) {
                    nameInput.style.backgroundColor = 'var(--danger-bg)';
                    nameInput.style.borderColor = 'var(--danger-color)';
                }
                if (matchBtn && matchIcon) {
                    matchBtn.style.display = 'inline-flex';
                    matchBtn.style.backgroundColor = 'var(--danger-bg)';
                    matchBtn.style.borderColor = 'var(--danger-color)';
                    matchBtn.title = 'Staat al in de planning';
                    matchIcon.textContent = 'cancel';
                    matchIcon.style.color = 'var(--danger-color)';
                }
                if (selectedUserEl) selectedUserEl.style.display = 'none';
                if (alertEl) {
                    alertEl.style.display = 'flex';
                    alertEl.style.backgroundColor = 'var(--danger-bg)';
                    alertEl.style.border = '1px solid var(--danger-color)';
                    alertEl.style.color = 'var(--danger-color)';
                    alertEl.innerHTML = `<i class="material-icons" style="font-size: 16px;">warning</i><span>Let op: Deze medewerker staat al in de planning.</span>`;
                }
                return;
            }
        }

        if (isExactMatch) {
            if (nameInput) {
                nameInput.style.backgroundColor = 'var(--success-bg)';
                nameInput.style.borderColor = 'var(--success-color)';
            }
            if (matchBtn && matchIcon) {
                matchBtn.style.display = 'inline-flex';
                matchBtn.style.backgroundColor = 'var(--input-bg)';
                matchBtn.style.borderColor = 'var(--border-color)';
                matchBtn.title = u ? `Gekoppeld aan @${u}` : 'Gekoppeld aan account';
                matchIcon.textContent = 'check_circle';
                matchIcon.style.color = 'var(--success-color)';
            }
            if (selectedUserEl && selectedUsernameEl) {
                if (u) {
                    selectedUserEl.style.display = 'block';
                    selectedUsernameEl.textContent = `@${u}`;
                } else {
                    selectedUserEl.style.display = 'none';
                }
            }
            if (alertEl) alertEl.style.display = 'none';
        } else if (hasMultipleMatches) {
            if (selectedUserEl) selectedUserEl.style.display = 'none';
            if (nameInput) {
                nameInput.style.backgroundColor = 'var(--danger-bg)';
                nameInput.style.borderColor = 'var(--danger-color)';
            }
            if (matchBtn && matchIcon) {
                matchBtn.style.display = 'inline-flex';
                matchBtn.style.backgroundColor = 'var(--danger-bg)';
                matchBtn.style.borderColor = 'var(--danger-color)';
                matchBtn.title = 'Meerdere accounts gevonden';
                matchIcon.textContent = 'cancel';
                matchIcon.style.color = 'var(--danger-color)';
            }
            if (alertEl) {
                alertEl.style.display = 'flex';
                alertEl.style.backgroundColor = 'var(--danger-bg)';
                alertEl.style.border = '1px solid var(--danger-color)';
                alertEl.style.color = 'var(--danger-color)';
                const namesStr = candidateMatches && candidateMatches.length ? candidateMatches.map(c => {
                    const user = getEmployeeUsername(c);
                    return user ? `${getEmployeeFullName(c)} (@${user})` : getEmployeeFullName(c);
                }).join(', ') : '';
                alertEl.innerHTML = `<i class="material-icons" style="font-size: 16px;">warning</i><span>Meerdere accounts gevonden: ${namesStr}. Kies er een uit de lijst.</span>`;
            }
        } else {
            if (selectedUserEl) selectedUserEl.style.display = 'none';
            if (nameInput) {
                nameInput.style.backgroundColor = '';
                nameInput.style.borderColor = '';
            }
            if (matchBtn) matchBtn.style.display = 'none';
            if (alertEl) {
                alertEl.style.display = 'flex';
                alertEl.style.backgroundColor = 'var(--danger-bg)';
                alertEl.style.border = '1px solid var(--danger-color)';
                alertEl.style.color = 'var(--danger-color)';
                alertEl.innerHTML = `<i class="material-icons" style="font-size: 16px;">warning</i><span>Let op: Deze medewerker is niet gekoppeld aan een gebruikersaccount.</span>`;
            }
        }
    };

    if (nameInput && autocompleteList) {
        setupFillerAutocomplete(nameInput, autocompleteList, state.storeEmployees, (emp) => {
            const u = getEmployeeUsername(emp);
            updateMatchStatus(getEmployeeFullName(emp), u);
            if (onSelect) onSelect(emp);
        }, getExcluded);
        nameInput.addEventListener('input', () => {
            updateMatchStatus(nameInput.value);
        });
    }

    return { updateMatchStatus };
};

export const setupModals = () => {
    const addFillerBtn = document.getElementById('add-filler-workspace-btn');
    if (addFillerBtn) {
        addFillerBtn.addEventListener('click', openAddFillerModal);
    }

    const addFillerModal = document.getElementById('add-filler-modal');
    const addFillerCancelBtn = document.getElementById('add-filler-cancel-btn');
    const addFillerCancelIconBtn = document.getElementById('add-filler-cancel-icon-btn');
    const addFillerNameInput = document.getElementById('add-filler-name-input');
    const addFillerStartInput = document.getElementById('add-filler-start-input');
    const addFillerEndInput = document.getElementById('add-filler-end-input');
    const addFillerPauseInput = document.getElementById('add-filler-pause-input');
    const addFillerSaveBtn = document.getElementById('add-filler-save-btn');
    const addFillerAlertEl = document.getElementById('add-filler-status-alert');
    const addFillerMatchBtn = document.getElementById('add-filler-match-btn');
    const addFillerMatchIcon = document.getElementById('add-filler-match-icon');
    const addFillerSelectedUserEl = document.getElementById('add-filler-selected-user');
    const addFillerSelectedUsernameEl = document.getElementById('add-filler-selected-username');
    const addFillerAutocompleteList = document.getElementById('add-filler-autocomplete-list');

    const closeAddFillerModal = setupModal(addFillerModal, [addFillerCancelBtn, addFillerCancelIconBtn]);

    setupFillerModalMatching({
        nameInput: addFillerNameInput,
        matchBtn: addFillerMatchBtn,
        matchIcon: addFillerMatchIcon,
        alertEl: addFillerAlertEl,
        selectedUserEl: addFillerSelectedUserEl,
        selectedUsernameEl: addFillerSelectedUsernameEl,
        autocompleteList: addFillerAutocompleteList,
        onSelect: () => {
            if (addFillerStartInput) addFillerStartInput.focus();
        },
        getExcluded: () => {
            const used = new Set();
            (state.selectedFillers || []).forEach(f => {
                const { username } = parseNameAndSubtitle(f);
                if (username) {
                    used.add(username.toLowerCase());
                    used.add(`@${username.toLowerCase()}`);
                }
            });
            return used;
        }
    });

    if (addFillerStartInput) {
        addFillerStartInput.addEventListener('input', (e) => {
            const val = formatTimeInputValue(e.target.value);
            if (e.target.value !== val) {
                addFillerStartInput.value = val;
            }
            if (val.length === 5 && addFillerEndInput && !addFillerEndInput.value) {
                addFillerEndInput.focus();
            }
        });
        addFillerStartInput.addEventListener('blur', (e) => {
            const norm = normalizeTimeString(e.target.value);
            if (norm && e.target.value !== norm) {
                addFillerStartInput.value = norm;
            }
        });
    }

    if (addFillerEndInput) {
        addFillerEndInput.addEventListener('input', (e) => {
            const val = formatTimeInputValue(e.target.value);
            if (e.target.value !== val) {
                addFillerEndInput.value = val;
            }
            if (val.length === 5 && addFillerPauseInput && !addFillerPauseInput.value) {
                addFillerPauseInput.focus();
            }
        });
        addFillerEndInput.addEventListener('blur', (e) => {
            const norm = normalizeTimeString(e.target.value);
            if (norm && e.target.value !== norm) {
                addFillerEndInput.value = norm;
            }
        });
    }

    if (addFillerSaveBtn) {
        addFillerSaveBtn.addEventListener('click', () => {
            const nameVal = addFillerNameInput ? addFillerNameInput.value.trim() : '';
            const startVal = normalizeTimeString(addFillerStartInput ? addFillerStartInput.value.trim() : '');
            const endVal = normalizeTimeString(addFillerEndInput ? addFillerEndInput.value.trim() : '');
            const pauseVal = addFillerPauseInput ? Math.max(0, parseInt(addFillerPauseInput.value) || 0) : 0;
            const userFromInput = (addFillerNameInput ? addFillerNameInput.dataset.username : '') || '';

            if (!nameVal || !startVal || !endVal) {
                showToast('Vul alle velden in.', 'error');
                return;
            }

            const toMin = (t) => {
                const p = (t || '').split(':').map(Number);
                return (p[0] || 0) * 60 + (p[1] || 0);
            };

            if (toMin(startVal) >= toMin(endVal)) {
                showToast('De begintijd moet voor de eindtijd liggen.', 'error');
                return;
            }

            const finalName = userFromInput ? `${nameVal} (@${userFromInput})` : nameVal;
            const displayName = `${finalName} - ${startVal} - ${endVal}`;

            const exists = state.selectedFillers.some(f => {
                const parsed = parseNameAndSubtitle(f);
                if (userFromInput && parsed.username) {
                    return parsed.username.toLowerCase() === userFromInput.toLowerCase();
                }
                return f.toLowerCase() === displayName.toLowerCase();
            });
            if (exists) {
                showToast(`Medewerker "${nameVal}" staat al in de planning.`, 'error');
                return;
            }

            const isLinked = Array.isArray(state.storeEmployees) && state.storeEmployees.some(emp => {
                const fn = getEmployeeFullName(emp).toLowerCase();
                const un = getEmployeeUsername(emp).toLowerCase();
                return (userFromInput && un === userFromInput.toLowerCase()) || fn === nameVal.toLowerCase() || (un && un === nameVal.toLowerCase());
            });
            if (!isLinked) {
                showToast(`Let op: "${nameVal}" is niet gekoppeld aan een gebruikersaccount.`, 'warning');
            }

            state.selectedFillers.push(displayName);
            state.fillerBreaks[displayName] = pauseVal;
            state.fillerTasks[displayName] = [];
            state.actualEndTimes[displayName] = endVal;

            closeAddFillerModal();
            renderWorkspace();
            triggerSave();
            showToast(`Medewerker ${nameVal} toegevoegd.`, 'success');
        });
    }

    const editFillerModal = document.getElementById('edit-filler-modal');
    const editFillerCancelBtn = document.getElementById('edit-filler-cancel-btn');
    const editFillerCancelIconBtn = document.getElementById('edit-filler-cancel-icon-btn');
    const editFillerNameInput = document.getElementById('edit-filler-name-input');
    const editFillerStartInput = document.getElementById('edit-filler-start-input');
    const editFillerEndInput = document.getElementById('edit-filler-end-input');
    const editFillerSaveBtn = document.getElementById('edit-filler-save-btn');
    const editFillerAlertEl = document.getElementById('edit-filler-status-alert');
    const editFillerMatchBtn = document.getElementById('edit-filler-match-btn');
    const editFillerMatchIcon = document.getElementById('edit-filler-match-icon');
    const editFillerSelectedUserEl = document.getElementById('edit-filler-selected-user');
    const editFillerSelectedUsernameEl = document.getElementById('edit-filler-selected-username');
    const editFillerAutocompleteList = document.getElementById('edit-filler-autocomplete-list');

    const editFillerMatching = setupFillerModalMatching({
        nameInput: editFillerNameInput,
        matchBtn: editFillerMatchBtn,
        matchIcon: editFillerMatchIcon,
        alertEl: editFillerAlertEl,
        selectedUserEl: editFillerSelectedUserEl,
        selectedUsernameEl: editFillerSelectedUsernameEl,
        autocompleteList: editFillerAutocompleteList,
        onSelect: () => {
            if (editFillerStartInput) editFillerStartInput.focus();
        },
        getExcluded: () => {
            const used = new Set();
            (state.selectedFillers || []).forEach(f => {
                if (f === activeEditFiller) return;
                const { username } = parseNameAndSubtitle(f);
                if (username) {
                    used.add(username.toLowerCase());
                    used.add(`@${username.toLowerCase()}`);
                }
            });
            return used;
        }
    });
    updateEditFillerMatchStatusFn = editFillerMatching.updateMatchStatus;

    const closeEditFillerModal = setupModal(editFillerModal, [editFillerCancelBtn, editFillerCancelIconBtn], () => {
        activeEditFiller = null;
    });

    if (editFillerStartInput) {
        editFillerStartInput.addEventListener('input', (e) => {
            const val = formatTimeInputValue(e.target.value);
            if (e.target.value !== val) {
                editFillerStartInput.value = val;
            }
        });
        editFillerStartInput.addEventListener('blur', (e) => {
            const norm = normalizeTimeString(e.target.value);
            if (norm && e.target.value !== norm) {
                editFillerStartInput.value = norm;
            }
        });
    }

    if (editFillerEndInput) {
        editFillerEndInput.addEventListener('input', (e) => {
            const val = formatTimeInputValue(e.target.value);
            if (e.target.value !== val) {
                editFillerEndInput.value = val;
            }
        });
        editFillerEndInput.addEventListener('blur', (e) => {
            const norm = normalizeTimeString(e.target.value);
            if (norm && e.target.value !== norm) {
                editFillerEndInput.value = norm;
            }
        });
    }

    const editFillerDeleteBtn = document.getElementById('edit-filler-delete-btn');
    if (editFillerDeleteBtn) {
        editFillerDeleteBtn.addEventListener('click', () => {
            if (!activeEditFiller) return;
            const fillerToDelete = activeEditFiller;
            const cleanName = parseNameAndSubtitle(fillerToDelete).name || fillerToDelete;
            showConfirmModal(
                'Medewerker Verwijderen',
                `Weet je zeker dat je ${cleanName} wilt verwijderen uit de planning? Alle eventueel toegewezen taken gaan terug naar onverdeeld.`,
                () => {
                    removeFillerFromPlanning(fillerToDelete, state);
                    activeEditFiller = null;
                    closeEditFillerModal();
                    renderWorkspace();
                    triggerSave();
                    showToast(`Medewerker ${cleanName} verwijderd.`, 'success');
                },
                null,
                'Verwijderen'
            );
        });
    }

    if (editFillerSaveBtn) {
        editFillerSaveBtn.addEventListener('click', () => {
            if (!activeEditFiller) return;
            const nameInput = document.getElementById('edit-filler-name-input');
            const startInput = document.getElementById('edit-filler-start-input');
            const endInput = document.getElementById('edit-filler-end-input');
            const pauseInput = document.getElementById('edit-filler-pause-input');

            const nameVal = nameInput ? nameInput.value.trim() : '';
            const startVal = normalizeTimeString(startInput ? startInput.value.trim() : '');
            const endVal = normalizeTimeString(endInput ? endInput.value.trim() : '');
            const pauseVal = pauseInput ? Math.max(0, parseInt(pauseInput.value) || 0) : 0;
            const userFromInput = (nameInput ? nameInput.dataset.username : '') || '';

            if (!nameVal || !startVal || !endVal) {
                showToast('Vul alle velden in.', 'error');
                return;
            }

            const toMin = (t) => {
                const p = (t || '').split(':').map(Number);
                return (p[0] || 0) * 60 + (p[1] || 0);
            };

            if (toMin(startVal) >= toMin(endVal)) {
                showToast('De begintijd moet voor de eindtijd liggen.', 'error');
                return;
            }

            const oldFillerKey = activeEditFiller;
            const finalName = userFromInput ? `${nameVal} (@${userFromInput})` : nameVal;
            const newFillerKey = `${finalName} - ${startVal} - ${endVal}`;

            const isDuplicateOfOther = state.selectedFillers.some(f => {
                if (f === oldFillerKey) return false;
                const parsed = parseNameAndSubtitle(f);
                if (userFromInput && parsed.username) {
                    return parsed.username.toLowerCase() === userFromInput.toLowerCase();
                }
                if (!userFromInput && !parsed.username) {
                    return parsed.rawName.toLowerCase() === finalName.toLowerCase() || parsed.name.toLowerCase() === nameVal.toLowerCase();
                }
                return false;
            });
            if (isDuplicateOfOther) {
                showToast(`Medewerker "${nameVal}" staat al in de planning.`, 'error');
                return;
            }

            if (newFillerKey !== oldFillerKey) {
                const selIdx = state.selectedFillers.indexOf(oldFillerKey);
                if (selIdx !== -1) {
                    state.selectedFillers[selIdx] = newFillerKey;
                } else {
                    const matchIdx = state.selectedFillers.findIndex(f => {
                        const parsed = parseNameAndSubtitle(f);
                        if (userFromInput && parsed.username) {
                            return parsed.username.toLowerCase() === userFromInput.toLowerCase();
                        }
                        return parsed.rawName.toLowerCase() === finalName.toLowerCase() || parsed.name.toLowerCase() === nameVal.toLowerCase();
                    });
                    if (matchIdx !== -1) {
                        state.selectedFillers[matchIdx] = newFillerKey;
                    } else {
                        state.selectedFillers.push(newFillerKey);
                    }
                }

                if (Array.isArray(state.nonFillers)) {
                    const nfIdx = state.nonFillers.indexOf(oldFillerKey);
                    if (nfIdx !== -1) {
                        state.nonFillers[nfIdx] = newFillerKey;
                    }
                }

                if (Array.isArray(state.hiddenFillers)) {
                    const hfIdx = state.hiddenFillers.indexOf(oldFillerKey);
                    if (hfIdx !== -1) {
                        state.hiddenFillers[hfIdx] = newFillerKey;
                    }
                }

                if (state.fillerTasks[oldFillerKey]) {
                    state.fillerTasks[newFillerKey] = state.fillerTasks[oldFillerKey];
                    delete state.fillerTasks[oldFillerKey];
                } else if (!state.fillerTasks[newFillerKey]) {
                    state.fillerTasks[newFillerKey] = [];
                }

                if (state.actualEndTimes[oldFillerKey] !== undefined) {
                    const oldEndStr = formatTimeOfDay(getFillerEndTime(oldFillerKey));
                    if (state.actualEndTimes[oldFillerKey] === oldEndStr) {
                        state.actualEndTimes[newFillerKey] = endVal;
                    } else {
                        state.actualEndTimes[newFillerKey] = state.actualEndTimes[oldFillerKey];
                    }
                    delete state.actualEndTimes[oldFillerKey];
                } else {
                    state.actualEndTimes[newFillerKey] = endVal;
                }

                if (state.helpers) {
                    Object.values(state.helpers).forEach(h => {
                        if (h && h.helperName === oldFillerKey) {
                            h.helperName = newFillerKey;
                        }
                    });
                }

                if (state.fillerBreaks[oldFillerKey] !== undefined) {
                    delete state.fillerBreaks[oldFillerKey];
                }
            }

            state.fillerBreaks[newFillerKey] = pauseVal;
            activeEditFiller = null;

            closeEditFillerModal();
            renderWorkspace();
            triggerSave();
            showToast('Werktijden bijgewerkt.', 'success');
        });
    }

    const helperModal = document.getElementById('helper-modal');
    const helperCancelBtn = document.getElementById('modal-cancel-btn');
    const helperCancelIconBtn = document.getElementById('modal-cancel-icon-btn');
    const closeHelperModal = setupModal(helperModal, [helperCancelBtn, helperCancelIconBtn], () => {
        activeTaskId = null;
    });

    const helperSelect = document.getElementById('helper-select');
    const helperDuration = document.getElementById('helper-duration');
    const helperMaxCheckbox = document.getElementById('helper-max-checkbox');
    const helperHalfCheckbox = document.getElementById('helper-half-checkbox');
    const helperErrorMsg = document.getElementById('helper-error-msg');
    const helperSaveBtn = document.getElementById('modal-save-btn');

    if (helperMaxCheckbox) {
        helperMaxCheckbox.addEventListener('change', () => {
            if (helperMaxCheckbox.checked) helperHalfCheckbox.checked = false;
            updateDynamicDuration();
        });
    }
    if (helperHalfCheckbox) {
        helperHalfCheckbox.addEventListener('change', () => {
            if (helperHalfCheckbox.checked) helperMaxCheckbox.checked = false;
            updateDynamicDuration();
        });
    }
    if (helperSelect) {
        helperSelect.addEventListener('change', () => {
            if (helperSelect.value) {
                helperErrorMsg.style.display = 'none';
            }
            updateDynamicDuration();
        });
    }
    if (helperDuration) {
        helperDuration.addEventListener('input', () => {
            if (!activeTaskId) return;
            helperMaxCheckbox.checked = false;
            helperHalfCheckbox.checked = false;
            const maxDuration = Math.round(getTaskDuration(activeTaskId));
            const val = parseInt(helperDuration.value) || 0;
            if (val > maxDuration) {
                helperDuration.value = maxDuration;
            }
            checkHelperValidity();
        });
    }
    if (helperSaveBtn) {
        helperSaveBtn.addEventListener('click', () => {
            if (!activeTaskId) return;
            const helperName = helperSelect.value;
            const duration = parseInt(helperDuration.value) || 0;
            const isMax = helperMaxCheckbox.checked;
            const isHalf = helperHalfCheckbox.checked;

            if (helperName && duration > 0) {
                state.helpers[activeTaskId] = {
                    helperName,
                    duration,
                    isMax,
                    isHalf,
                    calculatedDuration: duration
                };
            } else {
                delete state.helpers[activeTaskId];
            }
            closeHelperModal();
            renderWorkspace();
            triggerSave();
        });
    }

    const durationModal = document.getElementById('duration-modal');
    const durationCancelBtn = document.getElementById('duration-cancel-btn');
    const durationCancelIconBtn = document.getElementById('duration-cancel-icon-btn');
    const closeDurationModal = setupModal(durationModal, [durationCancelBtn, durationCancelIconBtn], () => {
        if (activeDurationTaskId) {
            const [pathName] = activeDurationTaskId.split('_');
            if (pathName === 'Pauze' && (!state.instanceTimes[activeDurationTaskId] || state.instanceTimes[activeDurationTaskId] <= 0)) {
                removeTaskFromAll(activeDurationTaskId);
                delete state.instanceTimes[activeDurationTaskId];
                renderWorkspace();
                triggerSave();
            }
        }
        activeDurationTaskId = null;
    });

    document.querySelectorAll('.quick-duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!activeDurationTaskId) return;
            const val = parseInt(btn.dataset.min) || 0;
            const [pathName, type] = activeDurationTaskId.split('_');
            if (val > 0) {
                if (activeDurationTaskId.includes('_inst-')) {
                    state.instanceTimes[activeDurationTaskId] = val;
                } else if (type === 'fill' && state.pathColli[pathName]) {
                    state.pathColli[pathName].duration = val;
                } else if (type === 'mirror' && state.pathColli[pathName]) {
                    state.pathColli[pathName].mirrorDuration = val;
                } else if (type === 'restanten' && state.pathColli[pathName]) {
                    state.pathColli[pathName].restantenDuration = val;
                } else {
                    state.otherTimes[pathName] = val;
                }
                closeDurationModal();
                renderWorkspace();
                triggerSave();
            }
        });
    });

    const durationSaveBtn = document.getElementById('duration-save-btn');
    if (durationSaveBtn) {
        durationSaveBtn.addEventListener('click', () => {
            if (!activeDurationTaskId) return;
            const input = document.getElementById('task-duration-input');
            const [pathName, type] = activeDurationTaskId.split('_');
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                if (activeDurationTaskId.includes('_inst-')) {
                    state.instanceTimes[activeDurationTaskId] = val;
                } else if (type === 'fill' && state.pathColli[pathName]) {
                    state.pathColli[pathName].duration = val;
                } else if (type === 'mirror' && state.pathColli[pathName]) {
                    state.pathColli[pathName].mirrorDuration = val;
                } else if (type === 'restanten' && state.pathColli[pathName]) {
                    state.pathColli[pathName].restantenDuration = val;
                } else {
                    state.otherTimes[pathName] = val;
                }
                closeDurationModal();
                renderWorkspace();
                triggerSave();
            } else if (pathName === 'Pauze' && activeDurationTaskId.includes('_inst-')) {
                removeTaskFromAll(activeDurationTaskId);
                delete state.instanceTimes[activeDurationTaskId];
                closeDurationModal();
                renderWorkspace();
                triggerSave();
            }
        });
    }

    const durationDeleteBtn = document.getElementById('duration-delete-btn');
    if (durationDeleteBtn) {
        durationDeleteBtn.addEventListener('click', () => {
            if (!activeDurationTaskId) return;
            const [pathName, type] = activeDurationTaskId.split('_');
            if (activeDurationTaskId.includes('_inst-')) {
                removeTaskFromAll(activeDurationTaskId);
                delete state.instanceTimes[activeDurationTaskId];
            } else if (type === 'mirror' && state.pathColli[pathName]) {
                delete state.pathColli[pathName].mirrorDuration;
                removeTaskFromAll(activeDurationTaskId);
            } else if (type === 'restanten' && state.pathColli[pathName]) {
                delete state.pathColli[pathName].restantenDuration;
                removeTaskFromAll(activeDurationTaskId);
            } else {
                delete state.otherTimes[pathName];
                Object.keys(state.instanceTimes).forEach(instKey => {
                    if (instKey.startsWith(`${pathName}_other_inst-`)) {
                        removeTaskFromAll(instKey);
                        delete state.instanceTimes[instKey];
                    }
                });
            }
            closeDurationModal();
            renderWorkspace();
            triggerSave();
        });
    }

    const customTaskModal = document.getElementById('custom-task-modal');
    const customTaskCancelBtn = document.getElementById('custom-task-cancel-btn');
    const customTaskCancelIconBtn = document.getElementById('custom-task-cancel-icon-btn');
    const closeCustomTaskModal = setupModal(customTaskModal, [customTaskCancelBtn, customTaskCancelIconBtn]);

    const addCustomTaskBtn = document.getElementById('add-custom-task-btn');
    if (addCustomTaskBtn) {
        addCustomTaskBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('custom-task-name-input');
            const durInput = document.getElementById('custom-task-duration-input');
            if (nameInput) nameInput.value = '';
            if (durInput) durInput.value = '';
            if (customTaskModal) customTaskModal.style.display = 'flex';
        });
    }

    const customTaskSaveBtn = document.getElementById('custom-task-save-btn');
    if (customTaskSaveBtn) {
        customTaskSaveBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('custom-task-name-input');
            const durInput = document.getElementById('custom-task-duration-input');
            const name = nameInput ? nameInput.value.trim() : '';
            const duration = durInput ? parseInt(durInput.value) || 0 : 0;
            if (name.toLowerCase() === 'pauze') {
                showToast('Het is niet toegestaan om een taak genaamd "Pauze" aan te maken', 'error');
                return;
            }
            if (name.includes('_')) {
                showToast('Een taaknaam mag geen liggend streepje (_) bevatten', 'error');
                return;
            } if (name && duration > 0) {
                state.otherTimes[name] = duration;
                closeCustomTaskModal();
                renderWorkspace();
                triggerSave();
            }
        });
    }

    const openAutoPairModalBtn = document.getElementById('open-auto-pair-modal-btn');
    const autoPairModal = document.getElementById('auto-pair-modal');
    const closeAutoPairModalBtn = document.getElementById('close-auto-pair-modal-btn');
    const saveAutoPairModalBtn = document.getElementById('save-auto-pair-modal-btn');
    const modalAutoPairEnabled = document.getElementById('modal-auto-pair-enabled');
    const modalAutoPairRestanten = document.getElementById('modal-auto-pair-restanten');
    const modalPrependOtherEnabled = document.getElementById('modal-prepend-other-enabled');
    const modalOtherTaskSelection = document.getElementById('modal-other-task-selection');
    const modalOtherTaskSelect = document.getElementById('modal-other-task-select');
    const modalNewOtherName = document.getElementById('modal-new-other-name');
    const modalNewOtherMin = document.getElementById('modal-new-other-min');
    const modalAddOtherBtn = document.getElementById('modal-add-other-btn');

    const populateOtherTaskSelect = (selectedVal) => {
        if (!modalOtherTaskSelect) return;
        modalOtherTaskSelect.innerHTML = '';
        Object.keys(state.otherTimes).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${key} (${state.otherTimes[key]} min)`;
            modalOtherTaskSelect.appendChild(opt);
        });
        if (selectedVal && state.otherTimes[selectedVal] !== undefined) {
            modalOtherTaskSelect.value = selectedVal;
        }
    };

    if (openAutoPairModalBtn && autoPairModal) {
        const autoPairModalCancelBtn = document.getElementById('auto-pair-modal-cancel-btn');
        setupModal(autoPairModal, [closeAutoPairModalBtn, autoPairModalCancelBtn]);
        openAutoPairModalBtn.addEventListener('click', () => {
            if (!state.autoPairSettings) {
                state.autoPairSettings = { enabled: false, prependRestanten: false, prependOtherTask: false, selectedOtherTask: "" };
            }
            if (modalAutoPairEnabled) modalAutoPairEnabled.checked = !!state.autoPairSettings.enabled;
            if (modalAutoPairRestanten) modalAutoPairRestanten.checked = !!state.autoPairSettings.prependRestanten;
            if (modalPrependOtherEnabled) modalPrependOtherEnabled.checked = !!state.autoPairSettings.prependOtherTask;
            if (modalOtherTaskSelection) modalOtherTaskSelection.style.display = state.autoPairSettings.prependOtherTask ? 'flex' : 'none';
            populateOtherTaskSelect(state.autoPairSettings.selectedOtherTask);
            autoPairModal.style.display = 'flex';
        });
    }

    if (modalPrependOtherEnabled && modalOtherTaskSelection) {
        modalPrependOtherEnabled.addEventListener('change', (e) => {
            modalOtherTaskSelection.style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    if (modalAddOtherBtn && modalNewOtherName && modalNewOtherMin) {
        modalAddOtherBtn.addEventListener('click', () => {
            const name = modalNewOtherName.value.trim();
            const min = parseInt(modalNewOtherMin.value, 10);
            if (name.toLowerCase() === 'pauze') {
                showToast('Het is niet toegestaan om een taak genaamd "Pauze" aan te maken', 'error');
                return;
            }
            if (name.includes('_')) {
                showToast('Een taaknaam mag geen liggend streepje (_) bevatten', 'error');
                return;
            }
            if (name && !isNaN(min) && min > 0) {
                state.otherTimes[name] = min;
                populateOtherTaskSelect(name);
                modalNewOtherName.value = '';
                modalNewOtherMin.value = '';
                showToast(`Taak "${name}" toegevoegd`, 'success');
                triggerSave();
            } else {
                showToast('Vul een geldige naam en aantal minuten in', 'error');
            }
        });
    }

    if (saveAutoPairModalBtn && autoPairModal) {
        saveAutoPairModalBtn.addEventListener('click', () => {
            if (!state.autoPairSettings) state.autoPairSettings = {};
            state.autoPairSettings.enabled = !!(modalAutoPairEnabled && modalAutoPairEnabled.checked);
            state.autoPairSettings.prependRestanten = !!(modalAutoPairRestanten && modalAutoPairRestanten.checked);
            state.autoPairSettings.prependOtherTask = !!(modalPrependOtherEnabled && modalPrependOtherEnabled.checked);
            state.autoPairSettings.selectedOtherTask = modalOtherTaskSelect ? modalOtherTaskSelect.value : "";
            autoPairModal.style.display = 'none';
            renderWorkspace();
            triggerSave();
            showToast('Instellingen opslagen', 'success');
        });
    }
};
