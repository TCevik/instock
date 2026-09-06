import { showModal, closeModal, showConfirmModal, showToast, escapeHtml } from '../main.js';
import { planningState } from './state.js';
import { timeToMinutes } from './time-utils.js';
import { setupAutocomplete, setupTimeInput, findExactUser, updateUsernameBadge, fillRoosterShifts } from './rooster.js';
import { calculateTimelineBounds } from './timeline-axis.js';
import { unassignTask } from './task-actions.js';
import { triggerAutoSave } from './storage.js';
import { recordSnapshot } from './history.js';

export async function openWorkerModal(filler = null, callbacks = {}) {
    const isEdit = !!filler;
    const title = isEdit ? 'Medewerker Bewerken' : 'Medewerker Toevoegen';
    const subtitle = isEdit ? 'Pas de gegevens van de medewerker aan.' : 'Voeg een medewerker toe aan de planning.';

    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <p class="modal-subtitle">${subtitle}</p>
        </div>
        <form id="workerModalForm" class="modal-form modal-worker-form">
            <div class="form-group">
                <label>Naam medewerker *</label>
                <div class="vuller-name-wrapper">
                    <input type="text" id="workerModalName" class="input-field vuller-name modal-input" placeholder="Naam medewerker..." value="${escapeHtml(filler?.name || '')}" autocomplete="off" required>
                    <div class="autocomplete-dropdown"></div>
                    <div class="vuller-matched-user"></div>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <div class="form-group">
                    <label>Vanaf *</label>
                    <div class="vuller-time-field-wrapper">
                        <input type="text" id="workerModalFrom" class="input-field vuller-from modal-input" placeholder="07:00" value="${escapeHtml(filler?.from || '')}" autocomplete="off" inputmode="numeric" required>
                        <div class="time-dropdown"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Tot *</label>
                    <div class="vuller-time-field-wrapper">
                        <input type="text" id="workerModalTo" class="input-field vuller-to modal-input" placeholder="15:30" value="${escapeHtml(filler?.to || '')}" autocomplete="off" inputmode="numeric" required>
                        <div class="time-dropdown"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Pauze</label>
                    <div class="vuller-time-field-wrapper">
                        <input type="text" id="workerModalPause" class="input-field vuller-pause modal-input" placeholder="30 min" value="${escapeHtml(filler?.pause || '')}" autocomplete="off" inputmode="numeric">
                        <div class="time-dropdown"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                ${isEdit ? `
                    <button type="button" class="modal-btn-danger" id="btnDeleteWorker">
                        <span class="material-icons">delete</span>
                        <span>Verwijderen</span>
                    </button>
                ` : ''}
                <button type="button" class="modal-btn-secondary" id="btnCancelWorker">Annuleren</button>
                <button type="submit" class="btn">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
            </div>
        </form>
    `;

    const overlay = await showModal(modalContent);
    const form = overlay.querySelector('#workerModalForm');
    const cancelBtn = overlay.querySelector('#btnCancelWorker');
    const deleteBtn = overlay.querySelector('#btnDeleteWorker');

    const nameInput = overlay.querySelector('#workerModalName');
    const nameDropdown = nameInput.nextElementSibling;
    const userBadge = nameDropdown.nextElementSibling;
    setupAutocomplete(nameInput, nameDropdown, userBadge);
    if (filler?.name) {
        updateUsernameBadge(nameInput, userBadge);
    }

    const fromInput = overlay.querySelector('#workerModalFrom');
    const fromDropdown = fromInput.nextElementSibling;
    setupTimeInput(fromInput, fromDropdown, false);

    const toInput = overlay.querySelector('#workerModalTo');
    const toDropdown = toInput.nextElementSibling;
    setupTimeInput(toInput, toDropdown, false);

    const pauseInput = overlay.querySelector('#workerModalPause');
    const pauseDropdown = pauseInput.nextElementSibling;
    setupTimeInput(pauseInput, pauseDropdown, true);

    cancelBtn?.addEventListener('click', () => closeModal(overlay));

    if (deleteBtn && isEdit) {
        deleteBtn.addEventListener('click', async () => {
            const hasAssigned = (planningState.assignedTasks[filler.id] || []).length > 0;
            const confirmed = await showConfirmModal({
                title: 'Medewerker Verwijderen',
                message: hasAssigned
                    ? `Weet je zeker dat je ${filler.name || 'deze medewerker'} wilt verwijderen? De taken worden teruggezet naar Onverdeelde Taken.`
                    : `Weet je zeker dat je ${filler.name || 'deze medewerker'} wilt verwijderen?`,
                confirmText: 'Verwijderen',
                cancelText: 'Annuleren',
                isDanger: true
            });

            if (!confirmed) return;

            while ((planningState.assignedTasks[filler.id] || []).length > 0) {
                unassignTask(filler.id, 0, {
                    onRenderRows: () => {},
                    onRenderUnassigned: () => {}
                });
            }

            delete planningState.assignedTasks[filler.id];
            planningState.fillers = planningState.fillers.filter(f => f.id !== filler.id);

            calculateTimelineBounds(planningState.fillers);
            callbacks.onRenderAxis?.();
            callbacks.onRenderRows?.();
            callbacks.onRenderUnassigned?.();
            recordSnapshot();
            triggerAutoSave(true);
            fillRoosterShifts(planningState.fillers);

            closeModal(overlay);
            showToast('success', 'Medewerker verwijderd');
        });
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = nameInput.value.trim();
        const from = fromInput.value.trim();
        const to = toInput.value.trim();
        const rawPause = pauseInput.value.trim();

        if (!name) {
            showToast('error', 'Vul een naam in.');
            return;
        }

        if (!from || !to) {
            showToast('error', 'Vul een begin- en eindtijd in.');
            return;
        }

        const startMins = timeToMinutes(from);
        let endMins = timeToMinutes(to);
        if (endMins <= startMins) {
            showToast('error', 'De begintijd moet vroeger zijn dan de eindtijd.');
            return;
        }

        let pause = rawPause;
        if (rawPause) {
            const d = rawPause.replace(/\D/g, '');
            pause = d ? `${d} min` : '';
        }

        const matchedUser = findExactUser(name);

        if (isEdit) {
            filler.name = name;
            filler.user_id = matchedUser ? matchedUser.user_id : null;
            filler.username = matchedUser ? matchedUser.username : null;
            filler.from = from;
            filler.to = to;
            filler.pause = pause;
            showToast('success', 'Medewerker bijgewerkt');
        } else {
            const newId = planningState.fillers.reduce((max, f) => (typeof f.id === 'number' ? Math.max(max, f.id) : max), 0) + 1;
            const newFiller = {
                id: newId,
                name: name,
                user_id: matchedUser ? matchedUser.user_id : null,
                username: matchedUser ? matchedUser.username : null,
                from: from,
                to: to,
                pause: pause
            };
            planningState.fillers.push(newFiller);
            planningState.assignedTasks[newId] = [];
            showToast('success', 'Medewerker toegevoegd');
        }

        calculateTimelineBounds(planningState.fillers);
        callbacks.onRenderAxis?.();
        callbacks.onRenderRows?.();
        callbacks.onRenderUnassigned?.();
        recordSnapshot();
        triggerAutoSave(true);
        fillRoosterShifts(planningState.fillers);

        closeModal(overlay);
    });
}
