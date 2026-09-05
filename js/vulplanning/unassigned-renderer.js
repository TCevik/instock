import { planningState, setDraggedTaskData } from './state.js';
import { formatDuration } from './time-utils.js';
import { showCustomTooltip, positionCustomTooltip, hideCustomTooltip } from './tooltip.js';
import { showContextMenu } from './context-menu.js';

export function renderUnassignedTasks(options) {
    const {
        unassignedTasksList,
        assignedTasksList = document.getElementById('assigned-tasks-list'),
        onRenderRows,
        onRenderUnassigned,
        onUnassignTask
    } = options;

    if (!unassignedTasksList) return;
    hideCustomTooltip();
    unassignedTasksList.innerHTML = '';

    planningState.unassignedTasks = planningState.unassignedTasks.filter(t => !t.isHelper && !t.title.includes('(Helper)'));
    planningState.unassignedTasks = planningState.unassignedTasks.filter(t => {
        if (t.type === 'vullen' && (!t.colli || t.colli <= 0)) return false;
        return true;
    });
    const uniqueOverige = new Set();
    planningState.unassignedTasks = planningState.unassignedTasks.filter(t => {
        if (t.type === 'overige') {
            const key = t.title.toLowerCase().trim();
            if (uniqueOverige.has(key)) return false;
            uniqueOverige.add(key);
        }
        return true;
    });

    const counts = { vullen: 0, spiegelen: 0, restanten: 0, overige: 0 };
    planningState.unassignedTasks.forEach(t => {
        const type = t.type || 'vullen';
        if (counts[type] !== undefined) counts[type]++;
    });

    ['vullen', 'spiegelen', 'restanten', 'overige'].forEach(tabKey => {
        const counterEl = document.getElementById(`count-tab-${tabKey}`);
        if (counterEl) counterEl.textContent = counts[tabKey] || 0;
    });

    let filteredUnassigned = planningState.unassignedTasks.filter(t => (t.type || 'vullen') === planningState.activeTab);
    if (planningState.activeTab === 'overige') {
        const hasPauze = filteredUnassigned.some(t => t.type === 'pauze' || t.id === 'pauze_template');
        if (!hasPauze) {
            filteredUnassigned = [{
                id: 'pauze_template',
                type: 'pauze',
                title: 'Pauze',
                duration: 30,
                colli: 0
            }, ...filteredUnassigned];
        }
    }

    const unassignedBadge = document.getElementById('count-unassigned-badge');
    if (unassignedBadge) {
        unassignedBadge.textContent = filteredUnassigned.filter(t => t.id !== 'pauze_template').length;
    }

    if (filteredUnassigned.length === 0) {
        unassignedTasksList.innerHTML = `
            <div class="empty-state" style="padding: 16px 8px; font-size: 11px;">
                Geen onverdeelde taken
            </div>
        `;
    } else {
        filteredUnassigned.forEach(task => {
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
                    colli: task.colli,
                    isFlexible: task.type === 'pauze' && task.id === 'pauze_template'
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

    if (!assignedTasksList) return;
    assignedTasksList.innerHTML = '';

    const mainTasksMap = new Map();
    const helperTasks = [];

    planningState.fillers.forEach(filler => {
        const list = planningState.assignedTasks[filler.id] || [];
        list.forEach((t, idx) => {
            if (t.type === 'pauze') return;

            const matchesTab = (t.type || 'vullen') === planningState.activeTab;
            if (!matchesTab) return;

            if (t.isHelper) {
                helperTasks.push({
                    task: t,
                    filler,
                    taskIndex: idx
                });
            } else {
                mainTasksMap.set(t.id, {
                    task: t,
                    filler,
                    taskIndex: idx,
                    helpers: []
                });
            }
        });
    });

    helperTasks.forEach(h => {
        const parentId = h.task.parentTaskId;
        if (parentId && mainTasksMap.has(parentId)) {
            mainTasksMap.get(parentId).helpers.push(h);
        } else {
            let foundParent = null;
            for (const item of mainTasksMap.values()) {
                const normMain = item.task.title.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
                const normHelp = h.task.title.replace(/\s*\(Helper\)/gi, '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
                if (normMain === normHelp) {
                    foundParent = item;
                    break;
                }
            }
            if (foundParent) {
                foundParent.helpers.push(h);
            }
        }
    });

    const assignedCardsData = Array.from(mainTasksMap.values());

    const assignedBadge = document.getElementById('count-assigned-badge');
    if (assignedBadge) {
        assignedBadge.textContent = assignedCardsData.length;
    }

    if (assignedCardsData.length === 0) {
        assignedTasksList.innerHTML = `
            <div class="empty-state" style="padding: 16px 8px; font-size: 11px;">
                Geen verdeelde taken
            </div>
        `;
        return;
    }

    assignedCardsData.forEach(({ task, filler, taskIndex, helpers }) => {
        const card = document.createElement('div');
        card.className = `unassigned-task-card assigned-card type-${task.type || 'vullen'}`;
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-task-id', task.id);
        card.setAttribute('data-filler-id', filler.id);
        card.setAttribute('data-task-index', taskIndex);

        const hasHelpers = helpers && helpers.length > 0;

        card.innerHTML = `
            <div class="unassigned-task-header">
                <span class="unassigned-task-title" title="${task.title}">${task.title}</span>
                <div class="assigned-card-top-right">
                    ${task.colli > 0 ? `<span class="unassigned-task-colli">${task.colli}c</span>` : ''}
                    <button type="button" class="btn-card-unassign" title="Terug naar onverdeeld">
                        <span class="material-icons">close</span>
                    </button>
                </div>
            </div>
            <div class="assigned-card-subrow">
                <span class="unassigned-task-duration">${formatDuration(task.duration)}</span>
                <div class="assigned-tags-wrapper">
                    <span class="assigned-filler-tag">${filler.name || 'Medewerker'}</span>
                    ${hasHelpers ? `
                        <button type="button" class="btn-helpers-dropdown-toggle" title="Toon helpers">
                            <span class="badge-helper-pill">${helpers.length} Helper${helpers.length > 1 ? 's' : ''}</span>
                            <span class="material-icons dropdown-arrow">expand_more</span>
                        </button>
                    ` : ''}
                </div>
            </div>
            ${hasHelpers ? `
                <div class="assigned-helpers-sublist">
                    ${helpers.map((h, hIdx) => `
                        <div class="assigned-helper-row" draggable="false" data-helper-idx="${hIdx}">
                            <div class="assigned-helper-info">
                                <span class="assigned-helper-name" title="${h.filler.name || 'Helper'}">${h.filler.name || 'Helper'}</span>
                                <span class="assigned-helper-dur">${formatDuration(h.task.duration)}</span>
                            </div>
                            <button type="button" class="btn-card-unassign btn-helper-unassign" data-helper-idx="${hIdx}" title="Helper verwijderen">
                                <span class="material-icons">close</span>
                            </button>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;

        card.addEventListener('mouseenter', (e) => {
            showCustomTooltip(e, {
                type: task.type,
                title: task.title,
                duration: task.duration,
                colli: task.colli,
                isHelper: false
            });
        });

        card.addEventListener('mousemove', (e) => {
            positionCustomTooltip(e);
        });

        card.addEventListener('mouseleave', () => {
            hideCustomTooltip();
        });

        card.addEventListener('dragstart', (e) => {
            if (e.target.closest('.assigned-helpers-sublist')) {
                e.preventDefault();
                return;
            }
            hideCustomTooltip();
            const dragData = {
                source: 'sidebar_assigned',
                taskId: task.id,
                fillerId: filler.id,
                taskIndex: taskIndex
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

        const toggleBtn = card.querySelector('.btn-helpers-dropdown-toggle');
        const sublist = card.querySelector('.assigned-helpers-sublist');
        if (toggleBtn && sublist) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = sublist.classList.toggle('is-open');
                toggleBtn.classList.toggle('is-open', isOpen);
            });
        }

        const helperUnassignBtns = card.querySelectorAll('.btn-helper-unassign');
        helperUnassignBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                hideCustomTooltip();
                const hIdx = parseInt(btn.getAttribute('data-helper-idx'), 10);
                const h = helpers[hIdx];
                if (h && onUnassignTask) {
                    onUnassignTask(h.filler.id, h.taskIndex);
                }
            });
        });

        const unassignBtn = card.querySelector('.btn-card-unassign:not(.btn-helper-unassign)');
        if (unassignBtn) {
            unassignBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                hideCustomTooltip();
                if (onUnassignTask) {
                    onUnassignTask(filler.id, taskIndex);
                }
            });
        }

        card.addEventListener('dblclick', (e) => {
            if (e.target.closest('.assigned-helpers-sublist')) return;
            hideCustomTooltip();
            if (onUnassignTask) {
                onUnassignTask(filler.id, taskIndex);
            }
        });

        card.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.assigned-helpers-sublist')) return;
            showContextMenu(e, task, true, filler.id, taskIndex, {
                onRenderRows,
                onRenderUnassigned,
                onUnassignTask
            });
        });

        assignedTasksList.appendChild(card);
    });
}
