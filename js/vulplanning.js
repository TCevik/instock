import { showToast, showConfirmModal } from './main.js';
import { openUnifiedImportModal } from './vulplanning/import-unified.js';
import { fillRoosterShifts, getAvailableUsers, getFillersData } from './vulplanning/rooster.js';
import { handleImportedColli } from './vulplanning/colli-invoer.js';
import { planningState, getDraggedTaskData } from './vulplanning/state.js';
import { timeToMinutes } from './vulplanning/time-utils.js';
import { triggerAutoSave } from './vulplanning/storage.js';
import { calculateTimelineBounds, renderTimelineAxis } from './vulplanning/timeline-axis.js';
import { generateTasksFromPathsAndColli } from './vulplanning/task-generator.js';
import { assignTaskToFiller, unassignTask, moveAssignedTask } from './vulplanning/task-actions.js';
import { renderTimelineRows } from './vulplanning/timeline-renderer.js';
import { renderUnassignedTasks } from './vulplanning/unassigned-renderer.js';
import { setupCustomTaskModal } from './vulplanning/custom-task-modal.js';
import { loadSavedPlanning } from './vulplanning/planning-loader.js';

window.__draggedTaskDataRef = getDraggedTaskData;

export { triggerAutoSave };

const stepInputView = document.getElementById('step-input-view');
const stepTimelineView = document.getElementById('step-timeline-view');
const btnUnifiedImport = document.getElementById('btn-unified-import');
const btnContinue = document.getElementById('btn-continue');
const btnBackToInput = document.getElementById('btn-back-to-input');
const btnAddCustomTask = document.getElementById('btn-add-custom-task');
const timelineWorkersList = document.getElementById('timeline-workers-list');
const timelineTracksContainer = document.getElementById('timeline-tracks-container');
const timelineSchedulePane = document.getElementById('timeline-schedule-pane');
const timelineHoursAxis = document.getElementById('timeline-hours-axis');
const unassignedTasksList = document.getElementById('unassigned-tasks-list');
const unassignedTasksSidebar = document.querySelector('.unassigned-tasks-sidebar');
const zoomLevelIndicator = document.getElementById('zoom-level-indicator');

function doRenderAxis() {
    renderTimelineAxis(timelineHoursAxis);
}

function doRenderRows() {
    renderTimelineRows({
        timelineWorkersList,
        timelineTracksContainer,
        timelineHoursAxis,
        unassignedTasksSidebar,
        onAssignTask: (taskId, fillerId, insertIndex) => {
            assignTaskToFiller(taskId, fillerId, insertIndex, {
                onRenderRows: doRenderRows,
                onRenderUnassigned: doRenderUnassigned
            });
        },
        onMoveTask: (fromFillerId, fromIndex, toFillerId, insertIndex) => {
            moveAssignedTask(fromFillerId, fromIndex, toFillerId, insertIndex, {
                onRenderRows: doRenderRows,
                onRenderUnassigned: doRenderUnassigned
            });
        },
        onUnassignTask: (fillerId, taskIndex) => {
            unassignTask(fillerId, taskIndex, {
                onRenderRows: doRenderRows,
                onRenderUnassigned: doRenderUnassigned
            });
        },
        onRenderRows: doRenderRows,
        onRenderUnassigned: doRenderUnassigned
    });
}

function doRenderUnassigned() {
    renderUnassignedTasks({
        unassignedTasksList,
        onRenderRows: doRenderRows,
        onRenderUnassigned: doRenderUnassigned,
        onUnassignTask: (fillerId, taskIndex) => {
            unassignTask(fillerId, taskIndex, {
                onRenderRows: doRenderRows,
                onRenderUnassigned: doRenderUnassigned
            });
        }
    });
}

function switchToTimelineView() {
    const fillers = getFillersData();
    if (!fillers || fillers.length === 0) {
        showToast('error', 'Voer ten minste één medewerker in.');
        return;
    }

    for (const f of fillers) {
        const displayName = f.name || 'Medewerker';
        if (!f.from || !f.to) {
            showToast('error', `Vul een begin- en eindtijd in voor ${displayName}.`);
            return;
        }

        const startMins = timeToMinutes(f.from);
        const endMins = timeToMinutes(f.to);

        if (startMins >= endMins) {
            showToast('error', `De begintijd van ${displayName} moet vroeger zijn dan de eindtijd.`);
            return;
        }
    }

    const existingOtherTasks = (planningState.unassignedTasks || []).filter(t => t.type === 'overige');
    const newTasks = generateTasksFromPathsAndColli();

    existingOtherTasks.forEach(ot => {
        if (!newTasks.some(nt => nt.id === ot.id)) {
            newTasks.push(ot);
        }
    });

    planningState.fillers = fillers;
    planningState.unassignedTasks = newTasks;
    planningState.assignedTasks = {};

    calculateTimelineBounds(fillers);

    stepInputView.style.display = 'none';
    stepTimelineView.style.display = 'flex';

    doRenderAxis();
    doRenderRows();
    doRenderUnassigned();
    restoreTimelineScroll();
    triggerAutoSave();
}

