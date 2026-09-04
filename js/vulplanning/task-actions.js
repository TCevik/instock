import { planningState } from './state.js';
import { triggerAutoSave } from './storage.js';

export function assignTaskToFiller(taskId, fillerId, insertIndex = null, callbacks = {}, customDuration = null) {
    let task = planningState.unassignedTasks.find(t => t.id === taskId);
    if (!task && (taskId === 'pauze_template' || taskId.startsWith('pauze'))) {
        task = {
            id: 'pauze_template',
            type: 'pauze',
            title: 'Pauze',
            duration: customDuration || 30,
            colli: 0
        };
    }
    if (!task) return;

    if (!planningState.assignedTasks[fillerId]) {
        planningState.assignedTasks[fillerId] = [];
    }

    let taskToInsert = null;
    if (task.type === 'overige' || task.type === 'pauze') {
        const dur = customDuration || task.duration || 30;
        taskToInsert = {
            ...task,
            id: `${task.type}_inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            templateId: task.id,
            duration: dur,
            origTitle: task.title,
            origDuration: dur
        };
    } else {
        const taskIdx = planningState.unassignedTasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
            planningState.unassignedTasks.splice(taskIdx, 1);
        }
        if (!task.origTitle) task.origTitle = task.title;
        if (!task.origDuration) task.origDuration = task.duration;
        taskToInsert = task;
    }

    const list = planningState.assignedTasks[fillerId];
    if (insertIndex !== null && insertIndex >= 0 && insertIndex <= list.length) {
        list.splice(insertIndex, 0, taskToInsert);
    } else {
        list.push(taskToInsert);
    }

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave();
}

export function unassignTask(fillerId, taskIndex, callbacks = {}) {
    const assignedList = planningState.assignedTasks[fillerId];
    if (!assignedList || taskIndex < 0 || taskIndex >= assignedList.length) return;

    const [task] = assignedList.splice(taskIndex, 1);
    if (task.type !== 'overige' && task.type !== 'pauze') {
        if (task.origTitle) {
            task.title = task.origTitle;
        }
        if (task.origDuration) {
            task.duration = task.origDuration;
        }

        if (typeof task.origOrder === 'number') {
            let insertIdx = planningState.unassignedTasks.findIndex(t => typeof t.origOrder === 'number' && t.origOrder > task.origOrder);
            if (insertIdx === -1) {
                const firstOverigeIdx = planningState.unassignedTasks.findIndex(t => t.type === 'overige');
                if (firstOverigeIdx !== -1) {
                    insertIdx = firstOverigeIdx;
                }
            }
            if (insertIdx !== -1) {
                planningState.unassignedTasks.splice(insertIdx, 0, task);
            } else {
                planningState.unassignedTasks.push(task);
            }
        } else {
            planningState.unassignedTasks.push(task);
        }
    } else if (task.templateId) {
        const template = planningState.unassignedTasks.find(t => t.id === task.templateId);
        if (template && task.origDuration !== undefined) {
            template.duration = task.origDuration;
        }
    }

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave();
}

export function moveAssignedTask(fromFillerId, fromIndex, toFillerId, insertIndex = null, callbacks = {}) {
    const fromList = planningState.assignedTasks[fromFillerId];
    if (!fromList || fromIndex < 0 || fromIndex >= fromList.length) return;

    const [task] = fromList.splice(fromIndex, 1);
    if (!planningState.assignedTasks[toFillerId]) {
        planningState.assignedTasks[toFillerId] = [];
    }

    const toList = planningState.assignedTasks[toFillerId];
    if (insertIndex !== null && insertIndex >= 0) {
        const boundedIndex = Math.min(insertIndex, toList.length);
        toList.splice(boundedIndex, 0, task);
    } else {
        toList.push(task);
    }

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave();
}
