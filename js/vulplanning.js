import { supabase, getCurrentUser, showToast, showModal, closeModal, showConfirmModal } from './main.js';
import { openUnifiedImportModal } from './vulplanning/import-unified.js';
import { fillRoosterShifts, getAvailableUsers, getFillersData } from './vulplanning/rooster.js';
import { handleImportedColli, getColliData, getLoadedPaths, loadStorePathsForColli, fillColliValues } from './vulplanning/colli-invoer.js';

let planningState = {
    fillers: [],
    unassignedTasks: [],
    assignedTasks: {},
    zoom: 1,
    activeTab: 'vullen',
    timelineStartHour: 0,
    timelineEndHour: 24
};

const stepInputView = document.getElementById('step-input-view');
const stepTimelineView = document.getElementById('step-timeline-view');
const btnUnifiedImport = document.getElementById('btn-unified-import');
const btnContinue = document.getElementById('btn-continue');
const btnBackToInput = document.getElementById('btn-back-to-input');
const btnAddCustomTask = document.getElementById('btn-add-custom-task');
const timelineWorkersList = document.getElementById('timeline-workers-list');
const timelineTracksContainer = document.getElementById('timeline-tracks-container');
const timelineSchedulePane = document.getElementById('timeline-schedule-pane');
const timelineHoursAxis = document.getElementById('timeline-hours-axis');
const unassignedTasksList = document.getElementById('unassigned-tasks-list');
const unassignedTasksSidebar = document.querySelector('.unassigned-tasks-sidebar');
const zoomLevelIndicator = document.getElementById('zoom-level-indicator');

let tooltipElement = null;
let draggedTaskData = null;

function getDraggedTask() {
    if (!draggedTaskData) return null;
    if (draggedTaskData.source === 'unassigned') {
        return planningState.unassignedTasks.find(t => t.id === draggedTaskData.taskId) || null;
    }
    if (draggedTaskData.source === 'assigned') {
        const list = planningState.assignedTasks[draggedTaskData.fillerId] || [];
        return list[draggedTaskData.taskIndex] || null;
    }
    return null;
}

function getOrCreateTooltip() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'custom-planning-tooltip';
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

function showCustomTooltip(e, data) {
    const tip = getOrCreateTooltip();
    const type = data.type || 'vullen';
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    let colliHtml = '';
    if (data.colli > 0) {
        colliHtml = `<span class="tooltip-detail-item"><span class="tooltip-colli-val">${data.colli}</span> colli</span>`;
    }

    let timeHtml = '';
    if (data.startStr && data.endStr) {
        timeHtml = `<span class="tooltip-detail-item"><strong>${data.startStr} - ${data.endStr}</strong></span>`;
    }

    tip.innerHTML = `
        <span class="tooltip-badge-pill type-${type}">${typeLabel}</span>
        <span class="tooltip-title">${data.title}</span>
        ${colliHtml}
        <span class="tooltip-detail-item">${formatDuration(data.duration)}</span>
        ${timeHtml}
    `;

    positionCustomTooltip(e);
    tip.classList.add('visible');
}

function positionCustomTooltip(e) {
    if (!tooltipElement) return;
    const x = e.clientX + 12;
    const y = e.clientY + 12;
    const tipRect = tooltipElement.getBoundingClientRect();

    let left = x;
    let top = y;

    if (left + tipRect.width > window.innerWidth - 10) {
        left = e.clientX - tipRect.width - 12;
    }
    if (top + tipRect.height > window.innerHeight - 10) {
        top = e.clientY - tipRect.height - 12;
    }

    tooltipElement.style.left = `${Math.max(10, left)}px`;
    tooltipElement.style.top = `${Math.max(10, top)}px`;
}

function hideCustomTooltip() {
    if (tooltipElement) {
        tooltipElement.classList.remove('visible');
    }
}

let contextMenuElement = null;

function getOrCreateContextMenu() {
    if (!contextMenuElement) {
        contextMenuElement = document.createElement('div');
        contextMenuElement.className = 'custom-context-menu';
        document.body.appendChild(contextMenuElement);

        document.addEventListener('click', () => {
            hideContextMenu();
        });
        window.addEventListener('blur', () => {
            hideContextMenu();
        });
        window.addEventListener('resize', () => {
            hideContextMenu();
        });
    }
    return contextMenuElement;
}

function hideContextMenu() {
    if (contextMenuElement) {
        contextMenuElement.classList.remove('active');
    }
}

function showContextMenu(e, task, isAssigned = false, fillerId = null, taskIndex = null) {
    e.preventDefault();
    hideCustomTooltip();
    const menu = getOrCreateContextMenu();

    let expandButtonHtml = '';
    let remainingMins = 0;

    if (isAssigned && fillerId && taskIndex !== null) {
        const assignedList = planningState.assignedTasks[fillerId] || [];
        if (taskIndex === assignedList.length - 1) {
            const filler = planningState.fillers.find(f => f.id === fillerId);
            if (filler) {
                const shiftStart = timeToMinutes(filler.from);
                let shiftEnd = timeToMinutes(filler.to);
                if (shiftEnd > 0 && shiftEnd <= shiftStart) {
                    shiftEnd += 24 * 60;
                }
                const pauseMins = parsePauseMinutes(filler.pause);
                const shiftNetDuration = Math.max(0, (shiftEnd - shiftStart) - pauseMins);
                
                let totalAssigned = 0;
                assignedList.forEach(t => {
                    if (t.type !== 'pauze') totalAssigned += t.duration;
                });
                
                remainingMins = shiftNetDuration - totalAssigned;
                if (remainingMins > 0) {
                    expandButtonHtml = `
                        <button type="button" class="context-menu-item expand" id="ctx-expand-task">
                            <span class="material-icons">straighten</span>
                            <span>Uitvullen tot limiet (+${formatDuration(remainingMins)})</span>
                        </button>
                    `;
                }
            }
        }
    }

    if (task.type === 'overige') {
        menu.innerHTML = `
            ${expandButtonHtml}
            <button type="button" class="context-menu-item" id="ctx-edit-task">
                <span class="material-icons">edit</span>
                <span>Bewerken</span>
            </button>
            <button type="button" class="context-menu-item danger" id="ctx-delete-task">
                <span class="material-icons">delete</span>
                <span>Verwijderen</span>
            </button>
        `;
    } else {
        if (!isAssigned) return;
        menu.innerHTML = `
            ${expandButtonHtml}
            <button type="button" class="context-menu-item" id="ctx-edit-task">
                <span class="material-icons">edit</span>
                <span>Bewerken</span>
            </button>
            <button type="button" class="context-menu-item danger" id="ctx-delete-task">
                <span class="material-icons">delete</span>
                <span>Verwijderen</span>
            </button>
        `;
    }

    const expandBtn = menu.querySelector('#ctx-expand-task');
    if (expandBtn) {
        expandBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            if (remainingMins > 0) {
                task.duration += remainingMins;
                renderTimelineRows();
                triggerAutoSave();
            }
        });
    }

    const editBtn = menu.querySelector('#ctx-edit-task');
    if (editBtn) {
        editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            openEditCustomTaskModal(task, isAssigned, fillerId, taskIndex);
        });
    }

    const deleteBtn = menu.querySelector('#ctx-delete-task');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            if (task.type === 'overige') {
                deleteCustomTask(task, isAssigned, fillerId, taskIndex);
            } else if (fillerId && taskIndex !== null) {
                unassignTask(fillerId, taskIndex);
            }
        });
    }

    const x = e.clientX;
    const y = e.clientY;
    menu.style.left = `${Math.min(window.innerWidth - 220, Math.max(10, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 130, Math.max(10, y))}px`;
    menu.classList.add('active');
}

