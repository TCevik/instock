import { planningState, setDraggedTaskData, getDraggedTask } from './state.js';
import { timeToMinutes, minutesToTime, formatDuration, parsePauseMinutes } from './time-utils.js';
import { showCustomTooltip, positionCustomTooltip, hideCustomTooltip } from './tooltip.js';
import { showContextMenu } from './context-menu.js';
import { calculateTimelineBounds, renderTimelineAxis, getPixelsPerMinute, getTimelineTotalMinutes } from './timeline-axis.js';
import { openPauseModal } from './custom-task-modal.js';
import { addHelperToTask } from './task-actions.js';

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
        onRenderUnassigned
    } = options;

    if (!timelineWorkersList || !timelineTracksContainer) return;
    
    calculateTimelineBounds(planningState.fillers);
    renderTimelineAxis(timelineHoursAxis);

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
        const effectivePause = hasPauzeTask ? assignedPauzeMins : presetPause;
        const targetShiftDuration = hasPauzeTask ? (shiftGrossDuration - presetPause + assignedPauzeMins) : Math.max(0, shiftGrossDuration - presetPause);

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
                        <span class="statbox-value">${formatDuration(totalAssignedMins)} / ${formatDuration(targetShiftDuration)}</span>
                    </div>
                    <div class="statbox-row">
                        <span class="statbox-label">Pauze: ${hasPauzeTask ? formatDuration(assignedPauzeMins) : (filler.pause || '0m')}</span>
                        <span class="statbox-status">${statusText}</span>
                    </div>
                </div>
            </div>
            <div class="timeline-worker-right">
                <input type="text" class="input-field timeline-worker-input" placeholder="" maxlength="5" />

                <span class="timeline-worker-prod"></span>
            </div>
        `;

        const timeInput = workerCard.querySelector('.timeline-worker-input');
        const prodLabel = workerCard.querySelector('.timeline-worker-prod');

        function calcProd() {
            prodLabel.textContent = '';
            prodLabel.className = 'timeline-worker-prod';
            if (!timeInput.value || timeInput.value.length < 5) return;

            let actualEnd = timeToMinutes(timeInput.value);
            if (actualEnd > 0 && actualEnd <= shiftStart && shiftEnd > 24 * 60) actualEnd += 24 * 60;
            const actualGross = Math.max(0, actualEnd - shiftStart);
            const actualNet = Math.max(0, actualGross - effectivePause);

            if (actualNet <= 0) return;

            const prodPercent = Math.round((workAssignedMins / actualNet) * 100);
            let prodClass = 'danger';
            if (prodPercent >= 100) prodClass = 'success';
            else if (prodPercent >= 80) prodClass = 'yellow';
            else if (prodPercent >= 60) prodClass = 'orange';

            prodLabel.textContent = `Prod: ${prodPercent}%`;
            prodLabel.className = `timeline-worker-prod ${prodClass}`;
        }

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
                calcProd();
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
                calcProd();
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
            const taskLeft = Math.max(0, (currentBlockStartMins - startMins) * pxPerMin);
            const taskWidth = Math.max(6, task.duration * pxPerMin);

            const isMicro = taskWidth < 38;
            const isTiny = taskWidth < 68;

            const block = document.createElement('div');
            block.className = `timeline-task-block type-${task.type || 'vullen'} ${task.isHelper ? 'is-helper' : ''} ${isMicro ? 'is-micro' : ''} ${isTiny ? 'is-tiny' : ''}`;
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

            const dragData = window.__draggedTaskDataRef ? window.__draggedTaskDataRef() : null;
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
                const isSourceRow = dragData && dragData.source === 'assigned' && dragData.fillerId === otherFillerId;
                if (isSourceRow) {
                    const sourceBlocks = otherRow.querySelectorAll('.timeline-task-block');
                    sourceBlocks.forEach(sb => {
                        const sIdx = parseInt(sb.getAttribute('data-task-index'), 10);
                        if (sIdx > dragData.taskIndex) {
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
}
