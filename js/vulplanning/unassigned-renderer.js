import { planningState, setDraggedTaskData } from './state.js';
import { formatDuration } from './time-utils.js';
import { showCustomTooltip, positionCustomTooltip, hideCustomTooltip } from './tooltip.js';
import { showContextMenu } from './context-menu.js';

export function renderUnassignedTasks(options) {
    const {
        unassignedTasksList,
        onRenderRows,
        onRenderUnassigned,
        onUnassignTask
    } = options;

    if (!unassignedTasksList) return;
    unassignedTasksList.innerHTML = '';

    const counts = { vullen: 0, spiegelen: 0, restanten: 0, overige: 0 };
    planningState.unassignedTasks.forEach(t => {
        const type = t.type || 'vullen';
        if (counts[type] !== undefined) counts[type]++;
    });

    ['vullen', 'spiegelen', 'restanten', 'overige'].forEach(tabKey => {
        const counterEl = document.getElementById(`count-tab-${tabKey}`);
        if (counterEl) counterEl.textContent = counts[tabKey] || 0;
    });

    let filtered = planningState.unassignedTasks.filter(t => (t.type || 'vullen') === planningState.activeTab);
    if (planningState.activeTab === 'overige') {
        const hasPauze = filtered.some(t => t.type === 'pauze' || t.id === 'pauze_template');
        if (!hasPauze) {
            filtered = [{
                id: 'pauze_template',
                type: 'pauze',
                title: 'Pauze',
                duration: 30,
                colli: 0
            }, ...filtered];
        }
    }

    if (filtered.length === 0) {
        unassignedTasksList.innerHTML = `
            <div class="empty-state" style="padding: 24px 8px; font-size: 12px;">
                Geen taken in deze categorie
            </div>
        `;
        return;
    }

    filtered.forEach(task => {
        const card = document.createElement('div');
        card.className = `unassigned-task-card type-${task.type || 'vullen'}`;
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-task-id', task.id);

        const durStr = (task.type === 'pauze' && task.id === 'pauze_template') ? 'Flexibel' : formatDuration(task.duration);

        card.innerHTML = `
            <div class="unassigned-task-header">
                <span class="unassigned-task-title">${task.title}</span>
                ${task.colli > 0 ? `<span class="unassigned-task-colli">${task.colli}c</span>` : ''}
            </div>
            <span class="unassigned-task-duration">${durStr}</span>
        `;

        card.addEventListener('mouseenter', (e) => {
            showCustomTooltip(e, {
                type: task.type,
                title: task.title,
                duration: task.duration,
                colli: task.colli
            });
        });

        card.addEventListener('mousemove', (e) => {
            positionCustomTooltip(e);
        });

        card.addEventListener('mouseleave', () => {
            hideCustomTooltip();
        });

        card.addEventListener('dragstart', (e) => {
            hideCustomTooltip();
            const dragData = {
                source: 'unassigned',
                taskId: task.id
            };
            setDraggedTaskData(dragData);
            e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
            card.classList.add('dragging');
        });

        card.addEventListener('dragend', () => {
            setDraggedTaskData(null);
            document.querySelectorAll('.timeline-task-ghost').forEach(el => el.remove());
            document.querySelectorAll('.timeline-task-block').forEach(b => {
                b.style.transform = '';
            });
            card.classList.remove('dragging');
        });

        if (task.type === 'overige') {
            card.addEventListener('contextmenu', (e) => {
                showContextMenu(e, task, false, null, null, {
                    onRenderRows,
                    onRenderUnassigned,
                    onUnassignTask
                });
            });
        }

        unassignedTasksList.appendChild(card);
    });
}