async function openEditCustomTaskModal(task, isAssigned, fillerId, taskIndex) {
    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Taak Bewerken</h2>
            <p class="modal-subtitle">Pas de taakomschrijving of tijdsduur aan voor deze planning.</p>
        </div>
        <form id="editCustomTaskForm" class="modal-form">
            <div class="form-group">
                <label>Taakomschrijving *</label>
                <input type="text" id="editCustomTaskTitle" class="modal-input" value="${task.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Tijdsduur (minuten) *</label>
                <input type="number" min="1" id="editCustomTaskDuration" class="modal-input" value="${task.duration || 30}" required>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btnCancelEditCustomTask">Annuleren</button>
                <button type="submit" class="btn">Opslaan</button>
            </div>
        </form>
    `;

    const overlay = await showModal(modalContent);
    const form = overlay.querySelector('#editCustomTaskForm');
    const cancelBtn = overlay.querySelector('#btnCancelEditCustomTask');

    cancelBtn.addEventListener('click', () => closeModal(overlay));

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const newTitle = overlay.querySelector('#editCustomTaskTitle').value.trim();
        const newDuration = parseInt(overlay.querySelector('#editCustomTaskDuration').value, 10) || 0;

        if (newTitle && newDuration > 0) {
            task.title = newTitle;
            task.duration = newDuration;

            if (!isAssigned) {
                const templateId = task.id;
                task.templateId = templateId;
            }

            closeModal(overlay);
            renderTimelineRows();
            renderUnassignedTasks();
            triggerAutoSave();
            showToast('notification', 'Taak succesvol bijgewerkt');
        }
    });
}

async function deleteCustomTask(task, isAssigned, fillerId, taskIndex) {
    const confirmed = await showConfirmModal({
        title: 'Overige taak verwijderen',
        message: `Weet je zeker dat je "${task.title}" wilt verwijderen?`,
        confirmText: 'Verwijderen',
        cancelText: 'Annuleren',
        isDanger: true
    });

    if (!confirmed) return;

    if (isAssigned && fillerId && taskIndex !== null) {
        planningState.assignedTasks[fillerId].splice(taskIndex, 1);
    } else {
        planningState.unassignedTasks = planningState.unassignedTasks.filter(t => t.id !== task.id);
        Object.keys(planningState.assignedTasks).forEach(fid => {
            planningState.assignedTasks[fid] = planningState.assignedTasks[fid].filter(t => t.id !== task.id && t.templateId !== task.id);
        });
    }

    renderTimelineRows();
    renderUnassignedTasks();
    triggerAutoSave();
    showToast('notification', 'Taak verwijderd');
}


function timeToMinutes(str) {
    if (!str || typeof str !== 'string') return 0;
    const clean = str.replace(/[^0-9:]/g, '');
    const parts = clean.split(':');
    if (parts.length < 2) {
        const num = parseInt(parts[0], 10);
        return isNaN(num) ? 0 : num * 60;
    }
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

function minutesToTime(mins) {
    if (isNaN(mins) || mins < 0) mins = 0;
    mins = Math.round(mins);
    const totalHours = Math.floor(mins / 60);
    const m = mins % 60;
    const days = Math.floor(totalHours / 24);
    const h = totalHours % 24;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (days > 0) {
        return `${timeStr} (+${days}D)`;
    }
    return timeStr;
}

function formatDuration(minutes) {
    if (isNaN(minutes) || minutes <= 0) return '0m';
    const mins = Math.round(minutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}u ${m}m`;
    if (h > 0) return `${h}u`;
    return `${m}m`;
}

function parsePauseMinutes(pauseStr) {
    if (!pauseStr) return 0;
    const digits = String(pauseStr).replace(/[^0-9]/g, '');
    return parseInt(digits, 10) || 0;
}

function generateTasksFromPathsAndColli() {
    const rawColliData = getColliData();
    const paths = getLoadedPaths();
    const tasks = [];
    let idCounter = 1;

    const pathMap = new Map();
    paths.forEach(p => {
        const name = (p.name || '').trim();
        if (name) pathMap.set(name.toLowerCase(), p);
    });

    const groupedByPath = new Map();
    rawColliData.forEach(item => {
        const pName = (item.path || '').trim();
        if (!groupedByPath.has(pName)) {
            groupedByPath.set(pName, []);
        }
        groupedByPath.get(pName).push(item);
    });

    groupedByPath.forEach((items, pathName) => {
        let totalColli = 0;
        let totalMinutes = 0;
        const matchedPath = pathMap.get(pathName.toLowerCase()) || null;

        items.forEach(it => {
            const c = Number(it.colli) || 0;
            const norm = Number(it.norm) || 50;
            totalColli += c;
            if (c > 0 && norm > 0) {
                totalMinutes += (c / norm) * 60;
            }
        });

        tasks.push({
            id: `task_fill_${idCounter++}`,
            type: 'vullen',
            title: totalColli > 0 ? `${pathName} (${totalColli} c)` : pathName,
            pathName: pathName,
            colli: totalColli,
            duration: Math.max(1, Math.round(totalMinutes)),
            categoryDetails: items,
            origOrder: tasks.length
        });

        const spiegelNorm = matchedPath && matchedPath.spiegelnorm !== undefined && matchedPath.spiegelnorm !== null ? Number(matchedPath.spiegelnorm) : 0;
        tasks.push({
            id: `task_spiegel_${idCounter++}`,
            type: 'spiegelen',
            title: `Spiegelen ${pathName}`,
            pathName: pathName,
            colli: 0,
            duration: Math.max(0, spiegelNorm),
            origOrder: tasks.length
        });

        const restantenNorm = matchedPath && matchedPath.restantennorm !== undefined && matchedPath.restantennorm !== null ? Number(matchedPath.restantennorm) : 0;
        tasks.push({
            id: `task_restant_${idCounter++}`,
            type: 'restanten',
            title: `Restanten ${pathName}`,
            pathName: pathName,
            colli: 0,
            duration: Math.max(0, restantenNorm),
            origOrder: tasks.length
        });
    });

    return tasks;
}

