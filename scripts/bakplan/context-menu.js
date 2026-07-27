import { DAYS, state } from './state.js';
import { triggerSave } from './storage.js';

const syncFieldAcrossDays = (catIdx, prodIdx, field, value) => {
    DAYS.forEach(day => {
        const dayList = state.daysData[day];
        if (dayList && dayList[catIdx] && dayList[catIdx].products && dayList[catIdx].products[prodIdx]) {
            dayList[catIdx].products[prodIdx][field] = value;
        }
    });
    triggerSave();
};

const syncProductAcrossDays = (catIdx, prodIdx) => {
    const sourceProd = state.daysData[state.selectedDay][catIdx].products[prodIdx];
    if (!sourceProd) return;
    DAYS.forEach(day => {
        const dayList = state.daysData[day];
        if (dayList && dayList[catIdx] && dayList[catIdx].products && dayList[catIdx].products[prodIdx]) {
            const targetProd = dayList[catIdx].products[prodIdx];
            targetProd.description = sourceProd.description;
            targetProd.price = sourceProd.price;
            targetProd.promo = sourceProd.promo;
            targetProd.gemVerk = sourceProd.gemVerk;
            targetProd.derving = sourceProd.derving;
        }
    });
    triggerSave();
};

const fieldNamesNL = {
    description: 'Productomschrijving',
    price: 'Prijs',
    promo: 'Promo',
    gemVerk: 'Opleggen',
    derving: 'Derving'
};

let activeContextMenuTarget = null;

export const initContextMenu = () => {
    const menu = document.getElementById('context-menu');
    const syncFieldBtn = document.getElementById('ctx-sync-field');
    const syncProductBtn = document.getElementById('ctx-sync-product');
    const fieldTextSpan = document.getElementById('ctx-field-text');

    if (!menu || !syncFieldBtn || !syncProductBtn) return;

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    syncFieldBtn.addEventListener('click', () => {
        if (activeContextMenuTarget) {
            const { catIdx, prodIdx, field } = activeContextMenuTarget;
            const catObj = state.daysData[state.selectedDay][catIdx];
            if (catObj && catObj.products && catObj.products[prodIdx]) {
                const value = catObj.products[prodIdx][field];
                syncFieldAcrossDays(catIdx, prodIdx, field, value);
            }
        }
        menu.style.display = 'none';
    });

    syncProductBtn.addEventListener('click', () => {
        if (activeContextMenuTarget) {
            const { catIdx, prodIdx } = activeContextMenuTarget;
            syncProductAcrossDays(catIdx, prodIdx);
        }
        menu.style.display = 'none';
    });

    window.openContextMenu = (e, catIdx, prodIdx, field) => {
        e.preventDefault();
        activeContextMenuTarget = { catIdx, prodIdx, field };
        const label = fieldNamesNL[field] || field;
        if (fieldTextSpan) {
            fieldTextSpan.textContent = `Sync alleen ${label.toLowerCase()} voor alle dagen`;
        }
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.display = 'block';
    };
};
