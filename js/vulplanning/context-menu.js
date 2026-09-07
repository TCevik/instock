import { showModal, closeModal, showConfirmModal, showToast } from '../main.js';
import { planningState } from './state.js';
import { timeToMinutes, formatDuration, parsePauseMinutes } from './time-utils.js';
import { hideCustomTooltip } from './tooltip.js';
import { triggerAutoSave } from './storage.js';
import { openPauseModal } from './custom-task-modal.js';
import { findMainTaskForHelper, findHelpersForMainTask } from './task-actions.js';
import { sortFillers } from './filler-sort.js';

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
    let mainInfo = null;

    if (isAssigned && task.isHelper) {
        mainInfo = findMainTaskForHelper(task);
    }

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

                if (task.isHelper) {
                    if (!mainInfo || !mainInfo.task || mainInfo.task.duration <= 1) {
                        remainingMins = 0;
                    } else {
                        remainingMins = Math.min(remainingMins, mainInfo.task.duration - 1);
                    }
                }

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
                if (task.duration + remainingMins > 5760) {
                    showToast('error', 'De maximale tijdsduur is 96 uur (5760 minuten).');
                    return;
                }
                if (task.isHelper && mainInfo && mainInfo.task) {
                    if (mainInfo.task.duration - remainingMins < 1) {
                        showToast('error', 'Hoofdtaak kan niet minder dan 1 minuut duren');
                        return;
                    }
                    if (task.origDuration === undefined) {
                        task.origDuration = task.duration;
                    }
                    task.duration += remainingMins;
                    mainInfo.task.duration -= remainingMins;
                } else {
                    if (task.origDuration === undefined) {
                        task.origDuration = task.duration;
                    }
                    task.duration += remainingMins;
                }
                if (callbacks.onRenderRows) callbacks.onRenderRows();
                if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
                triggerAutoSave(true);
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
    const isHelper = Boolean(isAssigned && task.isHelper);
    let mainInfo = null;
    let maxHelperDuration = null;

    if (isHelper) {
        mainInfo = findMainTaskForHelper(task);
        if (mainInfo && mainInfo.task) {
            maxHelperDuration = task.duration + mainInfo.task.duration - 1;
        }
    }

    let origDuration = task.origDuration;
    if (task.type === 'vullen' && Array.isArray(task.categoryDetails) && task.categoryDetails.length > 0) {
        let totalMins = 0;
        task.categoryDetails.forEach(it => {
            const c = Number(it.colli) || 0;
            const norm = Number(it.norm) || 50;
            if (c > 0 && norm > 0) {
                totalMins += (c / norm) * 60;
            }
        });
        if (totalMins > 0) {
            const calculated = Math.max(1, Math.round(totalMins));
            if (origDuration === undefined || origDuration === null || (origDuration === task.duration && calculated !== task.duration)) {
                origDuration = calculated;
                task.origDuration = calculated;
            }
        }
    }

    const hasModifiedDuration = isAssigned && origDuration !== undefined && origDuration !== null && origDuration !== task.duration;

    let subtitle = '';
    if (isHelper) {
        subtitle = mainInfo && mainInfo.task
            ? `Helpertaak van "${mainInfo.task.title}". Tijd die je hier aanpast, wordt verrekend met de hoofdtaak.`
            : 'Helpertaak in de planning.';
    } else if (isAssigned) {
        subtitle = 'Pas de tijdsduur of titel aan voor deze planning. De originele tijd blijft behouden.';
    } else {
        subtitle = 'Pas de taakomschrijving of standaardtijd aan in het overzicht.';
    }

    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">${isHelper ? 'Helpertaak Bewerken' : (isAssigned ? 'Taak in Planning Bewerken' : 'Taak Bewerken')}</h2>
            <p class="modal-subtitle">${subtitle}</p>
        </div>
        <form id="editCustomTaskForm" class="modal-form" novalidate>
            <div class="form-group">
                <label>Taakomschrijving *</label>
                <input type="text" id="editCustomTaskTitle" class="modal-input" value="${task.title || ''}" ${isHelper ? 'readonly style="opacity:0.75;cursor:not-allowed;"' : ''} required>
            </div>
            <div class="form-group">
                <label>Tijdsduur (minuten) *</label>
                <input type="number" min="1" id="editCustomTaskDuration" class="modal-input" value="${task.duration || 30}" required>
                <div id="editCustomTaskDurationError" style="display:none;font-size:12px;color:var(--danger-color);margin-top:2px;"></div>
                ${isHelper && mainInfo && mainInfo.task ? `<small style="font-size:11px;color:var(--text-color-muted);margin-top:4px;display:block;">Hoofdtaak heeft nu ${mainInfo.task.duration} min (max. ${maxHelperDuration} min voor deze helper)</small>` : ''}
                ${hasModifiedDuration ? `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
                    <small style="font-size:12px;color:var(--text-color-muted);">Originele tijd: <strong style="color:var(--text-color);">${origDuration} min</strong> (${formatDuration(origDuration)})</small>
                    <button type="button" id="btnRestoreOrigDuration" style="background:none;border:none;color:var(--accent-color);font-size:12px;font-weight:500;cursor:pointer;padding:0;">Herstellen en opslaan</button>
                </div>` : ''}
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
    const restoreBtn = overlay.querySelector('#btnRestoreOrigDuration');
    const durInput = overlay.querySelector('#editCustomTaskDuration');
    const durError = overlay.querySelector('#editCustomTaskDurationError');

    const validateDuration = () => {
        const val = parseInt(durInput.value, 10);
        if (isNaN(val) || val < 1) {
            durInput.style.borderColor = 'var(--danger-color)';
            durError.textContent = 'Voer een geldige tijdsduur in (minimaal 1 minuut).';
            durError.style.display = 'block';
            return false;
        }
        if (val > 5760) {
            durInput.style.borderColor = 'var(--danger-color)';
            durError.textContent = 'De maximale tijdsduur is 96 uur (5760 minuten).';
            durError.style.display = 'block';
            return false;
        }
        durInput.style.borderColor = '';
        durError.style.display = 'none';
        return true;
    };

    durInput.addEventListener('input', validateDuration);

    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            if (durInput && origDuration) {
                durInput.value = origDuration;
                validateDuration();
                if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        });
    }

    cancelBtn.addEventListener('click', () => closeModal(overlay));

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const newTitle = overlay.querySelector('#editCustomTaskTitle').value.trim();
        const newDuration = parseInt(durInput.value, 10) || 0;

        if (!validateDuration()) {
            showToast('error', durError.textContent);
            durInput.focus();
            return;
        }

        if (newTitle && newDuration > 0) {
            if (isHelper) {
                const currentMain = findMainTaskForHelper(task);
                if (!currentMain || !currentMain.task) {
                    showToast('error', 'Hoofdtaak niet gevonden');
                    return;
                }
                const oldDuration = task.duration;
                const diff = newDuration - oldDuration;
                if (currentMain.task.duration - diff < 1) {
                    showToast('error', `Te veel tijd! Hoofdtaak moet minimaal 1 minuut overhouden.`);
                    return;
                }

                if (task.origDuration === undefined) {
                    task.origDuration = oldDuration;
                }
                task.duration = newDuration;
                currentMain.task.duration -= diff;
            } else if (isAssigned) {
                if (task.origDuration === undefined || task.origDuration === null) {
                    task.origDuration = origDuration || task.duration;
                }
                if (task.origTitle === undefined) {
                    task.origTitle = task.title;
                }
                task.title = newTitle;
                task.duration = newDuration;

                const helpers = findHelpersForMainTask(task);
                helpers.forEach(h => {
                    h.task.title = `${newTitle} (Helper)`;
                    h.task.origTitle = `${newTitle} (Helper)`;
                });
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
            triggerAutoSave(true);
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

export function showWorkerContextMenu(e, filler, callbacks = {}) {
    e.preventDefault();
    hideCustomTooltip();
    const menu = getOrCreateContextMenu();

    menu.innerHTML = `
        <button type="button" class="context-menu-item" id="ctx-edit-worker">
            <span class="material-icons">edit</span>
            <span>${filler?.name || 'Medewerker'} bewerken</span>
        </button>
        <div class="context-menu-divider"></div>
        <button type="button" class="context-menu-item" data-sort="start-asc">
            <span class="material-icons">schedule</span>
            <span>Begintijd (omhoog)</span>
        </button>
        <button type="button" class="context-menu-item" data-sort="start-desc">
            <span class="material-icons">schedule</span>
            <span>Begintijd (omlaag)</span>
        </button>
        <div class="context-menu-divider"></div>
        <button type="button" class="context-menu-item" data-sort="end-asc">
            <span class="material-icons">update</span>
            <span>Eindtijd (omhoog)</span>
        </button>
        <button type="button" class="context-menu-item" data-sort="end-desc">
            <span class="material-icons">update</span>
            <span>Eindtijd (omlaag)</span>
        </button>
        <div class="context-menu-divider"></div>
        <button type="button" class="context-menu-item" data-sort="name-asc">
            <span class="material-icons">sort_by_alpha</span>
            <span>Naam (A-Z)</span>
        </button>
        <button type="button" class="context-menu-item" data-sort="name-desc">
            <span class="material-icons">sort_by_alpha</span>
            <span>Naam (Z-A)</span>
        </button>
        <div class="context-menu-divider"></div>
        <button type="button" class="context-menu-item" data-sort="custom">
            <span class="material-icons">tune</span>
            <span>Aangepast (volgorde)</span>
        </button>
    `;

    const editBtn = menu.querySelector('#ctx-edit-worker');
    if (editBtn) {
        editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hideContextMenu();
            if (callbacks.onEditWorker) {
                callbacks.onEditWorker(filler);
            }
        });
    }

    menu.querySelectorAll('.context-menu-item[data-sort]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const sortType = btn.getAttribute('data-sort');
            hideContextMenu();
            if (sortType) {
                sortFillers(sortType, callbacks);
            }
        });
    });

    const x = e.clientX;
    const y = e.clientY;
    menu.style.left = `${Math.min(window.innerWidth - 240, Math.max(10, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 300, Math.max(10, y))}px`;
    menu.classList.add('active');
}
