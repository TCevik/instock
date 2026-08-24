import {
    state,
    getFillerPause,
    getAvailableTime,
    getEffectiveTaskDuration,
    getFillerTotalTime,
    getTaskDuration
} from './state.js';
import {
    formatMin,
    formatTimeOfDay,
    getFillerStartTime,
    getFillerEndTime,
    parseNameAndSubtitle
} from './planning-logic.js';

const sortFillers = (list) => {
    return [...list].sort((a, b) => {
        if (state.fillerSortOrder === 'name-asc') return a.localeCompare(b);
        if (state.fillerSortOrder === 'name-desc') return b.localeCompare(a);
        if (state.fillerSortOrder === 'start-asc') return getFillerStartTime(a) - getFillerStartTime(b);
        if (state.fillerSortOrder === 'start-desc') return getFillerStartTime(b) - getFillerStartTime(a);
        if (state.fillerSortOrder === 'end-asc') return getFillerEndTime(a) - getFillerEndTime(b);
        if (state.fillerSortOrder === 'end-desc') return getFillerEndTime(b) - getFillerEndTime(a);
        return a.localeCompare(b);
    });
};

const buildRowHtml = (filler) => {
    const { name, subtitle } = parseNameAndSubtitle(filler);
    const tasks = state.fillerTasks[filler] || [];
    const startMin = getFillerStartTime(filler);
    const maxMin = getAvailableTime(filler);
    const pauseMin = getFillerPause(filler);
    const totalTime = getFillerTotalTime(filler);
    const roundedTotal = Math.round(totalTime);
    const isExceeded = isFinite(maxMin) && roundedTotal > maxMin;
    const remainingMin = isFinite(maxMin) ? maxMin - roundedTotal : 0;

    let taskBreaks = 0;
    tasks.forEach(tId => {
        const [pName] = (tId.includes('_helper') ? tId.split('_helper')[0] : tId).split('_');
        if (pName === 'Pauze') {
            taskBreaks += getTaskDuration(tId);
        }
    });
    const remainingPause = pauseMin - taskBreaks;

    let currentTime = isFinite(startMin) ? startMin : 0;
    let tasksHtml = '';

    if (tasks.length === 0) {
        tasksHtml = `<div class="empty-tasks-label">Geen taken toegewezen</div>`;
    } else {
        tasks.forEach(taskId => {
            const isHelperTask = taskId.includes('_helper');
            const mainTaskId = isHelperTask ? taskId.split('_helper')[0] : taskId;
            const [pathName, type] = mainTaskId.split('_');
            const isBreakTask = pathName === 'Pauze';
            const duration = getEffectiveTaskDuration(taskId);
            const tStart = currentTime;
            currentTime += duration;

            const data = state.pathColli[pathName];
            const colliSuffix = (type === 'fill' && data && data.colli) ? ` (${data.colli} c)` : '';
            const title = isHelperTask ? `${pathName} (Hulp)` : `${pathName}${colliSuffix}`;
            const timeStr = `${formatTimeOfDay(tStart)} - ${formatTimeOfDay(currentTime)}`;
            const durationText = formatMin(duration);

            let cardTypeClass = type;
            if (isBreakTask) cardTypeClass += ' break-task';
            if (isHelperTask) cardTypeClass += ' helper';

            tasksHtml += `
                <div class="task-card ${cardTypeClass}">
                    <div class="task-card-title">${title}</div>
                    <div class="task-card-meta">
                        <span>${durationText}</span>
                        <span>${timeStr}</span>
                    </div>
                </div>
            `;
        });
    }

    const pauseText = `Pauze: ${formatMin(taskBreaks)} / ${formatMin(pauseMin)}`;

    return `
        <tr class="filler-row ${isExceeded ? 'exceeded' : ''}">
            <td class="td-info">
                <div class="info-container">
                    <span class="filler-name">${name}</span>
                    ${subtitle ? `<span class="filler-subtitle">${subtitle}</span>` : ''}
                </div>
            </td>
            <td class="td-stats">
                <div class="stats-container">
                    <div class="stats-row">
                        <span class="stat-badge ${isExceeded ? 'exceeded' : ''}">Tijd: ${formatMin(roundedTotal)}${isFinite(maxMin) ? ` / ${formatMin(maxMin)}` : ''}</span>
                    </div>
                    <div class="stats-row">
                        <span class="stat-badge">${pauseText}</span>
                    </div>
                </div>
            </td>
            <td class="td-end">
                <span class="end-time-box"></span>
            </td>
            <td class="td-tasks">
                <div class="tasks-wrapper">${tasksHtml}</div>
            </td>
        </tr>
    `;
};

const renderTable = (rows) => `
    <table class="fillers-table">
        <colgroup>
            <col class="col-name">
            <col class="col-stats">
            <col class="col-end">
            <col class="col-tasks">
        </colgroup>
        <thead>
            <tr>
                <th>Medewerker</th>
                <th>Tijd & Pauze</th>
                <th class="th-end">Eindtijd</th>
                <th>Toegewezen Taken</th>
            </tr>
        </thead>
        <tbody>
            ${rows.map(buildRowHtml).join('')}
        </tbody>
    </table>
`;

