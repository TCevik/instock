import {
    state,
    getFillerPause,
    getAvailableTime,
    getTaskDuration,
    getEffectiveTaskDuration,
    getFillerTotalTime,
    getFillerProductivity,
    getProductivityStatusClass,
    formatTimeInputValue,
    getTaskAssignment,
    removeTaskFromAll,
    getClosestTask,
    createPersonNameElement,
    getBaseTaskDuration,
    getHelperTaskIdsForMainTask
} from './state.js';
import {
    formatMin,
    formatTimeOfDay,
    getFillerStartTime,
    getFillerEndTime,
    parseNameAndSubtitle,
    getAutoTasksForFillTask
} from './planning-logic.js';
import { openDurationModal, openHelperModal } from './modals.js';
import { showConfirmModal } from '../modal.js';
import { triggerSave } from './storage.js';
import { HARDCODED_MIRROR_TIMES } from './plus/pdf-defaults.js';

let currentDraggedTaskId = null;
let currentDraggedIsFromAssigned = false;
let taskContextMenu = null;
let zoomListenersInitialized = false;

const setupZoomListeners = () => {
    if (zoomListenersInitialized) return;
    zoomListenersInitialized = true;

    document.addEventListener('click', (e) => {
        const outBtn = e.target.closest('.timeline-zoom-out');
        if (outBtn) {
            state.timelineZoom = Math.max(0.4, Math.round(((state.timelineZoom || 1.0) - 0.15) * 100) / 100);
            renderWorkspace();
            return;
        }
        const inBtn = e.target.closest('.timeline-zoom-in');
        if (inBtn) {
            state.timelineZoom = Math.min(3.0, Math.round(((state.timelineZoom || 1.0) + 0.15) * 100) / 100);
            renderWorkspace();
            return;
        }
        const resetBtn = e.target.closest('.timeline-zoom-reset');
        if (resetBtn) {
            state.timelineZoom = 1.0;
            renderWorkspace();
            return;
        }
    });

    document.addEventListener('wheel', (e) => {
        if (e.ctrlKey && e.target.closest('.fillers-table, .filler-tasks-list, .filler-tasks-cell')) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            state.timelineZoom = Math.min(3.0, Math.max(0.4, Math.round(((state.timelineZoom || 1.0) + delta) * 100) / 100));
            renderWorkspace();
        }
    }, { passive: false });
};

const getOrCreateTaskContextMenu = () => {
    if (!taskContextMenu) {
        taskContextMenu = document.createElement('div');
        taskContextMenu.className = 'context-menu';
        taskContextMenu.id = 'task-context-menu';
        document.body.appendChild(taskContextMenu);

        document.addEventListener('click', (e) => {
            if (!taskContextMenu.contains(e.target)) {
                taskContextMenu.style.display = 'none';
            }
        });
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.task-card')) {
                taskContextMenu.style.display = 'none';
            }
        });
    }
    return taskContextMenu;
};

const getDraggedTaskSequence = (draggedId) => {
    if (!draggedId) return [];
    const isAlreadyAssigned = getTaskAssignment(draggedId) !== null;
    if (isAlreadyAssigned || draggedId.includes('_helper')) return [draggedId];
    const { prepended, appended } = getAutoTasksForFillTask(draggedId, state.autoPairSettings, state.pathColli);
    const list = [];
    if (prepended) list.push(prepended);
    list.push(draggedId);
    if (appended) list.push(appended);
    return list;
};

