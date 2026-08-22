import {
    state,
    getFillerPause,
    getAvailableTime,
    getTaskDuration,
    getFillerTotalTime,
    getFillerProductivity,
    getProductivityStatusClass,
    formatTimeInputValue,
    getTaskAssignment,
    removeTaskFromAll,
    getClosestTask,
    createPersonNameElement
} from './state.js';
import {
    formatMin,
    formatTimeOfDay,
    getFillerStartTime,
    getFillerEndTime,
    parseNameAndSubtitle
} from './planning-logic.js';
import { openDurationModal, openHelperModal } from './modals.js';
import { showConfirmModal } from '../modal.js';
import { triggerSave } from './storage.js';
import { HARDCODED_MIRROR_TIMES } from './plus/pdf-defaults.js';

export const createTaskCard = (taskId, startTime, endTime) => {
    const isHelperTask = taskId.endsWith('_helper');
    const mainTaskId = isHelperTask ? taskId.replace('_helper', '') : taskId;
    const [pathName, type] = mainTaskId.split('_');
    const isBreakTask = pathName === 'Pauze';
    const data = state.pathColli[pathName];
    if (!data && type !== 'other') return null;
    if (getTaskDuration(taskId) <= 0 && !isBreakTask) return null;
    const card = document.createElement('div');
    card.className = 'task-card ' + type + (isBreakTask ? ' break-task' : '') + (isHelperTask ? ' helper' : '');
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

    const duration = getTaskDuration(taskId);
    let durationText = '';
    if (isHelperTask) {
        card.classList.add('helper');
        durationText = formatMin(duration);
    } else if (startTime === undefined) {
        durationText = (isBreakTask && duration === 0) ? '' : formatMin(duration);
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
    leftMetaSpan.textContent = durationText || '\u00A0';
    metaRow.appendChild(leftMetaSpan);

    if (startTime !== undefined && endTime !== undefined) {
        const rightMetaSpan = document.createElement('span');
        rightMetaSpan.textContent = `${formatTimeOfDay(startTime)} - ${formatTimeOfDay(endTime)}`;
        metaRow.appendChild(rightMetaSpan);
    }

    card.appendChild(metaRow);

    if (!isHelperTask && pathName !== 'Pauze') {
        const assignee = getTaskAssignment(taskId);
        if (assignee || type === 'other') {
            const menuBtn = document.createElement('button');
            menuBtn.className = 'task-menu-btn';
            menuBtn.innerHTML = '<i class="material-icons">more_vert</i>';
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

export const updateMaxHelperDurations = () => {
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

export const renderWorkspace = () => {
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

    if (tabMirror) tabMirror.style.display = '';

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
        if (getTaskDuration(`${pathName}_fill`) > 0) {
            allTaskIds.push(`${pathName}_fill`);
        }
        if (HARDCODED_MIRROR_TIMES[pathName] !== undefined || (state.pathColli[pathName] && state.pathColli[pathName].mirrorDuration !== undefined)) {
            if (getTaskDuration(`${pathName}_mirror`) > 0) {
                allTaskIds.push(`${pathName}_mirror`);
            }
        }
    });
    const otherKeys = Object.keys(state.otherTimes).filter(k => k !== 'Pauze');
    allTaskIds.push('Pauze_other');
    otherKeys.forEach(pathName => {
        if (getTaskDuration(`${pathName}_other`) > 0) {
            allTaskIds.push(`${pathName}_other`);
        }
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
                badge.className = 'really-hidden-badge';
                const nameEl = createPersonNameElement(filler, 'person-name', 'person-subtitle', 'person-info');
                const icon = document.createElement('i');
                icon.className = 'material-icons';
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
        tr.className = `filler-row${isExceeded ? ' exceeded' : ''}${isNonFiller ? ' non-filler' : ''}`;

        const tdActions = document.createElement('td');
        tdActions.className = 'td-actions';
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'actions-container';

        const toggleNonFillerBtn = document.createElement('button');
        toggleNonFillerBtn.type = 'button';
        toggleNonFillerBtn.className = 'action-btn action-btn-toggle';
        toggleNonFillerBtn.title = isNonFiller ? 'Terugzetten als vuller' : 'Zet onderaan als niet-vuller';
        toggleNonFillerBtn.innerHTML = `<i class="material-icons">${isNonFiller ? 'arrow_upward' : 'arrow_downward'}</i>`;
        toggleNonFillerBtn.addEventListener('click', () => {
            if (isNonFiller) {
                state.nonFillers = state.nonFillers.filter(f => f !== filler);
            } else {
                if (!state.nonFillers.includes(filler)) state.nonFillers.push(filler);
            }
            renderWorkspace();
            triggerSave();
        });

        const reallyHideBtn = document.createElement('button');
        reallyHideBtn.type = 'button';
        reallyHideBtn.className = 'action-btn action-btn-hide';
        reallyHideBtn.title = 'Medewerker verbergen';
        reallyHideBtn.innerHTML = '<i class="material-icons">visibility_off</i>';

        reallyHideBtn.addEventListener('click', () => {
            const assignedTasks = state.fillerTasks[filler] || [];
            const executeHide = () => {
                assignedTasks.forEach(tId => {
                    if (tId.endsWith('_helper')) {
                        const mainId = tId.replace('_helper', '');
                        delete state.helpers[mainId];
                    }
                });
                delete state.fillerTasks[filler];
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
        tdInfo.className = 'td-info';
        const infoContainer = document.createElement('div');
        infoContainer.className = 'info-container';
        const { name, subtitle } = parseNameAndSubtitle(filler);
        const truncatedName = name.length > 13 ? name.substring(0, 12) + '..' : name;
        const nameEl = document.createElement('span');
        nameEl.className = 'filler-card-title name-el';
        nameEl.textContent = truncatedName;
        nameEl.title = name;
        infoContainer.appendChild(nameEl);
        if (subtitle) {
            const subEl = document.createElement('span');
            subEl.className = 'filler-card-subtitle sub-el';
            subEl.textContent = subtitle;
            infoContainer.appendChild(subEl);
        }
        tdInfo.appendChild(infoContainer);

        const tdStats = document.createElement('td');
        tdStats.className = 'td-stats';
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';

        if (isFinite(maxMin)) {
            const remainingMin = maxMin - roundedTotal;

            const topRow = document.createElement('div');
            topRow.className = 'top-row-stats';
            const usageSpan = document.createElement('span');
            usageSpan.className = `filler-stat-item usage-span${isExceeded ? ' exceeded' : ''}`;
            usageSpan.textContent = `Tijd: ${formatMin(roundedTotal)} / ${formatMin(maxMin)}`;
            topRow.appendChild(usageSpan);

            const bottomRow = document.createElement('div');
            bottomRow.className = 'bottom-row-stats';
            const pauseSpan = document.createElement('span');
            pauseSpan.className = 'filler-stat-item pause-span';
            let taskBreaks = 0;
            const fillerAssigned = state.fillerTasks[filler] || [];
            fillerAssigned.forEach(tId => {
                const [pName] = tId.replace('_helper', '').split('_');
                if (pName === 'Pauze') {
                    taskBreaks += getTaskDuration(tId);
                }
            });
            pauseSpan.textContent = `Pauze: ${formatMin(taskBreaks)} / ${formatMin(pauseMin)}`;

            const remainingSpan = document.createElement('span');
            remainingSpan.className = `filler-stat-item remaining remaining-span ${remainingMin >= 0 ? 'positive' : 'negative'}`;
            remainingSpan.textContent = remainingMin >= 0 ? `Over: ${formatMin(remainingMin)}` : `Te veel: ${formatMin(Math.abs(remainingMin))}`;

            bottomRow.appendChild(pauseSpan);
            bottomRow.appendChild(remainingSpan);

            statsContainer.appendChild(topRow);
            statsContainer.appendChild(bottomRow);
        }

        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-bar-container progress-bar-container-custom';
        const progressBarFill = document.createElement('div');
        progressBarFill.className = `progress-bar-fill${isExceeded ? ' exceeded' : ''}`;
        const percentage = isFinite(maxMin) && maxMin > 0 ? Math.min((roundedTotal / maxMin) * 100, 100) : 0;
        progressBarFill.style.width = `${percentage}%`;
        progressBarContainer.appendChild(progressBarFill);
        statsContainer.appendChild(progressBarContainer);
        tdStats.appendChild(statsContainer);

        const tdEnd = document.createElement('td');
        tdEnd.className = 'td-end';
        const endContainer = document.createElement('div');
        endContainer.className = 'end-container';

        const endInput = document.createElement('input');
        endInput.type = 'text';
        endInput.placeholder = '00:00';
        endInput.maxLength = 5;
        endInput.className = 'actual-end-input end-input-custom';
        endInput.style.textAlign = 'center';

        const plannedEndMin = getFillerEndTime(filler);
        const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '';
        const currentActual = state.actualEndTimes && state.actualEndTimes[filler] !== undefined ? state.actualEndTimes[filler] : plannedEndStr;
        endInput.value = currentActual;

        const prodContainer = document.createElement('div');

        const updateFillerProdDisplay = () => {
            prodContainer.innerHTML = '';
            const pVal = getFillerProductivity(filler);
            if (pVal !== null) {
                const statusClass = getProductivityStatusClass(pVal);
                const pSpan = document.createElement('span');
                pSpan.className = `filler-stat-item prod ${statusClass}`.trim();
                pSpan.textContent = `Prod: ${pVal}%`;
                prodContainer.appendChild(pSpan);
            }
        };
        updateFillerProdDisplay();

        const handleInput = (e) => {
            const val = formatTimeInputValue(e.target.value);
            if (e.target.value !== val) {
                endInput.value = val;
            }
            state.actualEndTimes[filler] = val;
            updateFillerProdDisplay();
            triggerSave();
        };

        endInput.addEventListener('input', handleInput);
        endInput.addEventListener('change', handleInput);
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
                if (!state.fillerTasks[filler]) state.fillerTasks[filler] = [];
                removeTaskFromAll(helperTaskId);

                const tasks = state.fillerTasks[filler];
                const closest = getClosestTask(tasksList, e.clientX, e.clientY);
                if (closest) {
                    const targetTaskId = closest.card.id.replace('task-', '');
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

            let isNewPauseTask = false;
            if (taskId.includes('_other') && !taskId.includes('_inst-')) {
                const uniqueId = `${taskId}_inst-${Date.now()}`;
                const [pathName] = taskId.split('_');
                if (pathName === 'Pauze') {
                    state.instanceTimes[uniqueId] = 0;
                    isNewPauseTask = true;
                } else {
                    state.instanceTimes[uniqueId] = state.otherTimes[pathName] || 30;
                }
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
            let extraOtherTaskId = null;
            
            if (!isAlreadyAssigned && taskId.endsWith('_fill') && state.autoPairSettings && state.autoPairSettings.enabled) {
                const pKey = taskId.replace('_fill', '');
                if (state.pathColli[pKey]) {
                    counterpartTaskId = `${pKey}_mirror`;
                }
            }

            if (!isAlreadyAssigned && taskId.endsWith('_fill') && state.autoPairSettings && state.autoPairSettings.prependOtherTask && state.autoPairSettings.selectedOtherTask) {
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
            if (isNewPauseTask) {
                openDurationModal(taskId);
            }
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
