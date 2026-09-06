import { planningState } from './state.js';
import { timeToMinutes, minutesToTime, formatDuration, parsePauseMinutes } from './time-utils.js';
import { escapeHtml, showToast } from '../main.js';

export function generatePrintDocument() {
    const container = document.getElementById('print-planning-container');
    if (!container) return;

    if (!planningState.fillers || planningState.fillers.length === 0) {
        container.innerHTML = `
            <div style="padding: 24px; text-align: center; font-size: 14px; color: var(--print-text);">
                Geen vulplanning data gevonden om te printen.
            </div>
        `;
        return;
    }

    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    const dateFormatted = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const rowsHtml = planningState.fillers.map(filler => {
        const shiftStart = timeToMinutes(filler.from);
        let shiftEnd = timeToMinutes(filler.to);
        if (shiftEnd > 0 && shiftEnd <= shiftStart) {
            shiftEnd += 24 * 60;
        }
        const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);
        const assigned = planningState.assignedTasks[filler.id] || [];

        let assignedPauzeMins = 0;
        let totalAssignedMins = 0;

        assigned.forEach(t => {
            totalAssignedMins += t.duration;
            if (t.type === 'pauze') {
                assignedPauzeMins += t.duration;
            }
        });

        const presetPause = parsePauseMinutes(filler.pause);
        const presetPauseStr = formatDuration(presetPause);
        const targetShiftDuration = Math.max(0, shiftGrossDuration - presetPause) + assignedPauzeMins;

        let currentMins = shiftStart >= 0 ? shiftStart : 0;
        const tasksHtml = assigned.length === 0
            ? `<div class="print-no-tasks">Geen taken toegewezen</div>`
            : assigned.map(t => {
                const isHelper = !!t.isHelper;
                const typeClass = isHelper ? 'is-helper' : `type-${t.type || 'overige'}`;
                const startStr = minutesToTime(currentMins);
                const endStr = minutesToTime(currentMins + t.duration);
                currentMins += t.duration;

                let titleText = (t.title || 'Taak').replace(/\s*\(\d+\s*c\)/gi, '').trim();
                if (isHelper) {
                    titleText += ' (Hulp)';
                } else if (t.colli) {
                    titleText += ` (${t.colli} c)`;
                }

                return `
                    <div class="print-task-pill ${typeClass}">
                        <div class="print-task-top" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
                        <div class="print-task-sub">
                            <span>${formatDuration(t.duration)}</span>
                            <span>${startStr} - ${endStr}</span>
                        </div>
                    </div>
                `;
            }).join('');

        return `
            <tr class="print-worker-row">
                <td>
                    <div class="print-worker-cell-name">${escapeHtml(filler.name || 'Medewerker')}</div>
                    <div class="print-worker-cell-hours">${filler.from || '00:00'} - ${filler.to || '00:00'}</div>
                </td>
                <td>
                    <div class="print-statbox">
                        <div class="print-statbox-line">Tijd: <strong>${formatDuration(totalAssignedMins)} / ${formatDuration(targetShiftDuration)}</strong></div>
                        <div class="print-statbox-line">Pauze: <strong>${formatDuration(assignedPauzeMins)} / ${presetPauseStr}</strong></div>
                    </div>
                </td>
                <td>
                    <div class="print-endtime-box"></div>
                </td>
                <td>
                    <div class="print-tasks-wrap">
                        ${tasksHtml}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="print-header-row">
            <div class="print-main-title">Vulplanning</div>
            <div class="print-timestamp">${dateFormatted}</div>
        </div>
        <table class="print-planning-table">
            <thead>
                <tr>
                    <th class="print-th-worker">MEDEWERKER</th>
                    <th class="print-th-time">TIJD & PAUZE</th>
                    <th class="print-th-endtime">EINDTIJD</th>
                    <th class="print-th-tasks">TOEGEWEZEN TAKEN</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>
    `;
}

export function printVulplanning() {
    if (!planningState.fillers || planningState.fillers.length === 0) {
        showToast('error', 'Geen planning om te printen. Maak eerst een planning.');
        return;
    }
    generatePrintDocument();
    window.print();
}

export function setupPrintPlanning(printButton) {
    if (printButton) {
        printButton.addEventListener('click', () => {
            printVulplanning();
        });
    }

    window.addEventListener('beforeprint', () => {
        generatePrintDocument();
    });
}
