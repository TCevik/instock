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
import { openComboSettingsModal, loadComboSettings } from './vulplanning/combo-settings-modal.js';
import { initHistory, setupHistoryShortcuts } from './vulplanning/history.js';
import { renderMobilePlanningView } from './vulplanning/mobile-view.js';
import { hideCustomTooltip } from './vulplanning/tooltip.js';
import { setupPrintPlanning } from './vulplanning/print-planning.js';

window.__draggedTaskDataRef = getDraggedTaskData;

export { triggerAutoSave };

const stepInputView = document.getElementById('step-input-view');
const stepTimelineView = document.getElementById('step-timeline-view');
const btnBackToTimeline = document.getElementById('btn-back-to-timeline');
const btnUnifiedImport = document.getElementById('btn-unified-import');
const btnContinue = document.getElementById('btn-continue');
const btnBackToInput = document.getElementById('btn-back-to-input');
const btnPrintPlanning = document.getElementById('btn-print-planning');
const btnAddCustomTask = document.getElementById('btn-add-custom-task');
const btnComboSettings = document.getElementById('btn-combo-settings');
const timelineWorkersList = document.getElementById('timeline-workers-list');
const timelineTracksContainer = document.getElementById('timeline-tracks-container');
const timelineSchedulePane = document.getElementById('timeline-schedule-pane');
const timelineHoursAxis = document.getElementById('timeline-hours-axis');
const unassignedTasksList = document.getElementById('unassigned-tasks-list');
const assignedTasksList = document.getElementById('assigned-tasks-list');
const unassignedTasksSidebar = document.querySelector('.unassigned-tasks-sidebar');
const zoomLevelIndicator = document.getElementById('zoom-level-indicator');
const mobilePlanningView = document.getElementById('mobile-planning-view');

const initialSavedZoom = localStorage.getItem('instock_planner_zoom');
if (initialSavedZoom !== null) {
    const parsed = parseFloat(initialSavedZoom);
    if (!isNaN(parsed)) {
        planningState.zoom = parsed;
        if (zoomLevelIndicator) {
            zoomLevelIndicator.textContent = `${Math.round(parsed * 100)}%`;
        }
    }
}

function doRenderAxis() {
    renderTimelineAxis(timelineHoursAxis);
}

