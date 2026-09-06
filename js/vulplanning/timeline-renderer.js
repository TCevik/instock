import { planningState, setDraggedTaskData, getDraggedTaskData, getDraggedTask } from './state.js';
import { timeToMinutes, minutesToTime, formatDuration, parsePauseMinutes, calculateProductivity, formatTimeInput, normalizeTimeOnBlur } from './time-utils.js';
import { showCustomTooltip, positionCustomTooltip, hideCustomTooltip } from './tooltip.js';
import { showContextMenu } from './context-menu.js';
import { findExactUser } from './rooster.js';
import { calculateTimelineBounds, renderTimelineAxis, getPixelsPerMinute, getTimelineTotalMinutes } from './timeline-axis.js';
import { openPauseModal } from './custom-task-modal.js';
import { addHelperToTask, getComboTasksForTask } from './task-actions.js';
import { triggerAutoSave } from './storage.js';

export function renderTimelineRows(options) {
    const {
        timelineWorkersList,
        timelineTracksContainer,
        timelineHoursAxis,
        unassignedTasksSidebar,
        onAssignTask,
        onMoveTask,
        onUnassignTask,
        onRenderRows,
        onRenderUnassigned,
        onEditWorker,
        onAddWorker
    } = options;

    if (!timelineWorkersList || !timelineTracksContainer) return;
    hideCustomTooltip();
    
    calculateTimelineBounds(planningState.fillers);
    renderTimelineAxis(timelineHoursAxis);

    if (timelineWorkersList.parentElement && !timelineWorkersList.parentElement.querySelector('.timeline-hours-axis-spacer')) {
        const spacer = document.createElement('div');
        spacer.className = 'timeline-hours-axis-spacer';
        timelineWorkersList.parentElement.insertBefore(spacer, timelineWorkersList);
    }
    timelineWorkersList.style.paddingTop = '0px';
    timelineTracksContainer.style.paddingTop = '0px';

    timelineWorkersList.innerHTML = '';
    timelineTracksContainer.innerHTML = '';

    const pxPerMin = getPixelsPerMinute();
    const totalMins = getTimelineTotalMinutes();
    const startMins = planningState.timelineStartHour * 60;
    timelineTracksContainer.style.width = `${totalMins * pxPerMin}px`;

    planningState.fillers.forEach(filler => {
        const shiftStart = timeToMinutes(filler.from);
        let shiftEnd = timeToMinutes(filler.to);
        if (shiftEnd > 0 && shiftEnd <= shiftStart) {
            shiftEnd += 24 * 60;
        }
        const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);

        const assigned = planningState.assignedTasks[filler.id] || [];

        let assignedPauzeMins = 0;
        let workAssignedMins = 0;
        let totalAssignedMins = 0;
        assigned.forEach(t => {
            totalAssignedMins += t.duration;
            if (t.type === 'pauze') {
                assignedPauzeMins += t.duration;
            } else {
                workAssignedMins += t.duration;
            }
        });

        const hasPauzeTask = assignedPauzeMins > 0;
        const presetPause = parsePauseMinutes(filler.pause);
        const presetPauseStr = formatDuration(presetPause);
        const effectivePause = hasPauzeTask ? assignedPauzeMins : presetPause;
        const targetShiftDuration = Math.max(0, shiftGrossDuration - presetPause) + assignedPauzeMins;

        const diffMins = totalAssignedMins - targetShiftDuration;
        let statusClass = 'status-fit';
        let statusText = 'Passend';
        if (diffMins > 0) {
            statusClass = 'status-over';
            statusText = `Te veel: ${formatDuration(diffMins)}`;
        } else if (diffMins < 0) {
            statusClass = 'status-rem';
            statusText = `Over: ${formatDuration(Math.abs(diffMins))}`;
        }

        const workerCard = document.createElement('div');
        workerCard.className = `timeline-worker-info ${diffMins > 0 ? 'worker-has-overflow' : ''}`;
        workerCard.setAttribute('data-filler-id', filler.id);
        workerCard.innerHTML = `
            <div class="timeline-worker-left">
                <div class="timeline-worker-name-row">
                    <span class="timeline-worker-name">${filler.name || 'Naamloos'}</span>
                    <span class="material-icons timeline-worker-edit-hint">edit</span>
                </div>
                <div class="timeline-worker-subrow">
                    <span class="timeline-worker-hours">${filler.from || '00:00'} - ${filler.to || '00:00'}</span>
                </div>
            </div>
            <div class="timeline-worker-center">
                <div class="timeline-worker-statbox ${statusClass}">
                    <div class="statbox-row">
                        <span class="statbox-label">Tijd:</span>
                        <span class="statbox-value">${formatDuration(totalAssignedMins)} / ${formatDuration(targetShiftDuration)}</span>
                    </div>
                    <div class="statbox-row">
                        <span class="statbox-label">Pauze: ${formatDuration(assignedPauzeMins)} / ${presetPauseStr}</span>
                        <span class="statbox-status">${statusText}</span>
                    </div>
                </div>
            </div>
            <div class="timeline-worker-right">
                <input type="text" class="input-field timeline-worker-input" placeholder="" maxlength="5" value="${filler.actualEndTime || ''}" />

                <span class="timeline-worker-prod"></span>
            </div>
        `;

        const timeInput = workerCard.querySelector('.timeline-worker-input');
        const prodLabel = workerCard.querySelector('.timeline-worker-prod');

        function calcProd() {
            filler.actualEndTime = timeInput.value;
            const res = calculateProductivity(workAssignedMins, timeInput.value, filler.from, filler.to, effectivePause, assigned);
            if (!res) {
                prodLabel.textContent = '';
                prodLabel.className = 'timeline-worker-prod';
                return;
            }
            prodLabel.textContent = `Prod: ${res.percent}%`;
            prodLabel.className = `timeline-worker-prod ${res.statusClass}`;
        }

        calcProd();

        if (timeInput) {
            let lastVal = timeInput.value;

            timeInput.addEventListener('input', (e) => {
                const isDeleting = (e && e.inputType && e.inputType.startsWith('delete')) || (timeInput.value.length < lastVal.length);
                timeInput.value = formatTimeInput(timeInput.value, isDeleting);
                lastVal = timeInput.value;
                calcProd();
                if (timeInput.value.length === 5 || timeInput.value === '') {
                    triggerAutoSave(true);
                } else {
                    triggerAutoSave(false);
                }
            });

            timeInput.addEventListener('change', () => {
                if (timeInput.value) {
                    timeInput.value = normalizeTimeOnBlur(timeInput.value);
                    lastVal = timeInput.value;
                }
                calcProd();
                triggerAutoSave(true);
            });

            timeInput.addEventListener('blur', () => {
                if (timeInput.value) {
                    timeInput.value = normalizeTimeOnBlur(timeInput.value);
                    lastVal = timeInput.value;
                }
                calcProd();
                triggerAutoSave(true);
            });

            timeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    timeInput.blur();
                }
            });
        }

        let workerUsername = filler.username || '';
        if (!workerUsername && filler.name) {
            const matched = findExactUser(filler.name);
            if (matched?.username) workerUsername = matched.username;
        }

        workerCard.addEventListener('mouseenter', (e) => {
            if (e.target.closest('.timeline-worker-input')) return;
            showCustomTooltip(e, {
                isWorker: true,
                username: workerUsername
            });
        });

        workerCard.addEventListener('mousemove', (e) => {
            if (e.target.closest('.timeline-worker-input')) {
                hideCustomTooltip();
            } else {
                showCustomTooltip(e, {
                    isWorker: true,
                    username: workerUsername
                });
                positionCustomTooltip(e);
            }
        });

        workerCard.addEventListener('mouseleave', () => {
            hideCustomTooltip();
        });

        workerCard.addEventListener('click', (e) => {
            hideCustomTooltip();
            if (e.target.closest('.timeline-worker-input')) return;
            if (onEditWorker) {
                onEditWorker(filler);
            }
        });

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

        const effectiveNetEnd = shiftStart + targetShiftDuration;

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
            const taskDurationMins = Number(task.duration) || 1;
            const taskLeft = Math.max(0, (currentBlockStartMins - startMins) * pxPerMin);
            const taskWidth = Math.max(2, taskDurationMins * pxPerMin);

            const isMicro = taskWidth < 38;
            const isTiny = taskWidth < 68;
            const isNano = taskWidth < 20;

            const block = document.createElement('div');
            block.className = `timeline-task-block type-${task.type || 'vullen'} ${task.isHelper ? 'is-helper' : ''} ${isMicro ? 'is-micro' : ''} ${isTiny ? 'is-tiny' : ''} ${isNano ? 'is-nano' : ''}`;
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
            if (task.isHelper) {
                typeBadge = `<span class="task-badge-icon badge-helper">H</span>`;
            } else if (task.type === 'vullen') {
                typeBadge = `<span class="task-badge-icon badge-vullen">V</span>`;
            } else if (task.type === 'spiegelen') {
                typeBadge = `<span class="task-badge-icon badge-spiegelen">S</span>`;
            } else if (task.type === 'restanten') {
                typeBadge = `<span class="task-badge-icon badge-restanten">R</span>`;
            } else if (task.type === 'overige') {
                typeBadge = `<span class="task-badge-icon badge-overige">O</span>`;
            } else if (task.type === 'pauze') {
                typeBadge = `<span class="task-badge-icon badge-pauze">P</span>`;
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
                    endStr: endStr,
                    isHelper: task.isHelper
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
                const dragData = {
                    source: 'assigned',
                    taskId: task.id,
                    fillerId: filler.id,
                    taskIndex: taskIdx
                };
                setDraggedTaskData(dragData);
                e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                setTimeout(() => {
                    block.classList.add('dragging');
                }, 0);
                if (unassignedTasksSidebar) {
                    unassignedTasksSidebar.classList.add('drag-active');
                }
            });

            block.addEventListener('dragend', () => {
                setDraggedTaskData(null);
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
                hideCustomTooltip();
                if (onUnassignTask) onUnassignTask(filler.id, taskIdx);
            });

            block.addEventListener('contextmenu', (e) => {
                showContextMenu(e, task, true, filler.id, taskIdx, {
                    onRenderRows,
                    onRenderUnassigned,
                    onUnassignTask
                });
            });

            trackRow.appendChild(block);
            currentBlockStartMins += task.duration;
        });

        trackRow.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragged = getDraggedTask();
            if (!dragged) return;

            const dragData = getDraggedTaskData();
            let previewTasks = [dragged];
            if (dragData && dragData.source === 'unassigned' && dragged.type === 'vullen') {
                const { prependedTasks, appendedTasks } = getComboTasksForTask(dragged);
                previewTasks = [...prependedTasks, dragged, ...appendedTasks];
            }

            const rect = trackRow.getBoundingClientRect();
            const hoverX = e.clientX - rect.left;

            let ghosts = Array.from(trackRow.querySelectorAll('.timeline-task-ghost'));
            const matchesExisting = ghosts.length === previewTasks.length && ghosts.every((g, i) => g.getAttribute('data-task-id') === String(previewTasks[i].id));
            if (!matchesExisting) {
                document.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
                document.querySelectorAll('.timeline-task-block').forEach(b => {
                    b.style.transform = '';
                });
                ghosts = previewTasks.map(item => {
                    const g = document.createElement('div');
                    g.className = `timeline-task-ghost type-${item.type || 'vullen'}`;
                    g.setAttribute('data-task-id', String(item.id));
                    g.innerHTML = `<span class="timeline-task-ghost-text">${item.title}</span>`;
                    trackRow.appendChild(g);
                    return g;
                });
            }

            const allAssigned = planningState.assignedTasks[filler.id] || [];
            const rowBaseStartMins = shiftStart >= 0 ? shiftStart : startMins;
            const totalWidthPx = previewTasks.reduce((sum, item) => sum + (Number(item.duration) || 1), 0) * pxPerMin;

            const isSelfDrag = dragData && dragData.source === 'assigned' && dragData.fillerId === filler.id;
            const selfOrigIdx = isSelfDrag ? dragData.taskIndex : -1;

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
            const slotEnd = slotStart + totalWidthPx;

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

            let currentGhostLeftPx = (rowBaseStartMins - startMins) * pxPerMin;
            for (let j = 0; j < bestSlot; j++) {
                currentGhostLeftPx += otherItems[j].duration * pxPerMin;
            }

            ghosts.forEach((g, idx) => {
                const item = previewTasks[idx];
                const itemDurationMins = Number(item.duration) || 1;
                const itemWidthPx = Math.max(2, itemDurationMins * pxPerMin);
                const isMicro = itemWidthPx < 38;
                const isTiny = itemWidthPx < 68;
                const isNano = itemWidthPx < 20;

                g.className = `timeline-task-ghost type-${item.type || 'vullen'} ${isMicro ? 'is-micro' : ''} ${isTiny ? 'is-tiny' : ''} ${isNano ? 'is-nano' : ''}`;
                g.style.left = `${Math.max(0, currentGhostLeftPx)}px`;
                g.style.width = `${itemWidthPx}px`;
                currentGhostLeftPx += itemDurationMins * pxPerMin;
            });
            trackRow.setAttribute('data-target-index', String(bestSlot));

            let runningBasePx = (rowBaseStartMins - startMins) * pxPerMin;
            otherItems.forEach((item, idx) => {
                const blockEl = trackRow.querySelector(`.timeline-task-block[data-task-id="${item.id}"]`);
                if (!blockEl) return;

                const origLeft = parseFloat(blockEl.style.left) || 0;
                let desiredLeft = runningBasePx;
                if (idx >= bestSlot) {
                    desiredLeft += totalWidthPx;
                }
                const diffX = desiredLeft - origLeft;
                blockEl.style.transform = diffX !== 0 ? `translateX(${diffX}px)` : '';
                runningBasePx += item.duration * pxPerMin;
            });

            document.querySelectorAll('.timeline-track-row').forEach(otherRow => {
                if (otherRow === trackRow) return;
                const otherFillerId = parseInt(otherRow.getAttribute('data-filler-id'), 10);
                const isSourceRow = dragData && dragData.source === 'assigned' && dragData.fillerId === otherFillerId;
                if (isSourceRow) {
                    const sourceBlocks = otherRow.querySelectorAll('.timeline-task-block');
                    sourceBlocks.forEach(sb => {
                        const sIdx = parseInt(sb.getAttribute('data-task-index'), 10);
                        if (sIdx > dragData.taskIndex) {
                            sb.style.transform = `translateX(-${totalWidthPx}px)`;
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
                trackRow.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
                trackRow.removeAttribute('data-target-index');
                trackRow.querySelectorAll('.timeline-task-block').forEach(b => {
                    b.style.transform = '';
                });
            }
        });

        trackRow.addEventListener('drop', (e) => {
            e.preventDefault();
            trackRow.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());

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
                    if (data.taskId === 'pauze_template') {
                        openPauseModal(30, (chosenDuration) => {
                            if (onAssignTask) onAssignTask(data.taskId, filler.id, targetIndex, chosenDuration);
                        });
                    } else if (onAssignTask) {
                        onAssignTask(data.taskId, filler.id, targetIndex);
                    }
                } else if (data.source === 'sidebar_assigned') {
                    if (data.fillerId !== filler.id) {
                        addHelperToTask(data.fillerId, data.taskIndex, filler.id, targetIndex, {
                            onRenderRows,
                            onRenderUnassigned
                        });
                    }
                } else if (data.source === 'assigned') {
                    if (onMoveTask) onMoveTask(data.fillerId, data.taskIndex, filler.id, targetIndex);
                }
            } catch (_) {}
            setDraggedTaskData(null);
        });

        timelineTracksContainer.appendChild(trackRow);
    });

    const addRow = document.createElement('div');
    addRow.className = 'timeline-add-worker-row';
    addRow.innerHTML = `
        <button type="button" class="btn-timeline-add-worker">
            <span class="material-icons">add</span>
            <span>Medewerker toevoegen</span>
        </button>
    `;
    const addBtn = addRow.querySelector('.btn-timeline-add-worker');
    if (addBtn && onAddWorker) {
        addBtn.addEventListener('click', () => {
            onAddWorker();
        });
    }
    timelineWorkersList.appendChild(addRow);

    const addTrackSpacer = document.createElement('div');
    addTrackSpacer.className = 'timeline-track-row timeline-track-add-spacer';
    addTrackSpacer.style.width = `${totalMins * pxPerMin}px`;
    for (let h = planningState.timelineStartHour; h <= planningState.timelineEndHour; h++) {
        const offsetMins = (h - planningState.timelineStartHour) * 60;
        const line = document.createElement('div');
        line.className = `timeline-grid-line ${h % 2 === 0 ? 'major' : ''}`;
        line.style.left = `${offsetMins * pxPerMin}px`;
        addTrackSpacer.appendChild(line);
    }
    timelineTracksContainer.appendChild(addTrackSpacer);
}
