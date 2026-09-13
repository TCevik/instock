import { planningState } from './state.js';
import { timeToMinutes } from './time-utils.js';

export function calculateTimelineBounds(fillers) {
    planningState.timelineStartHour = 0;
    let maxMinutes = 0;

    (fillers || planningState.fillers || []).forEach(filler => {
        const shiftStart = timeToMinutes(filler.from);
        let shiftEnd = timeToMinutes(filler.to);
        if (shiftEnd > 0 && shiftEnd <= shiftStart) {
            shiftEnd += 24 * 60;
        }
        if (shiftEnd > maxMinutes) maxMinutes = shiftEnd;

        const assigned = (planningState.assignedTasks && planningState.assignedTasks[filler.id]) || [];
        let cur = shiftStart >= 0 ? shiftStart : 0;
        assigned.forEach(t => {
            cur += t.duration || 0;
        });
        if (cur > maxMinutes) maxMinutes = cur;
    });

    const neededHours = maxMinutes > 0 ? Math.ceil(maxMinutes / 60) : 21;
    planningState.timelineEndHour = Math.max(24, neededHours + 3);
}

export function getPixelsPerMinute() {
    return 1.5 * planningState.zoom;
}

export function getTimelineTotalMinutes() {
    return (planningState.timelineEndHour - planningState.timelineStartHour) * 60;
}

export function renderGridLines(container, startH, endH, pxPerMin) {
    for (let h = startH; h <= endH; h++) {
        const offsetMins = (h - startH) * 60;
        const line = document.createElement('div');
        line.className = 'timeline-grid-line';
        line.style.left = `${offsetMins * pxPerMin}px`;
        container.appendChild(line);
    }
}

export function renderTimelineAxis(timelineHoursAxis) {
    if (!timelineHoursAxis) return;
    timelineHoursAxis.innerHTML = '';

    const startH = planningState.timelineStartHour;
    const endH = planningState.timelineEndHour;
    const pxPerMin = getPixelsPerMinute();
    const totalMins = getTimelineTotalMinutes();

    timelineHoursAxis.style.width = `${totalMins * pxPerMin}px`;

    renderGridLines(timelineHoursAxis, startH, endH, pxPerMin);

    for (let h = startH; h < endH; h++) {
        const offsetMins = (h - startH) * 60;
        const leftPx = offsetMins * pxPerMin;

        const marker = document.createElement('div');
        marker.className = 'timeline-hour-marker';
        marker.style.width = `${60 * pxPerMin}px`;
        if (h === startH) {
            marker.classList.add('marker-start');
        } else if (h === endH - 1) {
            marker.classList.add('marker-end');
        }
        marker.style.left = `${leftPx}px`;

        const dayCount = Math.floor(h / 24);
        const dayH = h % 24;
        let label = `${String(dayH).padStart(2, '0')}:00`;
        if (dayCount > 0) {
            label = `${String(dayH).padStart(2, '0')}:00 +${dayCount}D`;
        }
        marker.textContent = label;
        timelineHoursAxis.appendChild(marker);
    }
}
