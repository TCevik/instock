import { getSupabase } from '../main.js';
import { state } from './state.js';

let currentStoreId = null;
let saveTimeout = null;

export const setStoreId = (id) => {
    currentStoreId = id;
};

export const getStoreId = () => currentStoreId;

export const triggerSave = () => {
    if (!currentStoreId) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const supabase = await getSupabase();
        const payload = {
            selectedFillers: state.selectedFillers,
            pathColli: state.pathColli,
            fillerTasks: state.fillerTasks,
            helpers: state.helpers,
            otherTimes: state.otherTimes,
            instanceTimes: state.instanceTimes,
            fillerBreaks: state.fillerBreaks,
            actualEndTimes: state.actualEndTimes,
            nonFillers: state.nonFillers || [],
            hiddenFillers: state.hiddenFillers || [],
            showNonFillers: !!state.showNonFillers,
            showReallyHidden: !!state.showReallyHidden,
            autoPairSettings: state.autoPairSettings || { enabled: false, prependOtherTask: false, selectedOtherTask: "" }
        };
        await supabase.from('vulplanningen').upsert({ id: currentStoreId, vulplanning: payload });
    }, 500);
};

export const loadData = async () => {
    if (!currentStoreId) return;
    const supabase = await getSupabase();
    const { data } = await supabase.from('vulplanningen').select('vulplanning').eq('id', currentStoreId).single();
    if (data && data.vulplanning) {
        const vp = data.vulplanning;
        if (vp.selectedFillers) state.selectedFillers = vp.selectedFillers;
        if (vp.pathColli) state.pathColli = vp.pathColli;
        if (vp.fillerTasks) state.fillerTasks = vp.fillerTasks;
        if (vp.helpers) state.helpers = vp.helpers;
        if (vp.otherTimes) state.otherTimes = vp.otherTimes;
        state.otherTimes["Pauze"] = 0;
        if (vp.instanceTimes) state.instanceTimes = vp.instanceTimes;
        if (vp.fillerBreaks) state.fillerBreaks = vp.fillerBreaks;
        if (vp.actualEndTimes) state.actualEndTimes = vp.actualEndTimes;
        if (vp.nonFillers) state.nonFillers = vp.nonFillers;
        if (vp.hiddenFillers) state.hiddenFillers = vp.hiddenFillers;
        if (vp.showNonFillers !== undefined) state.showNonFillers = vp.showNonFillers;
        if (vp.autoPairSettings) state.autoPairSettings = vp.autoPairSettings;
    }
};
