import { supabase, getCurrentUser, showToast } from '../main.js';
import { planningState } from './state.js';
import { getColliData } from './colli-invoer.js';
import { recordSnapshot } from './history.js';

let autoSaveTimeout = null;

export function triggerAutoSave() {
    recordSnapshot();
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        try {
            const user = await getCurrentUser();
            if (!user || !user.store_id) return;

            const compactSchedule = {};
            Object.entries(planningState.assignedTasks).forEach(([fillerId, tasks]) => {
                if (Array.isArray(tasks) && tasks.length > 0) {
                    compactSchedule[fillerId] = tasks.map(t => {
                        if (t.type === 'overige' || t.type === 'pauze') {
                            return {
                                id: t.id,
                                templateId: t.templateId || t.id,
                                type: t.type,
                                title: t.title,
                                duration: t.duration,
                                origDuration: t.origDuration,
                                isHelper: t.isHelper,
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
                            isHelper: t.isHelper,
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

            const { error } = await supabase
                .from('planner')
                .upsert({
                    store_id: user.store_id,
                    fillers: planningState.fillers,
                    tasks: getColliData(),
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
                showToast('error', 'Opslaan mislukt: controleer verbinding');
            }
        } catch (err) {
            showToast('error', 'Opslaan mislukt: controleer verbinding');
        }
    }, 400);
}