function doRenderRows() {
    renderTimelineRows({
        timelineWorkersList,
        timelineTracksContainer,
        timelineHoursAxis,
        unassignedTasksSidebar,
        onAssignTask: (taskId, fillerId, insertIndex, customDuration) => {
            assignTaskToFiller(taskId, fillerId, insertIndex, {
                onRenderRows: doRenderRows,
                onRenderUnassigned: doRenderUnassigned
            }, customDuration);
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
    doRenderMobile();
}

function doRenderMobile() {
    renderMobilePlanningView(mobilePlanningView);
}

function doRenderUnassigned() {
    const activeTab = planningState.activeTab || 'vullen';
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === activeTab);
    });
    renderUnassignedTasks({
        unassignedTasksList,
        assignedTasksList,
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

async function switchToTimelineView() {
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

    const hasAssignments = Object.values(planningState.assignedTasks || {}).some(list => Array.isArray(list) && list.length > 0);
    if (hasAssignments) {
        const confirmed = await showConfirmModal({
            title: 'Planning maken',
            message: 'Weet je het zeker? De huidige planning wordt hierbij verwijderd.',
            confirmText: 'Ja, doorgaan',
            cancelText: 'Annuleren',
            isDanger: true
        });
        if (!confirmed) return;
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
    localStorage.setItem('instock_planner_step', 'timeline');

    if (btnBackToTimeline) {
        btnBackToTimeline.style.display = 'none';
    }

    doRenderAxis();
    doRenderRows();
    doRenderUnassigned();
    restoreTimelineScroll();
    initHistory({
        onRenderAxis: doRenderAxis,
        onRenderRows: doRenderRows,
        onRenderUnassigned: doRenderUnassigned
    });
    triggerAutoSave();
}

function switchToInputView() {
    if (window.innerWidth <= 768) return;

    stepTimelineView.style.display = 'none';
    stepInputView.style.display = 'flex';
    if (btnBackToTimeline) {
        btnBackToTimeline.style.display = 'inline-flex';
    }
}

if (btnContinue) {
    btnContinue.addEventListener('click', switchToTimelineView);
}

if (btnBackToInput) {
    btnBackToInput.addEventListener('click', switchToInputView);
}

if (btnBackToTimeline) {
    btnBackToTimeline.addEventListener('click', () => {
        stepInputView.style.display = 'none';
        stepTimelineView.style.display = 'flex';
        btnBackToTimeline.style.display = 'none';
    });
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
        localStorage.setItem('instock_planner_tab', planningState.activeTab);
        doRenderUnassigned();
    });
});

if (unassignedTasksSidebar) {
    unassignedTasksSidebar.addEventListener('dragover', (e) => {
        const draggedData = getDraggedTaskData();
        if (draggedData && draggedData.source === 'assigned') {
            e.preventDefault();
            unassignedTasksSidebar.classList.add('drag-over');
        }
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

const TIMELINE_SCROLL_LEFT_KEY = 'instock_timeline_scroll_left';
const TIMELINE_SCROLL_TOP_KEY = 'instock_timeline_scroll_top';
const INPUT_SCROLL_TOP_KEY = 'instock_planner_input_scroll_top';
const UNASSIGNED_SCROLL_TOP_KEY = 'instock_planner_unassigned_scroll_top';

const timelineBoardBody = document.querySelector('.timeline-board-body');
const timelineBoardContainer = document.querySelector('.timeline-board-container');

const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');

function applyZoom(nextZoom) {
    nextZoom = Math.max(0.5, Math.min(2.5, Math.round(nextZoom * 100) / 100));
    if (nextZoom === planningState.zoom) return;

    const oldZoom = planningState.zoom;
    let targetScrollLeft = null;

    if (timelineBoardBody && oldZoom > 0) {
        const workersPane = document.querySelector('.timeline-workers-pane');
        const workersWidth = workersPane ? workersPane.offsetWidth : 360;
        const visibleWidth = Math.max(0, timelineBoardBody.clientWidth - workersWidth);
        const centerTimePx = timelineBoardBody.scrollLeft + (visibleWidth > 0 ? visibleWidth / 2 : timelineBoardBody.clientWidth / 2);
        const ratio = nextZoom / oldZoom;
        targetScrollLeft = Math.max(0, (centerTimePx * ratio) - (visibleWidth > 0 ? visibleWidth / 2 : timelineBoardBody.clientWidth / 2));
    }

    planningState.zoom = nextZoom;

    if (zoomLevelIndicator) {
        zoomLevelIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
    }
    localStorage.setItem('instock_planner_zoom', String(planningState.zoom));
    doRenderAxis();
    doRenderRows();

    if (timelineBoardBody && targetScrollLeft !== null) {
        timelineBoardBody.scrollLeft = targetScrollLeft;
        localStorage.setItem(TIMELINE_SCROLL_LEFT_KEY, String(targetScrollLeft));
    }
}

function updateZoom(newZoom) {
    if (typeof newZoom === 'number' && newZoom !== planningState.zoom) {
        applyZoom(newZoom);
        return;
    }
    if (zoomLevelIndicator) {
        zoomLevelIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
    }
    localStorage.setItem('instock_planner_zoom', String(planningState.zoom));
    doRenderAxis();
    doRenderRows();
}

if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
        applyZoom(planningState.zoom + 0.25);
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
        applyZoom(planningState.zoom - 0.25);
    });
}

if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
        applyZoom(1);
    });
}

function restoreTimelineScroll() {
    const boardBody = document.querySelector('.timeline-board-body');
    if (boardBody) {
        const savedLeft = localStorage.getItem(TIMELINE_SCROLL_LEFT_KEY);
        const savedTop = localStorage.getItem(TIMELINE_SCROLL_TOP_KEY);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (savedLeft !== null) {
                    const left = parseFloat(savedLeft);
                    if (!isNaN(left)) boardBody.scrollLeft = left;
                }
                if (savedTop !== null) {
                    const top = parseFloat(savedTop);
                    if (!isNaN(top)) boardBody.scrollTop = top;
                }
            });
        });
    }

    const unassignedSection = document.querySelector('.unassigned-list-section');
    if (unassignedSection) {
        const savedUnassignedTop = localStorage.getItem(UNASSIGNED_SCROLL_TOP_KEY);
        if (savedUnassignedTop !== null) {
            const top = parseFloat(savedUnassignedTop);
            if (!isNaN(top)) {
                requestAnimationFrame(() => {
                    unassignedSection.scrollTop = top;
                });
            }
        }
    }
}

