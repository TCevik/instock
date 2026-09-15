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
