import { getSupabase } from '../main.js';
import { DAYS, state, storeId } from './state.js';
import { normalizeDaysData } from './logic.js';

let saveTimeout = null;

export const triggerSave = () => {
    if (!storeId) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const supabase = await getSupabase();
        const payload = {
            daysData: state.daysData,
            productPlateConfig: state.productPlateConfig,
            customCarts: state.customCarts
        };
        await supabase.from('bakplannen').upsert({ id: storeId, bakplan: payload });
    }, 500);
};

export const loadData = async () => {
    if (!storeId) return;
    const supabase = await getSupabase();
    const { data } = await supabase.from('bakplannen').select('bakplan').eq('id', storeId).single();
    if (data && data.bakplan) {
        normalizeDaysData(data.bakplan, state);
        if (data.bakplan.productPlateConfig) state.productPlateConfig = data.bakplan.productPlateConfig;
        if (data.bakplan.customCarts && Array.isArray(data.bakplan.customCarts)) {
            state.customCarts = data.bakplan.customCarts;
        }
    }
};
