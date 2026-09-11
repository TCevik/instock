import { showModal, closeModal, showConfirmModal, showToast, escapeHtml } from '../main.js';
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

                if (remainingMins > 0 && !task.isHelper && task.type === 'overige') {
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
    let mainTask = task;
    let mainFillerId = fillerId;
    let mainTaskIndex = taskIndex;
    let helpers = [];

    if (isAssigned && task.isHelper) {
        const mainInfo = findMainTaskForHelper(task);
        if (mainInfo && mainInfo.task) {
            mainTask = mainInfo.task;
            mainFillerId = mainInfo.fillerId;
            mainTaskIndex = mainInfo.taskIndex;
        }
    }

    if (isAssigned) {
        helpers = findHelpersForMainTask(mainTask);
    }

    let origDuration = mainTask.origDuration;
    if (mainTask.type === 'vullen' && Array.isArray(mainTask.categoryDetails) && mainTask.categoryDetails.length > 0) {
        let totalMins = 0;
        mainTask.categoryDetails.forEach(it => {
            const c = Number(it.colli) || 0;
            const norm = Number(it.norm) || 50;
            if (c > 0 && norm > 0) {
                totalMins += (c / norm) * 60;
            }
        });
        if (totalMins > 0) {
            const calculated = Math.max(1, Math.round(totalMins));
            if (origDuration === undefined || origDuration === null || (origDuration === mainTask.duration && calculated !== mainTask.duration)) {
                origDuration = calculated;
                mainTask.origDuration = calculated;
            }
        }
    }

    const origTitle = mainTask.origTitle;
    const hasModifiedDuration = isAssigned && origDuration !== undefined && origDuration !== null && origDuration !== mainTask.duration;
    const hasModifiedTitle = isAssigned && origTitle !== undefined && origTitle !== null && origTitle !== mainTask.title;
    const canRestore = hasModifiedDuration || hasModifiedTitle;

    const mainFillerObj = isAssigned ? planningState.fillers.find(f => f.id === mainFillerId) : null;
    const mainFillerName = mainFillerObj ? (mainFillerObj.name || 'Medewerker') : '';

    let totalWorkMinutes = mainTask.duration + helpers.reduce((sum, h) => sum + (h.task.duration || 0), 0);

    let subtitle = '';
    if (helpers.length > 0) {
        subtitle = `Pas de tijden aan voor de hoofdtaak en ${helpers.length} gekoppelde helper(s). De totale werktijd blijft gelijk (${totalWorkMinutes} min).`;
    } else if (isAssigned) {
        subtitle = 'Pas de tijdsduur of titel aan voor deze planning. De originele gegevens blijven behouden.';
    } else {
        subtitle = 'Pas de taakomschrijving of standaardtijd aan in het overzicht.';
    }

    const helpersRowsHtml = helpers.map((h, idx) => {
        const helperFillerObj = planningState.fillers.find(f => f.id === h.fillerId);
        const helperName = helperFillerObj ? (helperFillerObj.name || 'Helper') : 'Helper';
        return `
            <div class="form-group helper-edit-row" data-helper-idx="${idx}" style="margin-top: 10px; padding: 8px 10px; background-color: var(--input-background); border: 1px solid var(--card-border); border-radius: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 12px; font-weight: 600; color: var(--text-color);">${escapeHtml(helperName)} (Helper)</span>
                    <span style="font-size: 11px; color: var(--text-color-muted);">Inzet op taak</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="number" min="1" class="modal-input helper-dur-input" data-helper-idx="${idx}" value="${h.task.duration || 1}" required style="flex: 1;">
                    <span style="font-size: 12px; color: var(--text-color-muted);">min</span>
                </div>
            </div>
        `;
    }).join('');

    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">${helpers.length > 0 ? 'Taak & Helpers Tijden Aanpassen' : (isAssigned ? 'Taak in Planning Bewerken' : 'Taak Bewerken')}</h2>
            <p class="modal-subtitle">${subtitle}</p>
        </div>
        <form id="editCustomTaskForm" class="modal-form" novalidate>
            <div class="form-group">
                <label>Taakomschrijving *</label>
                <input type="text" id="editCustomTaskTitle" class="modal-input" value="${escapeHtml(mainTask.title || '')}" required>
            </div>
            
            ${helpers.length > 0 ? `
            <div class="form-group">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="margin: 0;">Totale Werktijd (minuten) *</label>
                    <small style="font-size: 11px; color: var(--accent-color); font-weight: 500;">Som ingesteld: <span id="currentPersonSumDisplay">${totalWorkMinutes}</span> / <span id="totalWorkTargetDisplay">${totalWorkMinutes}</span> min</small>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                    <input type="number" min="1" id="editCustomTaskTotalWork" class="modal-input" value="${totalWorkMinutes}" required style="flex: 1;">
                    <span style="font-size: 12px; color: var(--text-color-muted);">min</span>
                </div>
            </div>
            ` : ''}

            <div class="form-group">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label style="margin: 0;">${helpers.length > 0 ? `Tijdsduur Hoofdtaak (${escapeHtml(mainFillerName || 'Hoofdtaak')}) *` : 'Tijdsduur (minuten) *'}</label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                    <input type="number" min="1" id="editCustomTaskDuration" class="modal-input" value="${mainTask.duration || 30}" required style="flex: 1;">
                    <span style="font-size: 12px; color: var(--text-color-muted);">min</span>
                </div>
            ${helpers.length > 0 ? `
                <div class="form-group" style="margin-top: 14px; border-top: 1px solid var(--card-border); padding-top: 12px;">
                    <label style="font-weight: 600; color: var(--text-color);">Helper Taken (${helpers.length})</label>
                    ${helpersRowsHtml}
                </div>
            ` : ''}

            <div id="editCustomTaskDurationError" style="min-height: 36px; height: 36px; font-size: 12px; color: var(--danger-color); margin-top: 8px; line-height: 1.3; overflow: hidden; visibility: hidden;">&nbsp;</div>

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
    const totalWorkInput = overlay.querySelector('#editCustomTaskTotalWork');
    const durError = overlay.querySelector('#editCustomTaskDurationError');
    const helperInputs = Array.from(overlay.querySelectorAll('.helper-dur-input'));
    const currentPersonSumDisplay = overlay.querySelector('#currentPersonSumDisplay');
    const totalWorkTargetDisplay = overlay.querySelector('#totalWorkTargetDisplay');

    const getAllDurInputs = () => [durInput, ...helperInputs];

    const calculateCurrentSum = () => {
        return getAllDurInputs().reduce((sum, inp) => sum + (parseInt(inp.value, 10) || 0), 0);
    };

    const validateAllInputs = () => {
        let totalWorkVal = 0;
        if (totalWorkInput) {
            totalWorkVal = parseInt(totalWorkInput.value, 10);
            if (isNaN(totalWorkVal) || totalWorkVal < 1) {
                totalWorkInput.style.borderColor = 'var(--danger-color)';
                durError.textContent = 'Voer een geldige totale werktijd in (minimaal 1 minuut).';
                durError.style.visibility = 'visible';
                return false;
            }
            totalWorkInput.style.borderColor = '';
        }

        for (const inp of getAllDurInputs()) {
            const val = parseInt(inp.value, 10);
            if (isNaN(val) || val < 1) {
                inp.style.borderColor = 'var(--danger-color)';
                durError.textContent = 'Voer een geldige tijdsduur in (minimaal 1 minuut).';
                durError.style.visibility = 'visible';
                return false;
            }
            if (val > 5760) {
                inp.style.borderColor = 'var(--danger-color)';
                durError.textContent = 'De maximale tijdsduur is 96 uur (5760 minuten).';
                durError.style.visibility = 'visible';
                return false;
            }
            inp.style.borderColor = '';
        }

        const currentSum = calculateCurrentSum();
        if (totalWorkTargetDisplay) totalWorkTargetDisplay.textContent = totalWorkVal;
        if (currentPersonSumDisplay) currentPersonSumDisplay.textContent = currentSum;

        if (helpers.length > 0 && currentSum !== totalWorkVal) {
            durError.textContent = `De som van de tijden (${currentSum} min) is niet gelijk aan de totale werktijd (${totalWorkVal} min). Verdeel alle minuten voor het opslaan.`;
            durError.style.visibility = 'visible';
            return false;
        }

        durError.innerHTML = '&nbsp;';
        durError.style.visibility = 'hidden';
        return true;
    };

    if (totalWorkInput) {
        totalWorkInput.addEventListener('input', validateAllInputs);
    }
    durInput.addEventListener('input', validateAllInputs);
    helperInputs.forEach(hInp => hInp.addEventListener('input', validateAllInputs));

    if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            const titleInput = overlay.querySelector('#editCustomTaskTitle');
            if (titleInput && mainTask.origTitle) {
                titleInput.value = mainTask.origTitle;
            }
            if (durInput && origDuration) {
                durInput.value = origDuration;
            }
            validateAllInputs();
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        });
    }

    cancelBtn.addEventListener('click', () => closeModal(overlay));

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const newTitle = overlay.querySelector('#editCustomTaskTitle').value.trim();
        const newMainDuration = parseInt(durInput.value, 10) || 0;

        if (!validateAllInputs()) {
            showToast('error', durError.textContent);
            return;
        }

        if (newTitle && newMainDuration > 0) {
            if (isAssigned) {
                if (mainTask.origDuration === undefined || mainTask.origDuration === null) {
                    mainTask.origDuration = origDuration || mainTask.duration;
                }
                if (mainTask.origTitle === undefined) {
                    mainTask.origTitle = mainTask.title;
                }
                mainTask.title = newTitle;
                mainTask.duration = newMainDuration;

                helpers.forEach((h, idx) => {
                    const hInput = helperInputs[idx];
                    const newHelperDur = parseInt(hInput?.value, 10) || h.task.duration;
                    if (h.task.origDuration === undefined || h.task.origDuration === null) {
                        h.task.origDuration = h.task.duration;
                    }
                    h.task.duration = newHelperDur;
                    h.task.title = newTitle;
                    h.task.origTitle = newTitle;
                });
            } else {
                mainTask.title = newTitle;
                mainTask.duration = newMainDuration;
                mainTask.origDuration = newMainDuration;
                mainTask.origTitle = newTitle;
                mainTask.templateId = mainTask.id;
            }

            closeModal(overlay);
            if (callbacks.onRenderRows) callbacks.onRenderRows();
            if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
            triggerAutoSave(true);
            showToast('notification', isAssigned ? 'Taak en helper tijden bijgewerkt' : 'Taak succesvol bijgewerkt');
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
