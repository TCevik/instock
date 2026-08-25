export const parsePadenData = (padenData) => {
    const list = Array.isArray(padenData) ? padenData : [];
    const pathsMapping = {};
    const normsMapping = {};
    const mirrorNormsMapping = {};
    const restantenNormsMapping = {};
    list.forEach(p => {
        if (!p.name) return;
        if (p.mirrorNorm !== undefined) {
            mirrorNormsMapping[p.name] = parseFloat(p.mirrorNorm) || 21;
        }
        if (p.restantenNorm !== undefined) {
            restantenNormsMapping[p.name] = parseFloat(p.restantenNorm) || 20;
        }
        const cats = Array.isArray(p.categories) ? p.categories : [];
        pathsMapping[p.name] = cats.map(c => typeof c === 'string' ? c : c.name).filter(Boolean);
        cats.forEach(c => {
            if (typeof c === 'object' && c.name) {
                normsMapping[c.name.toLowerCase()] = parseFloat(c.norm) || 62;
            }
        });
    });
    return { pathsMapping, normsMapping, mirrorNormsMapping, restantenNormsMapping };
};

export const getAutoTasksForFillTask = (taskId, autoPairSettings, pathColli) => {
    let prepended = null;
    let prependedRestanten = null;
    let appended = null;
    if (taskId && taskId.endsWith('_fill') && autoPairSettings) {
        const pKey = taskId.replace('_fill', '');
        if (autoPairSettings.prependRestanten) {
            if (pathColli && pathColli[pKey]) {
                prependedRestanten = `${pKey}_restanten`;
            }
        }
        if (autoPairSettings.prependOtherTask && autoPairSettings.selectedOtherTask) {
            prepended = `${autoPairSettings.selectedOtherTask}_other`;
        }
        if (autoPairSettings.enabled) {
            if (pathColli && pathColli[pKey]) {
                appended = `${pKey}_mirror`;
            }
        }
    }
    return { prepended, prependedRestanten, appended };
};

export const getHelperTaskIdsForMainTask = (mainTaskId, state) => {
    const list = [];
    if (!state || !state.fillerTasks) return list;
    Object.values(state.fillerTasks).forEach(tasks => {
        if (Array.isArray(tasks)) {
            tasks.forEach(tId => {
                if (typeof tId === 'string' && tId.includes('_helper') && tId.split('_helper')[0] === mainTaskId) {
                    list.push(tId);
                }
            });
        }
    });
    return list;
};

export const getBaseTaskDuration = (taskId, state) => {
    if (!taskId) return 0;
    const mainTaskId = taskId.includes('_helper') ? taskId.split('_helper')[0] : taskId;
    if (state && state.instanceTimes && state.instanceTimes[mainTaskId] !== undefined) {
        return state.instanceTimes[mainTaskId];
    }
    if (state && state.instanceTimes && state.instanceTimes[taskId] !== undefined) {
        return state.instanceTimes[taskId];
    }
    const [pathName, type] = mainTaskId.split('_');
    if (type === 'other') {
        return (state && state.otherTimes && state.otherTimes[pathName]) || 0;
    }
    const data = state && state.pathColli && state.pathColli[pathName];
    if (!data) return 0;
    if (type === 'fill') return data.duration;
    if (type === 'mirror') return data.mirrorDuration !== undefined ? data.mirrorDuration : 21;
    if (type === 'restanten') return data.restantenDuration !== undefined ? data.restantenDuration : 20;
    return 0;
};

export const getTaskDuration = (taskId, state) => {
    if (!taskId) return 0;
    if (taskId.includes('_helper')) {
        const mainTaskId = taskId.split('_helper')[0];
        const helperIds = getHelperTaskIdsForMainTask(mainTaskId, state);
        const totalWorkers = 1 + Math.max(1, helperIds.length);
        const baseDuration = getBaseTaskDuration(mainTaskId, state);
        return Math.floor(baseDuration / totalWorkers);
    }
    return getBaseTaskDuration(taskId, state);
};

export const getEffectiveTaskDuration = (taskId, state) => {
    if (!taskId) return 0;
    if (taskId.includes('_helper')) {
        return getTaskDuration(taskId, state);
    }
    const helperIds = getHelperTaskIdsForMainTask(taskId, state);
    if (helperIds.length > 0) {
        const totalWorkers = 1 + helperIds.length;
        const baseDuration = getBaseTaskDuration(taskId, state);
        return Math.floor(baseDuration / totalWorkers);
    }
    return getTaskDuration(taskId, state);
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
        const isHelper = taskId.includes('_helper');
        const mainTaskId = isHelper ? taskId.split('_helper')[0] : taskId;
        const [pathName, type] = mainTaskId.split('_');
        if (type === 'fill' && state.pathColli[pathName]) {
            const colli = state.pathColli[pathName].colli || 0;
            const helperIds = getHelperTaskIdsForMainTask(mainTaskId, state);
            const totalWorkers = 1 + helperIds.length;
            total += colli / totalWorkers;
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

export const getFillerBreakTime = (displayName, state) => {
    let total = 0;
    const tasks = state?.fillerTasks?.[displayName] || [];
    tasks.forEach(taskId => {
        const [pathName] = taskId.replace('_helper', '').split('_');
        if (pathName === 'Pauze') {
            total += getTaskDuration(taskId, state);
        }
    });
    return total;
};

export const getFillerProductivity = (displayName, state) => {
    const startMin = getFillerStartTime(displayName);
    const endMin = getFillerActualEndTime(displayName, state);
    if (!isFinite(endMin) || endMin <= startMin) return null;
    const presetPause = getFillerPause(displayName, state);
    const taskBreaks = getFillerBreakTime(displayName, state);
    const hasTaskBreaks = (state?.fillerTasks?.[displayName] || []).some(tId => {
        const [pName] = (tId.includes('_helper') ? tId.split('_helper')[0] : tId).split('_');
        return pName === 'Pauze';
    });
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

export const formatTaskDisplayName = (task) => {
    if (!task) return '';
    let taskId = '';
    let duration = null;

    if (typeof task === 'object') {
        taskId = task.id || task.taskId || task.name || '';
        duration = task.duration ?? task.minutes ?? null;
    } else if (typeof task === 'string') {
        if (task.includes('|')) {
            const parts = task.split('|');
            taskId = parts[0];
            const parsedDur = parseInt(parts[1], 10);
            if (!isNaN(parsedDur)) duration = parsedDur;
        } else {
            taskId = task;
        }
    }

    if (!taskId) return '';
    const isHelper = taskId.includes('_helper');
    const cleanId = isHelper ? taskId.split('_helper')[0] : taskId;
    const [pathName, rawType] = cleanId.split('_');
    const type = (rawType || '').split('-')[0];
    let typeLabel = '';
    if (type === 'fill') typeLabel = 'Vullen';
    else if (type === 'mirror') typeLabel = 'Spiegelen';
    else if (type === 'restanten') typeLabel = 'Restanten';
    else if (type === 'other') typeLabel = 'Overig';
    
    let result = pathName;
    if (typeLabel && pathName !== 'Pauze') {
        result += ` (${typeLabel})`;
    }
    if (isHelper) {
        result += ' (Hulp)';
    }
    if (duration !== null && duration > 0) {
        result += ` • ${formatMin(duration)}`;
    }
    return result;
};
