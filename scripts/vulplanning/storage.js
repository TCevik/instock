import { getSupabase } from '../main.js';
import { state } from './state.js';
import { pushHistory } from './history.js';

let currentStoreId = null;
let saveTimeout = null;

export const setStoreId = (id) => {
    currentStoreId = id;
};

export const getStoreId = () => currentStoreId;

export const triggerSave = () => {
    pushHistory();
    if (!currentStoreId) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const supabase = await getSupabase();
        const payload = {
            id: currentStoreId,
            selected_fillers: state.selectedFillers || [],
            path_colli: state.pathColli || {},
            filler_tasks: state.fillerTasks || {},
            helpers: state.helpers || {},
            other_times: state.otherTimes || {},
            instance_times: state.instanceTimes || {},
            filler_breaks: state.fillerBreaks || {},
            actual_end_times: state.actualEndTimes || {},
            non_fillers: state.nonFillers || [],
            hidden_fillers: state.hiddenFillers || [],
            show_non_fillers: !!state.showNonFillers,
            show_really_hidden: !!state.showReallyHidden,
            auto_pair_settings: state.autoPairSettings || { enabled: false, prependOtherTask: false, selectedOtherTask: "" },
            updated_at: new Date().toISOString()
        };
        await supabase.from('vulplanningen').upsert(payload);
    }, 500);
};

export const loadData = async () => {
    if (!currentStoreId) return;
    const supabase = await getSupabase();
    const { data } = await supabase.from('vulplanningen').select('*').eq('id', currentStoreId).single();
    if (data) {
        if (data.selected_fillers !== undefined && data.selected_fillers !== null) {
            state.selectedFillers = data.selected_fillers;
            state.pathColli = data.path_colli || {};
            state.fillerTasks = data.filler_tasks || {};
            state.helpers = data.helpers || {};
            state.otherTimes = data.other_times || {};
            state.otherTimes["Pauze"] = 0;
            state.instanceTimes = data.instance_times || {};
            state.fillerBreaks = data.filler_breaks || {};
            state.actualEndTimes = data.actual_end_times || {};
            state.nonFillers = data.non_fillers || [];
            state.hiddenFillers = data.hidden_fillers || [];
            state.showNonFillers = !!data.show_non_fillers;
            state.showReallyHidden = !!data.show_really_hidden;
            state.autoPairSettings = data.auto_pair_settings || { enabled: false, prependOtherTask: false, selectedOtherTask: "" };
        } else if (data.vulplanning) {
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
            if (vp.showReallyHidden !== undefined) state.showReallyHidden = vp.showReallyHidden;
            if (vp.autoPairSettings) state.autoPairSettings = vp.autoPairSettings;
        }
    }
};
