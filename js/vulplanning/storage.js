import { supabase, getCurrentUser, showToast } from '../main.js';
import { planningState } from './state.js';
import { getColliData } from './colli-invoer.js';

let autoSaveTimeout = null;

export function triggerAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(async () => {
        try {
            const user = await getCurrentUser();
            if (!user || !user.store_id) return;

            const compactSchedule = {};
            Object.entries(planningState.assignedTasks).forEach(([fillerId, tasks]) => {
                if (Array.isArray(tasks) && tasks.length > 0) {
                    compactSchedule[fillerId] = tasks.map(t => {
                        if (t.type === 'overige') {
                            return { id: t.id, templateId: t.templateId || t.id, type: 'overige', title: t.title, duration: t.duration };
                        }
                        return { id: t.id, type: t.type, duration: t.duration };
                    });
                }
            });

            const otherTasksMap = new Map();
            planningState.unassignedTasks.forEach(t => {
                if (t.type === 'overige') {
                    const key = t.title + '_' + t.duration;
                    if (!otherTasksMap.has(key)) otherTasksMap.set(key, t);
                }
            });
            Object.values(planningState.assignedTasks).forEach(list => {
                if (Array.isArray(list)) {
                    list.forEach(t => {
                        if (t.type === 'overige') {
                            const key = t.title + '_' + t.duration;
                            if (!otherTasksMap.has(key)) otherTasksMap.set(key, { ...t, id: t.templateId || t.id });
                        }
                    });
                }
            });

            const { error } = await supabase
                .from('planner')
                .upsert({
                    store_id: user.store_id,
                    fillers: planningState.fillers,
                    tasks: getColliData(),
                    schedule: compactSchedule,
                    other_tasks: Array.from(otherTasksMap.values())
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