function calculateTimelineBounds(fillers) {
    planningState.timelineStartHour = 0;
    let maxMinutes = 24 * 60;

    (fillers || planningState.fillers || []).forEach(filler => {
        const shiftStart = timeToMinutes(filler.from);
        let shiftEnd = timeToMinutes(filler.to);
        if (shiftEnd > 0 && shiftEnd <= shiftStart) {
            shiftEnd += 24 * 60;
        }
        if (shiftEnd > maxMinutes) maxMinutes = shiftEnd;

        const assigned = (planningState.assignedTasks && planningState.assignedTasks[filler.id]) || [];
        let cur = shiftStart >= 0 ? shiftStart : 0;
        assigned.forEach(t => {
            cur += t.duration || 0;
        });
        if (cur > maxMinutes) maxMinutes = cur;
    });

    const neededHours = Math.ceil(maxMinutes / 60) + 1;
    planningState.timelineEndHour = Math.max(24, neededHours);
}

function getPixelsPerMinute() {
    return 2.0 * planningState.zoom;
}

function getTimelineTotalMinutes() {
    return (planningState.timelineEndHour - planningState.timelineStartHour) * 60;
}

function renderTimelineAxis() {
    if (!timelineHoursAxis) return;
    timelineHoursAxis.innerHTML = '';

    const startH = planningState.timelineStartHour;
    const endH = planningState.timelineEndHour;
    const pxPerMin = getPixelsPerMinute();
    const totalMins = getTimelineTotalMinutes();

    timelineHoursAxis.style.width = `${totalMins * pxPerMin}px`;

    for (let h = startH; h <= endH; h++) {
        const offsetMins = (h - startH) * 60;
        const leftPx = offsetMins * pxPerMin;

        const marker = document.createElement('div');
        marker.className = 'timeline-hour-marker';
        marker.style.width = `${60 * pxPerMin}px`;
        if (h === startH) {
            marker.classList.add('marker-start');
        } else if (h === endH) {
            marker.classList.add('marker-end');
        }
        marker.style.left = `${leftPx}px`;

        const dayCount = Math.floor(h / 24);
        const dayH = h % 24;
        let label = `${String(dayH).padStart(2, '0')}:00`;
        if (dayCount > 0) {
            label = `${String(dayH).padStart(2, '0')}:00 +${dayCount}D`;
        }
        marker.textContent = label;
        timelineHoursAxis.appendChild(marker);
    }
}

