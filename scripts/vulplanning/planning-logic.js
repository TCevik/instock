export const parsePadenData = (padenData) => {
    const list = Array.isArray(padenData) ? padenData : [];
    const pathsMapping = {};
    const normsMapping = {};
    const mirrorNormsMapping = {};
    list.forEach(p => {
        if (!p.name) return;
        if (p.mirrorNorm !== undefined) {
            mirrorNormsMapping[p.name] = parseFloat(p.mirrorNorm) || 21;
        }
        const cats = Array.isArray(p.categories) ? p.categories : [];
        pathsMapping[p.name] = cats.map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
        cats.forEach(c => {
            if (typeof c === 'object' && c.name) {
                normsMapping[c.name.toLowerCase()] = parseFloat(c.norm) || 62;
            }
        });
    });
    return { pathsMapping, normsMapping, mirrorNormsMapping };
};

export const getTaskDuration = (taskId, state) => {
    if (taskId.endsWith('_helper')) {
        const mainTaskId = taskId.replace('_helper', '');
        const helperInfo = state.helpers[mainTaskId];
        if (!helperInfo) return 0;
        if (helperInfo.isMax || helperInfo.isHalf) {
            return helperInfo.calculatedDuration || 0;
        }
        const mainDuration = getTaskDuration(mainTaskId, state);
        return Math.min(mainDuration, helperInfo.duration || 0);
    }
    if (state.instanceTimes && state.instanceTimes[taskId] !== undefined) {
        return state.instanceTimes[taskId];
    }
    const [pathName, type] = taskId.split('_');
    if (type === 'other') {
        return state.otherTimes[pathName] || 0;
    }
    const data = state.pathColli[pathName];
    if (!data) return 0;
    if (type === 'fill') return data.duration;
    if (type === 'mirror') return data.mirrorDuration !== undefined ? data.mirrorDuration : 21;
    return 0;
};

export const getEffectiveTaskDuration = (taskId, state) => {
    let duration = getTaskDuration(taskId, state);
    if (!taskId.endsWith('_helper')) {
        const helperInfo = state.helpers[taskId];
        if (helperInfo && helperInfo.helperName) {
            const helperDuration = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
            duration = Math.max(0, duration - Math.min(duration, Math.max(0, helperDuration)));
        }
    }
    return duration;
};

export const formatMin = (min) => {
    const hours = Math.floor(min / 60);
    const mins = Math.round(min % 60);
    return hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;
};

export const parseNameAndSubtitle = (str) => {
    if (!str) return { name: '', subtitle: '' };
    const match = str.match(/^(.*?)\s*(?:-|:|\()\s*(\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?)\)?$/);
    if (match) {
        return { name: match[1].trim(), subtitle: match[2].trim() };
    }
    return { name: str, subtitle: '' };
};

export const getFillerPause = (displayName, state) => {
    if (state && state.fillerBreaks && state.fillerBreaks[displayName] !== undefined) {
        return state.fillerBreaks[displayName];
    }
    return 0;
};

export const getAvailableTime = (displayName, state) => {
    const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
    if (!match) return Infinity;
    const parts = match[0].split('-').map(p => p.trim());
    if (parts.length !== 2) return Infinity;
    const parseTime = (str) => {
        const hm = str.split(':');
        const h = parseInt(hm[0]) || 0;
        const m = parseInt(hm[1]) || 0;
        return h * 60 + m;
    };
    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    const gross = end > start ? (end - start) : Infinity;
    if (!isFinite(gross)) return Infinity;
    const pause = getFillerPause(displayName, state);
    return Math.max(0, gross - pause);
};

export const getFillerStartTime = (displayName) => {
    const match = displayName.match(/\b\d{2}:\d{2}\b/);
    if (!match) return 0;
    const parts = match[0].split(':').map(p => parseInt(p) || 0);
    return parts[0] * 60 + parts[1];
};

export const getFillerEndTime = (displayName) => {
    const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
    if (!match) return Infinity;
    const parts = match[0].split('-').map(p => p.trim());
    if (parts.length !== 2) return Infinity;
    const parseTime = (str) => {
        const hm = str.split(':');
        const h = parseInt(hm[0]) || 0;
        const m = parseInt(hm[1]) || 0;
        return h * 60 + m;
    };
    return parseTime(parts[1]);
};

export const getFillerActualEndTime = (displayName, state) => {
    if (state.actualEndTimes && state.actualEndTimes[displayName]) {
        const parts = state.actualEndTimes[displayName].split(':');
        if (parts.length === 2) {
            return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
        }
    }
    return getFillerEndTime(displayName);
};

export const getFillerColli = (displayName, state) => {
    let total = 0;
    const tasks = state.fillerTasks[displayName] || [];
    tasks.forEach(taskId => {
        if (taskId.endsWith('_helper')) {
            const mainTaskId = taskId.replace('_helper', '');
            const [pathName, type] = mainTaskId.split('_');
            if (type === 'fill' && state.pathColli[pathName]) {
                const colli = state.pathColli[pathName].colli || 0;
                const duration = getTaskDuration(mainTaskId, state);
                const helperInfo = state.helpers[mainTaskId];
                if (helperInfo && duration > 0) {
                    const hDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                    total += (hDur / duration) * colli;
                }
            }
        } else {
            const [pathName, type] = taskId.split('_');
            if (type === 'fill' && state.pathColli[pathName]) {
                const colli = state.pathColli[pathName].colli || 0;
                const duration = getTaskDuration(taskId, state);
                const helperInfo = state.helpers[taskId];
                if (helperInfo && helperInfo.helperName && duration > 0) {
                    const hDur = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                    total += ((duration - hDur) / duration) * colli;
                } else {
                    total += colli;
                }
            }
        }
    });
    return Math.round(total);
};

