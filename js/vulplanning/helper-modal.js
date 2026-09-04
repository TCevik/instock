import { showModal, closeModal, showToast } from '../main.js';
import { planningState } from './state.js';
import { getFillerShiftDuration, formatDuration } from './time-utils.js';
import { applyMultiHelpers } from './task-actions.js';

const MAX_HELPERS = 4;

export async function openHelperModal(options) {
    const {
        sourceFillerId,
        sourceTaskIndex,
        targetFillerId,
        targetIndex = null,
        callbacks = {}
    } = options;

    const sourceFiller = planningState.fillers.find(f => f.id === sourceFillerId);
    const sourceList = planningState.assignedTasks[sourceFillerId];

    if (!sourceFiller || !sourceList || sourceTaskIndex < 0 || sourceTaskIndex >= sourceList.length) {
        return;
    }

    const task = sourceList[sourceTaskIndex];
    const rootTaskId = task.parentTaskId || task.id;
    const baseTitle = task.origTitle || task.title.replace(/\s*\(Helper\)$/, '');

    const existingHelpers = [];
    planningState.fillers.forEach(f => {
        if (f.id === sourceFillerId) return;
        (planningState.assignedTasks[f.id] || []).forEach((t, idx) => {
            if (t.isHelper && t.parentTaskId === rootTaskId) {
                existingHelpers.push({
                    fillerId: f.id,
                    duration: t.duration,
                    targetIndex: idx
                });
            }
        });
    });

    const totalTaskDuration = task.duration + existingHelpers.reduce((sum, h) => sum + h.duration, 0);

    const helpers = [];
    if (existingHelpers.length > 0) {
        existingHelpers.forEach(h => helpers.push({ ...h }));
    }

    if (targetFillerId && targetFillerId !== sourceFillerId) {
        const alreadyExists = helpers.some(h => h.fillerId === targetFillerId);
        if (!alreadyExists && helpers.length < MAX_HELPERS) {
            helpers.push({
                fillerId: targetFillerId,
                duration: 0,
                targetIndex
            });
        }
    }

    if (helpers.length === 0) {
        const firstCandidate = planningState.fillers.find(f => f.id !== sourceFillerId);
        if (firstCandidate) {
            helpers.push({
                fillerId: firstCandidate.id,
                duration: 0,
                targetIndex: null
            });
        }
    }

    function calculateHelperRemaining(fillerId) {
        const filler = planningState.fillers.find(f => f.id === fillerId);
        if (!filler) return 0;
        const shift = getFillerShiftDuration(filler);
        const assigned = (planningState.assignedTasks[fillerId] || []).reduce((sum, t) => {
            if (t.isHelper && t.parentTaskId === rootTaskId) return sum;
            return sum + t.duration;
        }, 0);
        return Math.max(0, shift - assigned);
    }

    function calculateGiverNeeded() {
        const shift = getFillerShiftDuration(sourceFiller);
        const assignedWithout = (planningState.assignedTasks[sourceFillerId] || []).reduce((sum, t) => {
            if (t.id === task.id) return sum;
            return sum + t.duration;
        }, 0);
        return Math.max(0, shift - assignedWithout);
    }

    function distributeEqual() {
        const totalPeople = 1 + helpers.length;
        const share = Math.floor(totalTaskDuration / totalPeople);
        let remainder = totalTaskDuration - (share * totalPeople);

        helpers.forEach(h => {
            h.duration = share + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
        });
    }

    distributeEqual();

    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Helpers Toevoegen</h2>
            <p class="modal-subtitle">Verdeel <strong>${baseTitle}</strong> (${formatDuration(totalTaskDuration)}) met maximaal ${MAX_HELPERS} helpers</p>
        </div>
        <form id="multiHelperForm" class="modal-form">
            <div class="helper-presets-grid" style="grid-template-columns: repeat(2, 1fr);">
                <button type="button" class="modal-btn-secondary helper-preset-btn" id="btnQuickEqual">
                    <span class="helper-preset-title">Gelijk verdelen</span>
                    <span class="helper-preset-desc" id="quickEqualDesc">Gelijke verdeling over allen</span>
                </button>
                <button type="button" class="modal-btn-secondary helper-preset-btn" id="btnQuickGiver">
                    <span class="helper-preset-title">Volmaken bij ${sourceFiller.name || 'Gever'}</span>
                    <span class="helper-preset-desc" id="quickGiverDesc">Houdt rooster vol</span>
                </button>
            </div>

            <div class="helpers-header-row">
                <span class="unassigned-section-label" id="helpersSectionCount">Helpers (${helpers.length}/${MAX_HELPERS})</span>
                <button type="button" class="btn-add-helper" id="btnAddHelperBtn">
                    <span class="material-icons">add</span>
                    <span>Helper Toevoegen</span>
                </button>
            </div>

            <div class="helpers-list-container" id="helpersListContainer"></div>

            <div class="helper-live-preview" id="multiHelperPreview"></div>

            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btnCancelMultiHelper">Annuleren</button>
                <button type="submit" class="btn">Helpers Toepassen</button>
            </div>
        </form>
    `;

    const overlay = await showModal(modalContent);
    const form = overlay.querySelector('#multiHelperForm');
    const cancelBtn = overlay.querySelector('#btnCancelMultiHelper');
    const btnAdd = overlay.querySelector('#btnAddHelperBtn');
    const btnQuickEqual = overlay.querySelector('#btnQuickEqual');
    const btnQuickGiver = overlay.querySelector('#btnQuickGiver');
    const helpersContainer = overlay.querySelector('#helpersListContainer');
    const previewContainer = overlay.querySelector('#multiHelperPreview');
    const countLabel = overlay.querySelector('#helpersSectionCount');

    function renderHelpersList() {
        helpersContainer.innerHTML = '';
        countLabel.textContent = `Helpers (${helpers.length}/${MAX_HELPERS})`;

        const availableFillers = planningState.fillers.filter(f => f.id !== sourceFillerId);
        const canAddMore = helpers.length < MAX_HELPERS && helpers.length < availableFillers.length;
        btnAdd.style.display = canAddMore ? 'inline-flex' : 'none';

        helpers.forEach((helper, idx) => {
            const card = document.createElement('div');
            card.className = 'helper-item-card';

            const remaining = calculateHelperRemaining(helper.fillerId);
            const canFill = remaining > 0 && remaining < totalTaskDuration;

            const selectedIds = new Set(helpers.map((h, i) => i !== idx ? h.fillerId : null).filter(Boolean));

            let optionsHtml = '';
            availableFillers.forEach(f => {
                const disabled = selectedIds.has(f.id);
                optionsHtml += `<option value="${f.id}" ${f.id === helper.fillerId ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${f.name || 'Medewerker'}</option>`;
            });

            card.innerHTML = `
                <div class="helper-item-top">
                    <select class="modal-input helper-select" data-index="${idx}">
                        ${optionsHtml}
                    </select>
                    ${helpers.length > 1 ? `
                        <button type="button" class="btn-remove-helper" data-index="${idx}" title="Helper verwijderen">
                            <span class="material-icons">delete_outline</span>
                        </button>
                    ` : ''}
                </div>
                <div class="helper-item-actions">
                    <button type="button" class="helper-quick-btn" data-index="${idx}" ${!canFill ? 'disabled' : ''}>
                        ${canFill ? `Volmaken (${remaining}m)` : `Volmaken (${remaining}m over)`}
                    </button>
                    <div class="helper-input-wrap">
                        <input type="number" min="1" max="${totalTaskDuration}" class="modal-input helper-mins-input" data-index="${idx}" value="${helper.duration}">
                        <span class="helper-input-unit">min</span>
                    </div>
                </div>
            `;

            helpersContainer.appendChild(card);
        });

        attachCardEvents();
        updatePreview();
        updateQuickButtons();
    }

    function updateQuickButtons() {
        const giverNeeded = calculateGiverNeeded();
        const canFillGiver = giverNeeded > 0 && giverNeeded < totalTaskDuration;
        btnQuickGiver.disabled = !canFillGiver;
        const giverDesc = overlay.querySelector('#quickGiverDesc');
        if (giverDesc) {
            giverDesc.textContent = canFillGiver ? `${giverNeeded}m behouden` : `${giverNeeded}m nodig`;
        }
    }

    function updatePreview() {
        const sumHelpers = helpers.reduce((sum, h) => sum + (parseInt(h.duration, 10) || 0), 0);
        const giverMins = Math.max(0, totalTaskDuration - sumHelpers);

        let previewHtml = `
            <div class="helper-preview-card">
                <span class="helper-preview-label">${sourceFiller.name || 'Gever'}</span>
                <span class="helper-preview-val">${giverMins} min</span>
            </div>
        `;

        helpers.forEach(h => {
            const f = planningState.fillers.find(fl => fl.id === h.fillerId);
            previewHtml += `
                <div class="helper-preview-card is-helper-target">
                    <span class="helper-preview-label">${f ? f.name : 'Helper'}</span>
                    <span class="helper-preview-val">${h.duration || 0} min</span>
                </div>
            `;
        });

        previewContainer.innerHTML = previewHtml;
    }

    function attachCardEvents() {
        overlay.querySelectorAll('.helper-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                const newId = parseInt(e.target.value, 10);
                if (helpers[idx]) {
                    helpers[idx].fillerId = newId;
                    renderHelpersList();
                }
            });
        });

        overlay.querySelectorAll('.btn-remove-helper').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                if (helpers.length > 1 && idx >= 0 && idx < helpers.length) {
                    helpers.splice(idx, 1);
                    distributeEqual();
                    renderHelpersList();
                }
            });
        });

        overlay.querySelectorAll('.helper-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                if (helpers[idx]) {
                    const remaining = calculateHelperRemaining(helpers[idx].fillerId);
                    if (remaining > 0 && remaining < totalTaskDuration) {
                        helpers[idx].duration = remaining;
                        const input = overlay.querySelector(`.helper-mins-input[data-index="${idx}"]`);
                        if (input) input.value = remaining;
                        updatePreview();
                    }
                }
            });
        });

        overlay.querySelectorAll('.helper-mins-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                let val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 0) val = 0;
                if (val > totalTaskDuration) {
                    val = totalTaskDuration;
                    e.target.value = val;
                }
                if (helpers[idx]) {
                    helpers[idx].duration = val;
                    updatePreview();
                }
            });
        });
    }

    btnQuickEqual.addEventListener('click', () => {
        distributeEqual();
        renderHelpersList();
    });

    btnQuickGiver.addEventListener('click', () => {
        const giverNeeded = calculateGiverNeeded();
        if (giverNeeded > 0 && giverNeeded < totalTaskDuration) {
            const remainingForHelpers = totalTaskDuration - giverNeeded;
            const share = Math.floor(remainingForHelpers / helpers.length);
            let remainder = remainingForHelpers - (share * helpers.length);

            helpers.forEach(h => {
                h.duration = share + (remainder > 0 ? 1 : 0);
                if (remainder > 0) remainder--;
            });
            renderHelpersList();
        }
    });

    btnAdd.addEventListener('click', () => {
        if (helpers.length >= MAX_HELPERS) return;
        const existingIds = new Set(helpers.map(h => h.fillerId));
        existingIds.add(sourceFillerId);
        const candidate = planningState.fillers.find(f => !existingIds.has(f.id));
        if (candidate) {
            helpers.push({
                fillerId: candidate.id,
                duration: 0,
                targetIndex: null
            });
            distributeEqual();
            renderHelpersList();
        }
    });

    cancelBtn.addEventListener('click', () => closeModal(overlay));

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const sumHelpers = helpers.reduce((sum, h) => sum + (parseInt(h.duration, 10) || 0), 0);
        const giverDuration = Math.max(0, totalTaskDuration - sumHelpers);

        closeModal(overlay);

        applyMultiHelpers({
            sourceFillerId,
            sourceTaskIndex,
            giverDuration,
            helpers,
            callbacks
        });

        showToast('notification', `${helpers.length} helper(s) toegewezen voor ${baseTitle}`);
    });

    renderHelpersList();
}