function renderTimelineRows() {
    if (!timelineWorkersList || !timelineTracksContainer) return;
    
    calculateTimelineBounds(planningState.fillers);
    renderTimelineAxis();

    timelineWorkersList.innerHTML = '';
    timelineTracksContainer.innerHTML = '';

    const pxPerMin = getPixelsPerMinute();
    const totalMins = getTimelineTotalMinutes();
    const startMins = planningState.timelineStartHour * 60;

    planningState.fillers.forEach(filler => {
        const shiftStart = timeToMinutes(filler.from);
        let shiftEnd = timeToMinutes(filler.to);
        if (shiftEnd > 0 && shiftEnd <= shiftStart) {
            shiftEnd += 24 * 60;
        }
        const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);
        const pauseMins = parsePauseMinutes(filler.pause);
        const shiftNetDuration = Math.max(0, shiftGrossDuration - pauseMins);

        const assigned = planningState.assignedTasks[filler.id] || [];
        let totalAssignedMins = 0;
        assigned.forEach(t => {
            if (t.type !== 'pauze') totalAssignedMins += t.duration;
        });

        const prodPercent = shiftNetDuration > 0 ? Math.round((totalAssignedMins / shiftNetDuration) * 100) : 0;
        const diffMins = totalAssignedMins - shiftNetDuration;
        let statusClass = 'status-fit';
        let statusText = 'Passend';
        if (diffMins > 0) {
            statusClass = 'status-over';
            statusText = `Te veel: ${formatDuration(diffMins)}`;
        } else if (diffMins < 0) {
            statusClass = 'status-rem';
            statusText = `Over: ${formatDuration(Math.abs(diffMins))}`;
        }

        let prodClass = 'danger';
        if (prodPercent > 100) {
            prodClass = 'success';
        } else if (prodPercent >= 80) {
            prodClass = 'yellow';
        } else if (prodPercent >= 60) {
            prodClass = 'orange';
        } else {
            prodClass = 'danger';
        }

        const workerCard = document.createElement('div');
        workerCard.className = `timeline-worker-info ${diffMins > 0 ? 'worker-has-overflow' : ''}`;
        workerCard.setAttribute('data-filler-id', filler.id);
        workerCard.innerHTML = `
            <div class="timeline-worker-left">
                <div class="timeline-worker-name-row">
                    <span class="timeline-worker-name" title="${filler.name || 'Naamloos'}">${filler.name || 'Naamloos'}</span>
                </div>
                <div class="timeline-worker-subrow">
                    <span class="timeline-worker-hours">${filler.from || '00:00'} - ${filler.to || '00:00'}</span>
                </div>
            </div>
            <div class="timeline-worker-center">
                <div class="timeline-worker-statbox ${statusClass}">
                    <div class="statbox-row">
                        <span class="statbox-label">Tijd:</span>
                        <span class="statbox-value">${formatDuration(totalAssignedMins)} / ${formatDuration(shiftNetDuration)}</span>
                    </div>
                    <div class="statbox-row">
                        <span class="statbox-label">Pauze: ${filler.pause || '0m'}</span>
                        <span class="statbox-status">${statusText}</span>
                    </div>
                </div>
            </div>
            <div class="timeline-worker-right">
                <input type="text" class="input-field timeline-worker-input" placeholder="" maxlength="5" />
                <span class="timeline-worker-prod ${prodClass}">Prod: ${prodPercent}%</span>
            </div>
        `;

        const timeInput = workerCard.querySelector('.timeline-worker-input');
        if (timeInput) {
            timeInput.addEventListener('input', () => {
                let digits = timeInput.value.replace(/\D/g, '');
                if (digits.length > 4) digits = digits.substring(0, 4);

                let formatted = '';
                if (digits.length > 0) {
                    let h1 = parseInt(digits[0], 10);
                    if (h1 > 2) {
                        digits = '0' + digits;
                    }
                }

                if (digits.length >= 2) {
                    let hh = parseInt(digits.substring(0, 2), 10);
                    if (hh > 23) hh = 23;
                    formatted = String(hh).padStart(2, '0');

                    if (digits.length >= 3) {
                        let mmStr = digits.substring(2);
                        if (mmStr.length >= 1 && parseInt(mmStr[0], 10) > 5) {
                            mmStr = '5' + (mmStr[1] || '');
                        }
                        if (mmStr.length >= 2) {
                            let mm = parseInt(mmStr.substring(0, 2), 10);
                            if (mm > 59) mm = 59;
                            formatted += ':' + String(mm).padStart(2, '0');
                        } else {
                            formatted += ':' + mmStr;
                        }
                    }
                } else if (digits.length === 1) {
                    formatted = digits;
                }

                timeInput.value = formatted;
            });

            timeInput.addEventListener('blur', () => {
                if (timeInput.value) {
                    let digits = timeInput.value.replace(/\D/g, '');
                    if (digits.length === 1 || digits.length === 2) {
                        let hh = Math.min(23, parseInt(digits, 10));
                        timeInput.value = `${String(hh).padStart(2, '0')}:00`;
                    } else if (digits.length === 3) {
                        let hh = Math.min(23, parseInt(digits.substring(0, 2), 10));
                        let mm = parseInt(digits[2] + '0', 10);
                        timeInput.value = `${String(hh).padStart(2, '0')}:${String(Math.min(59, mm)).padStart(2, '0')}`;
                    } else if (digits.length >= 4) {
                        let hh = Math.min(23, parseInt(digits.substring(0, 2), 10));
                        let mm = Math.min(59, parseInt(digits.substring(2, 4), 10));
                        timeInput.value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
                    }
                }
            });
        }

        timelineWorkersList.appendChild(workerCard);

        const trackRow = document.createElement('div');
        trackRow.className = `timeline-track-row ${diffMins > 0 ? 'has-overflow' : ''}`;
        trackRow.style.width = `${totalMins * pxPerMin}px`;
        trackRow.setAttribute('data-filler-id', filler.id);

        for (let h = planningState.timelineStartHour; h <= planningState.timelineEndHour; h++) {
            const offsetMins = (h - planningState.timelineStartHour) * 60;
            const line = document.createElement('div');
            line.className = `timeline-grid-line ${h % 2 === 0 ? 'major' : ''}`;
            line.style.left = `${offsetMins * pxPerMin}px`;
            trackRow.appendChild(line);
        }

        const effectiveNetEnd = shiftStart + shiftNetDuration;

        if (effectiveNetEnd > shiftStart) {
            const shiftLeft = Math.max(0, (shiftStart - startMins) * pxPerMin);
            const shiftWidth = (effectiveNetEnd - shiftStart) * pxPerMin;
            const bounds = document.createElement('div');
            bounds.className = 'timeline-shift-bounds';
            bounds.style.left = `${shiftLeft}px`;
            bounds.style.width = `${shiftWidth}px`;
            trackRow.appendChild(bounds);
        }

        let currentBlockStartMins = shiftStart >= 0 ? shiftStart : startMins;

        assigned.forEach((task, taskIdx) => {
            const taskLeft = Math.max(0, (currentBlockStartMins - startMins) * pxPerMin);
            const taskWidth = Math.max(20, task.duration * pxPerMin);

            const block = document.createElement('div');
            block.className = `timeline-task-block type-${task.type || 'vullen'}`;
            block.style.left = `${taskLeft}px`;
            block.style.width = `${taskWidth}px`;
            block.setAttribute('draggable', 'true');
            block.setAttribute('data-task-id', task.id);
            block.setAttribute('data-filler-id', filler.id);
            block.setAttribute('data-task-index', taskIdx);

            const taskStartMins = currentBlockStartMins;
            const taskEndMins = currentBlockStartMins + task.duration;
            const startStr = minutesToTime(taskStartMins);
            const endStr = minutesToTime(taskEndMins);

            let typeBadge = '';
            if (task.type === 'vullen') {
                typeBadge = `<span class="task-badge-icon badge-vullen">V</span>`;
            } else if (task.type === 'spiegelen') {
                typeBadge = `<span class="task-badge-icon badge-spiegelen">S</span>`;
            } else if (task.type === 'restanten') {
                typeBadge = `<span class="task-badge-icon badge-restanten">R</span>`;
            } else if (task.type === 'overige') {
                typeBadge = `<span class="task-badge-icon badge-overige">O</span>`;
            }

            block.innerHTML = `
                <div class="task-block-header">
                    ${typeBadge}
                    <span class="timeline-task-title">${task.title}</span>
                </div>
                <div class="task-block-footer">
                    <span class="timeline-task-meta-dur">${formatDuration(task.duration)}</span>
                    <span class="timeline-task-meta-time">${startStr} - ${endStr}</span>
                </div>
            `;

            if (effectiveNetEnd > 0 && taskEndMins > effectiveNetEnd) {
                const overflowMins = Math.min(task.duration, taskEndMins - effectiveNetEnd);
                const overflowWidth = Math.max(4, overflowMins * pxPerMin);
                const overflowOverlay = document.createElement('div');
                overflowOverlay.className = 'timeline-task-overflow';
                overflowOverlay.style.width = `${overflowWidth}px`;
                overflowOverlay.title = `Te lang: ${overflowMins}m na werktijd`;
                block.appendChild(overflowOverlay);
            }

            block.addEventListener('mouseenter', (e) => {
                showCustomTooltip(e, {
                    type: task.type,
                    title: task.title,
                    duration: task.duration,
                    colli: task.colli,
                    startStr: startStr,
                    endStr: endStr
                });
            });

            block.addEventListener('mousemove', (e) => {
                positionCustomTooltip(e);
            });

            block.addEventListener('mouseleave', () => {
                hideCustomTooltip();
            });

            block.addEventListener('dragstart', (e) => {
                hideCustomTooltip();
                draggedTaskData = {
                    source: 'assigned',
                    taskId: task.id,
                    fillerId: filler.id,
                    taskIndex: taskIdx
                };
                e.dataTransfer.setData('text/plain', JSON.stringify(draggedTaskData));
                setTimeout(() => {
                    block.classList.add('dragging');
                }, 0);
                if (unassignedTasksSidebar) {
                    unassignedTasksSidebar.classList.add('drag-active');
                }
            });

            block.addEventListener('dragend', () => {
                draggedTaskData = null;
                document.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
                document.querySelectorAll('.timeline-task-block').forEach(b => {
                    b.style.transform = '';
                });
                block.classList.remove('dragging');
                if (unassignedTasksSidebar) {
                    unassignedTasksSidebar.classList.remove('drag-active');
                    unassignedTasksSidebar.classList.remove('drag-over');
                }
            });

            block.addEventListener('dblclick', () => {
                unassignTask(filler.id, taskIdx);
            });

            block.addEventListener('contextmenu', (e) => {
                showContextMenu(e, task, true, filler.id, taskIdx);
            });

            trackRow.appendChild(block);
            currentBlockStartMins += task.duration;
        });

        trackRow.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragged = getDraggedTask();
            if (!dragged) return;

            const rect = trackRow.getBoundingClientRect();
            const hoverX = e.clientX - rect.left;

            let ghost = trackRow.querySelector('.timeline-task-ghost');
            if (!ghost) {
                document.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
                document.querySelectorAll('.timeline-task-block').forEach(b => {
                    b.style.transform = '';
                });
                ghost = document.createElement('div');
                ghost.className = 'timeline-task-ghost';
                ghost.innerHTML = `<span class="timeline-task-ghost-text">${dragged.title}</span>`;
                trackRow.appendChild(ghost);
            }

            const allAssigned = planningState.assignedTasks[filler.id] || [];
            const rowBaseStartMins = shiftStart >= 0 ? shiftStart : startMins;
            const draggedWidthPx = Math.max(16, dragged.duration * pxPerMin);

            const isSelfDrag = draggedTaskData && draggedTaskData.source === 'assigned' && draggedTaskData.fillerId === filler.id;
            const selfOrigIdx = isSelfDrag ? draggedTaskData.taskIndex : -1;

            const otherItems = [];
            allAssigned.forEach((item, idx) => {
                if (isSelfDrag && idx === selfOrigIdx) return;
                otherItems.push(item);
            });

            const activeTargetIdxStr = trackRow.getAttribute('data-target-index');
            const currentSlot = activeTargetIdxStr !== null 
                ? Math.max(0, Math.min(otherItems.length, parseInt(activeTargetIdxStr, 10))) 
                : (isSelfDrag ? selfOrigIdx : otherItems.length);

            let slotStart = (rowBaseStartMins - startMins) * pxPerMin;
            for (let s = 0; s < currentSlot; s++) {
                slotStart += otherItems[s].duration * pxPerMin;
            }
            const slotEnd = slotStart + draggedWidthPx;

            let bestSlot = currentSlot;

            if (hoverX < slotStart && currentSlot > 0) {
                const prevItem = otherItems[currentSlot - 1];
                const prevItemWidth = prevItem.duration * pxPerMin;
                const prevItemStart = slotStart - prevItemWidth;
                const prevItemMid = prevItemStart + (prevItemWidth / 2);

                if (hoverX < prevItemMid) {
                    bestSlot = currentSlot - 1;
                }
            } else if (hoverX > slotEnd && currentSlot < otherItems.length) {
                const nextItem = otherItems[currentSlot];
                const nextItemWidth = nextItem.duration * pxPerMin;
                const nextItemStart = slotEnd;
                const nextItemMid = nextItemStart + (nextItemWidth / 2);

                if (hoverX > nextItemMid) {
                    bestSlot = currentSlot + 1;
                }
            }

            let ghostLeftPx = (rowBaseStartMins - startMins) * pxPerMin;
            for (let j = 0; j < bestSlot; j++) {
                ghostLeftPx += otherItems[j].duration * pxPerMin;
            }

            ghost.style.left = `${Math.max(0, ghostLeftPx)}px`;
            ghost.style.width = `${draggedWidthPx}px`;
            trackRow.setAttribute('data-target-index', String(bestSlot));

            let runningBasePx = (rowBaseStartMins - startMins) * pxPerMin;
            otherItems.forEach((item, idx) => {
                const blockEl = trackRow.querySelector(`.timeline-task-block[data-task-id="${item.id}"]`);
                if (!blockEl) return;

                const origLeft = parseFloat(blockEl.style.left) || 0;
                let desiredLeft = runningBasePx;
                if (idx >= bestSlot) {
                    desiredLeft += draggedWidthPx;
                }
                const diffX = desiredLeft - origLeft;
                blockEl.style.transform = diffX !== 0 ? `translateX(${diffX}px)` : '';
                runningBasePx += item.duration * pxPerMin;
            });

            document.querySelectorAll('.timeline-track-row').forEach(otherRow => {
                if (otherRow === trackRow) return;
                const otherFillerId = parseInt(otherRow.getAttribute('data-filler-id'), 10);
                const isSourceRow = draggedTaskData && draggedTaskData.source === 'assigned' && draggedTaskData.fillerId === otherFillerId;
                if (isSourceRow) {
                    const sourceBlocks = otherRow.querySelectorAll('.timeline-task-block');
                    sourceBlocks.forEach(sb => {
                        const sIdx = parseInt(sb.getAttribute('data-task-index'), 10);
                        if (sIdx > draggedTaskData.taskIndex) {
                            sb.style.transform = `translateX(-${draggedWidthPx}px)`;
                        } else {
                            sb.style.transform = '';
                        }
                    });
                } else {
                    otherRow.querySelectorAll('.timeline-task-block').forEach(sb => {
                        sb.style.transform = '';
                    });
                }
            });
        });

        trackRow.addEventListener('dragleave', (e) => {
            if (!trackRow.contains(e.relatedTarget)) {
                const ghost = trackRow.querySelector('.timeline-task-ghost');
                if (ghost) ghost.remove();
                trackRow.removeAttribute('data-target-index');
                trackRow.querySelectorAll('.timeline-task-block').forEach(b => {
                    b.style.transform = '';
                });
            }
        });

        trackRow.addEventListener('drop', (e) => {
            e.preventDefault();
            const ghost = trackRow.querySelector('.timeline-task-ghost');
            if (ghost) ghost.remove();

            trackRow.querySelectorAll('.timeline-task-block').forEach(b => {
                b.style.transform = '';
            });

            const targetIdxStr = trackRow.getAttribute('data-target-index');
            const targetIndex = targetIdxStr !== null ? parseInt(targetIdxStr, 10) : null;
            trackRow.removeAttribute('data-target-index');

            const dataStr = e.dataTransfer.getData('text/plain');
            if (!dataStr) return;

            try {
                const data = JSON.parse(dataStr);
                if (data.source === 'unassigned') {
                    assignTaskToFiller(data.taskId, filler.id, targetIndex);
                } else if (data.source === 'assigned') {
                    moveAssignedTask(data.fillerId, data.taskIndex, filler.id, targetIndex);
                }
            } catch (_) {}
            draggedTaskData = null;
        });

        timelineTracksContainer.appendChild(trackRow);
    });
}