const executePrint = (notes = []) => {
    let iframe = document.getElementById('print-vulplanning-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-vulplanning-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    doc.open();

    const nonFillers = state.nonFillers || [];
    const hiddenFillers = state.hiddenFillers || [];
    const activeFillers = state.selectedFillers.filter(f => !nonFillers.includes(f) && !hiddenFillers.includes(f));
    const nonFillersList = state.selectedFillers.filter(f => nonFillers.includes(f) && !hiddenFillers.includes(f));

    const sortedActive = sortFillers(activeFillers);
    const sortedNon = sortFillers(nonFillersList);

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let sectionsHtml = '';
    if (sortedActive.length > 0) {
        sectionsHtml += `
            <div class="table-section">
                ${sortedNon.length > 0 ? `<div class="section-title">Vullers</div>` : ''}
                ${renderTable(sortedActive)}
            </div>
        `;
    }
    if (sortedNon.length > 0) {
        sectionsHtml += `
            <div class="table-section">
                <div class="section-title">Niet-vullers</div>
                ${renderTable(sortedNon)}
            </div>
        `;
    }

    const notesHtml = notes.length > 0 ? `
        <div class="print-notes-section">
            <div class="notes-header">Notities</div>
            <div class="notes-list">
                ${notes.map(n => `<div class="note-row"><span class="note-dot">&#8226;</span><span class="note-text">${n}</span></div>`).join('')}
            </div>
        </div>
    ` : '';

    const htmlContent = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Vulplanning ${dateStr}</title>
<style>
@page {
    size: A4 landscape;
    margin: 4mm;
}
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
body {
    background: #ffffff;
    color: #1e293b;
    padding: 2px;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #658d24;
    padding-bottom: 3px;
    margin-bottom: 4px;
}
.header h1 {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
}
.header .date {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
}
.table-section {
    margin-bottom: 4px;
}
.section-title {
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 3px;
    margin-bottom: 2px;
    border-bottom: 1.5px solid #658d24;
    padding-bottom: 1px;
}
.fillers-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 1.5px;
    table-layout: fixed;
}
.fillers-table col.col-name { width: 130px; }
.fillers-table col.col-stats { width: 110px; }
.fillers-table col.col-end { width: 60px; }
.fillers-table col.col-tasks { width: auto; }

.fillers-table th {
    padding: 2px 4px;
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1.5px solid #cbd5e1;
    text-align: left;
}
.fillers-table th.th-end {
    text-align: center;
}
.filler-row {
    background: #ffffff;
    page-break-inside: avoid;
    break-inside: avoid;
}
.filler-row td {
    padding: 1.5px 4px;
    vertical-align: middle;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
}
.filler-row td:first-child {
    border-left: 1px solid #e2e8f0;
    border-top-left-radius: 5px;
    border-bottom-left-radius: 5px;
}
.filler-row td:last-child {
    border-right: 1px solid #e2e8f0;
    border-top-right-radius: 5px;
    border-bottom-right-radius: 5px;
}
.info-container {
    display: flex;
    flex-direction: column;
    gap: 0;
}
.filler-name {
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.15;
}
.filler-subtitle {
    font-size: 10px;
    color: #64748b;
    font-weight: 500;
    line-height: 1.1;
}
.stats-container {
    display: flex;
    flex-direction: column;
    gap: 1px;
}
.stats-row {
    display: flex;
    gap: 3px;
    align-items: center;
}
.stat-badge {
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    padding: 0 3px;
    font-size: 9px;
    font-weight: 600;
    color: #475569;
    white-space: nowrap;
    line-height: 1.3;
}
.stat-badge.positive {
    color: #658d24;
    background: #f0fdf4;
    border-color: #bbf7d0;
}
.stat-badge.negative,
.stat-badge.exceeded {
    color: #dc2626;
    background: #fef2f2;
    border-color: #fecaca;
}
.td-end {
    text-align: center;
}
.end-time-box {
    display: inline-block;
    width: 44px;
    height: 18px;
    border: 1.5px solid #94a3b8;
    border-radius: 3px;
    background: #ffffff;
    box-sizing: border-box;
}
.td-tasks {
    border-left: 1px solid #e2e8f0;
}
.tasks-wrapper {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    min-height: 20px;
}
.empty-tasks-label {
    font-size: 10px;
    color: #94a3b8;
    font-style: italic;
}
.task-card {
    border-radius: 3px;
    padding: 1px 4px;
    min-width: 85px;
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    page-break-inside: avoid;
    break-inside: avoid;
}
.task-card.fill {
    background: #f4f8ec;
    border-color: #c7dc9c;
    border-left: 3px solid #658d24;
}
.task-card.mirror {
    background: #fffbeb;
    border-color: #fde68a;
    border-left: 3px solid #d97706;
}
.task-card.helper {
    background: #fdf2f8;
    border-color: #fbcfe8;
    border-left: 3px solid #db2777;
}
.task-card.break-task {
    background: #fff7ed;
    border-color: #ffedd5;
    border-left: 3px solid #ea580c;
}
.task-card.other {
    background: #eff6ff;
    border-color: #bfdbfe;
    border-left: 3px solid #2563eb;
}
.task-card-title {
    font-size: 10px;
    font-weight: 700;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.15;
}
.task-card-meta {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    font-size: 8.5px;
    font-weight: 600;
    color: #475569;
    line-height: 1.05;
}
.print-notes-section {
    margin-top: 5px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    padding: 3px 8px;
    background: #ffffff;
}
.notes-header {
    font-size: 10px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 1px;
}
.notes-list {
    display: flex;
    flex-direction: column;
    gap: 1.5px;
}
.note-row {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 10px;
    color: #1e293b;
    page-break-inside: avoid;
    break-inside: avoid;
}
.note-dot {
    font-size: 11px;
    color: #658d24;
    font-weight: 700;
}
.note-text {
    font-size: 10px;
    line-height: 1.15;
}
@media print {
    body {
        padding: 0;
        background: #ffffff;
    }
    .filler-row {
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .task-card {
        break-inside: avoid;
        page-break-inside: avoid;
    }
    .note-row {
        break-inside: avoid;
        page-break-inside: avoid;
    }
}
</style>
</head>
<body>
<div class="header">
    <h1>Vulplanning</h1>
    <span class="date">${dateStr}</span>
</div>
${sectionsHtml}
${notesHtml}
</body>
</html>`;

    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 250);
};

