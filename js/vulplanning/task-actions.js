import { planningState } from './state.js';
import { triggerAutoSave } from './storage.js';
import { showToast } from '../main.js';
import { hideCustomTooltip } from './tooltip.js';

export function getComboTasksForTask(task) {
    if (!task || task.type !== 'vullen') {
        return { prependedTasks: [], appendedTasks: [] };
    }

    const combo = planningState.comboSettings || {
        autoRestanten: true,
        autoSpiegelen: true,
        autoOverige: false
    };

    const pathName = task.pathName || task.title.replace(/\s*\([^)]*\)/g, '').trim();
    const prependedTasks = [];
    const appendedTasks = [];

    if (combo.autoOverige) {
        let oTask = null;
        if (combo.selectedOverigeTaskId) {
            oTask = planningState.unassignedTasks.find(t => 
                t.type === 'overige' && !t.isHelper && String(t.id) === String(combo.selectedOverigeTaskId)
            );
        }
        if (!oTask && combo.selectedOverigeTitle) {
            oTask = planningState.unassignedTasks.find(t => 
                t.type === 'overige' && !t.isHelper && t.title.toLowerCase().trim() === combo.selectedOverigeTitle.toLowerCase().trim()
            );
        }
        if (!oTask) {
            oTask = planningState.unassignedTasks.find(t => t.type === 'overige' && !t.isHelper);
        }
        if (!oTask && combo.selectedOverigeTitle) {
            const inAssigned = Object.values(planningState.assignedTasks || {}).flat().find(t => 
                t && t.type === 'overige' && !t.isHelper && (
                    (combo.selectedOverigeTaskId && String(t.templateId || t.id) === String(combo.selectedOverigeTaskId)) ||
                    (t.title && t.title.toLowerCase().trim() === combo.selectedOverigeTitle.toLowerCase().trim())
                )
            );
            if (inAssigned) {
                oTask = {
                    id: inAssigned.templateId || inAssigned.id,
                    type: 'overige',
                    title: inAssigned.origTitle || inAssigned.title,
                    duration: inAssigned.origDuration || inAssigned.duration || 30,
                    colli: 0
                };
            }
        }
        if (oTask) {
            prependedTasks.push({
                ...oTask,
                id: `combo_overige_${oTask.id}`,
                templateId: oTask.id,
                duration: oTask.duration || 30,
                origTitle: oTask.title,
                origDuration: oTask.duration || 30
            });
        }
    }

    if (combo.autoRestanten) {
        const rTask = planningState.unassignedTasks.find(t => 
            t.type === 'restanten' && 
            (t.pathName === pathName || t.title.toLowerCase().includes(pathName.toLowerCase()))
        );
        if (rTask) {
            prependedTasks.push(rTask);
        }
    }

    if (combo.autoSpiegelen) {
        const sTask = planningState.unassignedTasks.find(t => 
            t.type === 'spiegelen' && 
            (t.pathName === pathName || t.title.toLowerCase().includes(pathName.toLowerCase()))
        );
        if (sTask) {
            appendedTasks.push(sTask);
        }
    }

    return { prependedTasks, appendedTasks };
}