function renderUnassignedTasks() {
    if (!unassignedTasksList) return;
    unassignedTasksList.innerHTML = '';

    const counts = { vullen: 0, spiegelen: 0, restanten: 0, overige: 0 };
    planningState.unassignedTasks.forEach(t => {
        const type = t.type || 'vullen';
        if (counts[type] !== undefined) counts[type]++;
    });

    ['vullen', 'spiegelen', 'restanten', 'overige'].forEach(tabKey => {
        const counterEl = document.getElementById(`count-tab-${tabKey}`);
        if (counterEl) counterEl.textContent = counts[tabKey] || 0;
    });

    const filtered = planningState.unassignedTasks.filter(t => (t.type || 'vullen') === planningState.activeTab);

    if (filtered.length === 0) {
        unassignedTasksList.innerHTML = `
            <div class="empty-state" style="padding: 24px 8px; font-size: 12px;">
                Geen taken in deze categorie
            </div>
        `;
        return;
    }

    filtered.forEach(task => {
        const card = document.createElement('div');
        card.className = `unassigned-task-card type-${task.type || 'vullen'}`;
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-task-id', task.id);

        card.innerHTML = `
            <div class="unassigned-task-header">
                <span class="unassigned-task-title">${task.title}</span>
                ${task.colli > 0 ? `<span class="unassigned-task-colli">${task.colli}c</span>` : ''}
            </div>
            <span class="unassigned-task-duration">${formatDuration(task.duration)}</span>
        `;

        card.addEventListener('mouseenter', (e) => {
            showCustomTooltip(e, {
                type: task.type,
                title: task.title,
                duration: task.duration,
                colli: task.colli
            });
        });

        card.addEventListener('mousemove', (e) => {
            positionCustomTooltip(e);
        });

        card.addEventListener('mouseleave', () => {
            hideCustomTooltip();
        });

        card.addEventListener('dragstart', (e) => {
            hideCustomTooltip();
            draggedTaskData = {
                source: 'unassigned',
                taskId: task.id
            };
            e.dataTransfer.setData('text/plain', JSON.stringify(draggedTaskData));
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            draggedTaskData = null;
            document.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
            document.querySelectorAll('.timeline-task-block').forEach(b => {
                b.style.transform = '';
            });
            card.classList.remove('dragging');
        });

        if (task.type === 'overige') {
            card.addEventListener('contextmenu', (e) => {
                showContextMenu(e, task, false);
            });
        }

        unassignedTasksList.appendChild(card);
    });
}