export const createTaskCard = (taskId, startTime, endTime, maxMin, totalInTimePlanned, totalOvertimePlanned, fillerStartTime, scale) => {
    const isHelperTask = taskId.includes('_helper');
    const mainTaskId = isHelperTask ? taskId.split('_helper')[0] : taskId;
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
        currentDraggedTaskId = taskId;
        currentDraggedIsFromAssigned = card.closest('#assigned-tasks-grid') !== null;
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.setData('is-from-assigned', currentDraggedIsFromAssigned ? 'true' : 'false');
        card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
        currentDraggedTaskId = null;
        currentDraggedIsFromAssigned = false;
        card.classList.remove('dragging');
        document.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
    });

    const colliSuffix = (type === 'fill' && data && data.colli) ? ` (${data.colli} c)` : '';
    const titleRow = document.createElement('div');
    titleRow.className = 'task-card-title';
    titleRow.textContent = `${pathName}${colliSuffix}`;
    titleRow.style.position = 'relative';
    titleRow.style.zIndex = '2';
    card.appendChild(titleRow);

    const metaRow = document.createElement('div');
    metaRow.className = 'task-card-meta';

    const effectiveDuration = getEffectiveTaskDuration(taskId);
    let durationText = '';
    if (isHelperTask) {
        card.classList.add('helper');
        durationText = formatMin(effectiveDuration);
    } else if (startTime === undefined) {
        durationText = (isBreakTask && effectiveDuration === 0) ? '' : formatMin(effectiveDuration);
    } else {
        durationText = formatMin(effectiveDuration);
    }

    if (startTime !== undefined && endTime !== undefined) {
        const effectiveScale = scale !== undefined ? scale : (1.6 * (state.timelineZoom || 1.0));
        const cardWidth = Math.max(2, effectiveDuration * effectiveScale);

        card.style.width = `${cardWidth}px`;
        card.style.minWidth = `${cardWidth}px`;
        card.style.maxWidth = `${cardWidth}px`;
        card.style.flexShrink = '0';
        card.title = `${pathName}${colliSuffix} (${formatMin(effectiveDuration)})`;

        if (isFinite(maxMin) && maxMin > 0) {
            const baseStart = fillerStartTime !== undefined ? fillerStartTime : (endTime - effectiveDuration);
            const maxLimitTime = baseStart + maxMin;

            let overDur = 0;
            if (endTime > maxLimitTime) {
                overDur = Math.max(0, endTime - Math.max(startTime, maxLimitTime));
            }

            if (overDur > 0 && effectiveDuration > 0) {
                const overPortionPct = (overDur / effectiveDuration) * 100;
                const overlay = document.createElement('div');
                overlay.className = 'task-overtime-overlay';
                overlay.style.width = `${overPortionPct}%`;
                if (overPortionPct >= 99.9) {
                    overlay.style.borderLeft = 'none';
                }
                card.appendChild(overlay);
            }
        }
    }

    const leftMetaSpan = document.createElement('span');
    leftMetaSpan.textContent = durationText || '\u00A0';
    leftMetaSpan.style.position = 'relative';
    leftMetaSpan.style.zIndex = '2';
    metaRow.appendChild(leftMetaSpan);

    if (startTime !== undefined && endTime !== undefined) {
        const rightMetaSpan = document.createElement('span');
        rightMetaSpan.textContent = `${formatTimeOfDay(startTime)} - ${formatTimeOfDay(endTime)}`;
        rightMetaSpan.style.position = 'relative';
        rightMetaSpan.style.zIndex = '2';
        metaRow.appendChild(rightMetaSpan);
    }

    card.appendChild(metaRow);

    const typeLabel = type === 'fill' ? 'Vullen' : (type === 'mirror' ? 'Spiegelen' : (isBreakTask ? 'Pauze' : 'Overig'));
    let tooltip = `${pathName}${colliSuffix} (${typeLabel})\nDuur: ${durationText || '0m'}`;
    if (startTime !== undefined && endTime !== undefined) {
        tooltip += `\nTijd: ${formatTimeOfDay(startTime)} - ${formatTimeOfDay(endTime)}`;
    }
    card.title = tooltip;

    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const menu = getOrCreateTaskContextMenu();
        menu.innerHTML = '';

        const assignee = getTaskAssignment(taskId);

        if (type === 'other' || isBreakTask) {
            const editItem = document.createElement('div');
            editItem.className = 'context-menu-item';
            editItem.innerHTML = '<i class="material-icons">schedule</i><span>Duur aanpassen</span>';
            editItem.addEventListener('click', () => {
                menu.style.display = 'none';
                openDurationModal(taskId);
            });
            menu.appendChild(editItem);

            if (assignee) {
                const fillerTasks = state.fillerTasks[assignee] || [];
                const isLastTask = fillerTasks.length > 0 && fillerTasks[fillerTasks.length - 1] === taskId;
                const availableTime = getAvailableTime(assignee);
                const totalTime = Math.round(getFillerTotalTime(assignee));
                const remaining = isFinite(availableTime) ? availableTime - totalTime : 0;

                if (isLastTask && remaining > 0) {
                    const fillItem = document.createElement('div');
                    fillItem.className = 'context-menu-item';
                    fillItem.innerHTML = `<i class="material-icons">straighten</i><span>Uitvullen tot limiet (+${formatMin(remaining)})</span>`;
                    fillItem.addEventListener('click', () => {
                        const currentDur = getEffectiveTaskDuration(taskId);
                        const newDur = currentDur + remaining;
                        if (taskId.includes('_inst-')) {
                            state.instanceTimes[taskId] = newDur;
                        } else {
                            const uniqueId = `${taskId}_inst-${Date.now()}`;
                            const taskIndex = fillerTasks.indexOf(taskId);
                            if (taskIndex !== -1) {
                                fillerTasks[taskIndex] = uniqueId;
                            }
                            state.instanceTimes[uniqueId] = newDur;
                        }
                        menu.style.display = 'none';
                        renderWorkspace();
                        triggerSave();
                    });
                    menu.appendChild(fillItem);
                }
            }
        } else if (!isHelperTask) {
            const helperItem = document.createElement('div');
            helperItem.className = 'context-menu-item';
            helperItem.innerHTML = '<i class="material-icons">person_add</i><span>Helper toewijzen</span>';
            helperItem.addEventListener('click', () => {
                menu.style.display = 'none';
                openHelperModal(taskId);
            });
            menu.appendChild(helperItem);
        }

        if (assignee) {
            const removeItem = document.createElement('div');
            removeItem.className = 'context-menu-item';
            removeItem.innerHTML = '<i class="material-icons">delete_outline</i><span>Taak verwijderen</span>';
            removeItem.addEventListener('click', () => {
                menu.style.display = 'none';
                removeTaskFromAll(taskId);
                if (taskId.includes('_inst-')) {
                    delete state.instanceTimes[taskId];
                }
                renderWorkspace();
                triggerSave();
            });
            menu.appendChild(removeItem);
        }

        if (menu.children.length === 0) return;

        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';

        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${window.innerHeight - rect.height - 8}px`;
        }
    });

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
                const [pName] = (tId.includes('_helper') ? tId.split('_helper')[0] : tId).split('_');
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
        prodContainer.className = 'prod-container';

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

        const scale = 1.6 * (state.timelineZoom || 1.0);

        const timelineSep = document.createElement('div');
        timelineSep.className = 'timeline-separator';
        if (isFinite(maxMin) && maxMin > 0) {
            timelineSep.style.display = 'block';
            timelineSep.style.left = `${maxMin * scale + 4}px`;
        } else {
            timelineSep.style.display = 'none';
        }
        tasksList.appendChild(timelineSep);

        tasksList.addEventListener('scroll', (e) => {
            const scrollLeft = e.target.scrollLeft;
            const allLists = document.querySelectorAll('.filler-tasks-list');
            allLists.forEach(list => {
                if (list !== e.target && list.scrollLeft !== scrollLeft) {
                    list.scrollLeft = scrollLeft;
                }
            });
        });

        tr.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggedId = currentDraggedTaskId;
            if (!draggedId) return;

            let placeholders = [...tasksList.querySelectorAll('.task-card-placeholder')];
            if (placeholders.length === 0) {
                document.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
                const existingAssignee = getTaskAssignment(draggedId);
                const isCreatingHelper = currentDraggedIsFromAssigned && existingAssignee && existingAssignee !== filler && !draggedId.includes('_other');
                const seq = isCreatingHelper ? [draggedId] : getDraggedTaskSequence(draggedId);
                placeholders = seq.map(tId => {
                    const card = createTaskCard(tId);
                    if (!card) return null;
                    card.classList.add('task-card-placeholder');
                    card.removeAttribute('id');
                    card.draggable = false;
                    let effectiveDuration = getEffectiveTaskDuration(tId);
                    if (isCreatingHelper) {
                        card.classList.add('helper');
                        const mainTaskId = tId.split('_helper')[0];
                        const currentHelpers = getHelperTaskIdsForMainTask(mainTaskId);
                        const targetWorkers = 1 + currentHelpers.length + 1;
                        const baseDur = getBaseTaskDuration(mainTaskId);
                        effectiveDuration = Math.floor(baseDur / targetWorkers);
                        const leftSpan = card.querySelector('.task-card-meta span:first-child');
                        if (leftSpan) leftSpan.textContent = formatMin(effectiveDuration);
                    }
                    if (isFinite(maxMin) && maxMin > 0) {
                        const cardWidth = Math.max(2, effectiveDuration * scale);
                        card.style.width = `${cardWidth}px`;
                        card.style.minWidth = `${cardWidth}px`;
                        card.style.maxWidth = `${cardWidth}px`;
                        card.style.flexShrink = '0';
                    }
                    return card;
                }).filter(Boolean);
            }

            if (placeholders.length === 0) return;

            const closest = getClosestTask(tasksList, e.clientX, e.clientY);
            if (closest && closest.card) {
                tr.classList.remove('drag-over');
                if (closest.before) {
                    placeholders.forEach(p => tasksList.insertBefore(p, closest.card));
                } else {
                    let ref = closest.card;
                    placeholders.forEach(p => {
                        ref.after(p);
                        ref = p;
                    });
                }
            } else {
                placeholders.forEach(p => tasksList.appendChild(p));
            }
        });

        tr.addEventListener('dragleave', (e) => {
            if (!tr.contains(e.relatedTarget)) {
                tr.classList.remove('drag-over');
                tasksList.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
            }
        });

        tr.addEventListener('drop', (e) => {
            e.preventDefault();
            tr.classList.remove('drag-over');
            document.querySelectorAll('.task-card-placeholder').forEach(el => el.remove());
            let taskId = e.dataTransfer.getData('text/plain');
            if (!taskId || !document.getElementById(`task-${taskId}`)) return;
            const existingAssignee = getTaskAssignment(taskId);
            const isFromAssigned = e.dataTransfer.getData('is-from-assigned') === 'true';

            if (isFromAssigned && existingAssignee && existingAssignee !== filler && !taskId.includes('_other')) {
                const mainTaskId = taskId.split('_helper')[0];
                const helperTaskId = `${mainTaskId}_helper_inst-${Date.now()}`;
                if (!state.fillerTasks[filler]) state.fillerTasks[filler] = [];

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

            if (!state.fillerTasks[filler]) {
                state.fillerTasks[filler] = [];
            }

            const tasksToAdd = [];
            if (!isAlreadyAssigned) {
                const { prepended, appended } = getAutoTasksForFillTask(taskId, state.autoPairSettings, state.pathColli);
                if (prepended) {
                    const uniqueId = `${prepended}_inst-${Date.now()}`;
                    const [pName] = prepended.split('_');
                    state.instanceTimes[uniqueId] = state.otherTimes[pName] || 30;
                    tasksToAdd.push(uniqueId);
                }
                tasksToAdd.push(taskId);
                if (appended) {
                    removeTaskFromAll(appended);
                    tasksToAdd.push(appended);
                }
            } else {
                tasksToAdd.push(taskId);
            }

            const tasks = state.fillerTasks[filler];
            const closest = getClosestTask(tasksList, e.clientX, e.clientY);
            if (closest) {
                const targetTaskId = closest.card.id.replace('task-', '');
                const targetIndex = tasks.indexOf(targetTaskId);
                if (targetIndex !== -1) {
                    const insertIndex = closest.before ? targetIndex : targetIndex + 1;
                    tasks.splice(insertIndex, 0, ...tasksToAdd);
                } else {
                    tasks.push(...tasksToAdd);
                }
            } else {
                tasks.push(...tasksToAdd);
            }
            renderWorkspace();
            triggerSave();
            if (isNewPauseTask) {
                openDurationModal(taskId);
            }
        });

        const fillerStartMin = getFillerStartTime(filler);
        const maxLimitTime = fillerStartMin + maxMin;

        let totalInTimePlanned = 0;
        let totalOvertimePlanned = 0;
        let runningCalcTime = fillerStartMin;

        (state.fillerTasks[filler] || []).forEach(taskId => {
            const duration = getEffectiveTaskDuration(taskId);
            const taskStart = runningCalcTime;
            const taskEnd = runningCalcTime + duration;
            runningCalcTime = taskEnd;

            if (taskEnd <= maxLimitTime) {
                totalInTimePlanned += duration;
            } else if (taskStart >= maxLimitTime) {
                totalOvertimePlanned += duration;
            } else {
                totalInTimePlanned += Math.max(0, maxLimitTime - taskStart);
                totalOvertimePlanned += Math.max(0, taskEnd - maxLimitTime);
            }
        });

        let currentTime = fillerStartMin;
        (state.fillerTasks[filler] || []).forEach(taskId => {
            const duration = getEffectiveTaskDuration(taskId);
            const startTime = currentTime;
            const endTime = currentTime + duration;
            currentTime = endTime;

            const card = createTaskCard(taskId, startTime, endTime, maxMin, totalInTimePlanned, totalOvertimePlanned, fillerStartMin, scale);
            if (card) {
                tasksList.appendChild(card);
            } else if (duration > 0) {
                const spacer = document.createElement('div');
                const spacerWidth = Math.max(2, duration * scale);
                spacer.style.width = `${spacerWidth}px`;
                spacer.style.minWidth = `${spacerWidth}px`;
                spacer.style.maxWidth = `${spacerWidth}px`;
                spacer.style.flexShrink = '0';
                spacer.style.visibility = 'hidden';
                tasksList.appendChild(spacer);
            }
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

    setupZoomListeners();
    const zoomPercent = Math.round((state.timelineZoom || 1.0) * 100);
    document.querySelectorAll('.timeline-zoom-level-text').forEach(el => {
        el.textContent = `${zoomPercent}%`;
    });

    workspace.style.display = 'grid';
};