export function assignTaskToFiller(taskId, fillerId, insertIndex = null, callbacks = {}, customDuration = null) {
    hideCustomTooltip();
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
    if (task.type === 'pauze' && customDuration !== null && customDuration <= 0) return;

    if (!planningState.assignedTasks[fillerId]) {
        planningState.assignedTasks[fillerId] = [];
    }

    const list = planningState.assignedTasks[fillerId];
    let effectiveInsertIndex = (insertIndex !== null && insertIndex >= 0 && insertIndex <= list.length) 
        ? insertIndex 
        : list.length;

    const prependedTasks = [];
    const appendedTasks = [];

    if (task.type === 'vullen') {
        const { prependedTasks: cPre, appendedTasks: cApp } = getComboTasksForTask(task);
        cPre.forEach(pt => {
            if (pt.type === 'overige') {
                prependedTasks.push({
                    ...pt,
                    id: `overige_inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
                });
            } else if (pt.type === 'restanten') {
                const rIdx = planningState.unassignedTasks.findIndex(t => t.id === pt.id);
                if (rIdx !== -1) {
                    planningState.unassignedTasks.splice(rIdx, 1);
                }
                prependedTasks.push(pt);
            }
        });
        cApp.forEach(at => {
            if (at.type === 'spiegelen') {
                const sIdx = planningState.unassignedTasks.findIndex(t => t.id === at.id);
                if (sIdx !== -1) {
                    planningState.unassignedTasks.splice(sIdx, 1);
                }
                appendedTasks.push(at);
            }
        });
    }

    prependedTasks.forEach(pt => {
        list.splice(effectiveInsertIndex, 0, pt);
        effectiveInsertIndex++;
    });

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

    list.splice(effectiveInsertIndex, 0, taskToInsert);
    effectiveInsertIndex++;

    appendedTasks.forEach(at => {
        list.splice(effectiveInsertIndex, 0, at);
        effectiveInsertIndex++;
    });

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave(true);
}

export function unassignTask(fillerId, taskIndex, callbacks = {}) {
    hideCustomTooltip();
    const assignedList = planningState.assignedTasks[fillerId];
    if (!assignedList || taskIndex < 0 || taskIndex >= assignedList.length) return;

    const [task] = assignedList.splice(taskIndex, 1);

    if (task.isHelper && task.parentTaskId && task.helperOfFillerId) {
        const rootTaskId = task.parentTaskId;
        const mainFillerId = task.helperOfFillerId;
        const mainList = planningState.assignedTasks[mainFillerId];
        const mainTask = mainList ? mainList.find(t => t.id === rootTaskId) : null;

        if (mainTask) {
            const existingHelpers = [];
            planningState.fillers.forEach(f => {
                const flist = planningState.assignedTasks[f.id] || [];
                flist.forEach((t, idx) => {
                    if (t.isHelper && t.parentTaskId === rootTaskId) {
                        existingHelpers.push({ fillerId: f.id, taskIndex: idx, task: t });
                    }
                });
            });

            const totalOrig = mainTask.origDuration || (mainTask.duration + task.duration);
            const totalPeople = 1 + existingHelpers.length;
            const baseMinutes = Math.floor(totalOrig / totalPeople);
            let remainder = totalOrig % totalPeople;

            mainTask.duration = baseMinutes + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;

            existingHelpers.forEach(h => {
                const add = remainder > 0 ? 1 : 0;
                if (remainder > 0) remainder--;
                h.task.duration = baseMinutes + add;
            });
        }
    } else {
        const rootTaskId = task.id;
        planningState.fillers.forEach(f => {
            if (planningState.assignedTasks[f.id]) {
                planningState.assignedTasks[f.id] = planningState.assignedTasks[f.id].filter(t => !(t.isHelper && t.parentTaskId === rootTaskId));
            }
        });

        if (task.type !== 'pauze' && task.type !== 'overige') {
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
    }

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave(true);
}

export function addHelperToTask(sourceFillerId, sourceTaskIndex, targetFillerId, targetIndex = null, callbacks = {}) {
    const sourceList = planningState.assignedTasks[sourceFillerId];
    if (!sourceList || sourceTaskIndex < 0 || sourceTaskIndex >= sourceList.length) return;

    const origTask = sourceList[sourceTaskIndex];
    if (origTask.isHelper) return;

    const rootTaskId = origTask.id;
    const totalOrig = origTask.origDuration || origTask.duration;
    const baseTitle = origTask.origTitle || origTask.title;

    const existingHelpers = [];
    planningState.fillers.forEach(f => {
        const flist = planningState.assignedTasks[f.id] || [];
        flist.forEach((t, idx) => {
            if (t.isHelper && t.parentTaskId === rootTaskId) {
                existingHelpers.push({ fillerId: f.id, taskIndex: idx, task: t });
            }
        });
    });

    if (existingHelpers.some(h => h.fillerId === targetFillerId)) {
        showToast('error', 'Deze medewerker helpt al bij deze taak.');
        return;
    }

    if (existingHelpers.length >= 4) {
        showToast('error', 'Maximaal 4 helpers toegestaan per taak.');
        return;
    }

    const helperList = [...existingHelpers.map(h => ({ fillerId: h.fillerId, targetIndex: null })), { fillerId: targetFillerId, targetIndex }];
    const totalPeople = 1 + helperList.length;
    const baseMinutes = Math.floor(totalOrig / totalPeople);
    let remainder = totalOrig % totalPeople;

    const giverMinutes = baseMinutes + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    const helpersPayload = helperList.map(h => {
        const add = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder--;
        return {
            fillerId: h.fillerId,
            duration: baseMinutes + add,
            targetIndex: h.targetIndex
        };
    });

    applyMultiHelpers({
        sourceFillerId,
        sourceTaskIndex,
        giverDuration: giverMinutes,
        helpers: helpersPayload,
        callbacks
    });
}

export function addHelperTask(params) {
    const {
        sourceFillerId,
        sourceTaskIndex,
        targetFillerId,
        targetIndex = null,
        callbacks = {}
    } = params;

    addHelperToTask(sourceFillerId, sourceTaskIndex, targetFillerId, targetIndex, callbacks);
}

export function applyMultiHelpers(params) {
    const {
        sourceFillerId,
        sourceTaskIndex,
        giverDuration,
        helpers = [],
        callbacks = {}
    } = params;

    const sourceList = planningState.assignedTasks[sourceFillerId];
    if (!sourceList || sourceTaskIndex < 0 || sourceTaskIndex >= sourceList.length) return;

    const origTask = sourceList[sourceTaskIndex];
    const rootTaskId = origTask.parentTaskId || origTask.id;
    const totalOrig = origTask.origDuration || origTask.duration;
    const baseTitle = origTask.origTitle || origTask.title.replace(/\s*\(Helper\)$/, '');

    planningState.fillers.forEach(f => {
        if (planningState.assignedTasks[f.id]) {
            planningState.assignedTasks[f.id] = planningState.assignedTasks[f.id].filter(t => !(t.isHelper && t.parentTaskId === rootTaskId));
        }
    });

    if (giverDuration <= 0) {
        const curIdx = sourceList.findIndex(t => t.id === origTask.id);
        if (curIdx !== -1) {
            sourceList.splice(curIdx, 1);
        }
    } else {
        origTask.duration = giverDuration;
        if (!origTask.origDuration) origTask.origDuration = totalOrig;
        if (!origTask.origTitle) origTask.origTitle = baseTitle;
    }

    helpers.forEach(h => {
        if (!h.duration || h.duration <= 0) return;
        if (!planningState.assignedTasks[h.fillerId]) {
            planningState.assignedTasks[h.fillerId] = [];
        }

        const helperTask = {
            id: `${rootTaskId}_helper_${h.fillerId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: origTask.type,
            title: `${baseTitle} (Helper)`,
            duration: h.duration,
            colli: origTask.colli || 0,
            origTitle: baseTitle,
            origDuration: totalOrig,
            isHelper: true,
            parentTaskId: rootTaskId,
            helperOfFillerId: sourceFillerId
        };

        const targetList = planningState.assignedTasks[h.fillerId];
        if (h.targetIndex !== null && h.targetIndex >= 0 && h.targetIndex <= targetList.length) {
            targetList.splice(h.targetIndex, 0, helperTask);
        } else {
            targetList.push(helperTask);
        }
    });

    if (callbacks.onRenderRows) callbacks.onRenderRows();
    if (callbacks.onRenderUnassigned) callbacks.onRenderUnassigned();
    triggerAutoSave(true);
}

export function moveAssignedTask(fromFillerId, fromIndex, toFillerId, insertIndex = null, callbacks = {}) {
    const fromList = planningState.assignedTasks[fromFillerId];
    if (!fromList || fromIndex < 0 || fromIndex >= fromList.length) return;

    const [task] = fromList.splice(fromIndex, 1);
    if (!planningState.assignedTasks[toFillerId]) {
        planningState.assignedTasks[toFillerId] = [];
    }

    if (!task.isHelper) {
        const rootTaskId = task.id;
        if (fromFillerId !== toFillerId) {
            planningState.assignedTasks[toFillerId] = (planningState.assignedTasks[toFillerId] || []).filter(
                t => !(t.isHelper && t.parentTaskId === rootTaskId)
            );

            planningState.fillers.forEach(f => {
                const flist = planningState.assignedTasks[f.id] || [];
                flist.forEach(t => {
                    if (t.isHelper && t.parentTaskId === rootTaskId) {
                        t.helperOfFillerId = toFillerId;
                    }
                });
            });

            const remainingHelpers = [];
            planningState.fillers.forEach(f => {
                const flist = planningState.assignedTasks[f.id] || [];
                flist.forEach(t => {
                    if (t.isHelper && t.parentTaskId === rootTaskId) {
                        remainingHelpers.push(t);
                    }
                });
            });

            const totalOrig = task.origDuration || task.duration;
            const totalPeople = 1 + remainingHelpers.length;
            const baseMinutes = Math.floor(totalOrig / totalPeople);
            let remainder = totalOrig % totalPeople;

            task.duration = baseMinutes + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;

            remainingHelpers.forEach(h => {
                const add = remainder > 0 ? 1 : 0;
                if (remainder > 0) remainder--;
                h.duration = baseMinutes + add;
            });
        }
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
    triggerAutoSave(true);
}