function assignTaskToFiller(taskId, fillerId, insertIndex = null) {
    const task = planningState.unassignedTasks.find(t => t.id === taskId);
    if (!task) return;

    if (!planningState.assignedTasks[fillerId]) {
        planningState.assignedTasks[fillerId] = [];
    }

    let taskToInsert = null;
    if (task.type === 'overige') {
        taskToInsert = {
            ...task,
            id: `custom_inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            templateId: task.id,
            origTitle: task.title,
            origDuration: task.duration
        };
    } else {
        const taskIdx = planningState.unassignedTasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
            planningState.unassignedTasks.splice(taskIdx, 1);
        }
        if (!task.origTitle) task.origTitle = task.title;
        if (!task.origDuration) task.origDuration = task.duration;
        taskToInsert = task;
    }

    const list = planningState.assignedTasks[fillerId];
    if (insertIndex !== null && insertIndex >= 0 && insertIndex <= list.length) {
        list.splice(insertIndex, 0, taskToInsert);
    } else {
        list.push(taskToInsert);
    }

    renderTimelineRows();
    renderUnassignedTasks();
    triggerAutoSave();
}

function unassignTask(fillerId, taskIndex) {
    const assignedList = planningState.assignedTasks[fillerId];
    if (!assignedList || taskIndex < 0 || taskIndex >= assignedList.length) return;

    const [task] = assignedList.splice(taskIndex, 1);
    if (task.type !== 'overige') {
        if (task.origTitle) {
            task.title = task.origTitle;
        }
        if (task.origDuration) {
            task.duration = task.origDuration;
        }

        if (typeof task.origOrder === 'number') {
            let insertIdx = planningState.unassignedTasks.findIndex(t => typeof t.origOrder === 'number' && t.origOrder > task.origOrder);
            if (insertIdx === -1) {
                const firstOverigeIdx = planningState.unassignedTasks.findIndex(t => t.type === 'overige');
                if (firstOverigeIdx !== -1) {
                    insertIdx = firstOverigeIdx;
                }
            }
            if (insertIdx !== -1) {
                planningState.unassignedTasks.splice(insertIdx, 0, task);
            } else {
                planningState.unassignedTasks.push(task);
            }
        } else {
            planningState.unassignedTasks.push(task);
        }
    }

    renderTimelineRows();
    renderUnassignedTasks();
    triggerAutoSave();
}

function moveAssignedTask(fromFillerId, fromIndex, toFillerId, insertIndex = null) {
    const fromList = planningState.assignedTasks[fromFillerId];
    if (!fromList || fromIndex < 0 || fromIndex >= fromList.length) return;

    const [task] = fromList.splice(fromIndex, 1);
    if (!planningState.assignedTasks[toFillerId]) {
        planningState.assignedTasks[toFillerId] = [];
    }

    const toList = planningState.assignedTasks[toFillerId];
    if (insertIndex !== null && insertIndex >= 0) {
        const boundedIndex = Math.min(insertIndex, toList.length);
        toList.splice(boundedIndex, 0, task);
    } else {
        toList.push(task);
    }

    renderTimelineRows();
    renderUnassignedTasks();
    triggerAutoSave();
}

function switchToTimelineView() {
    const fillers = getFillersData();
    if (!fillers || fillers.length === 0) {
        showToast('error', 'Voer ten minste één medewerker in.');
        return;
    }

    for (const f of fillers) {
        const displayName = f.name || 'Medewerker';
        if (!f.from || !f.to) {
            showToast('error', `Vul een begin- en eindtijd in voor ${displayName}.`);
            return;
        }

        const startMins = timeToMinutes(f.from);
        const endMins = timeToMinutes(f.to);

        if (startMins >= endMins) {
            showToast('error', `De begintijd van ${displayName} moet vroeger zijn dan de eindtijd.`);
            return;
        }
    }

    const existingOtherTasks = (planningState.unassignedTasks || []).filter(t => t.type === 'overige');
    const newTasks = generateTasksFromPathsAndColli();

    existingOtherTasks.forEach(ot => {
        if (!newTasks.some(nt => nt.id === ot.id)) {
            newTasks.push(ot);
        }
    });

    planningState.fillers = fillers;
    planningState.unassignedTasks = newTasks;
    planningState.assignedTasks = {};

    calculateTimelineBounds(fillers);

    stepInputView.style.display = 'none';
    stepTimelineView.style.display = 'flex';

    renderTimelineAxis();
    renderTimelineRows();
    renderUnassignedTasks();
    restoreTimelineScroll();
    triggerAutoSave();
}

async function switchToInputView() {
    const hasAssignments = Object.values(planningState.assignedTasks || {}).some(list => Array.isArray(list) && list.length > 0);
    if (hasAssignments) {
        const confirmed = await showConfirmModal({
            title: 'Invoer aanpassen',
            message: 'Weet je het zeker? De huidige planning wordt hierbij verwijderd.',
            confirmText: 'Ja, doorgaan',
            cancelText: 'Annuleren',
            isDanger: true
        });
        if (!confirmed) return;
    }

    stepTimelineView.style.display = 'none';
    stepInputView.style.display = 'flex';
}

if (btnContinue) {
    btnContinue.addEventListener('click', switchToTimelineView);
}

if (btnBackToInput) {
    btnBackToInput.addEventListener('click', switchToInputView);
}

if (btnUnifiedImport) {
    btnUnifiedImport.addEventListener('click', () => {
        openUnifiedImportModal({
            onRoosterImport: (shifts) => {
                fillRoosterShifts(shifts);
            },
            onColliImport: (colliMap) => {
                handleImportedColli(colliMap);
            },
            availableUsers: getAvailableUsers()
        });
    });
}

const tabButtons = document.querySelectorAll('.unassigned-tab');
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        planningState.activeTab = btn.getAttribute('data-tab');
        renderUnassignedTasks();
    });
});

if (unassignedTasksSidebar) {
    unassignedTasksSidebar.addEventListener('dragover', (e) => {
        e.preventDefault();
        unassignedTasksSidebar.classList.add('drag-over');
    });

    unassignedTasksSidebar.addEventListener('dragleave', (e) => {
        if (!unassignedTasksSidebar.contains(e.relatedTarget)) {
            unassignedTasksSidebar.classList.remove('drag-over');
        }
    });

    unassignedTasksSidebar.addEventListener('drop', (e) => {
        e.preventDefault();
        unassignedTasksSidebar.classList.remove('drag-over');
        unassignedTasksSidebar.classList.remove('drag-active');

        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            if (data.source === 'assigned' && data.fillerId && data.taskIndex !== undefined) {
                unassignTask(data.fillerId, data.taskIndex);
            }
        } catch (_) {}
    });
}

const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
        planningState.zoom = Math.min(2.5, planningState.zoom + 0.25);
        updateZoom();
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
        planningState.zoom = Math.max(0.5, planningState.zoom - 0.25);
        updateZoom();
    });
}

if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
        planningState.zoom = 1;
        updateZoom();
    });
}

const TIMELINE_SCROLL_KEY = 'instock_timeline_scroll_left';

function restoreTimelineScroll() {
    if (!timelineSchedulePane) return;
    const saved = localStorage.getItem(TIMELINE_SCROLL_KEY);
    if (saved !== null) {
        const left = parseFloat(saved);
        if (!isNaN(left)) {
            requestAnimationFrame(() => {
                timelineSchedulePane.scrollLeft = left;
            });
        }
    }
}

if (timelineSchedulePane) {
    let scrollSaveTimeout = null;
    timelineSchedulePane.addEventListener('scroll', () => {
        if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
            localStorage.setItem(TIMELINE_SCROLL_KEY, String(timelineSchedulePane.scrollLeft));
        }, 150);
    }, { passive: true });
}

function updateZoom() {
    if (zoomLevelIndicator) {
        zoomLevelIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
    }
    renderTimelineAxis();
    renderTimelineRows();
}

if (btnAddCustomTask) {
    btnAddCustomTask.addEventListener('click', async () => {
        const modalContent = `
            <div class="modal-header">
                <h2 class="modal-title">Aangepaste Taak Toevoegen</h2>
                <p class="modal-subtitle">Voeg een overige taak toe aan de planning.</p>
            </div>
            <form id="customTaskForm" class="modal-form">
                <div class="form-group">
                    <label>Taakomschrijving *</label>
                    <input type="text" id="customTaskTitle" class="modal-input" placeholder="Bijv. Magazijn opruimen, Helpen bij zuivel..." required>
                </div>
                <div class="form-group">
                    <label>Tijdsduur (minuten) *</label>
                    <input type="number" min="1" id="customTaskDuration" class="modal-input" placeholder="30" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn-secondary" id="btnCancelCustomTask">Annuleren</button>
                    <button type="submit" class="btn">Toevoegen</button>
                </div>
            </form>
        `;

        const overlay = await showModal(modalContent);
        const form = overlay.querySelector('#customTaskForm');
        const cancelBtn = overlay.querySelector('#btnCancelCustomTask');

        cancelBtn.addEventListener('click', () => closeModal(overlay));

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = overlay.querySelector('#customTaskTitle').value.trim();
            const duration = parseInt(overlay.querySelector('#customTaskDuration').value, 10) || 0;

            if (title && duration > 0) {
                const newTask = {
                    id: `custom_${Date.now()}`,
                    type: 'overige',
                    title: title,
                    duration: duration,
                    colli: 0
                };
                planningState.unassignedTasks.push(newTask);
                closeModal(overlay);
                renderUnassignedTasks();
                triggerAutoSave();
                showToast('notification', 'Taak toegevoegd aan Onverdeelde Taken');
            }
        });
    });
}

let autoSaveTimeout = null;

export function triggerAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        try {
            const user = await getCurrentUser();
            if (!user || !user.store_id) return;

            const compactSchedule = {};
            Object.entries(planningState.assignedTasks).forEach(([fillerId, tasks]) => {
                if (Array.isArray(tasks) && tasks.length > 0) {
                    compactSchedule[fillerId] = tasks.map(t => {
                        if (t.type === 'overige') {
                            return { id: t.id, templateId: t.templateId || t.id, type: 'overige', title: t.title, duration: t.duration };
                        }
                        return { id: t.id, type: t.type, duration: t.duration };
                    });
                }
            });

            const otherTasksMap = new Map();
            planningState.unassignedTasks.forEach(t => {
                if (t.type === 'overige') {
                    const key = t.title + '_' + t.duration;
                    if (!otherTasksMap.has(key)) otherTasksMap.set(key, t);
                }
            });
            Object.values(planningState.assignedTasks).forEach(list => {
                if (Array.isArray(list)) {
                    list.forEach(t => {
                        if (t.type === 'overige') {
                            const key = t.title + '_' + t.duration;
                            if (!otherTasksMap.has(key)) otherTasksMap.set(key, { ...t, id: t.templateId || t.id });
                        }
                    });
                }
            });

            const { error } = await supabase
                .from('planner')
                .upsert({
                    store_id: user.store_id,
                    fillers: planningState.fillers,
                    tasks: getColliData(),
                    schedule: compactSchedule,
                    other_tasks: Array.from(otherTasksMap.values())
                }, {
                    onConflict: 'store_id'
                });

            if (error) {
                showToast('error', 'Opslaan mislukt: controleer verbinding');
            }
        } catch (err) {
            showToast('error', 'Opslaan mislukt: controleer verbinding');
        }
    }, 400);
}

async function loadSavedPlanning() {
    try {
        const user = await getCurrentUser();
        if (!user || !user.store_id) return;

        const [plannerResult, _] = await Promise.all([
            supabase
                .from('planner')
                .select('*')
                .eq('store_id', user.store_id)
                .maybeSingle(),
            loadStorePathsForColli()
        ]);

        const data = plannerResult.data;
        if (plannerResult.error || !data) return;

        if (Array.isArray(data.other_tasks) && data.other_tasks.length > 0) {
            data.other_tasks.forEach(ot => {
                if (ot && ot.title) {
                    const exists = planningState.unassignedTasks.some(t => t.type === 'overige' && t.title === ot.title && t.duration === ot.duration);
                    if (!exists) {
                        planningState.unassignedTasks.push(ot);
                    }
                }
            });
            renderUnassignedTasks();
        }

        const savedFillers = Array.isArray(data.fillers) ? data.fillers : [];
        if (savedFillers.length === 0) return;

        const scheduleData = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
        planningState.fillers = savedFillers;
        planningState.unassignedTasks = Array.isArray(scheduleData.unassigned_tasks) 
            ? scheduleData.unassigned_tasks 
            : (Array.isArray(data.unassigned_tasks) ? data.unassigned_tasks : []);
        planningState.assignedTasks = scheduleData.assigned_tasks && typeof scheduleData.assigned_tasks === 'object'
            ? scheduleData.assigned_tasks
            : (data.assigned_tasks && typeof data.assigned_tasks === 'object' ? data.assigned_tasks : {});

        fillRoosterShifts(savedFillers);

        const colliMap = {};
        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
            data.tasks.forEach(t => {
                if (t.category && t.colli !== undefined) {
                    colliMap[t.category.toLowerCase().trim()] = t.colli;
                }
            });
        }

        if (Object.keys(colliMap).length > 0) {
            fillColliValues(colliMap);
        }

        const generatedTasks = generateTasksFromPathsAndColli();
        const otherTasksList = [];

        if (Array.isArray(data.other_tasks) && data.other_tasks.length > 0) {
            data.other_tasks.forEach(ot => {
                if (ot && ot.title) {
                    otherTasksList.push(ot);
                }
            });
        }

        const taskPool = new Map();
        generatedTasks.forEach(t => taskPool.set(t.id, t));
        otherTasksList.forEach(t => taskPool.set(t.id, t));

        const hydratedAssignedTasks = {};
        const assignedTaskIds = new Set();

        const rawSchedule = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
        const scheduleAssignments = rawSchedule.assigned_tasks ? rawSchedule.assigned_tasks : rawSchedule;

        Object.entries(scheduleAssignments).forEach(([fillerId, taskRefs]) => {
            if (Array.isArray(taskRefs)) {
                hydratedAssignedTasks[fillerId] = [];
                taskRefs.forEach(ref => {
                    const refId = typeof ref === 'string' ? ref : (ref && ref.id);
                    const templateId = ref && ref.templateId;

                    if (ref && ref.type === 'overige') {
                        const template = taskPool.get(templateId || refId);
                        hydratedAssignedTasks[fillerId].push({
                            id: refId || `custom_inst_${Date.now()}`,
                            templateId: templateId || (template && template.id) || refId,
                            type: 'overige',
                            title: (ref && ref.title) || (template && template.title) || 'Overige taak',
                            duration: (ref && ref.duration) || (template && template.duration) || 30,
                            colli: 0
                        });
                    } else if (taskPool.has(refId)) {
                        const originalTask = taskPool.get(refId);
                        hydratedAssignedTasks[fillerId].push(originalTask);
                        assignedTaskIds.add(refId);
                    }
                });
            }
        });

        const unassignedNormal = generatedTasks.filter(t => !assignedTaskIds.has(t.id));

        planningState.fillers = savedFillers;
        planningState.assignedTasks = hydratedAssignedTasks;
        planningState.unassignedTasks = [...unassignedNormal, ...otherTasksList];

        calculateTimelineBounds(savedFillers);

        stepInputView.style.display = 'none';
        stepTimelineView.style.display = 'flex';

        renderTimelineAxis();
        renderTimelineRows();
        renderUnassignedTasks();
        restoreTimelineScroll();
    } catch (_) {}
}

loadSavedPlanning();



