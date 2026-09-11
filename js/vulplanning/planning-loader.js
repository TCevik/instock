import { supabase, getCurrentUser } from '../main.js';
import { planningState } from './state.js';
import { fillRoosterShifts, loadStoreUsers } from './rooster.js';
import { fillColliValues, loadStorePathsForColli } from './colli-invoer.js';
import { generateTasksFromPathsAndColli } from './task-generator.js';
import { calculateTimelineBounds } from './timeline-axis.js';
import { applyStoredFillerSort } from './filler-sort.js';
import { consumeLocalSaveFlag } from './storage.js';

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
            loadStorePathsForColli(),
            loadStoreUsers()
        ]);

        const data = plannerResult.data;
        if (plannerResult.error || !data) {
            if (window.innerWidth <= 768) {
                if (stepInputView) stepInputView.style.display = 'none';
                if (stepTimelineView) stepTimelineView.style.display = 'flex';
                if (onRenderRows) onRenderRows();
            }
            return;
        }

        const savedFillers = (Array.isArray(data.fillers) ? data.fillers : []).map((f, idx) => ({
            ...f,
            customOrder: (f && typeof f.customOrder === 'number') ? f.customOrder : idx
        }));
        if (savedFillers.length === 0) {
            if (window.innerWidth <= 768) {
                if (stepInputView) stepInputView.style.display = 'none';
                if (stepTimelineView) stepTimelineView.style.display = 'flex';
                if (onRenderRows) onRenderRows();
            }
            return;
        }

        const scheduleData = data.schedule && typeof data.schedule === 'object' ? data.schedule : {};
        planningState.fillers = savedFillers;
        planningState.unassignedTasks = Array.isArray(scheduleData.unassigned_tasks) 
            ? scheduleData.unassigned_tasks 
            : (Array.isArray(data.unassigned_tasks) ? data.unassigned_tasks : []);
        planningState.assignedTasks = scheduleData.assigned_tasks && typeof scheduleData.assigned_tasks === 'object'
            ? scheduleData.assigned_tasks
            : (data.assigned_tasks && typeof data.assigned_tasks === 'object' ? data.assigned_tasks : {});

        if (data.settings && typeof data.settings === 'object') {
            planningState.settings = data.settings;
        }

        fillRoosterShifts(savedFillers);

        if (Array.isArray(data.tasks)) {
            planningState.savedTasks = data.tasks;
        }
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
            const seenTitles = new Set();
            data.other_tasks.forEach(ot => {
                if (ot && ot.title && !ot.isHelper && !ot.title.includes('(Helper)')) {
                    const normTitle = ot.title.toLowerCase().trim();
                    if (!seenTitles.has(normTitle)) {
                        seenTitles.add(normTitle);
                        otherTasksList.push({
                            id: ot.id || `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                            type: 'overige',
                            title: ot.title,
                            duration: ot.origDuration || ot.duration || 30,
                            colli: ot.colli || 0
                        });
                    }
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

        savedFillers.forEach(f => {
            hydratedAssignedTasks[f.id] = [];
        });

        Object.entries(scheduleAssignments).forEach(([fillerId, taskRefs]) => {
            if (Array.isArray(taskRefs)) {
                hydratedAssignedTasks[fillerId] = [];
                taskRefs.forEach(ref => {
                    const refId = typeof ref === 'string' ? ref : (ref && ref.id);
                    const templateId = ref && ref.templateId;

                    if (ref && (ref.type === 'overige' || ref.type === 'pauze')) {
                        const template = taskPool.get(templateId || refId);
                        const dur = (ref && ref.duration) || (template && template.duration) || 30;
                        hydratedAssignedTasks[fillerId].push({
                            id: refId || `${ref.type}_inst_${Date.now()}`,
                            templateId: templateId || (template && template.id) || refId,
                            type: ref.type,
                            title: (ref && ref.title) || (template && template.title) || (ref.type === 'pauze' ? 'Pauze' : 'Overige taak'),
                            duration: dur,
                            origDuration: (ref && ref.origDuration !== undefined) ? ref.origDuration : (template ? template.duration : dur),
                            colli: 0,
                            isHelper: !!(ref && ref.isHelper),
                            parentTaskId: ref && ref.parentTaskId,
                            helperOfFillerId: ref && ref.helperOfFillerId
                        });
                    } else if (ref && ref.isHelper) {
                        const parent = taskPool.get(ref.parentTaskId);
                        hydratedAssignedTasks[fillerId].push({
                            id: refId,
                            type: (ref && ref.type) || (parent && parent.type) || 'vullen',
                            title: (ref && ref.title) || (parent && parent.title) || 'Taak',
                            duration: (ref && ref.duration) || 30,
                            origDuration: (ref && ref.origDuration) || (parent && parent.duration) || 30,
                            colli: (ref && ref.colli) || (parent && parent.colli) || 0,
                            isHelper: true,
                            parentTaskId: ref.parentTaskId,
                            helperOfFillerId: ref.helperOfFillerId
                        });
                    } else if (taskPool.has(refId)) {
                        const originalTask = taskPool.get(refId);
                        const taskCopy = { ...originalTask };
                        if (ref && ref.title) {
                            taskCopy.title = ref.title;
                        }
                        if (ref && ref.duration !== undefined) {
                            taskCopy.duration = ref.duration;
                        }
                        if (ref && ref.origDuration !== undefined) {
                            taskCopy.origDuration = ref.origDuration;
                        } else if (!taskCopy.origDuration) {
                            taskCopy.origDuration = originalTask.duration;
                        }
                        hydratedAssignedTasks[fillerId].push(taskCopy);
                        assignedTaskIds.add(refId);
                    }
                });
            }
        });

        const unassignedNormal = generatedTasks.filter(t => !assignedTaskIds.has(t.id));

        planningState.fillers = savedFillers;
        planningState.assignedTasks = hydratedAssignedTasks;
        planningState.unassignedTasks = [...unassignedNormal, ...otherTasksList];

        if (stepInputView) stepInputView.style.display = 'none';
        if (stepTimelineView) stepTimelineView.style.display = 'flex';

        applyStoredFillerSort();
        calculateTimelineBounds(planningState.fillers);

        const savedZoom = localStorage.getItem('instock_planner_zoom');
        if (savedZoom !== null) {
            const parsedZoom = parseFloat(savedZoom);
            if (!isNaN(parsedZoom)) {
                planningState.zoom = parsedZoom;
                const zoomIndicator = document.getElementById('zoom-level-indicator');
                if (zoomIndicator) {
                    zoomIndicator.textContent = `${Math.round(planningState.zoom * 100)}%`;
                }
            }
        }

        if (onRenderAxis) onRenderAxis();
        if (onRenderRows) onRenderRows();
        if (onRenderUnassigned) onRenderUnassigned();
        if (onRestoreScroll) {
            setTimeout(onRestoreScroll, 50);
        }
    } catch (_) {}
}

let realtimeChannel = null;

export async function setupRealtimeSubscription(options = {}) {
    try {
        const user = await getCurrentUser();
        if (!user || !user.store_id) return;

        if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }

        realtimeChannel = supabase
            .channel(`planner_realtime_${user.store_id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'planner',
                    filter: `store_id=eq.${user.store_id}`
                },
                (payload) => {
                    if (consumeLocalSaveFlag()) {
                        return;
                    }
                    loadSavedPlanning(options);
                }
            )
            .subscribe();
    } catch (_) {}
}

