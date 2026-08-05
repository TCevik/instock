import {
    state,
    getFillerPause,
    getEffectiveTaskDuration
} from './state.js';
import {
    formatTimeOfDay,
    getFillerStartTime,
    getFillerEndTime,
    parseNameAndSubtitle
} from './planning-logic.js';

export const generatePrintablePlanning = () => {
    const printWin = window.open('about:blank', '_blank');
    if (!printWin) return;

    const visibleFillers = state.selectedFillers.filter(f => !(state.hiddenFillers || []).includes(f));
    const sortedFillers = [...visibleFillers].sort((a, b) => {
        if (state.fillerSortOrder === 'name-asc') return a.localeCompare(b);
        if (state.fillerSortOrder === 'name-desc') return b.localeCompare(a);
        if (state.fillerSortOrder === 'start-asc') return getFillerStartTime(a) - getFillerStartTime(b);
        if (state.fillerSortOrder === 'start-desc') return getFillerStartTime(b) - getFillerStartTime(a);
        if (state.fillerSortOrder === 'end-asc') return getFillerEndTime(a) - getFillerEndTime(b);
        if (state.fillerSortOrder === 'end-desc') return getFillerEndTime(b) - getFillerEndTime(a);
        return a.localeCompare(b);
    });

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let cardsHtml = '';
    sortedFillers.forEach(filler => {
        const tasks = state.fillerTasks[filler] || [];
        const startMin = getFillerStartTime(filler);
        const startStr = isFinite(startMin) ? formatTimeOfDay(startMin) : '--:--';
        const pauseMin = getFillerPause(filler);
        const plannedEndMin = getFillerEndTime(filler);
        const plannedEndStr = isFinite(plannedEndMin) ? formatTimeOfDay(plannedEndMin) : '--:--';

        let currentTime = isFinite(startMin) ? startMin : 0;

        if (tasks.length === 0) {
            cardsHtml += `<div class="printable-card empty-card"><div class="card-header"><span class="filler-name">${parseNameAndSubtitle(filler).name}</span><span class="time-compact">${startStr} - ${plannedEndStr} | Pauze: ${pauseMin}m</span></div><div class="empty-label">Geen taken</div></div>`;
        } else {
            let tasksListHtml = '';
            tasks.forEach(taskId => {
                const duration = getEffectiveTaskDuration(taskId);
                const tStart = currentTime;
                currentTime += duration;
                const startTimeStr = formatTimeOfDay(tStart);
                const endTimeStr = formatTimeOfDay(currentTime);
                let taskTitle = '';
                let taskBadge = '';
                let badgeClass = '';
                if (taskId.endsWith('_helper')) {
                    const mainTaskId = taskId.replace('_helper', '');
                    taskTitle = `${mainTaskId.split('_')[0]} (Hulp)`;
                    taskBadge = 'Hulp';
                    badgeClass = 'badge-helper';
                } else {
                    const [pName, pType] = taskId.split('_');
                    taskTitle = pName;
                    if (pType === 'fill') { taskBadge = 'Vul'; badgeClass = 'badge-fill'; }
                    else if (pType === 'mirror') { taskBadge = 'Spgl'; badgeClass = 'badge-mirror'; }
                    else if (pName === 'Pauze') { taskBadge = 'Pauze'; badgeClass = 'badge-other'; }
                    else { taskBadge = 'Ovr'; badgeClass = 'badge-other'; }
                }
                tasksListHtml += `<div class="task-row"><span class="task-time">${startTimeStr}-${endTimeStr}</span><span class="task-name">${taskTitle}</span><span class="task-badge ${badgeClass}">${taskBadge}</span></div>`;
            });
            cardsHtml += `<div class="printable-card"><div class="card-header"><span class="filler-name">${parseNameAndSubtitle(filler).name}</span><span class="time-compact">${startStr} - ${plannedEndStr} | Pauze: ${pauseMin}m</span></div><div class="card-body">${tasksListHtml}</div></div>`;
        }
    });

    let padTableRowsHtml = '';
    const padMap = {};
    sortedFillers.forEach(filler => {
        const tasks = state.fillerTasks[filler] || [];
        const startMin = getFillerStartTime(filler);
        let currentTime = isFinite(startMin) ? startMin : 0;
        const cleanName = parseNameAndSubtitle(filler).name;
        tasks.forEach(taskId => {
            const duration = getEffectiveTaskDuration(taskId);
            const tStart = currentTime;
            currentTime += duration;
            let padName = '';
            let role = '';
            if (taskId.endsWith('_helper')) {
                const mainTaskId = taskId.replace('_helper', '');
                const [pName, pType] = mainTaskId.split('_');
                padName = pName;
                role = pType === 'mirror' ? 'Hulp Spiegelen' : 'Hulp Vullen';
            } else {
                const [pName, pType] = taskId.split('_');
                padName = pName;
                role = pType === 'fill' ? 'Vullen' : pType === 'mirror' ? 'Spiegelen' : 'Overig';
            }
            if (padName && role !== 'Overig') {
                if (!padMap[padName]) padMap[padName] = [];
                padMap[padName].push({ cleanName, role, startTimeStr: formatTimeOfDay(tStart), endTimeStr: formatTimeOfDay(currentTime), durationMins: duration });
            }
        });
    });

    Object.keys(padMap).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).forEach(padName => {
        const assignments = padMap[padName];
        const uniquePersons = new Set(assignments.map(a => a.cleanName)).size;
        const pathData = state.pathColli[padName] || { colli: 0 };
        const colli = pathData.colli || 0;
        let fillMins = 0, mirrorMins = 0;
        assignments.forEach(a => {
            if (a.role === 'Vullen' || a.role === 'Hulp Vullen') fillMins += a.durationMins || 0;
            else if (a.role === 'Spiegelen' || a.role === 'Hulp Spiegelen') mirrorMins += a.durationMins || 0;
        });
        const fmtM = m => m <= 0 ? '-' : `${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,'0')}`;
        const fillHours = fillMins / 60;
        const norm = (colli > 0 && fillHours > 0) ? Math.round(colli / fillHours) : '-';
        const fillersList = assignments.filter(a => a.role === 'Vullen' || a.role === 'Hulp Vullen').map(a => `${a.cleanName}`).join(', ');
        const mirrorersList = assignments.filter(a => a.role === 'Spiegelen' || a.role === 'Hulp Spiegelen').map(a => `${a.cleanName}`).join(', ');
        padTableRowsHtml += `<tr><td>${padName}</td><td>${fillersList || '-'}</td><td>${mirrorersList || '-'}</td><td>${uniquePersons}</td><td>${colli}</td><td>${norm}</td><td>${fmtM(fillMins)}</td><td>${fmtM(mirrorMins)}</td></tr>`;
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Vulplanning ${dateStr}</title>
<style>
@page{size:A4 landscape;margin:5mm}
*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:0.85rem;line-height:1.3}
body{background:#fff;color:#1e293b;padding:6px 10px}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #658d24;padding-bottom:4px;margin-bottom:6px}
.header h1{font-size:14px;font-weight:700;color:#0f172a}
.header .date{font-size:10px;color:#64748b}
.print-btn{background:#658d24;color:#fff;border:none;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer}
.no-print-bar{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.grid-container{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}
.printable-card{border:1px solid #d1d5db;border-radius:4px;overflow:hidden}
.printable-card.empty-card{max-height:35px;display:flex;align-items:center}
.empty-card .card-header{border-bottom:none;padding:2px 6px;flex:1}
.empty-label{font-size:10px;color:#94a3b8;font-style:italic;padding-right:6px;white-space:nowrap}
.card-header{background:#f8fafc;border-bottom:1px solid #e5e7eb;padding:3px 6px;display:flex;justify-content:space-between;align-items:center}
.filler-name{font-size:11px;font-weight:700;color:#0f172a}
.time-compact{font-size:9px;color:#475569;white-space:nowrap}
.card-body{padding:2px 4px;display:flex;flex-direction:column;gap:1px}
.task-row{display:flex;align-items:center;gap:4px;padding:1px 4px;border-bottom:1px solid #f1f5f9}
.task-row:last-child{border-bottom:none}
.task-time{font-size:9px;font-weight:600;color:#334155;min-width:65px;flex-shrink:0}
.task-name{font-size:10px;font-weight:500;color:#334155;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-badge{font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;text-transform:uppercase;flex-shrink:0}
.badge-fill{background:#dbeafe;color:#1d4ed8}
.badge-mirror{background:#fef3c7;color:#b45309}
.badge-other{background:#ede9fe;color:#6b21a8}
.badge-helper{background:#fce7f3;color:#be185d}
.page-break{page-break-before:always;break-before:page}
.section-title{font-size:13px;font-weight:700;color:#0f172a;border-bottom:1.5px solid #658d24;padding-bottom:3px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center}
.section-title .date{font-size:10px;color:#64748b;font-weight:400}
.pad-table{width:100%;border-collapse:collapse;font-size:11px}
.pad-table th,.pad-table td{border:1px solid #d1d5db;padding:3px 5px}
.pad-table th{background:#f1f5f9;font-weight:700;font-size:10px;text-align:left;white-space:nowrap}
.pad-table td{font-size:10px}
.pad-table td:nth-child(n+4){text-align:center}
.pad-table tr:nth-child(even){background:#fafbfc}
.notes-box{margin-top:8px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;page-break-inside:avoid}
.notes-box h4{font-size:10px;font-weight:700;color:#475569;margin-bottom:2px}
.notes-lines{height:36px}
.notes-lines div{border-bottom:1px dashed #d1d5db;height:12px}
@media print{.no-print-bar{display:none!important}body{padding:5mm;background:#fff}.printable-card{break-inside:avoid}}
</style>
</head>
<body>
<div class="no-print-bar"><button class="print-btn" onclick="window.print()">Afdrukken / Opslaan als PDF</button><span class="date">${dateStr}</span></div>
<div class="header"><h1>Vulplanning Overzicht</h1><span class="date">${dateStr}</span></div>
<div class="grid-container">${cardsHtml}</div>
<div class="page-break"></div>
<div class="section-title"><span>Overzicht per Pad / Afdeling</span><span class="date">${dateStr}</span></div>
<table class="pad-table"><thead><tr><th>Pad</th><th>Vullers</th><th>Spiegelaars</th><th>Pers.</th><th>Colli</th><th>Norm</th><th>Vultijd</th><th>Spgl.tijd</th></tr></thead><tbody>${padTableRowsHtml}</tbody></table>
<div class="notes-box"><h4>Aantekeningen</h4><div class="notes-lines"><div></div><div></div><div></div></div></div>
</body>
</html>`;

    printWin.document.write(htmlContent);
    printWin.document.close();
};