async function switchToInputView() {
    const hasAssignments = Object.values(planningState.assignedTasks || {}).some(list => Array.isArray(list) && list.length > 0);
    if (hasAssignments) {
        const confirmed = await showConfirmModal({
            title: 'Invoer aanpassen',
            message: 'Weet je het zeker? De huidige planning wordt hierbij verwijderd.',
            confirmText: 'Ja, doorgaan',
            cancelText: 'Annuleren',
            isDanger: true
        });
        if (!confirmed) return;
    }

    stepTimelineView.style.display = 'none';
    stepInputView.style.display = 'flex';
}

if (btnContinue) {
    btnContinue.addEventListener('click', switchToTimelineView);
}

if (btnBackToInput) {
    btnBackToInput.addEventListener('click', switchToInputView);
}

if (btnUnifiedImport) {
    btnUnifiedImport.addEventListener('click', () => {
        openUnifiedImportModal({
            onRoosterImport: (shifts) => {
                fillRoosterShifts(shifts);
            },
            onColliImport: (colliMap) => {
                handleImportedColli(colliMap);
            },
            availableUsers: getAvailableUsers()
        });
    });
}

const tabButtons = document.querySelectorAll('.unassigned-tab');
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        planningState.activeTab = btn.getAttribute('data-tab');
        doRenderUnassigned();
    });
});

if (unassignedTasksSidebar) {
    unassignedTasksSidebar.addEventListener('dragover', (e) => {
        e.preventDefault();
        unassignedTasksSidebar.classList.add('drag-over');
    });

    unassignedTasksSidebar.addEventListener('dragleave', (e) => {
        if (!unassignedTasksSidebar.contains(e.relatedTarget)) {
            unassignedTasksSidebar.classList.remove('drag-over');
        }
    });

    unassignedTasksSidebar.addEventListener('drop', (e) => {
        e.preventDefault();
        unassignedTasksSidebar.classList.remove('drag-over');
        unassignedTasksSidebar.classList.remove('drag-active');

        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            if (data.source === 'assigned' && data.fillerId && data.taskIndex !== undefined) {
                unassignTask(data.fillerId, data.taskIndex, {
                    onRenderRows: doRenderRows,
                    onRenderUnassigned: doRenderUnassigned
                });
            }
        } catch (_) {}
    });
}

const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

function updateZoom() {
    if (zoomLevelIndicator) {
        zoomLevelIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
    }
    doRenderAxis();
    doRenderRows();
}

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
        planningState.zoom = Math.min(2.5, planningState.zoom + 0.25);
        updateZoom();
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
        planningState.zoom = Math.max(0.5, planningState.zoom - 0.25);
        updateZoom();
    });
}

if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
        planningState.zoom = 1;
        updateZoom();
    });
}

const TIMELINE_SCROLL_KEY = 'instock_timeline_scroll_left';

function restoreTimelineScroll() {
    if (!timelineSchedulePane) return;
    const saved = localStorage.getItem(TIMELINE_SCROLL_KEY);
    if (saved !== null) {
        const left = parseFloat(saved);
        if (!isNaN(left)) {
            requestAnimationFrame(() => {
                timelineSchedulePane.scrollLeft = left;
            });
        }
    }
}

if (timelineSchedulePane) {
    let scrollSaveTimeout = null;
    timelineSchedulePane.addEventListener('scroll', () => {
        if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
            localStorage.setItem(TIMELINE_SCROLL_KEY, String(timelineSchedulePane.scrollLeft));
        }, 150);
    }, { passive: true });
}

setupCustomTaskModal(btnAddCustomTask, {
    onRenderUnassigned: doRenderUnassigned
});

loadSavedPlanning({
    stepInputView,
    stepTimelineView,
    onRenderAxis: doRenderAxis,
    onRenderRows: doRenderRows,
    onRenderUnassigned: doRenderUnassigned,
    onRestoreScroll: restoreTimelineScroll
});
