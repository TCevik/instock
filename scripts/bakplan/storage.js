import { getSupabase } from '../main.js';
import { DAYS, state, storeId } from './state.js';
import { normalizeDaysData } from './logic.js';

let saveTimeout = null;

export const triggerSave = () => {
    if (!storeId) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        const supabase = await getSupabase();

        const activeProds = new Set();
        DAYS.forEach(day => {
            (state.daysData[day] || []).forEach(c => {
                (c.products || []).forEach(p => {
                    if (p.description) {
                        activeProds.add(p.description.trim());
                    }
                });
            });
        });
        const baseDayList = state.daysData[state.selectedDay] || [];
        const categories = baseDayList.map(c => ({
            category: c.category,
            thawInBatch1: !!c.thawInBatch1,
            products: (c.products || []).map(p => {
                const prodObj = {
                    ceNr: p.ceNr,
                    description: p.description,
                    price: p.price,
                    promo: p.promo
                };
                if (p._pdfMissing) prodObj._pdfMissing = true;
                if (p._pdfNew) prodObj._pdfNew = true;
                return prodObj;
            })
        }));

        const dailyValues = {};
        DAYS.forEach(day => {
            dailyValues[day] = {};
            (state.daysData[day] || []).forEach(c => {
                (c.products || []).forEach(p => {
                    const vals = {
                        gemVerk: p.gemVerk || '0',
                        derving: p.derving || '0',
                        price: p.price || '0.00',
                        promo: p.promo || ''
                    };
                    if (p._pdfMissing) vals._pdfMissing = true;
                    if (p._pdfNew) vals._pdfNew = true;
                    dailyValues[day][p.ceNr] = vals;
                });
            });
        });

        const payload = {
            categories,
            dailyValues,
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
