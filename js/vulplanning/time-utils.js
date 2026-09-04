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
