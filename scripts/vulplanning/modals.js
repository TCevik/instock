import { setupModal, showConfirmModal } from '../modal.js';
import { showToast } from '../toast.js';
import {
    state,
    getTaskDuration,
    getTaskAssignment,
    getAvailableTime,
    getFillerTotalTime,
    removeTaskFromAll
} from './state.js';
import { triggerSave } from './storage.js';

let activeTaskId = null;
let activeDurationTaskId = null;
let renderWorkspaceCallback = null;

export const setRenderWorkspaceCallback = (cb) => {
    renderWorkspaceCallback = cb;
};

const renderWorkspace = () => {
    if (renderWorkspaceCallback) renderWorkspaceCallback();
};

export { showConfirmModal };

export function checkHelperValidity() {
    const select = document.getElementById('helper-select');
    const durationInput = document.getElementById('helper-duration');
    const saveBtn = document.getElementById('modal-save-btn');
    if (!activeTaskId || !select || !durationInput || !saveBtn) return;
    const hasHelper = !!select.value;
    const hasDuration = parseInt(durationInput.value) > 0;
    saveBtn.disabled = hasHelper && !hasDuration;
    saveBtn.style.opacity = saveBtn.disabled ? '0.5' : '1';
    saveBtn.style.cursor = saveBtn.disabled ? 'not-allowed' : 'pointer';
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

export const openDurationModal = (taskId) => {
    activeDurationTaskId = taskId;
    const modal = document.getElementById('duration-modal');
    const input = document.getElementById('task-duration-input');
    if (!modal || !input) return;

    const [pathName, type] = taskId.split('_');

    if (taskId.includes('_inst-')) {
        const dur = state.instanceTimes[taskId] !== undefined ? state.instanceTimes[taskId] : (state.otherTimes[pathName] || 0);
        input.value = dur > 0 ? dur : '';
    } else {
        const dur = state.otherTimes[pathName] || 0;
        input.value = dur > 0 ? dur : '';
    }

    modal.style.display = 'flex';
};

export const setupModals = () => {
    const helperModal = document.getElementById('helper-modal');
    const helperCancelBtn = document.getElementById('modal-cancel-btn');
    const closeHelperModal = setupModal(helperModal, [helperCancelBtn], () => {
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
            if (!activeTaskId || !helperSelect || !helperDuration || !helperMaxCheckbox || !helperHalfCheckbox) return;
            const helperName = helperSelect.value;
            Object.keys(state.fillerTasks).forEach(filler => {
                state.fillerTasks[filler] = state.fillerTasks[filler].filter(id => id !== (activeTaskId + '_helper'));
            });
            if (helperName) {
                const maxDuration = Math.round(getTaskDuration(activeTaskId));
                const val = parseInt(helperDuration.value) || 0;
                const clampedVal = Math.min(maxDuration, val);

                state.helpers[activeTaskId] = {
                    helperName: helperName,
                    duration: clampedVal,
                    isMax: helperMaxCheckbox.checked,
                    isHalf: helperHalfCheckbox.checked
                };
                if (!state.fillerTasks[helperName]) {
                    state.fillerTasks[helperName] = [];
                }
                state.fillerTasks[helperName].push(activeTaskId + '_helper');
            } else {
                delete state.helpers[activeTaskId];
            }
            closeHelperModal();
            renderWorkspace();
        });
    }

    const durationModal = document.getElementById('duration-modal');
    const durationCancelBtn = document.getElementById('duration-cancel-btn');
    const closeDurationModal = setupModal(durationModal, [durationCancelBtn], () => {
        if (activeDurationTaskId && activeDurationTaskId.includes('_inst-')) {
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
            const [pathName] = activeDurationTaskId.split('_');
            if (val > 0) {
                if (activeDurationTaskId.includes('_inst-')) {
                    state.instanceTimes[activeDurationTaskId] = val;
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
            const [pathName] = activeDurationTaskId.split('_');
            if (activeDurationTaskId.includes('_inst-')) {
                removeTaskFromAll(activeDurationTaskId);
                delete state.instanceTimes[activeDurationTaskId];
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
    const closeCustomTaskModal = setupModal(customTaskModal, [customTaskCancelBtn]);

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
        setupModal(autoPairModal, [closeAutoPairModalBtn]);
        openAutoPairModalBtn.addEventListener('click', () => {
            if (!state.autoPairSettings) {
                state.autoPairSettings = { enabled: false, prependOtherTask: false, selectedOtherTask: "" };
            }
            if (modalAutoPairEnabled) modalAutoPairEnabled.checked = !!state.autoPairSettings.enabled;
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
            state.autoPairSettings.prependOtherTask = !!(modalPrependOtherEnabled && modalPrependOtherEnabled.checked);
            state.autoPairSettings.selectedOtherTask = modalOtherTaskSelect ? modalOtherTaskSelect.value : "";
            autoPairModal.style.display = 'none';
            renderWorkspace();
            triggerSave();
            showToast('Instellingen opslagen', 'success');
        });
    }
};
