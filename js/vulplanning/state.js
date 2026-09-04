export const planningState = {
    fillers: [],
    unassignedTasks: [],
    assignedTasks: {},
    zoom: 1,
    activeTab: 'vullen',
    timelineStartHour: 0,
    timelineEndHour: 24,
    settings: {},
    comboSettings: {
        autoRestanten: true,
        autoSpiegelen: true,
        autoOverige: false,
        selectedOverigeTaskId: null,
        selectedOverigeTitle: null
    }
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
        if (draggedTaskData.taskId === 'pauze_template' || (typeof draggedTaskData.taskId === 'string' && draggedTaskData.taskId.startsWith('pauze'))) {
            return {
                id: 'pauze_template',
                type: 'pauze',
                title: 'Pauze',
                duration: 30,
                colli: 0
            };
        }
        return planningState.unassignedTasks.find(t => t.id === draggedTaskData.taskId) || null;
    }
    if (draggedTaskData.source === 'assigned' || draggedTaskData.source === 'sidebar_assigned') {
        const list = planningState.assignedTasks[draggedTaskData.fillerId] || [];
        return list[draggedTaskData.taskIndex] || null;
    }
    return null;
}
