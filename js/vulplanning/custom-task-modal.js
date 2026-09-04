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
