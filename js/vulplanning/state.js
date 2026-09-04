export const planningState = {
    fillers: [],
    unassignedTasks: [],
    assignedTasks: {},
    zoom: 1,
    activeTab: 'vullen',
    timelineStartHour: 0,
    timelineEndHour: 24
};

let draggedTaskData = null;

export function getDraggedTaskData() {
    return draggedTaskData;
}

export function setDraggedTaskData(data) {
    draggedTaskData = data;
}

export function getDraggedTask() {
    if (!draggedTaskData) return null;
    if (draggedTaskData.source === 'unassigned') {
        return planningState.unassignedTasks.find(t => t.id === draggedTaskData.taskId) || null;
    }
    if (draggedTaskData.source === 'assigned') {
        const list = planningState.assignedTasks[draggedTaskData.fillerId] || [];
        return list[draggedTaskData.taskIndex] || null;
    }
    return null;
}
