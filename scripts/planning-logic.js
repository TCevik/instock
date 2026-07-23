export const PATHS_MAPPING = {
    "Wijn, Chips, Nootjes": ["Wijnen", "Zoutjes Snacks"],
    "Frisdrank, Bier": ["Frisdrank", "Bieren", "Vruchtensappen"],
    "Ontbijt": ["Ontbijtvervangers", "Boterhambeleg"],
    "Koffie, Koek, Chocolade": ["Koffie Thee", "Koffiemelk", "Koekjes", "Chocolade", "Suikerwerk", "Suiker"],
    "Maaltijdstraat Conserven": ["Groenteconserven", "Vleesconserven", "Zuren sauzen", "Soepen", "Houdbare zuivel", "Gezondheidsvoeding"],
    "Maaltijdstraat Oosters": ["Rijst en deegwaren", "Maaltijdstraat LDC + Specerijen"],
    "Eieren, Afbakbrood": ["Eieren", "Meelproducten"],
    "Non Food": ["Papierwaren", "Kindervoeding", "Luiers", "Wasmiddelen", "Reinigingsmiddelen", "Sorbo", "Huishoudelijk", "Nonfood", "Persoonlijke verzorging", "dierenvoeding"],
    "Diepvries": ["Diepvries"],
    "Zuivel": ["Zuivel", "Geelvetten"],
    "Vlees": ["Vers vlees", "Vis"],
    "Vleeswaren, Kaas": ["Vleeswaren AV/AVA", "Vleeswaren ZB", "Kaas AV/AVA", "Kaas ZB"]
};

export const MIRROR_TIMES = {
    "Wijn, Chips, Nootjes": 15,
    "Frisdrank, Bier": 21,
    "Ontbijt": 10,
    "Koffie, Koek, Chocolade": 21,
    "Maaltijdstraat Conserven": 21,
    "Maaltijdstraat Oosters": 21,
    "Eieren, Afbakbrood": 15,
    "Non Food": 21,
    "Diepvries": 21,
    "Zuivel": 21,
    "Vlees": 21,
    "Vleeswaren, Kaas": 21
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
    if (state.fillerBreaks && state.fillerBreaks[displayName] !== undefined) {
        return state.fillerBreaks[displayName];
    }
    const match = displayName.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?/);
    if (!match) return 0;
    const parts = match[0].split('-').map(p => p.trim());
    if (parts.length !== 2) return 0;
    const parseTime = (str) => {
        const hm = str.split(':');
        return (parseInt(hm[0]) || 0) * 60 + (parseInt(hm[1]) || 0);
    };
    const gross = parseTime(parts[1]) - parseTime(parts[0]);
    if (gross >= 480) return 60;
    if (gross >= 270) return 30;
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
    if (type === 'mirror') return MIRROR_TIMES[pathName] || 0;
    return 0;
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
        if (taskId.endsWith('_helper')) {
            total += getTaskDuration(taskId, state);
        } else {
            const duration = getTaskDuration(taskId, state);
            const helperInfo = state.helpers[taskId];
            if (helperInfo && helperInfo.helperName) {
                const helperDuration = (helperInfo.isMax || helperInfo.isHalf) ? (helperInfo.calculatedDuration || 0) : Math.min(duration, helperInfo.duration || 0);
                total += (duration - helperDuration);
            } else {
                total += duration;
            }
        }
    });
    return total;
};

export const getFillerProductivity = (displayName, state) => {
    const startMin = getFillerStartTime(displayName);
    const endMin = getFillerActualEndTime(displayName, state);
    if (!isFinite(endMin) || endMin <= startMin) return null;
    const pauseMin = getFillerPause(displayName, state);
    const workedNet = Math.max(1, (endMin - startMin) - pauseMin);
    const plannedTime = getFillerTotalTime(displayName, state);
    if (plannedTime <= 0) return null;
    return Math.round((plannedTime / workedNet) * 100);
};

export const formatTimeOfDay = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const mins = Math.floor(totalMinutes % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export const getTaskAssignment = (taskId, state) => {
    for (const [filler, tasks] of Object.entries(state.fillerTasks)) {
        if (tasks.includes(taskId)) {
            return filler;
        }
    }
    return null;
};
