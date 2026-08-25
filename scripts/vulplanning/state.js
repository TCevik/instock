import {
    parseNameAndSubtitle,
    getFillerPause as logicGetFillerPause,
    getFillerBreakTime as logicGetFillerBreakTime,
    getAvailableTime as logicGetAvailableTime,
    getFillerActualEndTime as logicGetFillerActualEndTime,
    getTaskDuration as logicGetTaskDuration,
    getEffectiveTaskDuration as logicGetEffectiveTaskDuration,
    getFillerColli as logicGetFillerColli,
    getFillerTotalTime as logicGetFillerTotalTime,
    getFillerProductivity as logicGetFillerProductivity,
    getProductivityStatusClass,
    formatTimeInputValue,
    getTaskAssignment as logicGetTaskAssignment,
    getBaseTaskDuration as logicGetBaseTaskDuration,
    getHelperTaskIdsForMainTask as logicGetHelperTaskIdsForMainTask
} from './planning-logic.js';

export const state = {
    selectedFillers: [],
    pathColli: {},
    fillerTasks: {},
    helpers: {},
    activeTab: 'fill',
    fillerSortOrder: 'start-asc',
    otherTimes: {
        "Bulk nalopen": 30,
        "Acties terugvullen": 15,
        "Magazijn opruimen": 45,
        "Tellen": 30,
        "Pauze": 0
    },
    instanceTimes: {},
    fillerBreaks: {},
    actualEndTimes: {},
    nonFillers: [],
    hiddenFillers: [],
    showNonFillers: false,
    showReallyHidden: false,
    autoPairSettings: {
        enabled: false,
        prependRestanten: false,
        prependOtherTask: false,
        selectedOtherTask: ""
    },
    timelineZoom: 1.0
};

export const resetState = () => {
    state.selectedFillers = [];
    state.pathColli = {};
    state.fillerTasks = {};
    state.helpers = {};
    state.instanceTimes = {};
    state.fillerBreaks = {};
    state.actualEndTimes = {};
    state.nonFillers = [];
    state.hiddenFillers = [];
    state.showNonFillers = false;
    state.showReallyHidden = false;
};

export const createPersonNameElement = (fullName, titleClass = 'person-name', subtitleClass = 'person-subtitle', containerClass = 'person-info') => {
    const { name, subtitle } = parseNameAndSubtitle(fullName);
    const container = document.createElement('div');
    container.className = containerClass;
    
    const nameEl = document.createElement('span');
    nameEl.className = titleClass;
    nameEl.textContent = name;
    container.appendChild(nameEl);

    if (subtitle) {
        const subEl = document.createElement('span');
        subEl.className = subtitleClass;
        subEl.textContent = subtitle;
        container.appendChild(subEl);
    }
    return container;
};

export const getFillerPause = (displayName) => logicGetFillerPause(displayName, state);
export const getFillerBreakTime = (displayName) => logicGetFillerBreakTime(displayName, state);
export const getAvailableTime = (displayName) => logicGetAvailableTime(displayName, state);
export const getFillerActualEndTime = (displayName) => logicGetFillerActualEndTime(displayName, state);
export const getTaskDuration = (taskId) => logicGetTaskDuration(taskId, state);
export const getEffectiveTaskDuration = (taskId) => logicGetEffectiveTaskDuration(taskId, state);
export const getFillerColli = (displayName) => logicGetFillerColli(displayName, state);
export const getFillerTotalTime = (filler) => logicGetFillerTotalTime(filler, state);
export const getFillerProductivity = (displayName) => logicGetFillerProductivity(displayName, state);
export { getProductivityStatusClass, formatTimeInputValue };
export const getTaskAssignment = (taskId) => logicGetTaskAssignment(taskId, state);
export const getBaseTaskDuration = (taskId) => logicGetBaseTaskDuration(taskId, state);
export const getHelperTaskIdsForMainTask = (mainTaskId) => logicGetHelperTaskIdsForMainTask(mainTaskId, state);

export const removeTaskFromAll = (taskId) => {
    Object.keys(state.fillerTasks).forEach(filler => {
        state.fillerTasks[filler] = state.fillerTasks[filler].filter(id => {
            if (id === taskId) return false;
            if (!taskId.includes('_helper') && id.startsWith(`${taskId}_helper`)) return false;
            return true;
        });
    });
};

export const getClosestTask = (container, x, y) => {
    const cards = [...container.querySelectorAll('.task-card:not(.dragging):not(.task-card-placeholder)')];
    if (cards.length === 0) return null;
    let closest = null;
    let minDistance = Infinity;
    cards.forEach(card => {
        const box = card.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance < minDistance) {
            minDistance = distance;
            closest = {
                card: card,
                before: x < centerX
            };
        }
    });
    return closest;
};
