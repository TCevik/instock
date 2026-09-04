import { showModal, closeModal, showToast } from '../main.js';
import { planningState } from './state.js';
import { triggerAutoSave } from './storage.js';

export function loadComboSettings() {
    try {
        const saved = localStorage.getItem('instock_planner_combo_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            planningState.comboSettings = {
                autoRestanten: parsed.autoRestanten !== false,
                autoSpiegelen: parsed.autoSpiegelen !== false,
                autoOverige: !!parsed.autoOverige
            };
        }
    } catch (_) {}
}

export function saveComboSettings(settings) {
    planningState.comboSettings = { ...settings };
    try {
        localStorage.setItem('instock_planner_combo_settings', JSON.stringify(planningState.comboSettings));
    } catch (_) {}
    triggerAutoSave();
}

export async function openComboSettingsModal() {
    loadComboSettings();
    const current = planningState.comboSettings || {
        autoRestanten: true,
        autoSpiegelen: true,
        autoOverige: false
    };

    let tempSettings = { ...current };

    const modalContent = `
        <div class="modal-header" style="display: flex; flex-direction: row; align-items: center; gap: 14px; padding-right: 28px;">
            <div class="combo-modal-icon-wrap">
                <span class="material-icons" style="font-size: 22px;">tune</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <h2 class="modal-title" style="font-size: 18px;">Samen Indelen Instellingen</h2>
                <p class="modal-subtitle" style="font-size: 12px;">Automatische combinaties bij inslepen</p>
            </div>
        </div>

        <div class="combo-info-banner">
            <span class="material-icons">info</span>
            <span>Werkt alleen bij het inslepen van een <strong>vulopdracht</strong>.</span>
        </div>

        <div class="combo-options-list">
            <div class="combo-option-row ${tempSettings.autoRestanten ? 'is-checked' : ''}" data-key="autoRestanten">
                <div class="combo-option-left">
                    <div class="combo-option-icon icon-restanten">
                        <span class="material-icons">inventory_2</span>
                    </div>
                    <span class="combo-option-title">Restanten automatisch ervoor zetten</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>

            <div class="combo-option-row ${tempSettings.autoSpiegelen ? 'is-checked' : ''}" data-key="autoSpiegelen">
                <div class="combo-option-left">
                    <div class="combo-option-icon icon-spiegelen">
                        <span class="material-icons">flip</span>
                    </div>
                    <span class="combo-option-title">Spiegelen automatisch erachter zetten</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>

            <div class="combo-option-row ${tempSettings.autoOverige ? 'is-checked' : ''}" data-key="autoOverige">
                <div class="combo-option-left">
                    <div class="combo-option-icon icon-overige">
                        <span class="material-icons">playlist_add</span>
                    </div>
                    <span class="combo-option-title">Overige taak automatisch ervoor zetten</span>
                </div>
                <div class="combo-checkbox">
                    <span class="material-icons">check</span>
                </div>
            </div>
        </div>

        <div class="modal-footer" style="margin-top: 14px;">
            <button type="button" class="modal-btn-secondary" id="btn-cancel-combo">Annuleren</button>
            <button type="button" class="btn" id="btn-save-combo">Opslaan</button>
        </div>
    `;

    await showModal(modalContent);

    const rows = document.querySelectorAll('.combo-option-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const key = row.getAttribute('data-key');
            tempSettings[key] = !tempSettings[key];
            row.classList.toggle('is-checked', tempSettings[key]);
        });
    });

    const cancelBtn = document.getElementById('btn-cancel-combo');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    const saveBtn = document.getElementById('btn-save-combo');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveComboSettings(tempSettings);
            closeModal();
            showToast('notification', 'Samen indelen instellingen opgeslagen');
        });
    }
}
