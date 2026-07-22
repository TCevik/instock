import { loadHeader } from './header.js';
import { checkAuth, getSupabase, setupModal } from './main.js';
import { extractTextLinesFromPage } from './pdf-utils.js';

(() => {
    let storeId = null;
    let saveTimeout = null;
    const PATHS_MAPPING = {
        "Wijn, Chips, Nootjes": ["Wijnen", "Zoutjes Snacks"],
        "Frisdrank, Bier": ["Frisdrank", "Bieren", "Vruchtensappen"],
        "Ontbijt": ["Ontbijtvervangers", "Boterhambeleg"],
        "Koffie, Koek, Chocolade": ["Koffie Thee", "Koffiemelk", "Koekjes", "Chocolade", "Suikerwerk", "Suiker"],
        "Maaltijdstraat Conserven": ["Groenteconserven", "Vleesconserven", "Zuren sauzen", "Soepen", "Houdbare zuivel", "Gezondheidsvoeding"],
        "Maaltijdstraat Oosters": ["Rijst en deegwaren", "Maaltijdstraat LDC + Specerijen"],
        "Eieren, Afbakbrood": ["Eieren", "Meelproducten"],
        "Non Food": ["Papierwaren", "Kindervoeding", "Luiers", "Wasmiddelen", "Reinigingsmiddelen", "Sorbo", "Huishoudelijk", "Nonfood", "Persoonlijke verzorging", "dierenvoeding"],
        "Diepvries": ["Diepvries"],
        "Zuivel": ["Zuivel", "Geelvetten"],
        "Vlees": ["Vers vlees", "Vis"],
        "Vleeswaren, Kaas": ["Vleeswaren AV/AVA", "Vleeswaren ZB", "Kaas AV/AVA", "Kaas ZB"]
    };

    const MIRROR_TIMES = {
        "Wijn, Chips, Nootjes": 15,
        "Frisdrank, Bier": 21,
        "Ontbijt": 10,
        "Koffie, Koek, Chocolade": 21,
        "Maaltijdstraat Conserven": 21,
        "Maaltijdstraat Oosters": 21,
        "Eieren, Afbakbrood": 15,
        "Non Food": 21,
        "Diepvries": 21,
        "Zuivel": 21,
        "Vlees": 21,
        "Vleeswaren, Kaas": 21
    };

    const state = {
        selectedFillers: [],
        pathColli: {},
        fillerTasks: {},
        helpers: {},
        activeTab: 'fill',
        fillerSortOrder: 'name-asc',
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
        hiddenFillers: []
    };

    let activeTaskId = null;
    let activeDurationTaskId = null;

    const formatMin = (min) => {
        const hours = Math.floor(min / 60);
        const mins = Math.round(min % 60);
        return hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;
    };

    const getFillerPause = (displayName) => {
        if (state.fillerBreaks && state.fillerBreaks[displayName] !== undefined) {
            return state.fillerBreaks[displayName];
        }
        const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
        if (!match) return 0;
        const parts = match[0].split('-').map(p => p.trim());
        if (parts.length !== 2) return 0;
        const parseTime = (str) => {
            const hm = str.split(':');
            return (parseInt(hm[0]) || 0) * 60 + (parseInt(hm[1]) || 0);
        };
        const gross = parseTime(parts[1]) - parseTime(parts[0]);
        if (gross >= 480) return 60;
        if (gross >= 270) return 30;
        return 0;
    };

    const getAvailableTime = (displayName) => {
        const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
        if (!match) return Infinity;
        const parts = match[0].split('-').map(p => p.trim());
        if (parts.length !== 2) return Infinity;
        const parseTime = (str) => {
            const hm = str.split(':');
            const h = parseInt(hm[0]) || 0;
            const m = parseInt(hm[1]) || 0;
            return h * 60 + m;
        };
        const start = parseTime(parts[0]);
        const end = parseTime(parts[1]);
        const gross = end > start ? (end - start) : Infinity;
        if (!isFinite(gross)) return Infinity;
        const pause = getFillerPause(displayName);
        return Math.max(0, gross - pause);
    };

    const getFillerStartTime = (displayName) => {
        const match = displayName.match(/\b\d{2}:\d{2}\b/);
        if (!match) return 0;
        const parts = match[0].split(':').map(p => parseInt(p) || 0);
        return parts[0] * 60 + parts[1];
    };

    const getFillerEndTime = (displayName) => {
        const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
        if (!match) return Infinity;
        const parts = match[0].split('-').map(p => p.trim());
        if (parts.length !== 2) return Infinity;
        const parseTime = (str) => {
            const hm = str.split(':');
            const h = parseInt(hm[0]) || 0;
            const m = parseInt(hm[1]) || 0;
            return h * 60 + m;
        };
        return parseTime(parts[1]);
    };

    const getFillerActualEndTime = (displayName) => {
        if (state.actualEndTimes && state.actualEndTimes[displayName]) {
            const parts = state.actualEndTimes[displayName].split(':');
            if (parts.length === 2) {
                return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
            }
        }
        return getFillerEndTime(displayName);
    };

    const getFillerColli = (displayName) => {
        let total = 0;
        const tasks = state.fillerTasks[displayName] || [];
        tasks.forEach(taskId => {
            if (taskId.endsWith('_helper')) {
                const mainTaskId = taskId.replace('_helper', '');
                const [pathName, type] = mainTaskId.split('_');
                if (type === 'fill' && state.pathColli[pathName]) {
                    const colli = state.pathColli[pathName].colli || 0;
                    const duration = getTaskDuration(mainTaskId);
                    const helperInfo = state.helpers[mainTaskId];
                    if (helperInfo && duration > 0) {
                        const hDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                        total += (hDur / duration) * colli;
                    }
                }
            } else {
                const [pathName, type] = taskId.split('_');
                if (type === 'fill' && state.pathColli[pathName]) {
                    const colli = state.pathColli[pathName].colli || 0;
                    const duration = getTaskDuration(taskId);
                    const helperInfo = state.helpers[taskId];
                    if (helperInfo && helperInfo.helperName && duration > 0) {
                        const hDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                        total += ((duration - hDur) / duration) * colli;
                    } else {
                        total += colli;
                    }
                }
            }
        });
        return Math.round(total);
    };

    const getFillerProductivity = (displayName) => {
        const startMin = getFillerStartTime(displayName);
        const endMin = getFillerActualEndTime(displayName);
        if (!isFinite(endMin) || endMin <= startMin) return null;
        const pauseMin = getFillerPause(displayName);
        const workedNet = Math.max(1, (endMin - startMin) - pauseMin);
        const plannedTime = getFillerTotalTime(displayName);
        if (plannedTime <= 0) return null;
        return Math.round((plannedTime / workedNet) * 100);
    };

    const formatTimeOfDay = (totalMinutes) => {
        const hours = Math.floor(totalMinutes / 60) % 24;
        const mins = Math.floor(totalMinutes % 60);
        return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    const getTaskDuration = (taskId) => {
        if (taskId.endsWith('_helper')) {
            const mainTaskId = taskId.replace('_helper', '');
            const helperInfo = state.helpers[mainTaskId];
            if (!helperInfo) return 0;
            if (helperInfo.isMax || helperInfo.isHalf) {
                return helperInfo.calculatedDuration || 0;
            }
            const mainDuration = getTaskDuration(mainTaskId);
            return Math.min(mainDuration, helperInfo.duration || 0);
        }
        if (state.instanceTimes && state.instanceTimes[taskId] !== undefined) {
            return state.instanceTimes[taskId];
        }
        const [pathName, type] = taskId.split('_');
        if (type === 'other') {
            return state.otherTimes[pathName] || 0;
        }
        const data = state.pathColli[pathName];
        if (!data) return 0;
        if (type === 'fill') return data.duration;
        if (type === 'mirror') return MIRROR_TIMES[pathName] || 0;
        return 0;
    };

    const getFillerTotalTime = (filler) => {
        let total = 0;
        const tasks = state.fillerTasks[filler] || [];
        tasks.forEach(taskId => {
            if (taskId.endsWith('_helper')) {
                total += getTaskDuration(taskId);
            } else {
                const duration = getTaskDuration(taskId);
                const helperInfo = state.helpers[taskId];
                if (helperInfo && helperInfo.helperName) {
                    const helperDuration = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                    total += (duration - helperDuration);
                } else {
                    total += duration;
                }
            }
        });
        return total;
    };

    const getTaskAssignment = (taskId) => {
        for (const [filler, tasks] of Object.entries(state.fillerTasks)) {
            if (tasks.includes(taskId)) {
                return filler;
            }
        }
        return null;
    };

    const removeTaskFromAll = (taskId) => {
        Object.keys(state.fillerTasks).forEach(filler => {
            state.fillerTasks[filler] = state.fillerTasks[filler].filter(id => id !== taskId);
        });
    };

    const getClosestTask = (container, y) => {
        const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
        if (cards.length === 0) return null;
        let closest = null;
        let minDistance = Infinity;
        cards.forEach(card => {
            const box = card.getBoundingClientRect();
            const center = box.top + box.height / 2;
            const distance = Math.abs(y - center);
            if (distance < minDistance) {
                minDistance = distance;
                closest = {
                    card: card,
                    before: y < center
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
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        const title = document.createElement('span');
        title.className = 'task-card-title';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = pathName;
        title.appendChild(nameSpan);
        
        if (startTime !== undefined && endTime !== undefined) {
            const timeSpan = document.createElement('span');
            timeSpan.textContent = ` (${formatTimeOfDay(startTime)} - ${formatTimeOfDay(endTime)})`;
            timeSpan.style.fontSize = '11px';
            timeSpan.style.fontWeight = '500';
            timeSpan.style.color = 'var(--text-color-muted)';
            timeSpan.style.marginLeft = '4px';
            title.appendChild(timeSpan);
        }

        const meta = document.createElement('div');
        meta.className = 'task-card-meta';

        const typeSpan = document.createElement('span');
        typeSpan.className = `task-card-type ${type}`;
        if (type === 'fill') typeSpan.textContent = 'Vullen';
        else if (type === 'mirror') typeSpan.textContent = 'Spiegelen';
        else typeSpan.textContent = 'Overige';

        const durationSpan = document.createElement('span');
        const duration = getTaskDuration(taskId);
        
        if (isHelperTask) {
            const mainAssignee = getTaskAssignment(mainTaskId);
            const mainAssigneeName = mainAssignee ? mainAssignee.split(' - ')[0] : 'onbekend';
            durationSpan.textContent = `Helpt ${mainAssigneeName} • ${formatMin(duration)}`;
        } else {
            const colliText = type === 'fill' ? `${data.colli} colli • ` : '';
            const helperInfo = state.helpers[taskId];
            if (helperInfo && helperInfo.helperName) {
                const helperDuration = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                const remainingDuration = duration - helperDuration;
                durationSpan.textContent = `${colliText}${formatMin(remainingDuration)} (was ${formatMin(duration)})`;
            } else {
                durationSpan.textContent = `${colliText}${formatMin(duration)}`;
            }
        }

        meta.appendChild(typeSpan);
        meta.appendChild(durationSpan);
        card.appendChild(title);
        card.appendChild(meta);

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

                const helperInfo = state.helpers[taskId];
                if (helperInfo && helperInfo.helperName) {
                    const helperMeta = document.createElement('div');
                    helperMeta.style.fontSize = '11px';
                    helperMeta.style.color = 'var(--helper-color)';
                    helperMeta.style.marginTop = '4px';
                    helperMeta.style.fontWeight = '600';
                    const durText = helperInfo.isMax ? 'Max' : (helperInfo.isHalf ? '50/50' : `${helperInfo.duration}m`);
                    helperMeta.textContent = `Helper: ${helperInfo.helperName.split(' - ')[0]} (${durText})`;
                    card.appendChild(helperMeta);
                }
            }
        } else {
            const badge = document.createElement('span');
            badge.style.position = 'absolute';
            badge.style.top = '10px';
            badge.style.right = '12px';
            badge.style.fontSize = '11px';
            badge.style.fontWeight = '700';
            badge.style.color = 'var(--helper-color)';
            badge.textContent = 'HELPER';
            card.appendChild(badge);
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
                errorMsg.style.display = 'block';
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
                if (minHelperDur > maxHelperDur) {
                    optimal = Math.min(duration, maxHelperDur);
                } else {
                    optimal = Math.max(minHelperDur, Math.min(maxHelperDur, duration / 2));
                }
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
        state.selectedFillers.forEach(filler => {
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
            if (helperInfo.isMax || helperInfo.isHalf) {
                const duration = getTaskDuration(taskId);
                helperInfo.calculatedDuration = helperInfo.isHalf ? Math.floor(duration / 2) : Math.round(duration / 2);
            }
        });
        Object.entries(state.helpers).forEach(([taskId, helperInfo]) => {
            if (helperInfo.isMax || helperInfo.isHalf) {
                const duration = getTaskDuration(taskId);
                const helper = helperInfo.helperName;
                const assignee = getTaskAssignment(taskId);
                if (assignee) {
                    const limitA = getAvailableTime(assignee);
                    const limitH = getAvailableTime(helper);
                    const totalA = getFillerTotalTime(assignee) - (duration - helperInfo.calculatedDuration);
                    const totalH = getFillerTotalTime(helper) - helperInfo.calculatedDuration;
                    const minHelperDur = isFinite(limitA) ? Math.max(0, totalA + duration - limitA) : 0;
                    const maxHelperDur = isFinite(limitH) ? Math.max(0, limitH - totalH) : duration;
                    let optimal = duration / 2;
                    if (helperInfo.isMax) {
                        optimal = Math.min(duration, maxHelperDur);
                    } else if (helperInfo.isHalf) {
                        if (minHelperDur > maxHelperDur) {
                            optimal = Math.min(duration, maxHelperDur);
                        } else {
                            optimal = Math.max(minHelperDur, Math.min(maxHelperDur, duration / 2));
                        }
                    }
                    helperInfo.calculatedDuration = helperInfo.isHalf ? Math.floor(optimal) : Math.round(optimal);
                }
            }
        });
    };

    const renderWorkspace = () => {
        updateMaxHelperDurations();
        const workspace = document.getElementById('drag-drop-workspace');
        const fillersContainer = document.getElementById('fillers-container');
        const fillContainer = document.getElementById('unassigned-fill-tasks');
        const mirrorContainer = document.getElementById('unassigned-mirror-tasks');
        const otherContainer = document.getElementById('unassigned-other-tasks');
        if (!workspace || !fillersContainer || !fillContainer || !mirrorContainer || !otherContainer) return;

        const currentFillers = new Set(state.selectedFillers);
        Object.keys(state.fillerTasks).forEach(filler => {
            if (!currentFillers.has(filler)) {
                delete state.fillerTasks[filler];
            }
        });

        state.selectedFillers.forEach(filler => {
            if (!state.fillerTasks[filler]) {
                state.fillerTasks[filler] = [];
            }
        });

        const tabFill = document.getElementById('tab-fill');
        const tabMirror = document.getElementById('tab-mirror');
        const tabOther = document.getElementById('tab-other');
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

        fillersContainer.innerHTML = '';
        fillContainer.innerHTML = '';
        mirrorContainer.innerHTML = '';
        otherContainer.innerHTML = '';

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

        if (!state.hiddenFillers) state.hiddenFillers = [];
        const visibleFillers = state.selectedFillers.filter(f => !state.hiddenFillers.includes(f));

        const toggleHiddenBtn = document.getElementById('toggle-hidden-fillers-btn');
        const hiddenCountSpan = document.getElementById('hidden-fillers-count');
        const hiddenListContainer = document.getElementById('hidden-fillers-list');
        const hiddenPanel = document.getElementById('hidden-fillers-panel');

        if (toggleHiddenBtn && hiddenCountSpan && hiddenListContainer) {
            hiddenCountSpan.textContent = state.hiddenFillers.length;
            toggleHiddenBtn.style.display = state.hiddenFillers.length > 0 ? 'flex' : 'none';
            if (state.hiddenFillers.length === 0 && hiddenPanel) hiddenPanel.style.display = 'none';

            hiddenListContainer.innerHTML = '';
            state.hiddenFillers.forEach(filler => {
                const badge = document.createElement('button');
                badge.type = 'button';
                badge.style.cssText = 'padding: 4px 8px; font-size: 12px; background-color: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px;';
                badge.innerHTML = `<span>${filler}</span> <i class="material-icons" style="font-size: 14px; color: var(--accent-color-sidemenu);">visibility</i>`;
                badge.addEventListener('click', () => {
                    state.hiddenFillers = state.hiddenFillers.filter(f => f !== filler);
                    renderWorkspace();
                    triggerSave();
                });
                hiddenListContainer.appendChild(badge);
            });
        }

        const sortedFillers = [...visibleFillers].sort((a, b) => {
            if (state.fillerSortOrder === 'name-asc') {
                return a.localeCompare(b);
            } else if (state.fillerSortOrder === 'name-desc') {
                return b.localeCompare(a);
            } else if (state.fillerSortOrder === 'start-asc') {
                return getFillerStartTime(a) - getFillerStartTime(b);
            } else if (state.fillerSortOrder === 'start-desc') {
                return getFillerStartTime(b) - getFillerStartTime(a);
            } else if (state.fillerSortOrder === 'end-asc') {
                return getFillerEndTime(a) - getFillerEndTime(b);
            } else if (state.fillerSortOrder === 'end-desc') {
                return getFillerEndTime(b) - getFillerEndTime(a);
            }
            return 0;
        });

        sortedFillers.forEach(filler => {
            const totalMin = getFillerTotalTime(filler);
            const maxMin = getAvailableTime(filler);
            const pauseMin = getFillerPause(filler);
            const roundedTotal = Math.round(totalMin);
            const isExceeded = roundedTotal > maxMin;

            const fillerCard = document.createElement('div');
            fillerCard.className = `filler-card${isExceeded ? ' exceeded' : ''}`;

            const header = document.createElement('div');
            header.className = 'filler-card-header';

            const titleRow = document.createElement('div');
            titleRow.className = 'filler-card-title-row';

            const title = document.createElement('span');
            title.className = 'filler-card-title';
            title.textContent = filler;

            const hideBtn = document.createElement('button');
            hideBtn.type = 'button';
            hideBtn.title = 'Vuller verbergen';
            hideBtn.style.cssText = 'background: none; border: none; color: var(--text-color-muted); cursor: pointer; padding: 2px 4px; display: flex; align-items: center; border-radius: 4px; margin-right: 6px;';
            hideBtn.innerHTML = '<i class="material-icons" style="font-size: 18px;">visibility_off</i>';
            hideBtn.addEventListener('click', (e) => {
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
                    renderWorkspace();
                    triggerSave();
                };

                if (assignedTasks.length > 0) {
                    const cleanName = filler.split(/\s*-\s*\d{2}:\d{2}/)[0].trim();
                    showConfirmModal(
                        'Vuller Verbergen',
                        `Weet je zeker dat je ${cleanName} wilt verbergen? Alle toegewezen taken van deze vuller gaan terug naar de onverdeelde taken.`,
                        executeHide
                    );
                } else {
                    executeHide();
                }
            });

            const endWrapper = document.createElement('div');
            endWrapper.className = 'actual-end-wrapper';

            const endLabel = document.createElement('label');
            endLabel.className = 'actual-end-label';
            endLabel.textContent = 'Eindtijd:';

            const endInput = document.createElement('input');
            endInput.type = 'time';
            endInput.className = 'actual-end-input';

            const plannedEndMin = getFillerEndTime(filler);
            const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '';
            const currentActual = state.actualEndTimes && state.actualEndTimes[filler] !== undefined ? state.actualEndTimes[filler] : plannedEndStr;
            endInput.value = currentActual;

            const updateFillerProdDisplay = () => {
                const pVal = getFillerProductivity(filler);
                let pSpan = header.querySelector('.filler-stat-item.prod');
                if (pVal !== null) {
                    let sRow = header.querySelector('.filler-card-stats');
                    if (!sRow) {
                        sRow = document.createElement('div');
                        sRow.className = 'filler-card-stats';
                        header.appendChild(sRow);
                    }
                    if (!pSpan) {
                        pSpan = document.createElement('span');
                        pSpan.className = 'filler-stat-item prod';
                        sRow.appendChild(pSpan);
                    }
                    pSpan.textContent = `Productiviteit: ${pVal}%`;
                } else if (pSpan) {
                    pSpan.remove();
                }
            };

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

            endWrapper.appendChild(endLabel);
            endWrapper.appendChild(endInput);

            const titleContainer = document.createElement('div');
            titleContainer.style.cssText = 'display: flex; align-items: center;';
            titleContainer.appendChild(hideBtn);
            titleContainer.appendChild(title);

            titleRow.appendChild(titleContainer);
            titleRow.appendChild(endWrapper);
            header.appendChild(titleRow);

            let statsRow = null;
            const prodVal = getFillerProductivity(filler);

            if (isFinite(maxMin) || prodVal !== null) {
                statsRow = document.createElement('div');
                statsRow.className = 'filler-card-stats';

                if (isFinite(maxMin)) {
                    const remainingMin = maxMin - roundedTotal;

                    const usageSpan = document.createElement('span');
                    usageSpan.className = `filler-stat-item${isExceeded ? ' exceeded' : ''}`;
                    usageSpan.textContent = `Tijd: ${formatMin(roundedTotal)} / ${formatMin(maxMin)}`;

                    const pauseSpan = document.createElement('span');
                    pauseSpan.className = 'filler-stat-item';
                    pauseSpan.textContent = `Pauze: ${formatMin(pauseMin)}`;

                    const remainingSpan = document.createElement('span');
                    remainingSpan.className = `filler-stat-item remaining ${remainingMin >= 0 ? 'positive' : 'negative'}`;
                    remainingSpan.textContent = remainingMin >= 0 ? `Over: ${formatMin(remainingMin)}` : `Te veel: ${formatMin(Math.abs(remainingMin))}`;

                    statsRow.appendChild(usageSpan);
                    statsRow.appendChild(pauseSpan);
                    statsRow.appendChild(remainingSpan);
                }

                if (prodVal !== null) {
                    const prodSpan = document.createElement('span');
                    prodSpan.className = 'filler-stat-item prod';
                    prodSpan.textContent = `Prod: ${prodVal}%`;
                    statsRow.appendChild(prodSpan);
                }

                header.appendChild(statsRow);
            }

            fillerCard.appendChild(header);

            const progressBarContainer = document.createElement('div');
            progressBarContainer.className = 'progress-bar-container';
            const progressBarFill = document.createElement('div');
            progressBarFill.className = `progress-bar-fill${isExceeded ? ' exceeded' : ''}`;
            const percentage = isFinite(maxMin) && maxMin > 0 ? Math.min((roundedTotal / maxMin) * 100, 100) : 0;
            progressBarFill.style.width = `${percentage}%`;
            progressBarContainer.appendChild(progressBarFill);
            fillerCard.appendChild(progressBarContainer);

            const tasksList = document.createElement('div');
            tasksList.className = 'filler-tasks-list';

            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator-line';
            tasksList.appendChild(indicator);

            fillerCard.addEventListener('dragover', (e) => {
                e.preventDefault();
                const closest = getClosestTask(tasksList, e.clientY);
                if (closest) {
                    fillerCard.classList.remove('drag-over');
                    const targetCard = closest.card;
                    let targetTop = 0;
                    if (closest.before) {
                        targetTop = targetCard.offsetTop - 6;
                    } else {
                        targetTop = targetCard.offsetTop + targetCard.offsetHeight + 2;
                    }
                    indicator.style.top = `${targetTop}px`;
                    indicator.style.display = 'block';
                } else {
                    indicator.style.display = 'none';
                    if (tasksList.querySelectorAll('.task-card').length === 0) {
                        fillerCard.classList.add('drag-over');
                    }
                }
            });

            fillerCard.addEventListener('dragleave', (e) => {
                if (!fillerCard.contains(e.relatedTarget)) {
                    fillerCard.classList.remove('drag-over');
                    indicator.style.display = 'none';
                }
            });

            fillerCard.addEventListener('drop', (e) => {
                e.preventDefault();
                fillerCard.classList.remove('drag-over');
                indicator.style.display = 'none';
                let taskId = e.dataTransfer.getData('text/plain');
                if (taskId) {
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
                    const closest = getClosestTask(tasksList, e.clientY);
                    if (closest) {
                        const targetTaskId = closest.card.id.replace('task-', '');
                        const tasks = state.fillerTasks[filler];
                        const targetIndex = tasks.indexOf(targetTaskId);
                        if (targetIndex !== -1) {
                            const insertIndex = closest.before ? targetIndex : targetIndex + 1;
                            tasks.splice(insertIndex, 0, taskId);
                        }
                    } else {
                        state.fillerTasks[filler].push(taskId);
                    }
                    renderWorkspace();
                    triggerSave();
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

            fillerCard.appendChild(tasksList);
            fillersContainer.appendChild(fillerCard);
        });

        allTaskIds.forEach(taskId => {
            if (!getTaskAssignment(taskId)) {
                const card = createTaskCard(taskId);
                if (card) {
                    if (taskId.endsWith('_fill')) {
                        fillContainer.appendChild(card);
                    } else if (taskId.endsWith('_mirror')) {
                        mirrorContainer.appendChild(card);
                    } else {
                        otherContainer.appendChild(card);
                    }
                }
            }
        });





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

            const span = document.createElement('span');
            span.className = 'person-name';
            span.textContent = name;

            label.appendChild(checkbox);
            label.appendChild(span);
            list.appendChild(label);
        });

        card.style.display = names.length > 0 ? 'block' : 'none';
    };

    const showConfirmModal = (title, message, onConfirm) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const okBtn = document.getElementById('confirm-ok-btn');

        if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) return;

        titleEl.textContent = title;
        msgEl.textContent = message;
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
                hiddenFillers: state.hiddenFillers || []
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
            if (vp.hiddenFillers) state.hiddenFillers = vp.hiddenFillers;
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

        const manualFillersList = document.getElementById('manual-fillers-list');
        const manualPathsList = document.getElementById('manual-paths-list');
        const addFillerBtn = document.getElementById('add-manual-filler-btn');
        const addPathBtn = document.getElementById('add-manual-path-btn');
        const startManualBtn = document.getElementById('start-manual-planning-btn');

        if (manualFillersList && manualPathsList) {
            const addFillerRow = (name = '', startTime = '', endTime = '') => {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
                row.innerHTML = `
                    <input type="text" placeholder="Naam vuller" value="${name}" class="manual-filler-name" style="flex: 2; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    <input type="time" value="${startTime}" class="manual-filler-start" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    <input type="time" value="${endTime}" class="manual-filler-end" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                    <button type="button" class="remove-row-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 4px;"><i class="material-icons">delete</i></button>
                `;
                row.querySelector('.remove-row-btn').addEventListener('click', () => row.remove());
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
                const catContainer = addPathBlock();
                addCategoryRow(catContainer);
            }

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
                    const fillerRows = manualFillersList.querySelectorAll('div');
                    const newFillers = [];
                    fillerRows.forEach(r => {
                        const nameInput = r.querySelector('.manual-filler-name');
                        if (!nameInput) return;
                        const name = nameInput.value.trim();
                        const start = r.querySelector('.manual-filler-start').value;
                        const end = r.querySelector('.manual-filler-end').value;
                        if (name) {
                            newFillers.push(`${name} - ${start} - ${end}`);
                        }
                    });

                    const pathBlocks = manualPathsList.querySelectorAll('.manual-path-block');
                    const newPathColli = {};
                    pathBlocks.forEach(b => {
                        const pathName = b.querySelector('.manual-path-name').value.trim();
                        if (!pathName) return;

                        let totalColli = 0;
                        let totalDurationMinutes = 0;

                        const catRows = b.querySelectorAll('.manual-category-row');
                        catRows.forEach(cr => {
                            const colli = parseInt(cr.querySelector('.manual-cat-colli').value) || 0;
                            const norm = parseFloat(cr.querySelector('.manual-cat-norm').value) || 0;
                            totalColli += colli;
                            if (norm > 0 && colli > 0) {
                                totalDurationMinutes += (colli / norm) * 60;
                            }
                        });

                        newPathColli[pathName] = { colli: totalColli, duration: totalDurationMinutes };
                    });

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
                    triggerSave();
                });
            }
        }

        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }

        await loadData();

        const resetBtn = document.getElementById('reset-planning-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Opnieuw Beginnen',
                    'Weet je zeker dat je opnieuw wilt beginnen? De huidige planning wordt overschreven.',
                    () => {
                        document.getElementById('step-1-container').style.display = 'block';
                        document.getElementById('step-2-container').style.display = 'none';
                        resetBtn.style.display = 'none';
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

            const dateStr = new Date().toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            let cardsHtml = '';
            sortedFillers.forEach(filler => {
                const tasks = state.fillerTasks[filler] || [];
                const startMin = getFillerStartTime(filler);
                const startStr = isFinite(startMin) ? formatTimeOfDay(startMin) : '--:--';
                const pauseMin = getFillerPause(filler);
                const plannedEndMin = getFillerEndTime(filler);
                const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '--:--';
                const actualEndStr = (state.actualEndTimes && state.actualEndTimes[filler]) ? state.actualEndTimes[filler] : plannedEndStr;
                const prodVal = getFillerProductivity(filler);

                let currentTime = isFinite(startMin) ? startMin : 0;
                let tasksListHtml = '';

                if (tasks.length === 0) {
                    tasksListHtml = `<div class="empty-task">Geen taken toegewezen</div>`;
                } else {
                    tasks.forEach((taskId, index) => {
                        let duration = getTaskDuration(taskId);
                        if (!taskId.endsWith('_helper')) {
                            const helperInfo = state.helpers[taskId];
                            if (helperInfo && helperInfo.helperName) {
                                const helperDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                                duration -= helperDur;
                            }
                        }

                        const tStart = currentTime;
                        const tEnd = currentTime + duration;
                        currentTime = tEnd;

                        const startTimeStr = formatTimeOfDay(tStart);
                        const endTimeStr = formatTimeOfDay(tEnd);

                        let taskTitle = '';
                        let taskBadge = '';
                        let badgeClass = 'badge-fill';

                        if (taskId.endsWith('_helper')) {
                            const mainTaskId = taskId.replace('_helper', '');
                            const [pName, pType] = mainTaskId.split('_');
                            const mainAssignee = getTaskAssignment(mainTaskId) || 'Onbekend';
                            taskTitle = `${pName} (Hulp bij ${mainAssignee})`;
                            taskBadge = 'Hulp';
                            badgeClass = 'badge-helper';
                        } else {
                            const [pName, pType] = taskId.split('_');
                            taskTitle = pName;
                            if (pType === 'fill') {
                                taskBadge = 'Vullen';
                                badgeClass = 'badge-fill';
                            } else if (pType === 'mirror') {
                                taskBadge = 'Spiegelen';
                                badgeClass = 'badge-mirror';
                            } else {
                                taskBadge = 'Overig';
                                badgeClass = 'badge-other';
                            }
                        }

                        tasksListHtml += `
                            <div class="task-row">
                                <div class="task-time-col">
                                    <span class="task-time">${startTimeStr} - ${endTimeStr}</span>
                                    <span class="task-duration">${Math.round(duration)} min</span>
                                </div>
                                <div class="task-desc-col">
                                    <span class="task-name">${taskTitle}</span>
                                </div>
                                <span class="task-badge ${badgeClass}">${taskBadge}</span>
                            </div>
                        `;
                    });
                }

                cardsHtml += `
                    <div class="printable-card">
                        <div class="card-header">
                            <div class="filler-info">
                                <h2 class="filler-name">${filler}</h2>
                                <div class="time-meta">
                                    <span>Start: <strong>${startStr}</strong></span>
                                    <span>Pauze: <strong>${pauseMin} min</strong></span>
                                    <span>Eindtijd: <strong>${plannedEndStr}</strong></span>
                                </div>
                            </div>
                        </div>
                        <div class="card-body">
                            ${tasksListHtml}
                        </div>
                    </div>
                `;
            });

            const htmlContent = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Vulplanning ${dateStr}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 10mm;
            @bottom-right {
                content: "Gemaakt in inStock";
                font-size: 10pt;
                font-family: 'Segoe UI', sans-serif;
                color: #64748b;
            }
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        body {
            background-color: #f8fafc;
            color: #0f172a;
            padding: 15px;
            position: relative;
            min-height: 100vh;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #658d24;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .header h1 {
            font-size: 22px;
            color: #1e293b;
        }
        .header .date {
            font-size: 13px;
            color: #64748b;
            font-weight: 500;
        }
        .no-print-bar {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .print-btn {
            background-color: #658d24;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }
        .grid-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 30px;
        }
        .print-footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            text-align: right;
            font-size: 12px;
            color: #64748b;
            font-weight: 500;
        }
        @media print {
            .no-print-bar {
                display: none !important;
            }
            body {
                background: white;
                padding: 0;
            }
            .printable-card {
                break-inside: avoid;
            }
            .print-footer {
                position: fixed;
                bottom: 0;
                right: 0;
                left: 0;
                background: white;
            }
        }
        .printable-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
        }
        .card-header {
            background: #f1f5f9;
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .filler-name {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
        }
        .time-meta {
            font-size: 11px;
            color: #475569;
            display: flex;
            gap: 8px;
            margin-top: 2px;
        }
        .prod-badge {
            background: #dcfce7;
            color: #166534;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #bbf7d0;
        }
        .card-body {
            padding: 8px 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex-grow: 1;
        }
        .empty-task {
            font-size: 12px;
            color: #94a3b8;
            font-style: italic;
            padding: 10px 0;
            text-align: center;
        }
        .task-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px;
            border-radius: 6px;
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            font-size: 12px;
        }
        .task-row.first-task {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
        }
        .task-time-col {
            display: flex;
            flex-direction: column;
            min-width: 90px;
        }
        .task-time {
            font-weight: 700;
            color: #1e293b;
            font-size: 11px;
        }
        .task-duration {
            font-size: 10px;
            color: #64748b;
        }
        .task-desc-col {
            flex-grow: 1;
            padding: 0 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .task-name {
            font-weight: 600;
            color: #334155;
        }
        .first-tag {
            background: #22c55e;
            color: white;
            font-size: 9px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .task-badge {
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
        }
        .badge-fill {
            background: #e0f2fe;
            color: #0369a1;
        }
        .badge-mirror {
            background: #fef3c7;
            color: #b45309;
        }
        .badge-other {
            background: #f3e8ff;
            color: #6b21a8;
        }
        .badge-helper {
            background: #fce7f3;
            color: #be185d;
        }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <button class="print-btn" onclick="window.print()">Afdrukken / Opslaan als PDF</button>
    </div>
    <div class="header">
        <h1>Vulplanning Overzicht</h1>
        <div class="date">${dateStr}</div>
    </div>
    <div class="grid-container">
        ${cardsHtml}
    </div>
</body>
</html>`;

            printWin.document.open();
            printWin.document.write(htmlContent);
            printWin.document.close();
        };

        const generateBtn = document.getElementById('generate-planning-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', generatePrintablePlanning);
        }

        const toggleHiddenBtn = document.getElementById('toggle-hidden-fillers-btn');
        const hiddenPanel = document.getElementById('hidden-fillers-panel');
        if (toggleHiddenBtn && hiddenPanel) {
            toggleHiddenBtn.addEventListener('click', () => {
                const current = hiddenPanel.style.display;
                hiddenPanel.style.display = current === 'none' ? 'block' : 'none';
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
            if (!taskId || taskId.trim() === '') return;

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