if (timelineBoardBody) {
    let scrollSaveTimeout = null;
    timelineBoardBody.addEventListener('scroll', () => {
        if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout);
        scrollSaveTimeout = setTimeout(() => {
            localStorage.setItem(TIMELINE_SCROLL_LEFT_KEY, String(timelineBoardBody.scrollLeft));
            localStorage.setItem(TIMELINE_SCROLL_TOP_KEY, String(timelineBoardBody.scrollTop));
        }, 150);
    }, { passive: true });

    let isRightDown = false;
    let isRightDragging = false;
    let hasRightDragged = false;
    let rightDragStartX = 0;
    let rightDragStartY = 0;
    let rightDragStartScrollLeft = 0;
    let rightDragStartScrollTop = 0;

    const dragTarget = timelineBoardContainer || timelineBoardBody;
    dragTarget.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            applyZoom(planningState.zoom + delta);
        }
    }, { passive: false });

    dragTarget.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return;
        if (e.target.closest('button, input, select, a')) return;
        isRightDown = true;
        isRightDragging = false;
        hasRightDragged = false;
        rightDragStartX = e.clientX;
        rightDragStartY = e.clientY;
        rightDragStartScrollLeft = timelineBoardBody.scrollLeft;
        rightDragStartScrollTop = timelineBoardBody.scrollTop;
    });

    window.addEventListener('mousemove', (e) => {
        if (!isRightDown) return;

        const dx = e.clientX - rightDragStartX;
        const dy = e.clientY - rightDragStartY;

        if (!isRightDragging) {
            if (Math.hypot(dx, dy) >= 5) {
                isRightDragging = true;
                hasRightDragged = true;
                hideCustomTooltip();
                document.body.style.userSelect = 'none';
                document.body.style.cursor = 'grabbing';
            }
        }

        if (isRightDragging) {
            timelineBoardBody.scrollLeft = rightDragStartScrollLeft - dx;
            timelineBoardBody.scrollTop = rightDragStartScrollTop - dy;
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 2 && isRightDown) {
            isRightDown = false;
            isRightDragging = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            setTimeout(() => {
                hasRightDragged = false;
            }, 100);
        }
    });

    window.addEventListener('contextmenu', (e) => {
        if (hasRightDragged) {
            e.preventDefault();
            e.stopPropagation();
            hasRightDragged = false;
        }
    }, true);

    window.addEventListener('blur', () => {
        if (isRightDown) {
            isRightDown = false;
            isRightDragging = false;
            hasRightDragged = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }
    });
}

const inputScrollContainer = document.querySelector('.vulplanning-input-scroll-container');
if (inputScrollContainer) {
    const savedInputTop = localStorage.getItem(INPUT_SCROLL_TOP_KEY);
    if (savedInputTop !== null) {
        const top = parseFloat(savedInputTop);
        if (!isNaN(top)) {
            requestAnimationFrame(() => {
                inputScrollContainer.scrollTop = top;
            });
        }
    }
    let inputScrollTimeout = null;
    inputScrollContainer.addEventListener('scroll', () => {
        if (inputScrollTimeout) clearTimeout(inputScrollTimeout);
        inputScrollTimeout = setTimeout(() => {
            localStorage.setItem(INPUT_SCROLL_TOP_KEY, String(inputScrollContainer.scrollTop));
        }, 150);
    }, { passive: true });
}

const unassignedListSection = document.querySelector('.unassigned-list-section');
if (unassignedListSection) {
    let unassignedScrollTimeout = null;
    unassignedListSection.addEventListener('scroll', () => {
        if (unassignedScrollTimeout) clearTimeout(unassignedScrollTimeout);
        unassignedScrollTimeout = setTimeout(() => {
            localStorage.setItem(UNASSIGNED_SCROLL_TOP_KEY, String(unassignedListSection.scrollTop));
        }, 150);
    }, { passive: true });
}

setupCustomTaskModal(btnAddCustomTask, {
    onRenderUnassigned: doRenderUnassigned
});

setupPrintPlanning(btnPrintPlanning);

loadComboSettings();

if (btnComboSettings) {
    btnComboSettings.addEventListener('click', () => openComboSettingsModal({
        onRenderUnassigned: doRenderUnassigned
    }));
}

setupHistoryShortcuts({
    onRenderAxis: doRenderAxis,
    onRenderRows: doRenderRows,
    onRenderUnassigned: doRenderUnassigned
});

loadSavedPlanning({
    stepInputView,
    stepTimelineView,
    onRenderAxis: doRenderAxis,
    onRenderRows: doRenderRows,
    onRenderUnassigned: doRenderUnassigned,
    onRestoreScroll: restoreTimelineScroll
}).then(() => {
    initHistory({
        onRenderAxis: doRenderAxis,
        onRenderRows: doRenderRows,
        onRenderUnassigned: doRenderUnassigned
    });
});

let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
    if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        if (window.innerWidth <= 768) {
            doRenderMobile();
        }
    }
});
