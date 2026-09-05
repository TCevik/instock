import { supabase, getCurrentUser, showToast, isPermissionError } from '../main.js';
import { planningState } from './state.js';
import { getColliData } from './colli-invoer.js';
import { recordSnapshot } from './history.js';

let autoSaveTimeout = null;

function handleSaveError(err) {
    if (isPermissionError(err)) {
        showToast('error', 'Opslaan mislukt: controleer rechten');
    } else {
        showToast('error', 'Opslaan mislukt: controleer verbinding');
    }
}

export function triggerAutoSave(immediate = false) {
    recordSnapshot();
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }

    const executeSave = async () => {
        try {
            const user = await getCurrentUser();
            if (!user || !user.store_id) return;

            if (Number(user.role) === 1) {
                showToast('error', 'Opslaan mislukt: controleer rechten');
                return;
            }

            const compactSchedule = {};
            const processedFillerIds = new Set();

            if (Array.isArray(planningState.fillers)) {
                planningState.fillers.forEach(filler => {
                    processedFillerIds.add(String(filler.id));
                    const tasks = planningState.assignedTasks[filler.id] || [];
                    compactSchedule[filler.id] = tasks.map(t => {
                        if (t.type === 'overige' || t.type === 'pauze') {
                            return {
                                id: t.id,
                                templateId: t.templateId || t.id,
                                type: t.type,
                                title: t.title,
                                duration: t.duration,
                                origDuration: t.origDuration,
                                isHelper: !!t.isHelper,
                                parentTaskId: t.parentTaskId,
                                helperOfFillerId: t.helperOfFillerId
                            };
                        }
                        return {
                            id: t.id,
                            type: t.type,
                            title: t.title,
                            duration: t.duration,
                            origDuration: t.origDuration,
                            colli: t.colli,
                            isHelper: !!t.isHelper,
                            parentTaskId: t.parentTaskId,
                            helperOfFillerId: t.helperOfFillerId
                        };
                    });
                });
            }

            Object.entries(planningState.assignedTasks || {}).forEach(([fillerId, tasks]) => {
                if (!processedFillerIds.has(String(fillerId))) {
                    compactSchedule[fillerId] = (Array.isArray(tasks) ? tasks : []).map(t => {
                        if (t.type === 'overige' || t.type === 'pauze') {
                            return {
                                id: t.id,
                                templateId: t.templateId || t.id,
                                type: t.type,
                                title: t.title,
                                duration: t.duration,
                                origDuration: t.origDuration,
                                isHelper: !!t.isHelper,
                                parentTaskId: t.parentTaskId,
                                helperOfFillerId: t.helperOfFillerId
                            };
                        }
                        return {
                            id: t.id,
                            type: t.type,
                            title: t.title,
                            duration: t.duration,
                            origDuration: t.origDuration,
                            colli: t.colli,
                            isHelper: !!t.isHelper,
                            parentTaskId: t.parentTaskId,
                            helperOfFillerId: t.helperOfFillerId
                        };
                    });
                }
            });

            const otherTasksMap = new Map();
            planningState.unassignedTasks.forEach(t => {
                if (t.type === 'overige' && !t.isHelper && !t.title.includes('(Helper)')) {
                    const key = t.title.toLowerCase().trim();
                    if (!otherTasksMap.has(key)) {
                        otherTasksMap.set(key, {
                            id: t.id,
                            type: 'overige',
                            title: t.title,
                            duration: t.origDuration || t.duration || 30,
                            colli: t.colli || 0
                        });
                    }
                }
            });

            const currentColli = getColliData();
            const tasksToSave = (currentColli && currentColli.length > 0) ? currentColli : (planningState.savedTasks || []);
            if (currentColli && currentColli.length > 0) {
                planningState.savedTasks = currentColli;
            }

            const { error } = await supabase
                .from('planner')
                .upsert({
                    store_id: user.store_id,
                    fillers: planningState.fillers,
                    tasks: tasksToSave,
                    schedule: compactSchedule,
                    other_tasks: Array.from(otherTasksMap.values()),
                    settings: {
                        ...(planningState.settings || {}),
                        combo: planningState.comboSettings
                    }
                }, {
                    onConflict: 'store_id'
                });

            if (error) {
                handleSaveError(error);
            }
        } catch (err) {
            handleSaveError(err);
        }
    };

    if (immediate) {
        executeSave();
    } else {
        autoSaveTimeout = setTimeout(executeSave, 300);
    }
}
