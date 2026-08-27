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
    if (!str) return { name: '', subtitle: '', rawName: '', username: '' };
    const timeMatch = str.match(/^(.*?)\s*(?:-|:|\()\s*(\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?)\)?$/);
    let rawNamePart = timeMatch ? timeMatch[1].trim() : str.trim();
    let timeSubtitle = timeMatch ? timeMatch[2].trim() : '';

    const userMatch = rawNamePart.match(/^(.*?)\s*\(@([^\)]+)\)$/);
    let cleanName = rawNamePart;
    let username = '';
    if (userMatch) {
        cleanName = userMatch[1].trim();
        username = userMatch[2].trim();
    }

    return {
        name: cleanName,
        rawName: rawNamePart,
        username: username,
        subtitle: timeSubtitle,
        timeSubtitle: timeSubtitle
    };
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

    let gross = end - start;
    if (gross < 0) {
        gross += 24 * 60;
    }

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
    let endMin = getFillerActualEndTime(displayName, state);

    if (endMin < startMin) {
        endMin += 24 * 60;
    }

    if (!isFinite(endMin) || endMin === startMin) return null;
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

export const normalizeTimeString = (val) => {
    if (!val) return '';
    let str = val.trim();
    if (/^\d{1,2}$/.test(str)) {
        const h = Math.min(23, Math.max(0, parseInt(str, 10)));
        return `${String(h).padStart(2, '0')}:00`;
    }
    if (/^\d{1,2}:\d{1}$/.test(str)) {
        const [hStr, mStr] = str.split(':');
        const h = Math.min(23, Math.max(0, parseInt(hStr, 10)));
        return `${String(h).padStart(2, '0')}:${mStr}0`;
    }
    if (/^\d{1,2}:$/.test(str)) {
        const h = Math.min(23, Math.max(0, parseInt(str.replace(':', ''), 10)));
        return `${String(h).padStart(2, '0')}:00`;
    }
    if (/^\d{1,2}:\d{2}$/.test(str)) {
        const [hStr, mStr] = str.split(':');
        const h = Math.min(23, Math.max(0, parseInt(hStr, 10)));
        const m = Math.min(59, Math.max(0, parseInt(mStr, 10)));
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (/^\d{3}$/.test(str)) {
        const h = Math.min(23, Math.max(0, parseInt(str.substring(0, 1), 10)));
        const m = Math.min(59, Math.max(0, parseInt(str.substring(1, 3), 10)));
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    if (/^\d{4}$/.test(str)) {
        const h = Math.min(23, Math.max(0, parseInt(str.substring(0, 2), 10)));
        const m = Math.min(59, Math.max(0, parseInt(str.substring(2, 4), 10)));
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return str;
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

export const getEmployeeFullName = (emp) => {
    if (!emp) return '';
    if (typeof emp === 'string') return emp;
    return emp.full_name || emp.name || emp.gebruikersnaam || emp.username || '';
};

export const getEmployeeUsername = (emp) => {
    if (!emp || typeof emp === 'string') return '';
    return emp.gebruikersnaam || emp.username || '';
};

export const getEmployeeFirstName = (emp) => {
    const full = getEmployeeFullName(emp);
    return full.split(' ')[0] || full;
};

export const matchEmployeeName = (rawName, storeEmployees, explicitUsername = null) => {
    if (!storeEmployees || !storeEmployees.length || !rawName) {
        return { matchedUser: null, hasMultipleMatches: false, candidateMatches: [] };
    }
    const cleanPdfName = rawName.toLowerCase().trim();

    if (explicitUsername) {
        const found = storeEmployees.find(e => getEmployeeUsername(e).toLowerCase() === explicitUsername.toLowerCase());
        if (found) {
            return { matchedUser: found, hasMultipleMatches: false, candidateMatches: [found] };
        }
    }

    const usernameMatch = storeEmployees.filter(e => {
        const u = getEmployeeUsername(e).toLowerCase();
        return u && (u === cleanPdfName || cleanPdfName === `@${u}`);
    });
    if (usernameMatch.length === 1) {
        return { matchedUser: usernameMatch[0], hasMultipleMatches: false, candidateMatches: usernameMatch };
    }

    const exactMatches = storeEmployees.filter(e => getEmployeeFullName(e).toLowerCase().trim() === cleanPdfName);
    if (exactMatches.length === 1) {
        return { matchedUser: exactMatches[0], hasMultipleMatches: false, candidateMatches: exactMatches };
    }
    if (exactMatches.length > 1) {
        return { matchedUser: null, hasMultipleMatches: true, candidateMatches: exactMatches };
    }

    const partialMatches = storeEmployees.filter(e => {
        const empName = getEmployeeFullName(e).toLowerCase().trim();
        return cleanPdfName.length > 2 && (empName.startsWith(cleanPdfName) || cleanPdfName.startsWith(empName));
    });
    
    if (partialMatches.length === 1) {
        return { matchedUser: partialMatches[0], hasMultipleMatches: false, candidateMatches: partialMatches };
    }
    if (partialMatches.length > 1) {
        return { matchedUser: null, hasMultipleMatches: true, candidateMatches: partialMatches };
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

export const removeFillerFromPlanning = (fillerKey, state) => {
    if (!fillerKey || !state) return;
    state.selectedFillers = (state.selectedFillers || []).filter(f => f !== fillerKey);
    state.nonFillers = (state.nonFillers || []).filter(f => f !== fillerKey);
    state.hiddenFillers = (state.hiddenFillers || []).filter(f => f !== fillerKey);

    const assigned = state.fillerTasks ? (state.fillerTasks[fillerKey] || []) : [];
    assigned.forEach(tId => {
        if (tId.endsWith('_helper')) {
            const mainId = tId.replace('_helper', '');
            if (state.helpers) delete state.helpers[mainId];
        }
    });

    if (state.fillerTasks) delete state.fillerTasks[fillerKey];
    if (state.fillerBreaks) delete state.fillerBreaks[fillerKey];
    if (state.actualEndTimes) delete state.actualEndTimes[fillerKey];

    if (state.helpers) {
        Object.keys(state.helpers).forEach(taskId => {
            if (state.helpers[taskId] && state.helpers[taskId].helperName === fillerKey) {
                delete state.helpers[taskId];
            }
        });
    }
};
