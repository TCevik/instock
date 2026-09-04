import { showModal, closeModal, showToast } from '../main.js';
import { planningState } from './state.js';
import { triggerAutoSave } from './storage.js';

export function setupCustomTaskModal(btnAddCustomTask, callbacks = {}) {
    if (!btnAddCustomTask) return;

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
                if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
                triggerAutoSave();
                showToast('notification', 'Taak toegevoegd aan Onverdeelde Taken');
            }
        });
    });
}

export async function openPauseModal(initialMins = 30, onConfirm) {
    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Pauze Inplannen</h2>
            <p class="modal-subtitle">Kies een tijdsduur voor de pauze of voer een aangepaste tijd in.</p>
        </div>
        <form id="pauseTaskForm" class="modal-form">
            <div class="pause-preset-buttons" style="display: flex; gap: 8px;">
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="15" style="flex: 1;">15 min</button>
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="30" style="flex: 1;">30 min</button>
                <button type="button" class="modal-btn-secondary pause-preset-btn" data-mins="45" style="flex: 1;">45 min</button>
            </div>
            <div class="form-group">
                <label>Aangepaste pauzeduur (minuten)</label>
                <input type="number" min="1" id="pauseTaskDuration" class="modal-input" value="${initialMins}" placeholder="30" required>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btnCancelPauseTask">Annuleren</button>
                <button type="submit" class="btn">Inplannen</button>
            </div>
        </form>
    `;

    const overlay = await showModal(modalContent);
    const form = overlay.querySelector('#pauseTaskForm');
    const input = overlay.querySelector('#pauseTaskDuration');
    const cancelBtn = overlay.querySelector('#btnCancelPauseTask');

    overlay.querySelectorAll('.pause-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.getAttribute('data-mins'), 10) || 30;
            input.value = mins;
            closeModal(overlay);
            if (onConfirm) onConfirm(mins);
        });
    });

    cancelBtn.addEventListener('click', () => closeModal(overlay));

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const mins = parseInt(input.value, 10);
        if (mins > 0) {
            closeModal(overlay);
            if (onConfirm) onConfirm(mins);
        }
    });
}
