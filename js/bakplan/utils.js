import { getCurrentDay } from './state.js';

export function getDayValue(item, field, day = getCurrentDay()) {
    if (item.days && item.days[day] && item.days[day][field] !== undefined) {
        return item.days[day][field];
    }
    return item[field] !== undefined ? item[field] : null;
}

export function setDayValue(item, field, val, day = getCurrentDay()) {
    if (!item.days) item.days = {};
    if (!item.days[day]) item.days[day] = {};
    item.days[day][field] = val;
}

export function calculatePlaten(opleggen, perPlaat) {
    const numOpleggen = parseFloat(opleggen);
    const numPerPlaat = parseFloat(perPlaat);
    if (isNaN(numOpleggen) || isNaN(numPerPlaat) || numPerPlaat <= 0) return 0;
    return Math.ceil(numOpleggen / numPerPlaat);
}

const BAKPLAN_PER_PLAAT_STORAGE_KEY = 'instock_bakplan_per_plaat';

export function getRememberedPerPlaatMap() {
    try {
        const raw = localStorage.getItem(BAKPLAN_PER_PLAAT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function saveRememberedPerPlaat(omschrijving, perPlaat) {
    if (!omschrijving) return;
    const key = omschrijving.trim().toLowerCase();
    const map = getRememberedPerPlaatMap();
    if (perPlaat !== null && perPlaat !== undefined && perPlaat !== '') {
        map[key] = Number(perPlaat);
    } else {
        delete map[key];
    }
    try {
        localStorage.setItem(BAKPLAN_PER_PLAAT_STORAGE_KEY, JSON.stringify(map));
    } catch {}
}

export function syncBakplanPerPlaatMemory(data) {
    if (!Array.isArray(data)) return;
    const map = getRememberedPerPlaatMap();
    let changed = false;
    for (const cat of data) {
        if (!Array.isArray(cat?.items)) continue;
        for (const item of cat.items) {
            if (item?.omschrijving && item.perPlaat !== null && item.perPlaat !== undefined && item.perPlaat !== '') {
                const key = item.omschrijving.trim().toLowerCase();
                const num = Number(item.perPlaat);
                if (map[key] !== num) {
                    map[key] = num;
                    changed = true;
                }
            }
        }
    }
    if (changed) {
        try {
            localStorage.setItem(BAKPLAN_PER_PLAAT_STORAGE_KEY, JSON.stringify(map));
        } catch {}
    }
}