export const generatePrintablePlanning = () => {
    let modal = document.getElementById('print-notes-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'print-notes-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <style>
                .modal-note-input:focus {
                    outline: none !important;
                    box-shadow: none !important;
                    border-color: var(--accent-color-sidemenu) !important;
                }
            </style>
            <div class="modal-content" style="max-width: 500px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--vullen-bg); display: flex; align-items: center; justify-content: center;">
                            <i class="material-icons" style="font-size: 20px; color: var(--accent-color-sidemenu);">print</i>
                        </div>
                        <div>
                            <h3 style="font-size: 17px; font-weight: 600; margin: 0; color: var(--text-color);">Notities voor Vulplanning</h3>
                            <p style="font-size: 12px; color: var(--text-color-muted); margin: 0;">Voeg eventueel extra opmerkingen toe op de print</p>
                        </div>
                    </div>
                    <button type="button" id="close-print-notes-x-btn" class="close-modal-btn" style="line-height: 1;">
                        <i class="material-icons" style="font-size: 20px;">close</i>
                    </button>
                </div>
                <div id="print-notes-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; max-height: 250px; overflow-y: auto; padding-right: 2px;"></div>
                <button type="button" id="add-print-note-btn" class="action-btn" style="padding: 8px 12px; font-size: 12px; background-color: var(--input-bg); border: 1px dashed var(--border-color); color: var(--text-color); border-radius: 8px; align-self: flex-start; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 500;">
                    <i class="material-icons" style="font-size: 16px; color: var(--accent-color-sidemenu);">add</i>
                    <span>Regel Toevoegen</span>
                </button>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                    <button type="button" id="cancel-print-notes-btn" class="submit-btn" style="background: var(--border-color); color: var(--text-color); max-width: 110px; box-shadow: none; padding: 8px 14px; font-size: 13px;">Annuleren</button>
                    <button type="button" id="confirm-print-notes-btn" class="submit-btn" style="max-width: 130px; padding: 8px 16px; font-size: 13px;">Afdrukken</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => {
            modal.style.display = 'none';
        };

        document.getElementById('close-print-notes-x-btn').addEventListener('click', closeModal);
        document.getElementById('cancel-print-notes-btn').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.getElementById('add-print-note-btn').addEventListener('click', () => {
            addNoteRow();
        });

        document.getElementById('confirm-print-notes-btn').addEventListener('click', () => {
            const list = document.getElementById('print-notes-list');
            const noteInputs = list.querySelectorAll('.modal-note-input');
            const notes = Array.from(noteInputs).map(inp => inp.value.trim()).filter(Boolean);
            closeModal();
            executePrint(notes);
        });
    }

    const list = document.getElementById('print-notes-list');
    list.innerHTML = '';

    const addNoteRow = (val = '') => {
        const row = document.createElement('div');
        row.className = 'print-note-row';
        row.style.cssText = 'display: flex; gap: 6px; align-items: center;';
        row.innerHTML = `
            <input type="text" placeholder="Typ een notitie..." value="${val}" class="modal-note-input form-input" style="flex: 1; padding: 6px 10px; font-size: 13px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
            <button type="button" class="remove-note-btn action-btn delete" style="padding: 6px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Regel Verwijderen">
                <i class="material-icons" style="font-size: 16px;">delete</i>
            </button>
        `;
        row.querySelector('.remove-note-btn').addEventListener('click', () => {
            if (list.querySelectorAll('.print-note-row').length > 1) {
                row.remove();
            } else {
                const input = row.querySelector('.modal-note-input');
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
        });
        list.appendChild(row);
        const input = row.querySelector('.modal-note-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addNoteRow();
                }
            });
            input.focus();
        }
    };

    addNoteRow();
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        const firstInput = list.querySelector('.modal-note-input');
        if (firstInput) firstInput.focus();
    });
};