export const getFillerTotalTime = (filler, state) => {
    let total = 0;
    const tasks = state.fillerTasks[filler] || [];
    tasks.forEach(taskId => {
        const [pathName] = taskId.replace('_helper', '').split('_');
        if (pathName === 'Pauze') return;
        total += getEffectiveTaskDuration(taskId, state);
    });
    return total;
};

export const getFillerProductivity = (displayName, state) => {
    const startMin = getFillerStartTime(displayName);
    const endMin = getFillerActualEndTime(displayName, state);
    if (!isFinite(endMin) || endMin <= startMin) return null;
    const presetPause = getFillerPause(displayName, state);
    let taskBreaks = 0;
    let hasTaskBreaks = false;
    if (state && state.fillerTasks && state.fillerTasks[displayName]) {
        state.fillerTasks[displayName].forEach(taskId => {
            const [pathName] = taskId.replace('_helper', '').split('_');
            if (pathName === 'Pauze') {
                taskBreaks += getTaskDuration(taskId, state);
                hasTaskBreaks = true;
            }
        });
    }
    const effectivePause = hasTaskBreaks ? taskBreaks : presetPause;
    const workedNet = Math.max(1, (endMin - startMin) - effectivePause);
    const plannedTime = getFillerTotalTime(displayName, state);
    if (plannedTime <= 0) return null;
    return Math.round((plannedTime / workedNet) * 100);
};

export const getProductivityStatusClass = (pVal) => {
    if (pVal === null || pVal === undefined) return '';
    if (pVal >= 100) return 'prod-healthy';
    if (pVal >= 80) return 'prod-moderate';
    if (pVal >= 55) return 'prod-warning';
    return 'prod-danger';
};

export const formatTimeOfDay = (totalMinutes) => {
    const rounded = Math.round(totalMinutes);
    const hours = Math.floor(rounded / 60) % 24;
    const mins = rounded % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const formatTimeInputValue = (val) => {
    let digits = (val || '').replace(/\D/g, '');
    if (digits.length >= 3) {
        digits = digits.substring(0, 2) + ':' + digits.substring(2, 4);
    }
    if (digits.length > 5) digits = digits.substring(0, 5);
    return digits;
};

export const getTaskAssignment = (taskId, state) => {
    for (const [filler, tasks] of Object.entries(state.fillerTasks)) {
        if (tasks.includes(taskId)) {
            return filler;
        }
    }
    return null;
};

export const matchEmployeeName = (rawName, storeEmployees) => {
    if (!storeEmployees || !storeEmployees.length || !rawName) {
        return { matchedUser: null, hasMultipleMatches: false, candidateMatches: [] };
    }
    const cleanPdfName = rawName.toLowerCase().trim();
    const exactMatches = storeEmployees.filter(emp => emp.toLowerCase().trim() === cleanPdfName);
    if (exactMatches.length === 1) {
        return { matchedUser: exactMatches[0], hasMultipleMatches: false, candidateMatches: exactMatches };
    }
    const includesMatches = storeEmployees.filter(emp => emp.toLowerCase().includes(cleanPdfName));
    if (includesMatches.length === 1) {
        return { matchedUser: includesMatches[0], hasMultipleMatches: false, candidateMatches: includesMatches };
    }
    if (includesMatches.length > 1) {
        return { matchedUser: null, hasMultipleMatches: true, candidateMatches: includesMatches };
    }
    const pdfParts = cleanPdfName.split(/\s+/).filter(Boolean);
    const partMatches = storeEmployees.filter(emp => {
        const empLower = emp.toLowerCase();
        return pdfParts.every(part => empLower.includes(part));
    });
    if (partMatches.length === 1) {
        return { matchedUser: partMatches[0], hasMultipleMatches: false, candidateMatches: partMatches };
    }
    if (partMatches.length > 1) {
        return { matchedUser: null, hasMultipleMatches: true, candidateMatches: partMatches };
    }
    return { matchedUser: null, hasMultipleMatches: false, candidateMatches: [] };
};

export const formatTaskDisplayName = (taskId) => {
    if (!taskId) return '';
    const isHelper = taskId.endsWith('_helper');
    const cleanId = isHelper ? taskId.replace('_helper', '') : taskId;
    const [pathName, rawType] = cleanId.split('_');
    const type = (rawType || '').split('-')[0];
    let typeLabel = '';
    if (type === 'fill') typeLabel = 'Vullen';
    else if (type === 'mirror') typeLabel = 'Spiegelen';
    else if (type === 'other') typeLabel = 'Overig';
    
    let result = pathName;
    if (typeLabel && pathName !== 'Pauze') {
        result += ` (${typeLabel})`;
    }
    if (isHelper) {
        result += ' (Hulp)';
    }
    return result;
};
