export const DAYS = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG', 'ZONDAG'];

export const getPlateQuantity = (desc, productPlateConfig) => {
    const key = desc.trim();
    const val = parseInt((productPlateConfig || {})[key]);
    return (!isNaN(val) && val > 0) ? val : 12;
};

export const normalizeDaysData = (data, state) => {
    if (!data) return;
    if (data.categories) {
        const categories = data.categories || [];
        const dailyValues = data.dailyValues || {};

        DAYS.forEach(day => {
            const dayObj = dailyValues[day] || {};
            state.daysData[day] = categories.map(cat => ({
                category: cat.category,
                products: (cat.products || []).map(p => {
                    const vals = dayObj[p.ceNr] || {};
                    const prodObj = {
                        ceNr: p.ceNr,
                        description: p.description,
                        price: vals.price !== undefined ? vals.price : p.price,
                        promo: vals.promo !== undefined ? vals.promo : p.promo,
                        gemVerk: vals.gemVerk !== undefined ? vals.gemVerk : '0',
                        derving: vals.derving !== undefined ? vals.derving : '0'
                    };
                    if (p._pdfMissing || vals._pdfMissing) prodObj._pdfMissing = true;
                    if (p._pdfNew || vals._pdfNew) prodObj._pdfNew = true;
                    return prodObj;
                })
            }));
        });
    } else if (data.daysData) {
        const daysData = data.daysData;
        DAYS.forEach(day => {
            if (daysData[day]) {
                if (Array.isArray(daysData[day])) {
                    state.daysData[day] = daysData[day];
                } else {
                    state.daysData[day] = Object.keys(daysData[day]).map(catName => ({
                        category: catName,
                        products: daysData[day][catName] || []
                    }));
                }
            } else {
                state.daysData[day] = [];
            }
        });
    }
};

export const syncStructureAcrossDays = (state) => {
    const baseDay = state.daysData[state.selectedDay] || [];
    DAYS.forEach(day => {
        if (day === state.selectedDay) return;
        const targetDayList = state.daysData[day] || [];
        const newDayList = [];

        baseDay.forEach((baseCat, catIdx) => {
            const existingTargetCat = targetDayList[catIdx] || targetDayList.find(c => c.category === baseCat.category);
            const newProducts = [];

            baseCat.products.forEach((baseProd, prodIdx) => {
                const existingTargetProd = existingTargetCat ? (
                    (existingTargetCat.products || [])[prodIdx] ||
                    (existingTargetCat.products || []).find(p => p.ceNr === baseProd.ceNr)
                ) : null;

                newProducts.push({
                    ceNr: baseProd.ceNr,
                    description: baseProd.description,
                    price: existingTargetProd ? existingTargetProd.price : baseProd.price,
                    promo: existingTargetProd ? existingTargetProd.promo : baseProd.promo,
                    gemVerk: existingTargetProd ? existingTargetProd.gemVerk : '0',
                    derving: existingTargetProd ? existingTargetProd.derving : '0'
                });
            });

            newDayList.push({
                category: baseCat.category,
                products: newProducts
            });
        });

        state.daysData[day] = newDayList;
    });
};
