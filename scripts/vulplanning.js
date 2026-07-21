import { loadHeader } from './header.js';

(() => {
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
        otherTimes: {
            "Restanten nalopen": 20,
            "Bulk nalopen": 30,
            "Acties terugvullen": 15,
            "Magazijn opruimen": 45,
            "Tellen": 30
        },
        instanceTimes: {}
    };

    const formatMin = (min) => {
        const hours = Math.floor(min / 60);
        const mins = Math.round(min % 60);
        return hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;
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
        return end > start ? (end - start) : Infinity;
    };

    const getFillerStartTime = (displayName) => {
        const match = displayName.match(/\b\d{2}:\d{2}\b/);
        if (!match) return 0;
        const parts = match[0].split(':').map(p => parseInt(p) || 0);
        return parts[0] * 60 + parts[1];
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

    const openHelperModal = (taskId) => {
        const modal = document.getElementById('helper-modal');
        const select = document.getElementById('helper-select');
        const durationInput = document.getElementById('helper-duration');
        const maxCheckbox = document.getElementById('helper-max-checkbox');
        const halfCheckbox = document.getElementById('helper-half-checkbox');
        const saveBtn = document.getElementById('modal-save-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        const errorMsg = document.getElementById('helper-error-msg');
        if (!modal || !select || !durationInput || !maxCheckbox || !halfCheckbox || !saveBtn || !cancelBtn || !errorMsg) return;

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

        const checkValidity = () => {
            const hasHelper = !!select.value;
            const hasDuration = parseInt(durationInput.value) > 0;
            saveBtn.disabled = hasHelper && !hasDuration;
            saveBtn.style.opacity = saveBtn.disabled ? '0.5' : '1';
            saveBtn.style.cursor = saveBtn.disabled ? 'not-allowed' : 'pointer';
        };

        const updateDynamicDuration = () => {
            const helperName = select.value;
            if (!helperName) {
                if (maxCheckbox.checked || halfCheckbox.checked) {
                    errorMsg.style.display = 'block';
                    maxCheckbox.checked = false;
                    halfCheckbox.checked = false;
                }
                checkValidity();
                return;
            }
            
            errorMsg.style.display = 'none';
            if (!maxCheckbox.checked && !halfCheckbox.checked) {
                checkValidity();
                return;
            }
            
            const duration = getTaskDuration(taskId.replace('_helper', ''));
            const assignee = getTaskAssignment(taskId);
            if (assignee) {
                const existingHelper = state.helpers[taskId];
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
            checkValidity();
        };

        maxCheckbox.onchange = () => {
            if (maxCheckbox.checked) halfCheckbox.checked = false;
            updateDynamicDuration();
        };

        halfCheckbox.onchange = () => {
            if (halfCheckbox.checked) maxCheckbox.checked = false;
            updateDynamicDuration();
        };

        select.onchange = () => {
            if (select.value) {
                errorMsg.style.display = 'none';
            }
            updateDynamicDuration();
        };

        durationInput.oninput = () => {
            maxCheckbox.checked = false;
            halfCheckbox.checked = false;
            
            const maxDuration = Math.round(getTaskDuration(taskId));
            const val = parseInt(durationInput.value) || 0;
            if (val > maxDuration) {
                durationInput.value = maxDuration;
            }
            checkValidity();
        };
        
        durationInput.disabled = false;
        
        if (maxCheckbox.checked || halfCheckbox.checked) {
            updateDynamicDuration();
        } else {
            checkValidity();
        }

        saveBtn.onclick = () => {
            const helperName = select.value;
            Object.keys(state.fillerTasks).forEach(filler => {
                state.fillerTasks[filler] = state.fillerTasks[filler].filter(id => id !== (taskId + '_helper'));
            });
            if (helperName) {
                const maxDuration = Math.round(getTaskDuration(taskId));
                const val = parseInt(durationInput.value) || 0;
                const clampedVal = Math.min(maxDuration, val);
                
                state.helpers[taskId] = {
                    helperName: helperName,
                    duration: clampedVal,
                    isMax: maxCheckbox.checked,
                    isHalf: halfCheckbox.checked
                };
                if (!state.fillerTasks[helperName]) {
                    state.fillerTasks[helperName] = [];
                }
                state.fillerTasks[helperName].push(taskId + '_helper');
            } else {
                delete state.helpers[taskId];
            }
            modal.style.display = 'none';
            renderWorkspace();
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        modal.style.display = 'flex';
    };

    const openDurationModal = (taskId) => {
        const modal = document.getElementById('duration-modal');
        const input = document.getElementById('task-duration-input');
        const saveBtn = document.getElementById('duration-save-btn');
        const cancelBtn = document.getElementById('duration-cancel-btn');
        if (!modal || !input || !saveBtn || !cancelBtn) return;

        const [pathName, type] = taskId.split('_');
        
        if (taskId.includes('_inst-')) {
            input.value = state.instanceTimes[taskId] !== undefined ? state.instanceTimes[taskId] : (state.otherTimes[pathName] || 30);
        } else {
            input.value = state.otherTimes[pathName] || 30;
        }

        saveBtn.onclick = () => {
            const val = parseInt(input.value) || 0;
            if (val > 0) {
                if (taskId.includes('_inst-')) {
                    state.instanceTimes[taskId] = val;
                } else {
                    state.otherTimes[pathName] = val;
                }
                modal.style.display = 'none';
                renderWorkspace();
            }
        };

        cancelBtn.onclick = () => {
            modal.style.display = 'none';
        };

        modal.style.display = 'flex';
    };

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

        state.selectedFillers.forEach(filler => {
            const totalMin = getFillerTotalTime(filler);
            const maxMin = getAvailableTime(filler);
            const roundedTotal = Math.round(totalMin);
            const isExceeded = roundedTotal > maxMin;

            const fillerCard = document.createElement('div');
            fillerCard.className = `filler-card${isExceeded ? ' exceeded' : ''}`;

            const header = document.createElement('div');
            header.className = 'filler-card-header';

            const title = document.createElement('span');
            title.className = 'filler-card-title';
            title.textContent = filler.split(' - ')[0];

            const timeSpan = document.createElement('span');
            timeSpan.className = `filler-card-time${isExceeded ? ' exceeded' : ''}`;
            const maxText = isFinite(maxMin) ? ` / ${formatMin(maxMin)}` : '';
            timeSpan.textContent = `${formatMin(roundedTotal)}${maxText}`;

            header.appendChild(title);
            header.appendChild(timeSpan);
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

    const extractTextLinesFromPage = async (page) => {
        const textContent = await page.getTextContent();
        if (!textContent || !textContent.items || textContent.items.length === 0) {
            return [];
        }

        const items = textContent.items
            .map(item => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5]
            }))
            .filter(item => item.text.trim() !== '');

        if (items.length === 0) return [];

        const tolerance = 5;
        const linesMap = [];
        for (let item of items) {
            let foundLine = linesMap.find(line => Math.abs(line.y - item.y) <= tolerance);
            if (!foundLine) {
                foundLine = { y: item.y, items: [] };
                linesMap.push(foundLine);
            }
            foundLine.items.push(item);
        }

        linesMap.sort((a, b) => b.y - a.y);

        return linesMap.map(line => {
            line.items.sort((a, b) => a.x - b.x);
            return {
                rawText: line.items.map(item => item.text).join(' '),
                items: line.items
            };
        });
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

    document.addEventListener('DOMContentLoaded', () => {
        loadHeader();
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }

        const input = document.getElementById('vulplanning-input');
        if (input) {
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const names = await parsePDFAndGetNames(file);
                    renderPeopleList(names);
                    const uploadGroup = input.closest('.upload-group');
                    if (uploadGroup) uploadGroup.style.display = 'none';
                } catch (err) {
                    console.error(err);
                }
            });
        }

        const nextBtn = document.getElementById('next-step-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                document.getElementById('step-1-container').style.display = 'none';
                document.getElementById('step-2-container').style.display = 'block';
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
                    state.pathColli = await parseColliPDF(file);
                    renderWorkspace();
                    const uploadGroup = colliInput.closest('.upload-group');
                    if (uploadGroup) uploadGroup.style.display = 'none';
                } catch (err) {
                    console.error(err);
                }
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
            } else if (!e.target.closest('.filler-card')) {
                e.preventDefault();
                renderWorkspace();
            }
        });
    });
})();
