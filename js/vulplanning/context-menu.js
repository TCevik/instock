import { showModal, closeModal, showConfirmModal, showToast } from '../main.js';
import { planningState } from './state.js';
import { timeToMinutes, formatDuration, parsePauseMinutes } from './time-utils.js';
import { hideCustomTooltip } from './tooltip.js';
import { triggerAutoSave } from './storage.js';
import { openPauseModal } from './custom-task-modal.js';

let contextMenuElement = null;

export function getOrCreateContextMenu() {
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

export function hideContextMenu() {
    if (contextMenuElement) {
        contextMenuElement.classList.remove('active');
    }
}

export function showContextMenu(e, task, isAssigned = false, fillerId = null, taskIndex = null, callbacks = {}) {
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

                let assignedPauzeMins = 0;
                let totalAssigned = 0;
                assignedList.forEach(t => {
                    totalAssigned += t.duration;
                    if (t.type === 'pauze') {
                        assignedPauzeMins += t.duration;
                    }
                });

                const presetPause = parsePauseMinutes(filler.pause);
                const targetShiftDuration = Math.max(0, shiftEnd - shiftStart - presetPause) + assignedPauzeMins;
                
                remainingMins = targetShiftDuration - totalAssigned;
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

    if (task.type === 'overige' || task.type === 'pauze') {
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
                if (task.origDuration === undefined) {
                    task.origDuration = task.duration;
                }
                task.duration += remainingMins;
                if (callbacks.onRenderRows) callbacks.onRenderRows();
                if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
                triggerAutoSave();
            }
        });
    }

    const editBtn = menu.querySelector('#ctx-edit-task');
    if (editBtn) {
        editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            if (task.type === 'pauze') {
                openPauseModal(task.duration, (newMins) => {
                    if (newMins <= 0) {
                        if (callbacks.onUnassignTask) {
                            callbacks.onUnassignTask(fillerId, taskIndex);
                        }
                    } else {
                        task.duration = newMins;
                        task.origDuration = newMins;
                        if (callbacks.onRenderRows) callbacks.onRenderRows();
                        if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
                        triggerAutoSave(true);
                        showToast('notification', 'Pauze bijgewerkt');
                    }
                });
            } else {
                openEditCustomTaskModal(task, isAssigned, fillerId, taskIndex, callbacks);
            }
        });
    }

    const deleteBtn = menu.querySelector('#ctx-delete-task');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            hideCustomTooltip();
            if (task.type === 'overige') {
                deleteCustomTask(task, isAssigned, fillerId, taskIndex, callbacks);
            } else if (fillerId && taskIndex !== null) {
                if (callbacks.onUnassignTask) {
                    callbacks.onUnassignTask(fillerId, taskIndex);
                    if (task.type === 'pauze') {
                        showToast('notification', 'Pauze verwijderd');
                    }
                }
            }
        });
    }

    const x = e.clientX;
    const y = e.clientY;
    menu.style.left = `${Math.min(window.innerWidth - 220, Math.max(10, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 130, Math.max(10, y))}px`;
    menu.classList.add('active');
}

export async function openEditCustomTaskModal(task, isAssigned, fillerId, taskIndex, callbacks = {}) {
    const subtitle = isAssigned
        ? 'Pas de tijdsduur of titel aan voor deze planning. De originele tijd blijft behouden.'
        : 'Pas de taakomschrijving of standaardtijd aan in het overzicht.';

    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">${isAssigned ? 'Taak in Planning Bewerken' : 'Taak Bewerken'}</h2>
            <p class="modal-subtitle">${subtitle}</p>
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
            if (isAssigned) {
                if (task.origDuration === undefined) {
                    task.origDuration = task.duration;
                }
                if (task.origTitle === undefined) {
                    task.origTitle = task.title;
                }
                task.title = newTitle;
                task.duration = newDuration;
            } else {
                task.title = newTitle;
                task.duration = newDuration;
                task.origDuration = newDuration;
                task.origTitle = newTitle;
                const templateId = task.id;
                task.templateId = templateId;
            }

            closeModal(overlay);
            if (callbacks.onRenderRows) callbacks.onRenderRows();
            if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
            triggerAutoSave();
            showToast('notification', isAssigned ? 'Taak in planning bijgewerkt' : 'Taak succesvol bijgewerkt');
        }
    });
}

export async function deleteCustomTask(task, isAssigned, fillerId, taskIndex, callbacks = {}) {
    hideCustomTooltip();
    const confirmed = await showConfirmModal({
        title: 'Overige taak verwijderen',
        message: `Weet je zeker dat je "${task.title}" wilt verwijderen?`,
        confirmText: 'Verwijderen',
        cancelText: 'Annuleren',
        isDanger: true
    });

    hideCustomTooltip();
    if (!confirmed) return;

    if (isAssigned && fillerId && taskIndex !== null) {
        planningState.assignedTasks[fillerId].splice(taskIndex, 1);
    } else {
        planningState.unassignedTasks = planningState.unassignedTasks.filter(t => t.id !== task.id);
    }

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave();
    showToast('notification', 'Taak verwijderd');
}
