import { loadHeader } from './header.js';
import { checkAuth, getSupabase, setupModal, initPadenModal } from './main.js';
import { extractTextLinesFromPage } from './pdf-utils.js';
import { showToast } from './toast.js';
import {
    PATHS_MAPPING,
    MIRROR_TIMES,
    formatMin,
    parseNameAndSubtitle,
    getFillerPause as logicGetFillerPause,
    getAvailableTime as logicGetAvailableTime,
    getFillerStartTime,
    getFillerEndTime,
    getFillerActualEndTime as logicGetFillerActualEndTime,
    getTaskDuration as logicGetTaskDuration,
    getFillerColli as logicGetFillerColli,
    getFillerTotalTime as logicGetFillerTotalTime,
    getFillerProductivity as logicGetFillerProductivity,
    formatTimeOfDay,
    getTaskAssignment as logicGetTaskAssignment
} from './planning-logic.js';

(() => {
    let storeId = null;
    let saveTimeout = null;

    const state = {
        selectedFillers: [],
        pathColli: {},
        fillerTasks: {},
        helpers: {},
        activeTab: 'fill',
        fillerSortOrder: 'start-asc',
        otherTimes: {
            "Restanten nalopen": 20,
            "Bulk nalopen": 30,
            "Acties terugvullen": 15,
            "Magazijn opruimen": 45,
            "Tellen": 30
        },
        instanceTimes: {},
        fillerBreaks: {},
        actualEndTimes: {},
        nonFillers: [],
        hiddenFillers: [],
        showNonFillers: false,
        showReallyHidden: false,
        autoPairSettings: {
            enabled: false,
            prependOtherTask: false,
            selectedOtherTask: ""
        }
    };

    let activeTaskId = null;
    let activeDurationTaskId = null;

    const createPersonNameElement = (fullName, titleClass = 'person-name', subtitleClass = 'person-subtitle', containerClass = 'person-info') => {
        const { name, subtitle } = parseNameAndSubtitle(fullName);
        const container = document.createElement('div');
        container.className = containerClass;
        
        const nameEl = document.createElement('span');
        nameEl.className = titleClass;
        nameEl.textContent = name;
        container.appendChild(nameEl);

        if (subtitle) {
            const subEl = document.createElement('span');
            subEl.className = subtitleClass;
            subEl.textContent = subtitle;
            container.appendChild(subEl);
        }
        return container;
    };

    const getFillerPause = (displayName) => logicGetFillerPause(displayName, state);
    const getAvailableTime = (displayName) => logicGetAvailableTime(displayName, state);
    const getFillerActualEndTime = (displayName) => logicGetFillerActualEndTime(displayName, state);
    const getTaskDuration = (taskId) => logicGetTaskDuration(taskId, state);
    const getFillerColli = (displayName) => logicGetFillerColli(displayName, state);
    const getFillerTotalTime = (filler) => logicGetFillerTotalTime(filler, state);
    const getFillerProductivity = (displayName) => logicGetFillerProductivity(displayName, state);
    const getTaskAssignment = (taskId) => logicGetTaskAssignment(taskId, state);

    const removeTaskFromAll = (taskId) => {
        Object.keys(state.fillerTasks).forEach(filler => {
            state.fillerTasks[filler] = state.fillerTasks[filler].filter(id => id !== taskId);
        });
    };

    const getClosestTask = (container, x, y) => {
        const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
        if (cards.length === 0) return null;
        let closest = null;
        let minDistance = Infinity;
        cards.forEach(card => {
            const box = card.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const distance = Math.hypot(x - centerX, y - centerY);
            if (distance < minDistance) {
                minDistance = distance;
                closest = {
                    card: card,
                    before: x < centerX
                };
            }
        });
        return closest;
    };

    const createTaskCard = (taskId, startTime, endTime) => {
        const isHelperTask = taskId.endsWith('_helper');
        const mainTaskId = isHelperTask ? taskId.replace('_helper', '') : taskId;
        const [pathName, type] = mainTaskId.split('_');
        const data = state.pathColli[pathName];
        if (!data && type !== 'other') return null;

        const card = document.createElement('div');
        card.className = 'task-card ' + type + (isHelperTask ? ' helper' : '');
        card.draggable = true;
        card.id = `task-${taskId}`;

        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', taskId);
            const isFromAssigned = card.closest('#assigned-tasks-grid') !== null;
            e.dataTransfer.setData('is-from-assigned', isFromAssigned ? 'true' : 'false');
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        const colliSuffix = (type === 'fill' && data && data.colli) ? ` (${data.colli} c)` : '';
        const titleRow = document.createElement('div');
        titleRow.className = 'task-card-title';
        titleRow.textContent = `${pathName}${colliSuffix}`;
        card.appendChild(titleRow);

        const metaRow = document.createElement('div');
        metaRow.className = 'task-card-meta';
        metaRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--text-color-muted); white-space: nowrap;';

        const duration = getTaskDuration(taskId);
        let durationText = '';
        if (isHelperTask) {
            card.classList.add('helper');
            durationText = formatMin(duration);
        } else if (startTime === undefined) {
            durationText = formatMin(duration);
        } else {
            const helperInfo = state.helpers[taskId];
            if (helperInfo && helperInfo.helperName) {
                const rawHelperDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : (helperInfo.duration || 0);
                const helperDuration = Math.min(duration, Math.max(0, rawHelperDur));
                const remainingDuration = Math.max(0, duration - helperDuration);
                durationText = formatMin(remainingDuration);
            } else {
                durationText = formatMin(duration);
            }
        }

        const leftMetaSpan = document.createElement('span');
        leftMetaSpan.textContent = durationText;
        metaRow.appendChild(leftMetaSpan);

        if (startTime !== undefined && endTime !== undefined) {
            const rightMetaSpan = document.createElement('span');
            rightMetaSpan.textContent = `${formatTimeOfDay(startTime)} - ${formatTimeOfDay(endTime)}`;
            metaRow.appendChild(rightMetaSpan);
        }

        card.appendChild(metaRow);

        if (!isHelperTask) {
            const assignee = getTaskAssignment(taskId);
            if (assignee || type === 'other') {
                const menuBtn = document.createElement('button');
                menuBtn.className = 'task-menu-btn';
                menuBtn.innerHTML = '<i class="material-icons" style="font-size: 18px;">more_vert</i>';
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (type === 'other') {
                        openDurationModal(taskId);
                    } else {
                        openHelperModal(taskId);
                    }
                });
                card.appendChild(menuBtn);
            }
        }

        return card;
    };

    function checkHelperValidity() {
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

    function updateDynamicDuration() {
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

    const openHelperModal = (taskId) => {
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

    const openDurationModal = (taskId) => {
        activeDurationTaskId = taskId;
        const modal = document.getElementById('duration-modal');
        const input = document.getElementById('task-duration-input');
        if (!modal || !input) return;

        const [pathName, type] = taskId.split('_');
        
        if (taskId.includes('_inst-')) {
            input.value = state.instanceTimes[taskId] !== undefined ? state.instanceTimes[taskId] : (state.otherTimes[pathName] || 30);
        } else {
            input.value = state.otherTimes[pathName] || 30;
        }

        modal.style.display = 'flex';
    };

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
        activeDurationTaskId = null;
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
            if (name && duration > 0) {
                state.otherTimes[name] = duration;
                closeCustomTaskModal();
                renderWorkspace();
                triggerSave();
            }
        });
    }


    const updateMaxHelperDurations = () => {
        Object.entries(state.helpers).forEach(([taskId, helperInfo]) => {
            if (helperInfo.isHalf) {
                const duration = getTaskDuration(taskId);
                helperInfo.calculatedDuration = Math.floor(duration / 2);
            } else if (helperInfo.isMax) {
                const duration = getTaskDuration(taskId);
                const helper = helperInfo.helperName;
                const assignee = getTaskAssignment(taskId);
                if (assignee) {
                    const limitH = getAvailableTime(helper);
                    const totalH = getFillerTotalTime(helper) - (helperInfo.calculatedDuration || 0);
                    const maxHelperDur = isFinite(limitH) ? Math.max(0, limitH - totalH) : duration;
                    helperInfo.calculatedDuration = Math.min(duration, Math.round(maxHelperDur));
                } else {
                    helperInfo.calculatedDuration = Math.round(duration / 2);
                }
            }
        });
    };

    const renderWorkspace = () => {
        updateMaxHelperDurations();
        const workspace = document.getElementById('drag-drop-workspace');
        const fillersTableBody = document.getElementById('fillers-table-body');
        const fillContainer = document.getElementById('unassigned-fill-tasks');
        const mirrorContainer = document.getElementById('unassigned-mirror-tasks');
        const otherContainer = document.getElementById('unassigned-other-tasks');
        if (!workspace || !fillersTableBody || !fillContainer || !mirrorContainer || !otherContainer) return;

        const pairCheckbox = document.getElementById('pair-fill-mirror-checkbox');
        if (pairCheckbox) pairCheckbox.checked = !!state.autoPairFillMirror;

        const currentFillers = new Set([...state.selectedFillers, ...(state.hiddenFillers || [])]);
        Object.keys(state.fillerTasks).forEach(filler => {
            if (!currentFillers.has(filler)) {
                delete state.fillerTasks[filler];
            }
        });

        currentFillers.forEach(filler => {
            if (!state.fillerTasks[filler]) {
                state.fillerTasks[filler] = [];
            }
        });

        const tabFill = document.getElementById('tab-fill');
        const tabMirror = document.getElementById('tab-mirror');
        const tabOther = document.getElementById('tab-other');

        if (state.autoPairSettings && state.autoPairSettings.enabled) {
            if (tabMirror) tabMirror.style.display = 'none';
            if (state.activeTab === 'mirror') state.activeTab = 'fill';
        } else {
            if (tabMirror) tabMirror.style.display = '';
        }

        const addCustomBtn = document.getElementById('add-custom-task-btn');
        if (addCustomBtn) {
            addCustomBtn.style.display = state.activeTab === 'other' ? 'block' : 'none';
        }
        if (tabFill && tabMirror && tabOther) {
            if (state.activeTab === 'fill') {
                tabFill.classList.add('active');
                tabMirror.classList.remove('active');
                tabOther.classList.remove('active');
                fillContainer.style.display = 'flex';
                mirrorContainer.style.display = 'none';
                otherContainer.style.display = 'none';
            } else if (state.activeTab === 'mirror') {
                tabFill.classList.remove('active');
                tabMirror.classList.add('active');
                tabOther.classList.remove('active');
                fillContainer.style.display = 'none';
                mirrorContainer.style.display = 'flex';
                otherContainer.style.display = 'none';
            } else {
                tabFill.classList.remove('active');
                tabMirror.classList.remove('active');
                tabOther.classList.add('active');
                fillContainer.style.display = 'none';
                mirrorContainer.style.display = 'none';
                otherContainer.style.display = 'flex';
            }
        }

        fillersTableBody.innerHTML = '';
        fillContainer.innerHTML = '';
        mirrorContainer.innerHTML = '';
        otherContainer.innerHTML = '';

        const nonFillersTableBody = document.getElementById('non-fillers-table-body');
        if (nonFillersTableBody) nonFillersTableBody.innerHTML = '';

        const allTaskIds = [];
        Object.keys(state.pathColli).forEach(pathName => {
            allTaskIds.push(`${pathName}_fill`);
            if (MIRROR_TIMES[pathName] !== undefined) {
                allTaskIds.push(`${pathName}_mirror`);
            }
        });
        Object.keys(state.otherTimes).forEach(pathName => {
            allTaskIds.push(`${pathName}_other`);
        });

        if (!state.nonFillers) state.nonFillers = [];
        if (!state.hiddenFillers) state.hiddenFillers = [];

        const activeFillers = state.selectedFillers.filter(f => !state.nonFillers.includes(f) && !state.hiddenFillers.includes(f));
        const nonFillersList = state.selectedFillers.filter(f => state.nonFillers.includes(f) && !state.hiddenFillers.includes(f));

        const nonFillersCountEl = document.getElementById('non-fillers-count');
        const hiddenCountEl = document.getElementById('hidden-fillers-count');
        const toggleReallyHiddenBtn = document.getElementById('toggle-really-hidden-btn');
        const nonFillersSection = document.getElementById('non-fillers-section');
        const fillersHeader = document.getElementById('fillers-header');
        const reallyHiddenPanel = document.getElementById('really-hidden-panel');
        const reallyHiddenList = document.getElementById('really-hidden-list');

        if (nonFillersCountEl) nonFillersCountEl.textContent = nonFillersList.length;
        if (hiddenCountEl) hiddenCountEl.textContent = state.hiddenFillers.length;
        if (toggleReallyHiddenBtn) {
            toggleReallyHiddenBtn.style.display = state.hiddenFillers.length > 0 ? 'flex' : 'none';
        }

        if (reallyHiddenPanel && reallyHiddenList) {
            reallyHiddenList.innerHTML = '';
            if (state.showReallyHidden && state.hiddenFillers.length > 0) {
                reallyHiddenPanel.style.display = 'block';
                state.hiddenFillers.forEach(filler => {
                    const badge = document.createElement('button');
                    badge.type = 'button';
                    badge.style.cssText = 'padding: 4px 8px; font-size: 12px; background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px;';
                    const nameEl = createPersonNameElement(filler, 'person-name', 'person-subtitle', 'person-info');
                    const icon = document.createElement('i');
                    icon.className = 'material-icons';
                    icon.style.cssText = 'font-size: 14px; color: var(--accent-color-sidemenu);';
                    icon.textContent = 'restore';
                    badge.appendChild(nameEl);
                    badge.appendChild(icon);
                    badge.addEventListener('click', () => {
                        state.hiddenFillers = state.hiddenFillers.filter(f => f !== filler);
                        renderWorkspace();
                        triggerSave();
                    });
                    reallyHiddenList.appendChild(badge);
                });
            } else {
                reallyHiddenPanel.style.display = 'none';
            }
        }

        const buildFillerRow = (filler, isNonFiller = false) => {
            const totalMin = getFillerTotalTime(filler);
            const maxMin = getAvailableTime(filler);
            const pauseMin = getFillerPause(filler);
            const roundedTotal = Math.round(totalMin);
            const isExceeded = roundedTotal > maxMin;

            const tr = document.createElement('tr');
            tr.className = `filler-row${isExceeded ? ' exceeded' : ''}`;
            if (isNonFiller) {
                tr.style.opacity = '0.95';
            }

            const tdActions = document.createElement('td');
            tdActions.style.cssText = 'padding: 4px; width: 32px; text-align: center;';
            const actionsContainer = document.createElement('div');
            actionsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center;';

            const toggleNonFillerBtn = document.createElement('button');
            toggleNonFillerBtn.type = 'button';
            toggleNonFillerBtn.title = isNonFiller ? 'Maak actieve vuller' : 'Maak niet-vuller';
            toggleNonFillerBtn.style.cssText = 'background: none; border: none; color: var(--text-color-muted); cursor: pointer; padding: 1px; display: flex; align-items: center; border-radius: 3px;';
            toggleNonFillerBtn.innerHTML = isNonFiller
                ? '<i class="material-icons" style="font-size: 16px; color: var(--accent-color-sidemenu);">person</i>'
                : '<i class="material-icons" style="font-size: 16px;">person_off</i>';
            toggleNonFillerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isNonFiller) {
                    state.nonFillers = state.nonFillers.filter(f => f !== filler);
                } else {
                    if (!state.nonFillers.includes(filler)) {
                        state.nonFillers.push(filler);
                    }
                }
                renderWorkspace();
                triggerSave();
            });

            const reallyHideBtn = document.createElement('button');
            reallyHideBtn.type = 'button';
            reallyHideBtn.title = 'Echt verbergen';
            reallyHideBtn.style.cssText = 'background: none; border: none; color: var(--text-color-muted); cursor: pointer; padding: 1px; display: flex; align-items: center; border-radius: 3px;';
            reallyHideBtn.innerHTML = '<i class="material-icons" style="font-size: 16px;">visibility_off</i>';
            reallyHideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const assignedTasks = (state.fillerTasks[filler] || []).slice();
                const executeHide = () => {
                    if (assignedTasks.length > 0) {
                        assignedTasks.forEach(taskId => {
                            if (taskId.endsWith('_helper')) {
                                const mainTaskId = taskId.replace('_helper', '');
                                removeTaskFromAll(taskId);
                                delete state.helpers[mainTaskId];
                            } else {
                                removeTaskFromAll(taskId);
                                removeTaskFromAll(taskId + '_helper');
                                delete state.helpers[taskId];
                            }
                        });
                    }
                    if (!state.hiddenFillers.includes(filler)) {
                        state.hiddenFillers.push(filler);
                    }
                    state.nonFillers = state.nonFillers.filter(f => f !== filler);
                    state.showReallyHidden = false;
                    renderWorkspace();
                    triggerSave();
                };

                if (assignedTasks.length > 0) {
                    const cleanName = filler.split(/\s*-\s*\d{2}:\d{2}/)[0].trim();
                    showConfirmModal(
                        'Medewerker Verbergen',
                        `Weet je zeker dat je ${cleanName} wilt verbergen? Alle toegewezen taken gaan terug naar onverdeeld.`,
                        executeHide
                    );
                } else {
                    executeHide();
                }
            });

            actionsContainer.appendChild(toggleNonFillerBtn);
            actionsContainer.appendChild(reallyHideBtn);
            tdActions.appendChild(actionsContainer);

            const tdInfo = document.createElement('td');
            tdInfo.style.cssText = 'padding: 4px 4px 4px 0; white-space: nowrap;';
            const infoContainer = document.createElement('div');
            infoContainer.style.cssText = 'display: flex; flex-direction: column; gap: 1px;';
            const { name, subtitle } = parseNameAndSubtitle(filler);
            const truncatedName = name.length > 13 ? name.substring(0, 12) + '..' : name;
            const nameEl = document.createElement('span');
            nameEl.className = 'filler-card-title';
            nameEl.style.cssText = 'font-size: 12px; font-weight: 600; white-space: nowrap;';
            nameEl.textContent = truncatedName;
            nameEl.title = name;
            infoContainer.appendChild(nameEl);
            if (subtitle) {
                const subEl = document.createElement('span');
                subEl.className = 'filler-card-subtitle';
                subEl.style.cssText = 'font-size: 10px; color: var(--text-color-muted); white-space: nowrap;';
                subEl.textContent = subtitle;
                infoContainer.appendChild(subEl);
            }
            tdInfo.appendChild(infoContainer);

            const tdStats = document.createElement('td');
            tdStats.style.cssText = 'padding: 4px 6px; width: 215px;';
            const statsContainer = document.createElement('div');
            statsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

            if (isFinite(maxMin)) {
                const remainingMin = maxMin - roundedTotal;

                const topRow = document.createElement('div');
                topRow.style.cssText = 'display: flex; width: 100%;';
                const usageSpan = document.createElement('span');
                usageSpan.className = `filler-stat-item${isExceeded ? ' exceeded' : ''}`;
                usageSpan.style.cssText = 'width: 100%; justify-content: center; text-align: center;';
                usageSpan.textContent = `Tijd: ${formatMin(roundedTotal)} / ${formatMin(maxMin)}`;
                topRow.appendChild(usageSpan);

                const bottomRow = document.createElement('div');
                bottomRow.style.cssText = 'display: flex; gap: 4px; width: 100%;';
                const pauseSpan = document.createElement('span');
                pauseSpan.className = 'filler-stat-item';
                pauseSpan.style.cssText = 'flex: 1; justify-content: center; text-align: center;';
                pauseSpan.textContent = `Pauze: ${formatMin(pauseMin)}`;

                const remainingSpan = document.createElement('span');
                remainingSpan.className = `filler-stat-item remaining ${remainingMin >= 0 ? 'positive' : 'negative'}`;
                remainingSpan.style.cssText = 'flex: 1; justify-content: center; text-align: center;';
                remainingSpan.textContent = remainingMin >= 0 ? `Over: ${formatMin(remainingMin)}` : `Te veel: ${formatMin(Math.abs(remainingMin))}`;

                bottomRow.appendChild(pauseSpan);
                bottomRow.appendChild(remainingSpan);

                statsContainer.appendChild(topRow);
                statsContainer.appendChild(bottomRow);
            }

            const progressBarContainer = document.createElement('div');
            progressBarContainer.className = 'progress-bar-container';
            progressBarContainer.style.cssText = 'height: 4px; margin-top: 2px;';
            const progressBarFill = document.createElement('div');
            progressBarFill.className = `progress-bar-fill${isExceeded ? ' exceeded' : ''}`;
            const percentage = isFinite(maxMin) && maxMin > 0 ? Math.min((roundedTotal / maxMin) * 100, 100) : 0;
            progressBarFill.style.width = `${percentage}%`;
            progressBarContainer.appendChild(progressBarFill);
            statsContainer.appendChild(progressBarContainer);
            tdStats.appendChild(statsContainer);

            const tdEnd = document.createElement('td');
            tdEnd.style.cssText = 'padding: 4px; width: 75px; text-align: center;';
            const endContainer = document.createElement('div');
            endContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; align-items: center; justify-content: center;';

            const endInput = document.createElement('input');
            endInput.type = 'time';
            endInput.className = 'actual-end-input';
            endInput.style.cssText = 'padding: 2px 4px; font-size: 11px; width: 70px;';

            const plannedEndMin = getFillerEndTime(filler);
            const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '';
            const currentActual = state.actualEndTimes && state.actualEndTimes[filler] !== undefined ? state.actualEndTimes[filler] : plannedEndStr;
            endInput.value = currentActual;

            const prodContainer = document.createElement('div');

            const updateFillerProdDisplay = () => {
                prodContainer.innerHTML = '';
                const pVal = getFillerProductivity(filler);
                if (pVal !== null) {
                    const pSpan = document.createElement('span');
                    pSpan.className = 'filler-stat-item prod';
                    pSpan.textContent = `Prod: ${pVal}%`;
                    prodContainer.appendChild(pSpan);
                }
            };
            updateFillerProdDisplay();

            endInput.addEventListener('input', (e) => {
                state.actualEndTimes[filler] = e.target.value;
                updateFillerProdDisplay();
                triggerSave();
            });
            endInput.addEventListener('change', (e) => {
                state.actualEndTimes[filler] = e.target.value;
                updateFillerProdDisplay();
                triggerSave();
            });
            endInput.addEventListener('click', (e) => e.stopPropagation());

            endContainer.appendChild(endInput);
            endContainer.appendChild(prodContainer);
            tdEnd.appendChild(endContainer);

            const tdTasks = document.createElement('td');
            tdTasks.className = 'filler-tasks-cell';
            const tasksList = document.createElement('div');
            tasksList.className = 'filler-tasks-list';

            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator-line';
            tasksList.appendChild(indicator);

            tr.addEventListener('dragover', (e) => {
                e.preventDefault();
                const closest = getClosestTask(tasksList, e.clientX, e.clientY);
                if (closest) {
                    tr.classList.remove('drag-over');
                    const targetCard = closest.card;
                    let targetLeft = 0;
                    if (closest.before) {
                        targetLeft = targetCard.offsetLeft - 4;
                    } else {
                        targetLeft = targetCard.offsetLeft + targetCard.offsetWidth + 2;
                    }
                    indicator.style.left = `${targetLeft}px`;
                    indicator.style.top = '0';
                    indicator.style.height = '100%';
                    indicator.style.display = 'block';
                } else {
                    indicator.style.display = 'none';
                    if (tasksList.querySelectorAll('.task-card').length === 0) {
                        tr.classList.add('drag-over');
                    }
                }
            });

            tr.addEventListener('dragleave', (e) => {
                if (!tr.contains(e.relatedTarget)) {
                    tr.classList.remove('drag-over');
                    indicator.style.display = 'none';
                }
            });

            tr.addEventListener('drop', (e) => {
                e.preventDefault();
                tr.classList.remove('drag-over');
                indicator.style.display = 'none';
                let taskId = e.dataTransfer.getData('text/plain');
                if (!taskId || !document.getElementById(`task-${taskId}`)) return;
                    const existingAssignee = getTaskAssignment(taskId);
                    const isFromAssigned = e.dataTransfer.getData('is-from-assigned') === 'true';

                    if (isFromAssigned && existingAssignee && existingAssignee !== filler && !taskId.endsWith('_helper') && !taskId.includes('_other')) {
                        const totalDur = getTaskDuration(taskId);
                        const halfDur = Math.floor(totalDur / 2);
                        const helperTaskId = `${taskId}_helper`;
                        state.helpers[taskId] = {
                            helperName: filler,
                            isHalf: true,
                            calculatedDuration: halfDur
                        };
                        if (!state.fillerTasks[filler]) {
                            state.fillerTasks[filler] = [];
                        }
                        removeTaskFromAll(helperTaskId);
                        const closest = getClosestTask(tasksList, e.clientX, e.clientY);
                        if (closest) {
                            const targetTaskId = closest.card.id.replace('task-', '');
                            const tasks = state.fillerTasks[filler];
                            const targetIndex = tasks.indexOf(targetTaskId);
                            if (targetIndex !== -1) {
                                const insertIndex = closest.before ? targetIndex : targetIndex + 1;
                                tasks.splice(insertIndex, 0, helperTaskId);
                            } else {
                                tasks.push(helperTaskId);
                            }
                        } else {
                            state.fillerTasks[filler].push(helperTaskId);
                        }
                        renderWorkspace();
                        triggerSave();
                        return;
                    }

                    const isAlreadyAssigned = existingAssignee !== null;

                    if (taskId.includes('_other') && !taskId.includes('_inst-')) {
                        const uniqueId = `${taskId}_inst-${Date.now()}`;
                        const [pathName] = taskId.split('_');
                        state.instanceTimes[uniqueId] = state.otherTimes[pathName] || 30;
                        taskId = uniqueId;
                    } else {
                        removeTaskFromAll(taskId);
                    }
                    
                    if (taskId.endsWith('_helper')) {
                        const mainTaskId = taskId.replace('_helper', '');
                        if (state.helpers[mainTaskId]) {
                            state.helpers[mainTaskId].helperName = filler;
                        }
                    } else {
                        const helperInfo = state.helpers[taskId];
                        if (helperInfo && helperInfo.helperName === filler) {
                            delete state.helpers[taskId];
                            removeTaskFromAll(taskId + '_helper');
                        }
                    }

                    if (!state.fillerTasks[filler]) {
                        state.fillerTasks[filler] = [];
                    }

                    let counterpartTaskId = null;
                    if (!isAlreadyAssigned && state.autoPairSettings && state.autoPairSettings.enabled) {
                        if (taskId.endsWith('_fill')) {
                            const pKey = taskId.replace('_fill', '');
                            if (state.pathColli[pKey] && MIRROR_TIMES[pKey] !== undefined) {
                                counterpartTaskId = `${pKey}_mirror`;
                            }
                        } else if (taskId.endsWith('_mirror')) {
                            const pKey = taskId.replace('_mirror', '');
                            if (state.pathColli[pKey] && MIRROR_TIMES[pKey] !== undefined) {
                                counterpartTaskId = `${pKey}_fill`;
                            }
                        }
                    }

                    let extraOtherTaskId = null;
                    const isFillOrMirror = taskId.endsWith('_fill') || taskId.endsWith('_mirror');
                    if (!isAlreadyAssigned && isFillOrMirror && state.autoPairSettings && state.autoPairSettings.prependOtherTask && state.autoPairSettings.selectedOtherTask) {
                        const otherName = state.autoPairSettings.selectedOtherTask;
                        const uniqueId = `${otherName}_other_inst-${Date.now()}`;
                        state.instanceTimes[uniqueId] = state.otherTimes[otherName] || 30;
                        extraOtherTaskId = uniqueId;
                    }

                    if (counterpartTaskId) {
                        removeTaskFromAll(counterpartTaskId);
                    }

                    const tasks = state.fillerTasks[filler];
                    const closest = getClosestTask(tasksList, e.clientX, e.clientY);
                    if (closest) {
                        const targetTaskId = closest.card.id.replace('task-', '');
                        const targetIndex = tasks.indexOf(targetTaskId);
                        if (targetIndex !== -1) {
                            const insertIndex = closest.before ? targetIndex : targetIndex + 1;
                            if (extraOtherTaskId) {
                                tasks.splice(insertIndex, 0, extraOtherTaskId);
                                tasks.splice(insertIndex + 1, 0, taskId);
                                if (counterpartTaskId) tasks.splice(insertIndex + 2, 0, counterpartTaskId);
                            } else {
                                tasks.splice(insertIndex, 0, taskId);
                                if (counterpartTaskId) tasks.splice(insertIndex + 1, 0, counterpartTaskId);
                            }
                        } else {
                            if (extraOtherTaskId) tasks.push(extraOtherTaskId);
                            tasks.push(taskId);
                            if (counterpartTaskId) tasks.push(counterpartTaskId);
                        }
                    } else {
                        if (extraOtherTaskId) tasks.push(extraOtherTaskId);
                        tasks.push(taskId);
                        if (counterpartTaskId) tasks.push(counterpartTaskId);
                    }
                    renderWorkspace();
                    triggerSave();
            });

            let currentTime = getFillerStartTime(filler);
            (state.fillerTasks[filler] || []).forEach(taskId => {
                let duration = getTaskDuration(taskId);
                if (!taskId.endsWith('_helper')) {
                    const helperInfo = state.helpers[taskId];
                    if (helperInfo && helperInfo.helperName) {
                        const helperDuration = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                        duration = duration - helperDuration;
                    }
                }
                const startTime = currentTime;
                const endTime = currentTime + duration;
                currentTime = endTime;

                const card = createTaskCard(taskId, startTime, endTime);
                if (card) tasksList.appendChild(card);
            });

            tdTasks.appendChild(tasksList);

            tr.appendChild(tdActions);
            tr.appendChild(tdInfo);
            tr.appendChild(tdStats);
            tr.appendChild(tdEnd);
            tr.appendChild(tdTasks);

            return tr;
        };

        const sortFillers = (list, sortOrder) => {
            return [...list].sort((a, b) => {
                if (sortOrder === 'name-asc') {
                    return a.localeCompare(b);
                } else if (sortOrder === 'name-desc') {
                    return b.localeCompare(a);
                } else if (sortOrder === 'start-asc') {
                    return getFillerStartTime(a) - getFillerStartTime(b);
                } else if (sortOrder === 'start-desc') {
                    return getFillerStartTime(b) - getFillerStartTime(a);
                } else if (sortOrder === 'end-asc') {
                    return getFillerEndTime(a) - getFillerEndTime(b);
                } else if (sortOrder === 'end-desc') {
                    return getFillerEndTime(b) - getFillerEndTime(a);
                }
                return 0;
            });
        };

        if (nonFillersSection && nonFillersTableBody) {
            if (nonFillersList.length > 0) {
                nonFillersSection.style.display = 'flex';
                if (fillersHeader) fillersHeader.style.display = 'flex';
                sortFillers(nonFillersList, state.fillerSortOrder).forEach(filler => {
                    nonFillersTableBody.appendChild(buildFillerRow(filler, true));
                });
            } else {
                nonFillersSection.style.display = 'none';
                if (fillersHeader) fillersHeader.style.display = 'none';
            }
        }

        const sortedFillers = sortFillers(activeFillers, state.fillerSortOrder);

        sortedFillers.forEach(filler => {
            fillersTableBody.appendChild(buildFillerRow(filler, false));
        });

        const assignedGrid = document.getElementById('assigned-tasks-grid');
        const assignedSection = document.getElementById('assigned-tasks-section');
        if (assignedGrid) assignedGrid.innerHTML = '';

        let fillCount = 0;
        let mirrorCount = 0;
        let otherCount = 0;
        let assignedCount = 0;

        allTaskIds.forEach(taskId => {
            const card = createTaskCard(taskId);
            if (!card) return;

            const assignee = getTaskAssignment(taskId);
            if (!assignee) {
                if (taskId.endsWith('_fill')) {
                    fillContainer.appendChild(card);
                    fillCount++;
                } else if (taskId.endsWith('_mirror')) {
                    mirrorContainer.appendChild(card);
                    mirrorCount++;
                } else {
                    otherContainer.appendChild(card);
                    otherCount++;
                }
            } else {
                if (assignedGrid) {
                    const isTabMatch = (state.activeTab === 'fill' && taskId.endsWith('_fill')) ||
                                       (state.activeTab === 'mirror' && taskId.endsWith('_mirror')) ||
                                       (state.activeTab === 'other' && !taskId.endsWith('_fill') && !taskId.endsWith('_mirror'));
                    if (isTabMatch) {
                        assignedGrid.appendChild(card);
                        assignedCount++;
                    }
                }
            }
        });

        if (assignedSection) {
            assignedSection.style.display = assignedCount > 0 ? 'flex' : 'none';
        }

        if (tabFill) tabFill.textContent = `Vullen (${fillCount})`;
        if (tabMirror) tabMirror.textContent = `Spiegelen (${mirrorCount})`;
        if (tabOther) tabOther.textContent = 'Overige';





        workspace.style.display = 'grid';
    };



    const parsePDFAndGetNames = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const namesSet = new Set();

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const rows = await extractTextLinesFromPage(page);

            for (let row of rows) {
                const timeIndex = row.rawText.search(/\b\d{2}:\d{2}\b/);
                if (timeIndex !== -1) {
                    let name = row.rawText.substring(0, timeIndex).trim();
                    name = name.replace(/[…\.\s\-]+$/, '').trim();
                    if (name && !['TAAK', 'AANWEZIG', 'TIJDEN', 'DAGROOSTER', 'WINKEL', 'GOEDERENVERWERKING'].includes(name.toUpperCase()) && !name.toUpperCase().includes('AFGEDRUKT')) {
                        const timeMatch = row.rawText.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?[…\.]*/);
                        const timeStr = timeMatch ? timeMatch[0].replace(/[…\.]+$/, '').trim() : '';
                        const displayName = timeStr ? `${name} - ${timeStr}` : name;
                        namesSet.add(displayName);

                        const timeMatches = [...row.rawText.matchAll(/\b\d{2}:\d{2}\b/g)].map(m => m[0]);
                        if (timeMatches.length >= 3) {
                            const pParts = timeMatches[2].split(':');
                            const pMin = (parseInt(pParts[0]) || 0) * 60 + (parseInt(pParts[1]) || 0);
                            state.fillerBreaks[displayName] = pMin;
                        }
                    }
                }
            }
        }
        return Array.from(namesSet).sort();
    };

    const NORMS = {
        "wijnen": 50,
        "zoutjes snacks": 60,
        "frisdrank": 80,
        "bieren": 80,
        "vruchtensappen": 75,
        "ontbijtvervangers": 50,
        "boterhambeleg": 50,
        "koffie thee": 50,
        "koffiemelk": 50,
        "koekjes": 50,
        "chocolade": 50,
        "suikerwerk": 50,
        "suiker": 50,
        "groenteconserven": 50,
        "vleesconserven": 50,
        "zuren sauzen": 50,
        "soepen": 50,
        "houdbare zuivel": 50,
        "gezondheidsvoeding": 50,
        "rijst en deegwaren": 50,
        "maaltijdstraat ldc + specerijen": 50,
        "eieren": 34,
        "meelproducten": 50,
        "papierwaren": 80,
        "kindervoeding": 50,
        "luiers": 50,
        "wasmiddelen": 54,
        "reinigingsmiddelen": 54,
        "sorbo": 88,
        "huishoudelijk": 88,
        "nonfood": 88,
        "persoonlijke verzorging": 60,
        "dierenvoeding": 50,
        "diepvries": 60,
        "zuivel": 60,
        "geelvetten": 46,
        "vers vlees": 80,
        "vis": 100,
        "vleeswaren av/ava": 90,
        "vleeswaren zb": 70,
        "kaas av/ava": 100,
        "kaas zb": 60
    };

    const parseColliPDF = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const colliMap = {};

        Object.keys(PATHS_MAPPING).forEach(path => {
            colliMap[path] = { colli: 0, duration: 0 };
        });

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const rows = await extractTextLinesFromPage(page);

            for (let row of rows) {
                const match = row.rawText.match(/99999\s+\d+\s+(.+?)\s+(\d+)\s+(RDC|VDC|CDC|DDC|VDM|AGF|TRS|RZL|VDZ|VLG)/i);
                if (match) {
                    const category = match[1].trim();
                    const colli = parseInt(match[2].trim()) || 0;
                    let foundPath = null;
                    for (const [pathName, categories] of Object.entries(PATHS_MAPPING)) {
                        if (categories.some(cat => cat.trim().toLowerCase() === category.toLowerCase())) {
                            foundPath = pathName;
                            break;
                        }
                    }
                    if (foundPath) {
                        const norm = NORMS[category.toLowerCase()] || 62;
                        colliMap[foundPath].colli += colli;
                        colliMap[foundPath].duration += (colli / norm) * 60;
                    }
                }
            }
        }
        return colliMap;
    };

    const renderPeopleList = (names) => {
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

    const showConfirmModal = (title, message, btnTextOrCallback, onConfirmArg) => {
        let btnText, onConfirm;
        if (typeof btnTextOrCallback === 'function') {
            btnText = 'Overschrijven';
            onConfirm = btnTextOrCallback;
        } else {
            btnText = btnTextOrCallback;
            onConfirm = onConfirmArg;
        }
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const okBtn = document.getElementById('confirm-ok-btn');

        if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) return;

        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = btnText;
        modal.style.display = 'flex';

        const close = () => {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleOk);
        };

        const handleCancel = () => close();
        const handleOk = () => {
            close();
            onConfirm();
        };

        cancelBtn.addEventListener('click', handleCancel);
        okBtn.addEventListener('click', handleOk);
    };

    const triggerSave = () => {
        if (!storeId) return;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const supabase = await getSupabase();
            const payload = {
                selectedFillers: state.selectedFillers,
                pathColli: state.pathColli,
                fillerTasks: state.fillerTasks,
                helpers: state.helpers,
                otherTimes: state.otherTimes,
                instanceTimes: state.instanceTimes,
                fillerBreaks: state.fillerBreaks,
                actualEndTimes: state.actualEndTimes,
                nonFillers: state.nonFillers || [],
                hiddenFillers: state.hiddenFillers || [],
                showNonFillers: !!state.showNonFillers,
                showReallyHidden: !!state.showReallyHidden,
                autoPairSettings: state.autoPairSettings || { enabled: false, prependOtherTask: false, selectedOtherTask: "" }
            };
            await supabase.from('vulplanningen').upsert({ id: storeId, vulplanning: payload });
        }, 500);
    };

    const loadData = async () => {
        if (!storeId) return;
        const supabase = await getSupabase();
        const { data } = await supabase.from('vulplanningen').select('vulplanning').eq('id', storeId).single();
        if (data && data.vulplanning) {
            const vp = data.vulplanning;
            if (vp.selectedFillers) state.selectedFillers = vp.selectedFillers;
            if (vp.pathColli) state.pathColli = vp.pathColli;
            if (vp.fillerTasks) state.fillerTasks = vp.fillerTasks;
            if (vp.helpers) state.helpers = vp.helpers;
            if (vp.otherTimes) state.otherTimes = vp.otherTimes;
            if (vp.instanceTimes) state.instanceTimes = vp.instanceTimes;
            if (vp.fillerBreaks) state.fillerBreaks = vp.fillerBreaks;
            if (vp.actualEndTimes) state.actualEndTimes = vp.actualEndTimes;
            if (vp.nonFillers) state.nonFillers = vp.nonFillers;
            if (vp.hiddenFillers) state.hiddenFillers = vp.hiddenFillers;
            if (vp.showNonFillers !== undefined) state.showNonFillers = vp.showNonFillers;
            // if (vp.showReallyHidden !== undefined) state.showReallyHidden = vp.showReallyHidden;
            if (vp.autoPairSettings) state.autoPairSettings = vp.autoPairSettings;
        }
    };

    document.addEventListener('DOMContentLoaded', async () => {
        loadHeader();
        const auth = await checkAuth(['beheerder']);
        if (!auth) return;
        storeId = auth.userData.winkel;
        const isPlusLms = auth.storeCode === 'plus-lms';

        const showManualBtn = document.getElementById('show-manual-input-btn');
        const manualContainer = document.getElementById('manual-input-container');

        if (showManualBtn && manualContainer) {
            showManualBtn.addEventListener('click', () => {
                document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                manualContainer.style.display = 'flex';
            });
        }

        if (!isPlusLms) {
            document.querySelectorAll('.upload-group').forEach(el => {
                el.style.display = 'none';
            });
            if (manualContainer) manualContainer.style.display = 'flex';
        }

        let storeEmployees = [];
        let storeDefaultPaden = [];
        const supabase = await getSupabase();
        if (storeId && supabase) {
            const { data: users } = await supabase
                .from('user_data')
                .select('full_name')
                .eq('winkel', storeId)
                .order('full_name', { ascending: true });
            if (users) {
                storeEmployees = users.map(u => u.full_name).filter(Boolean);
            }

            const { data: storeData } = await supabase
                .from('stores_info')
                .select('paden_categorieen')
                .eq('store_id', storeId)
                .maybeSingle();
            storeDefaultPaden = storeData?.paden_categorieen || [];
        }

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
                listEl.innerHTML = currentMatches.map((emp, idx) => `<div class="autocomplete-item" data-idx="${idx}" style="padding: 8px 12px; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--border-color); ${idx === 0 ? 'background-color: var(--border-color);' : ''}">${emp}</div>`).join('');
                listEl.style.display = 'block';
                listEl.querySelectorAll('.autocomplete-item').forEach(item => {
                    item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--border-color)');
                    item.addEventListener('mouseleave', () => {
                        if (item.getAttribute('data-idx') !== '0') item.style.backgroundColor = 'transparent';
                    });
                    item.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        inputEl.value = item.textContent;
                        listEl.style.display = 'none';
                    });
                });
            };
            inputEl.addEventListener('focus', render);
            inputEl.addEventListener('input', render);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (currentMatches.length > 0) {
                        e.preventDefault();
                        inputEl.value = currentMatches[0];
                        listEl.style.display = 'none';
                    }
                }
            });
            inputEl.addEventListener('blur', () => {
                setTimeout(() => { listEl.style.display = 'none'; }, 150);
            });
        };

        const manualFillersList = document.getElementById('manual-fillers-list');
        const manualPathsList = document.getElementById('manual-paths-list');
        const addFillerBtn = document.getElementById('add-manual-filler-btn');
        const addPathBtn = document.getElementById('add-manual-path-btn');
        const startManualBtn = document.getElementById('start-manual-planning-btn');

        if (manualFillersList && manualPathsList) {
            const addFillerRow = (name = '', startTime = '', endTime = '') => {
                const row = document.createElement('div');
                row.className = 'manual-filler-row';
                row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
                row.innerHTML = `
                    <div style="flex: 2; position: relative;">
                        <input type="text" placeholder="Naam vuller" value="${name}" class="manual-filler-name" style="width: 100%; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);" autocomplete="off">
                        <div class="filler-autocomplete-list" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 180px; overflow-y: auto; background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 100; margin-top: 4px;"></div>
                    </div>
                    <input type="time" value="${startTime}" class="manual-filler-start" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    <input type="time" value="${endTime}" class="manual-filler-end" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    <button type="button" class="remove-row-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 4px;"><i class="material-icons">delete</i></button>
                `;
                row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
                setupFillerAutocomplete(row.querySelector('.manual-filler-name'), row.querySelector('.filler-autocomplete-list'));
                manualFillersList.appendChild(row);
            };

            const addCategoryRow = (categoriesContainer, catName = '', colli = '', norm = '') => {
                const row = document.createElement('div');
                row.className = 'manual-category-row';
                row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 6px;';
                row.innerHTML = `
                    <input type="text" placeholder="Categorie (bijv. Frisdrank)" value="${catName}" class="manual-cat-name" style="flex: 2; padding: 6px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px;">
                    <input type="number" placeholder="Colli" value="${colli}" class="manual-cat-colli" style="flex: 1; padding: 6px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px;">
                    <input type="number" placeholder="Norm (colli/u)" value="${norm}" class="manual-cat-norm" style="flex: 1; padding: 6px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px;">
                    <button type="button" class="remove-cat-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 2px;"><i class="material-icons" style="font-size: 18px;">close</i></button>
                `;
                row.querySelector('.remove-cat-btn').addEventListener('click', () => row.remove());
                categoriesContainer.appendChild(row);
            };

            const addPathBlock = (pathName = '') => {
                const block = document.createElement('div');
                block.className = 'manual-path-block';
                block.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; background-color: var(--bg-color); display: flex; flex-direction: column; gap: 8px;';
                block.innerHTML = `
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" placeholder="Padnaam (bijv. Frisdrank, Bier)" value="${pathName}" class="manual-path-name" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-weight: 600;">
                        <button type="button" class="remove-path-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 4px;"><i class="material-icons">delete</i></button>
                    </div>
                    <div class="manual-categories-container" style="display: flex; flex-direction: column; padding-left: 12px; border-left: 2px solid var(--border-color); margin-top: 4px;"></div>
                    <button type="button" class="add-cat-btn" style="align-self: flex-start; padding: 4px 8px; font-size: 12px; background: none; border: 1px dashed var(--border-color); color: var(--text-color); border-radius: 4px; cursor: pointer;">+ Categorie Toevoegen</button>
                `;

                const catContainer = block.querySelector('.manual-categories-container');
                block.querySelector('.add-cat-btn').addEventListener('click', () => addCategoryRow(catContainer));
                block.querySelector('.remove-path-btn').addEventListener('click', () => block.remove());
                manualPathsList.appendChild(block);
                return catContainer;
            };

            const populatePaths = (padenList) => {
                manualPathsList.innerHTML = '';
                if (Array.isArray(padenList) && padenList.length > 0) {
                    padenList.forEach(p => {
                        const catContainer = addPathBlock(p.name || '');
                        if (Array.isArray(p.categories) && p.categories.length > 0) {
                            p.categories.forEach(c => addCategoryRow(catContainer, c.name || '', '', c.norm || ''));
                        } else {
                            addCategoryRow(catContainer);
                        }
                    });
                } else {
                    const catContainer = addPathBlock();
                    addCategoryRow(catContainer);
                }
            };

            if (addFillerBtn) addFillerBtn.addEventListener('click', () => addFillerRow());
            if (addPathBtn) addPathBtn.addEventListener('click', () => {
                const catContainer = addPathBlock();
                addCategoryRow(catContainer);
            });

            if (Object.keys(state.pathColli).length > 0) {
                Object.entries(state.pathColli).forEach(([pathName, obj]) => {
                    const catContainer = addPathBlock(pathName);
                    const norm = obj.colli && obj.duration ? Math.round((obj.colli / (obj.duration / 60))) : '';
                    addCategoryRow(catContainer, pathName, obj.colli || '', norm);
                });
            } else {
                populatePaths(storeDefaultPaden);
            }

            initPadenModal(supabase, storeId, (newPaden) => {
                storeDefaultPaden = newPaden;
                populatePaths(newPaden);
            });

            if (state.selectedFillers && state.selectedFillers.length > 0) {
                state.selectedFillers.forEach(displayName => {
                    const match = displayName.match(/^(.+?)\s*-\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
                    if (match) {
                        addFillerRow(match[1], match[2], match[3]);
                    } else {
                        addFillerRow(displayName, '', '');
                    }
                });
            } else {
                addFillerRow('', '', '');
            }

            if (startManualBtn) {
                startManualBtn.addEventListener('click', () => {
                    const fillerRows = manualFillersList.querySelectorAll('.manual-filler-row');
                    const newFillers = [];
                    let missingTimes = false;
                    fillerRows.forEach(r => {
                        const nameInput = r.querySelector('.manual-filler-name');
                        if (!nameInput) return;
                        const name = nameInput.value.trim();
                        const start = r.querySelector('.manual-filler-start')?.value || '';
                        const end = r.querySelector('.manual-filler-end')?.value || '';
                        if (name) {
                            if (!start || !end) missingTimes = true;
                            newFillers.push(`${name} - ${start} - ${end}`);
                        }
                    });

                    if (!newFillers.length) {
                        showToast('Voeg ten minste één vuller met naam toe.', 'error');
                        return;
                    }

                    if (missingTimes) {
                        showToast('Vul de begin- en eindtijd in voor alle vullers.', 'error');
                        return;
                    }

                    const pathBlocks = manualPathsList.querySelectorAll('.manual-path-block');
                    if (!pathBlocks.length) {
                        showToast('Voeg ten minste één pad toe.', 'error');
                        return;
                    }

                    let missingPathName = false;
                    let missingCatName = false;
                    let missingNorm = false;

                    const newPathColli = {};

                    pathBlocks.forEach(b => {
                        const pathName = b.querySelector('.manual-path-name')?.value.trim() || '';
                        if (!pathName) missingPathName = true;

                        const catRows = b.querySelectorAll('.manual-category-row');
                        if (!catRows.length) missingCatName = true;

                        let totalColli = 0;
                        let totalDurationMinutes = 0;

                        catRows.forEach(cr => {
                            const catName = cr.querySelector('.manual-cat-name')?.value.trim() || '';
                            const colliVal = cr.querySelector('.manual-cat-colli')?.value;
                            const colli = parseInt(colliVal) || 0;
                            const normVal = cr.querySelector('.manual-cat-norm')?.value;
                            const norm = parseFloat(normVal) || 0;

                            if (!catName) missingCatName = true;
                            if (!normVal || norm <= 0) missingNorm = true;

                            totalColli += colli;
                            if (norm > 0 && colli > 0) {
                                totalDurationMinutes += (colli / norm) * 60;
                            }
                        });

                        if (pathName) {
                            newPathColli[pathName] = { colli: totalColli, duration: totalDurationMinutes };
                        }
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
                    state.fillerBreaks = {};
                    state.actualEndTimes = {};

                    document.getElementById('step-1-container').style.display = 'none';
                    document.getElementById('step-2-container').style.display = 'block';
                    renderWorkspace();
                    if (resetBtn) resetBtn.style.display = 'inline-block';
                    if (generateBtn) generateBtn.style.display = 'flex';
                    triggerSave();
                });
            }
        }

        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }

        await loadData();

        const resetBtn = document.getElementById('reset-planning-btn');
        const generateBtn = document.getElementById('generate-planning-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Opnieuw Beginnen',
                    'Weet je zeker dat je opnieuw wilt beginnen? De huidige planning wordt overschreven.',
                    () => {
                        state.hiddenFillers = [];
                        state.nonFillers = [];
                        document.getElementById('step-1-container').style.display = 'block';
                        document.getElementById('step-2-container').style.display = 'none';
                        resetBtn.style.display = 'none';
                        if (generateBtn) generateBtn.style.display = 'none';
                        const peopleCard = document.getElementById('people-card');
                        if (peopleCard) peopleCard.style.display = 'none';
                        if (isPlusLms) {
                            document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'block');
                        } else {
                            document.getElementById('manual-input-container').style.display = 'flex';
                        }
                    }
                );
            });
        }

        const hasExistingPlanning = state.selectedFillers && state.selectedFillers.length > 0;
        if (hasExistingPlanning) {
            renderPeopleList(state.selectedFillers);
            state.selectedFillers.forEach(name => {
                const list = document.getElementById('people-list');
                if (list) {
                    const cb = list.querySelector(`input[value="${CSS.escape(name)}"]`);
                    if (cb) cb.checked = true;
                }
            });

            document.getElementById('step-1-container').style.display = 'none';
            document.getElementById('step-2-container').style.display = 'block';
            document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
            const manualContainer = document.getElementById('manual-input-container');
            if (manualContainer) manualContainer.style.display = 'none';
            renderWorkspace();
            if (resetBtn) resetBtn.style.display = 'inline-block';
            if (generateBtn) generateBtn.style.display = 'flex';
        }

        let pendingFillers = null;
        let pendingColli = null;

        const checkAndApplyBothUploads = async () => {
            if (!pendingFillers || !pendingColli) return;

            const applyNewData = () => {
                state.selectedFillers = pendingFillers;
                state.pathColli = pendingColli;
                state.fillerTasks = {};
                state.helpers = {};
                state.instanceTimes = {};
                state.fillerBreaks = {};
                state.actualEndTimes = {};
                pendingFillers = null;
                pendingColli = null;

                document.getElementById('step-1-container').style.display = 'none';
                document.getElementById('step-2-container').style.display = 'block';
                document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                renderWorkspace();
                if (resetBtn) resetBtn.style.display = 'inline-block';
                if (generateBtn) generateBtn.style.display = 'flex';
                triggerSave();
            };

            showConfirmModal(
                'Planning Overschrijven',
                'Beide PDF\'s zijn geüpload. Weet je zeker dat je de bestaande planning wilt overschrijven met deze nieuwe gegevens?',
                applyNewData
            );
        };

        const input = document.getElementById('vulplanning-input');
        if (input) {
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const names = await parsePDFAndGetNames(file);
                    pendingFillers = names;
                    await checkAndApplyBothUploads();
                } catch (err) {
                    console.error(err);
                }
            });
        }

        const sortSelect = document.getElementById('filler-sort-select');
        if (sortSelect) {
            sortSelect.value = state.fillerSortOrder;
            sortSelect.addEventListener('change', (e) => {
                state.fillerSortOrder = e.target.value;
                renderWorkspace();
            });
        }

        const tabFill = document.getElementById('tab-fill');
        const tabMirror = document.getElementById('tab-mirror');
        const tabOther = document.getElementById('tab-other');
        if (tabFill && tabMirror && tabOther) {
            tabFill.addEventListener('click', () => {
                state.activeTab = 'fill';
                renderWorkspace();
            });
            tabMirror.addEventListener('click', () => {
                state.activeTab = 'mirror';
                renderWorkspace();
            });
            tabOther.addEventListener('click', () => {
                state.activeTab = 'other';
                renderWorkspace();
            });
        }

        const colliInput = document.getElementById('colli-input');
        if (colliInput) {
            colliInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    pendingColli = await parseColliPDF(file);
                    await checkAndApplyBothUploads();
                } catch (err) {
                    console.error(err);
                }
            });
        }

        const generatePrintablePlanning = () => {
            const printWin = window.open('about:blank', '_blank');
            if (!printWin) return;

            const visibleFillers = state.selectedFillers.filter(f => !(state.hiddenFillers || []).includes(f));
            const sortedFillers = [...visibleFillers].sort((a, b) => {
                if (state.fillerSortOrder === 'name-asc') return a.localeCompare(b);
                if (state.fillerSortOrder === 'name-desc') return b.localeCompare(a);
                if (state.fillerSortOrder === 'start-asc') return getFillerStartTime(a) - getFillerStartTime(b);
                if (state.fillerSortOrder === 'start-desc') return getFillerStartTime(b) - getFillerStartTime(a);
                if (state.fillerSortOrder === 'end-asc') return getFillerEndTime(a) - getFillerEndTime(b);
                if (state.fillerSortOrder === 'end-desc') return getFillerEndTime(b) - getFillerEndTime(a);
                return a.localeCompare(b);
            });

            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            let cardsHtml = '';
            sortedFillers.forEach(filler => {
                const tasks = state.fillerTasks[filler] || [];
                const startMin = getFillerStartTime(filler);
                const startStr = isFinite(startMin) ? formatTimeOfDay(startMin) : '--:--';
                const pauseMin = getFillerPause(filler);
                const plannedEndMin = getFillerEndTime(filler);
                const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '--:--';

                let currentTime = isFinite(startMin) ? startMin : 0;

                if (tasks.length === 0) {
                    cardsHtml += `<div class="printable-card empty-card"><div class="card-header"><span class="filler-name">${parseNameAndSubtitle(filler).name}</span><span class="time-compact">${startStr} - ${plannedEndStr} | Pauze: ${pauseMin}m</span></div><div class="empty-label">Geen taken</div></div>`;
                } else {
                    let tasksListHtml = '';
                    tasks.forEach(taskId => {
                        let duration = getTaskDuration(taskId);
                        if (!taskId.endsWith('_helper')) {
                            const helperInfo = state.helpers[taskId];
                            if (helperInfo && helperInfo.helperName) {
                                const rawDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : (helperInfo.duration || 0);
                                duration = Math.max(0, duration - Math.min(duration, Math.max(0, rawDur)));
                            }
                        }
                        const tStart = currentTime;
                        currentTime += duration;
                        const startTimeStr = formatTimeOfDay(tStart);
                        const endTimeStr = formatTimeOfDay(currentTime);
                        let taskTitle = '';
                        let taskBadge = '';
                        let badgeClass = '';
                        if (taskId.endsWith('_helper')) {
                            const mainTaskId = taskId.replace('_helper', '');
                            taskTitle = `${mainTaskId.split('_')[0]} (Hulp)`;
                            taskBadge = 'Hulp';
                            badgeClass = 'badge-helper';
                        } else {
                            const [pName, pType] = taskId.split('_');
                            taskTitle = pName;
                            if (pType === 'fill') { taskBadge = 'Vul'; badgeClass = 'badge-fill'; }
                            else if (pType === 'mirror') { taskBadge = 'Spgl'; badgeClass = 'badge-mirror'; }
                            else { taskBadge = 'Ovr'; badgeClass = 'badge-other'; }
                        }
                        tasksListHtml += `<div class="task-row"><span class="task-time">${startTimeStr}-${endTimeStr}</span><span class="task-name">${taskTitle}</span><span class="task-badge ${badgeClass}">${taskBadge}</span></div>`;
                    });
                    cardsHtml += `<div class="printable-card"><div class="card-header"><span class="filler-name">${parseNameAndSubtitle(filler).name}</span><span class="time-compact">${startStr} - ${plannedEndStr} | Pauze: ${pauseMin}m</span></div><div class="card-body">${tasksListHtml}</div></div>`;
                }
            });

            let padTableRowsHtml = '';
            const padMap = {};
            sortedFillers.forEach(filler => {
                const tasks = state.fillerTasks[filler] || [];
                const startMin = getFillerStartTime(filler);
                let currentTime = isFinite(startMin) ? startMin : 0;
                const cleanName = parseNameAndSubtitle(filler).name;
                tasks.forEach(taskId => {
                    let duration = getTaskDuration(taskId);
                    if (!taskId.endsWith('_helper')) {
                        const helperInfo = state.helpers[taskId];
                        if (helperInfo && helperInfo.helperName) {
                            const rawDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : (helperInfo.duration || 0);
                            duration = Math.max(0, duration - Math.min(duration, Math.max(0, rawDur)));
                        }
                    }
                    const tStart = currentTime;
                    currentTime += duration;
                    let padName = '';
                    let role = '';
                    if (taskId.endsWith('_helper')) {
                        padName = taskId.replace('_helper', '').split('_')[0];
                        role = 'Hulp';
                    } else {
                        const [pName, pType] = taskId.split('_');
                        padName = pName;
                        role = pType === 'fill' ? 'Vullen' : pType === 'mirror' ? 'Spiegelen' : 'Overig';
                    }
                    if (padName) {
                        if (!padMap[padName]) padMap[padName] = [];
                        padMap[padName].push({ cleanName, role, startTimeStr: formatTimeOfDay(tStart), endTimeStr: formatTimeOfDay(currentTime), durationMins: duration });
                    }
                });
            });

            Object.keys(padMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).forEach(padName => {
                const assignments = padMap[padName];
                const uniquePersons = new Set(assignments.map(a => a.cleanName)).size;
                const pathData = state.pathColli[padName] || { colli: 0 };
                const colli = pathData.colli || 0;
                let fillMins = 0, mirrorMins = 0;
                assignments.forEach(a => {
                    if (a.role === 'Vullen' || a.role === 'Hulp') fillMins += a.durationMins || 0;
                    else if (a.role === 'Spiegelen') mirrorMins += a.durationMins || 0;
                });
                const fmtM = m => m <= 0 ? '-' : `${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,'0')}`;
                const fillHours = fillMins / 60;
                const norm = (colli > 0 && fillHours > 0) ? Math.round(colli / fillHours) : '-';
                const fillersList = assignments.filter(a => a.role === 'Vullen' || a.role === 'Hulp').map(a => `${a.cleanName}`).join(', ');
                const mirrorersList = assignments.filter(a => a.role === 'Spiegelen').map(a => `${a.cleanName}`).join(', ');
                padTableRowsHtml += `<tr><td>${padName}</td><td>${fillersList || '-'}</td><td>${mirrorersList || '-'}</td><td>${uniquePersons}</td><td>${colli}</td><td>${norm}</td><td>${fmtM(fillMins)}</td><td>${fmtM(mirrorMins)}</td></tr>`;
            });

            const htmlContent = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Vulplanning ${dateStr}</title>
<style>
@page{size:A4 landscape;margin:5mm}
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:0.85rem;line-height:1.3}
body{background:#fff;color:#1e293b;padding:6px 10px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #658d24;padding-bottom:4px;margin-bottom:6px}
.header h1{font-size:14px;font-weight:700;color:#0f172a}
.header .date{font-size:10px;color:#64748b}
.print-btn{background:#658d24;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer}
.no-print-bar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.grid-container{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.printable-card{border:1px solid #d1d5db;border-radius:4px;overflow:hidden}
.printable-card.empty-card{max-height:35px;display:flex;align-items:center}
.empty-card .card-header{border-bottom:none;padding:2px 6px;flex:1}
.empty-label{font-size:10px;color:#94a3b8;font-style:italic;padding-right:6px;white-space:nowrap}
.card-header{background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:3px 6px;display:flex;justify-content:space-between;align-items:center}
.filler-name{font-size:11px;font-weight:700;color:#0f172a}
.time-compact{font-size:9px;color:#475569;white-space:nowrap}
.card-body{padding:2px 4px;display:flex;flex-direction:column;gap:1px}
.task-row{display:flex;align-items:center;gap:4px;padding:1px 4px;border-bottom:1px solid #f1f5f9}
.task-row:last-child{border-bottom:none}
.task-time{font-size:9px;font-weight:600;color:#334155;min-width:65px;flex-shrink:0}
.task-name{font-size:10px;font-weight:500;color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-badge{font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;text-transform:uppercase;flex-shrink:0}
.badge-fill{background:#dbeafe;color:#1d4ed8}
.badge-mirror{background:#fef3c7;color:#b45309}
.badge-other{background:#ede9fe;color:#6b21a8}
.badge-helper{background:#fce7f3;color:#be185d}
.page-break{page-break-before:always;break-before:page}
.section-title{font-size:13px;font-weight:700;color:#0f172a;border-bottom:1.5px solid #658d24;padding-bottom:3px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.section-title .date{font-size:10px;color:#64748b;font-weight:400}
.pad-table{width:100%;border-collapse:collapse;font-size:11px}
.pad-table th,.pad-table td{border:1px solid #d1d5db;padding:3px 5px}
.pad-table th{background:#f1f5f9;font-weight:700;font-size:10px;text-align:left;white-space:nowrap}
.pad-table td{font-size:10px}
.pad-table td:nth-child(n+4){text-align:center}
.pad-table tr:nth-child(even){background:#fafbfc}
.notes-box{margin-top:8px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;page-break-inside:avoid}
.notes-box h4{font-size:10px;font-weight:700;color:#475569;margin-bottom:2px}
.notes-lines{height:36px}
.notes-lines div{border-bottom:1px dashed #d1d5db;height:12px}
@media print{.no-print-bar{display:none!important}body{padding:5mm;background:#fff}.printable-card{break-inside:avoid}}
</style>
</head>
<body>
<div class="no-print-bar"><button class="print-btn" onclick="window.print()">Afdrukken / Opslaan als PDF</button><span class="date">${dateStr}</span></div>
<div class="header"><h1>Vulplanning Overzicht</h1><span class="date">${dateStr}</span></div>
<div class="grid-container">${cardsHtml}</div>
<div class="page-break"></div>
<div class="section-title"><span>Overzicht per Pad / Afdeling</span><span class="date">${dateStr}</span></div>
<table class="pad-table"><thead><tr><th>Pad</th><th>Vullers</th><th>Spiegelaars</th><th>Pers.</th><th>Colli</th><th>Norm</th><th>Vultijd</th><th>Spgl.tijd</th></tr></thead><tbody>${padTableRowsHtml}</tbody></table>
<div class="notes-box"><h4>Aantekeningen</h4><div class="notes-lines"><div></div><div></div><div></div></div></div>
</body>
</html>`;

            printWin.document.open();
            printWin.document.write(htmlContent);
            printWin.document.close();
        };

        if (generateBtn) {
            generateBtn.addEventListener('click', generatePrintablePlanning);
        }

        const toggleReallyHiddenBtn = document.getElementById('toggle-really-hidden-btn');

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
            if (selectedVal && state.otherTimes[selectedVal]) {
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



        const clearPlanningBtn = document.getElementById('clear-planning-btn');
        if (clearPlanningBtn) {
            clearPlanningBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Planning leegmaken',
                    'Weet je zeker dat je alle toegewezen taken van alle medewerkers wilt verwijderen?',
                    'Leegmaken',
                    () => {
                        state.fillerTasks = {};
                        state.helpers = {};
                        state.instanceTimes = {};
                        renderWorkspace();
                        triggerSave();
                        showToast('Planning leeggemaakt', 'success');
                    }
                );
            });
        }

        if (toggleReallyHiddenBtn) {
            toggleReallyHiddenBtn.addEventListener('click', () => {
                state.showReallyHidden = !state.showReallyHidden;
                renderWorkspace();
                triggerSave();
            });
        }

        let globalDragCounter = 0;
        document.addEventListener('dragenter', (e) => {
            if (e.dataTransfer && e.dataTransfer.types.includes('text/plain')) {
                globalDragCounter++;
                const tasksContainerEl = document.getElementById('tasks-container');
                if (tasksContainerEl) tasksContainerEl.classList.add('drag-delete');
            }
        });
        document.addEventListener('dragleave', (e) => {
            if (e.dataTransfer && e.dataTransfer.types.includes('text/plain')) {
                globalDragCounter--;
                if (globalDragCounter === 0) {
                    const tasksContainerEl = document.getElementById('tasks-container');
                    if (tasksContainerEl) tasksContainerEl.classList.remove('drag-delete');
                }
            }
        });
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.addEventListener('drop', (e) => {
            globalDragCounter = 0;
            const tasksContainerEl = document.getElementById('tasks-container');
            if (tasksContainerEl) tasksContainerEl.classList.remove('drag-delete');
            
            const taskId = e.dataTransfer.getData('text/plain');
            if (!taskId || !document.getElementById(`task-${taskId}`)) return;

            if (e.target.closest('#tasks-container')) {
                e.preventDefault();
                if (taskId.endsWith('_helper')) {
                    const mainTaskId = taskId.replace('_helper', '');
                    removeTaskFromAll(taskId);
                    delete state.helpers[mainTaskId];
                } else {
                    removeTaskFromAll(taskId);
                    removeTaskFromAll(taskId + '_helper');
                    delete state.helpers[taskId];
                }
                renderWorkspace();
                triggerSave();
            } else if (!e.target.closest('.filler-card')) {
                e.preventDefault();
                renderWorkspace();
            }
        });
    });
})();
