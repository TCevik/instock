import { showToast } from '../main.js';
import { getCurrentDay, DAYS, saveState } from './state.js';
import { setDayValue, getDayValue } from './utils.js';
import { renderCategories } from './render.js';

let activeBakplanMenu = null;

export function removeBakplanSyncMenu() {
    if (activeBakplanMenu) {
        activeBakplanMenu.remove();
        activeBakplanMenu = null;
    }
}

export function showBakplanSyncMenu(x, y, item, field, value) {
    removeBakplanSyncMenu();

    const menu = document.createElement('div');
    menu.className = 'bakplan-sync-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const currentDay = getCurrentDay();
    const fieldNames = {
        promo: 'Promoprijs',
        opleggen: 'Aantal opleggen',
        derving: 'Aantal derving'
    };
    const fieldLabel = fieldNames[field] || field;
    const dayLabel = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);

    menu.innerHTML = `
        <div class="sync-menu-header">
            <span class="material-icons">sync</span>
            <span>Sync ${fieldLabel} (${dayLabel})</span>
        </div>
        <div class="sync-menu-item" data-action="sync-field-all">
            <span class="material-icons">copy_all</span>
            <span>Kopieer <strong>${fieldLabel}</strong> naar alle 7 dagen</span>
        </div>
        <div class="sync-menu-item" data-action="sync-item-all">
            <span class="material-icons">table_rows</span>
            <span>Kopieer <strong>alle dagwaardes</strong> van dit artikel naar alle dagen</span>
        </div>
        <div class="sync-menu-divider"></div>
        <div class="sync-menu-item" data-action="sync-field-workdays">
            <span class="material-icons">date_range</span>
            <span>Kopieer naar werkdagen (Ma - Vr)</span>
        </div>
        <div class="sync-menu-item" data-action="sync-field-weekend">
            <span class="material-icons">weekend</span>
            <span>Kopieer naar weekend (Za - Zo)</span>
        </div>
    `;

    menu.addEventListener('click', (e) => {
        const itemEl = e.target.closest('.sync-menu-item');
        if (!itemEl) return;
        const action = itemEl.dataset.action;

        saveState();

        if (action === 'sync-field-all') {
            DAYS.forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar alle dagen`);
        } else if (action === 'sync-item-all') {
            const currentPromo = getDayValue(item, 'promo');
            const currentOpleggen = getDayValue(item, 'opleggen');
            const currentDerving = getDayValue(item, 'derving');

            DAYS.forEach(d => {
                setDayValue(item, 'promo', currentPromo, d);
                setDayValue(item, 'opleggen', currentOpleggen, d);
                setDayValue(item, 'derving', currentDerving, d);
            });
            showToast('notification', `Alle dagwaardes gekopieerd naar alle dagen`);
        } else if (action === 'sync-field-workdays') {
            ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag'].forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar werkdagen`);
        } else if (action === 'sync-field-weekend') {
            ['zaterdag', 'zondag'].forEach(d => setDayValue(item, field, value, d));
            showToast('notification', `${fieldLabel} gekopieerd naar het weekend`);
        }

        removeBakplanSyncMenu();
        const searchInput = document.getElementById('bakplan-search');
        renderCategories(searchInput ? searchInput.value : '');
    });

    document.body.appendChild(menu);
    activeBakplanMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 12}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 12}px`;
    }
}

export function initContextMenuDismiss() {
    document.addEventListener('click', (e) => {
        if (activeBakplanMenu && !e.target.closest('.bakplan-sync-menu')) {
            removeBakplanSyncMenu();
        }
    });
}
