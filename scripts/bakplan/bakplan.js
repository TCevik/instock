import { loadHeader } from '../header.js';
import { checkAuth } from '../main.js';
import { setStoreId, setUserRole } from './state.js';
import { loadData } from './storage.js';
import { uiRenderer } from './ui-renderer.js';

(() => {
    document.addEventListener('DOMContentLoaded', async () => {
        const auth = await checkAuth(['beheerder', 'teamleider']);
        if (!auth) return;
        loadHeader();
        setStoreId(auth.userData.winkel);
        setUserRole(auth.userData.role);
        const isTeamleider = auth.userData.role === 'teamleider';
        const uploadGroup = document.querySelector('.upload-group');
        if (uploadGroup && (auth.storeCode !== 'plus-lms' || isTeamleider)) {
            uploadGroup.style.display = 'none';
        }
        if (isTeamleider) {
            const addCatBtn = document.getElementById('add-category-btn');
            const cartsBtn = document.getElementById('bakplan-carts-btn');
            const settingsBtn = document.getElementById('bakplan-settings-btn');
            const clearAllBtn = document.getElementById('clear-all-btn');
            if (addCatBtn) addCatBtn.style.display = 'none';
            if (cartsBtn) cartsBtn.style.display = 'none';
            if (settingsBtn) settingsBtn.style.display = 'none';
            if (clearAllBtn) clearAllBtn.style.display = 'none';
        }
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }
        uiRenderer.init();
        await loadData();
        uiRenderer.renderTabs();
        uiRenderer.renderTable();
    });
})();
