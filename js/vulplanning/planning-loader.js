import { supabase, getCurrentUser } from '../main.js';
import { planningState } from './state.js';
import { fillRoosterShifts } from './rooster.js';
import { fillColliValues, loadStorePathsForColli } from './colli-invoer.js';
import { generateTasksFromPathsAndColli } from './task-generator.js';
import { calculateTimelineBounds } from './timeline-axis.js';

export async function loadSavedPlanning(options = {}) {
    const {
        stepInputView,
        stepTimelineView,
        onRenderAxis,
        onRenderRows,
        onRenderUnassigned,
        onRestoreScroll
    } = options;

    try {
        const user = await getCurrentUser();
        if (!user || !user.store_id) return;

        const [plannerResult, _] = await Promise.all([
            supabase
                .from('planner')
                .select('*')
                .eq('store_id', user.store_id)
                .maybeSingle(),
            loadStorePathsForColli()
        ]);

        const data = plannerResult.data;
        if (plannerResult.error || !data) return;

        if (Array.isArray(data.other_tasks) && data.other_tasks.length > 0) {
            data.other_tasks.forEach(ot => {
                if (ot && ot.title) {
                    const exists = planningState.unassignedTasks.some(t => t.type === 'overige' && t.title === ot.title && t.duration === ot.duration);
                    if (!exists) {
                        planningState.unassignedTasks.push(ot);
                    }
                }
            });
            if (onRenderUnassigned) onRenderUnassigned();
        }

        const savedFillers = Array.isArray(data.fillers) ? data.fillers : [];
        if (savedFillers.length === 0) return;

        const scheduleData = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
        planningState.fillers = savedFillers;
        planningState.unassignedTasks = Array.isArray(scheduleData.unassigned_tasks) 
            ? scheduleData.unassigned_tasks 
            : (Array.isArray(data.unassigned_tasks) ? data.unassigned_tasks : []);
        planningState.assignedTasks = scheduleData.assigned_tasks && typeof scheduleData.assigned_tasks === 'object'
            ? scheduleData.assigned_tasks
            : (data.assigned_tasks && typeof data.assigned_tasks === 'object' ? data.assigned_tasks : {});

        fillRoosterShifts(savedFillers);

        const colliMap = {};
        if (Array.isArray(data.tasks) && data.tasks.length > 0) {
            data.tasks.forEach(t => {
                if (t.category && t.colli !== undefined) {
                    colliMap[t.category.toLowerCase().trim()] = t.colli;
                }
            });
        }

        if (Object.keys(colliMap).length > 0) {
            fillColliValues(colliMap);
        }

        const generatedTasks = generateTasksFromPathsAndColli();
        const otherTasksList = [];

        if (Array.isArray(data.other_tasks) && data.other_tasks.length > 0) {
            data.other_tasks.forEach(ot => {
                if (ot && ot.title) {
                    otherTasksList.push(ot);
                }
            });
        }

        const taskPool = new Map();
        generatedTasks.forEach(t => taskPool.set(t.id, t));
        otherTasksList.forEach(t => taskPool.set(t.id, t));

        const hydratedAssignedTasks = {};
        const assignedTaskIds = new Set();

        const rawSchedule = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
        const scheduleAssignments = rawSchedule.assigned_tasks ? rawSchedule.assigned_tasks : rawSchedule;

        Object.entries(scheduleAssignments).forEach(([fillerId, taskRefs]) => {
            if (Array.isArray(taskRefs)) {
                hydratedAssignedTasks[fillerId] = [];
                taskRefs.forEach(ref => {
                    const refId = typeof ref === 'string' ? ref : (ref && ref.id);
                    const templateId = ref && ref.templateId;

                    if (ref && ref.type === 'overige') {
                        const template = taskPool.get(templateId || refId);
                        hydratedAssignedTasks[fillerId].push({
                            id: refId || `custom_inst_${Date.now()}`,
                            templateId: templateId || (template && template.id) || refId,
                            type: 'overige',
                            title: (ref && ref.title) || (template && template.title) || 'Overige taak',
                            duration: (ref && ref.duration) || (template && template.duration) || 30,
                            colli: 0
                        });
                    } else if (taskPool.has(refId)) {
                        const originalTask = taskPool.get(refId);
                        hydratedAssignedTasks[fillerId].push(originalTask);
                        assignedTaskIds.add(refId);
                    }
                });
            }
        });

        const unassignedNormal = generatedTasks.filter(t => !assignedTaskIds.has(t.id));

        planningState.fillers = savedFillers;
        planningState.assignedTasks = hydratedAssignedTasks;
        planningState.unassignedTasks = [...unassignedNormal, ...otherTasksList];

        calculateTimelineBounds(savedFillers);

        if (stepInputView) stepInputView.style.display = 'none';
        if (stepTimelineView) stepTimelineView.style.display = 'flex';

        if (onRenderAxis) onRenderAxis();
        if (onRenderRows) onRenderRows();
        if (onRenderUnassigned) onRenderUnassigned();
        if (onRestoreScroll) onRestoreScroll();
    } catch (_) {}
}
