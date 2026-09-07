export function timeToMinutes(str) {
    if (!str || typeof str !== 'string') return 0;
    const clean = str.replace(/[^0-9:]/g, '');
    const parts = clean.split(':');
    if (parts.length < 2) {
        const num = parseInt(parts[0], 10);
        return isNaN(num) ? 0 : num * 60;
    }
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
}

export function minutesToTime(mins) {
    if (isNaN(mins) || mins < 0) mins = 0;
    mins = Math.round(mins);
    const totalHours = Math.floor(mins / 60);
    const m = mins % 60;
    const days = Math.floor(totalHours / 24);
    const h = totalHours % 24;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (days > 0) {
        return `${timeStr} (+${days}D)`;
    }
    return timeStr;
}

export function formatDuration(minutes) {
    if (isNaN(minutes) || minutes <= 0) return '0m';
    const mins = Math.round(minutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}u ${m}m`;
    if (h > 0) return `${h}u`;
    return `${m}m`;
}

export function parsePauseMinutes(pauseStr) {
    if (!pauseStr) return 0;
    const digits = String(pauseStr).replace(/[^0-9]/g, '');
    return parseInt(digits, 10) || 0;
}

export function getFillerShiftDuration(filler) {
    if (!filler) return 0;
    const shiftStart = timeToMinutes(filler.from);
    let shiftEnd = timeToMinutes(filler.to);
    if (shiftEnd > 0 && shiftEnd <= shiftStart) {
        shiftEnd += 24 * 60;
    }
    const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);
    const presetPause = parsePauseMinutes(filler.pause);
    return Math.max(0, shiftGrossDuration - presetPause);
}

export function calculateProductivity(workAssignedMins, actualEndTimeStr, shiftStartStr, shiftEndStr, effectivePauseMins = 0, assignedTasks = []) {
    if (!actualEndTimeStr) return null;
    let clean = String(actualEndTimeStr).trim();
    if (!clean.includes(':') && clean.length === 4) {
        clean = `${clean.substring(0, 2)}:${clean.substring(2, 4)}`;
    }
    if (clean.length < 5) return null;

    const shiftStart = timeToMinutes(shiftStartStr);
    let shiftEnd = timeToMinutes(shiftEndStr);
    if (shiftEnd > 0 && shiftEnd <= shiftStart) {
        shiftEnd += 24 * 60;
    }

    let actualEnd = timeToMinutes(clean);
    if (actualEnd > 0 && actualEnd <= shiftStart && shiftEnd > 24 * 60) {
        actualEnd += 24 * 60;
    }

    const actualGross = Math.max(0, actualEnd - shiftStart);
    if (actualGross <= 0) return null;

    const shiftGrossDuration = Math.max(0, shiftEnd - shiftStart);

    let pauseDeducted = 0;
    const pauseTasks = Array.isArray(assignedTasks) ? assignedTasks.filter(t => t && t.type === 'pauze') : [];

    if (pauseTasks.length > 0) {
        let currentMins = shiftStart;
        assignedTasks.forEach(t => {
            const tStart = currentMins;
            const tEnd = currentMins + t.duration;
            currentMins += t.duration;
            if (t.type === 'pauze') {
                if (actualEnd >= tEnd) {
                    pauseDeducted += t.duration;
                } else if (actualEnd > tStart) {
                    pauseDeducted += (actualEnd - tStart);
                }
            }
        });
    } else if (effectivePauseMins > 0) {
        if (actualGross >= shiftGrossDuration) {
            pauseDeducted = effectivePauseMins;
        } else if (actualGross >= Math.max(120, shiftGrossDuration * 0.5)) {
            pauseDeducted = effectivePauseMins;
        } else if (actualGross > 120 && shiftGrossDuration > 0) {
            pauseDeducted = Math.min(effectivePauseMins, Math.round(effectivePauseMins * (actualGross / shiftGrossDuration)));
        } else {
            pauseDeducted = 0;
        }
    }

    pauseDeducted = Math.min(pauseDeducted, Math.max(0, actualGross - 1));
    const actualNet = Math.max(1, actualGross - pauseDeducted);

    const percent = Math.round((workAssignedMins / actualNet) * 100);
    let statusClass = 'danger';
    if (percent >= 100) statusClass = 'success';
    else if (percent >= 80) statusClass = 'yellow';
    else if (percent >= 60) statusClass = 'orange';

    return { percent, statusClass };
}

export function formatTimeInput(value, isDeleting = false) {
    if (!value) return '';
    let digits = String(value).replace(/\D/g, '');
    if (digits.length > 4) digits = digits.substring(0, 4);
    if (!digits) return '';

    if (isDeleting) {
        if (digits.length === 2 && !value.includes(':')) {
            return digits.substring(0, 1);
        }
        if (value.endsWith(':')) {
            return value;
        }
    }

    let h1 = parseInt(digits[0], 10);
    if (h1 > 2) {
        digits = '0' + digits;
        if (digits.length > 4) digits = digits.substring(0, 4);
    }

    if (digits.length === 1) {
        if (value.includes(':')) {
            return '0' + digits + ':';
        }
        return digits;
    }

    let hh = parseInt(digits.substring(0, 2), 10);
    if (hh > 23) hh = 23;
    let formatted = String(hh).padStart(2, '0') + ':';

    if (digits.length >= 3) {
        let mmStr = digits.substring(2);
        if (parseInt(mmStr[0], 10) > 5) {
            mmStr = '5' + (mmStr[1] || '');
        }
        if (mmStr.length >= 2) {
            let mm = parseInt(mmStr.substring(0, 2), 10);
            if (mm > 59) mm = 59;
            formatted += String(mm).padStart(2, '0');
        } else {
            formatted += mmStr;
        }
    }

    return formatted;
}

export function normalizeTimeOnBlur(value) {
    if (!value) return '';
    let digits = String(value).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 1 || digits.length === 2) {
        let hh = Math.min(23, parseInt(digits, 10));
        return `${String(hh).padStart(2, '0')}:00`;
    } else if (digits.length === 3) {
        let hh = Math.min(23, parseInt(digits.substring(0, 2), 10));
        let mm = Math.min(59, parseInt(digits[2] + '0', 10));
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    } else if (digits.length >= 4) {
        let hh = Math.min(23, parseInt(digits.substring(0, 2), 10));
        let mm = Math.min(59, parseInt(digits.substring(2, 4), 10));
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return '';
}

export function getFillerStats(filler, assignedTasks = []) {
    let assignedPauzeMins = 0;
    let workAssignedMins = 0;
    let totalColli = 0;

    assignedTasks.forEach(t => {
        if (t.type === 'pauze') {
            assignedPauzeMins += (t.duration || 0);
        } else {
            workAssignedMins += (t.duration || 0);
            if (t.colli && Number(t.colli) > 0) {
                totalColli += Number(t.colli);
            }
        }
    });

    const presetPause = parsePauseMinutes(filler.pause);
    const effectivePause = assignedPauzeMins > 0 ? assignedPauzeMins : presetPause;
    const prodResult = calculateProductivity(workAssignedMins, filler.actualEndTime, filler.from, filler.to, effectivePause, assignedTasks);

    return {
        assignedPauzeMins,
        workAssignedMins,
        totalColli,
        presetPause,
        effectivePause,
        prodResult
    };
}

export function getFormattedTasksWithTimes(filler, assignedTasks = []) {
    const shiftStart = timeToMinutes(filler.from);
    let currentMins = shiftStart >= 0 ? shiftStart : 0;
    return (assignedTasks || []).map(t => {
        const dur = Number(t.duration) || 0;
        const tStart = currentMins;
        const tEnd = currentMins + dur;
        currentMins = tEnd;
        const taskData = {
            title: t.title || t.pathName || 'Taak',
            type: t.type || 'overige',
            duration_minutes: dur,
            start_time: minutesToTime(tStart),
            end_time: minutesToTime(tEnd)
        };
        if (t.colli !== undefined && t.colli !== null && Number(t.colli) > 0) {
            taskData.colli = Number(t.colli);
        }
        return taskData;
    });
}

