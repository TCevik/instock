import { loadHeader } from '../header.js';
import { checkAuth } from '../main.js';
import { setStoreId } from './state.js';
import { loadData } from './storage.js';
import { uiRenderer } from './ui-renderer.js';
import { initContextMenu } from './context-menu.js';

(() => {
    document.addEventListener('DOMContentLoaded', async () => {
        const auth = await checkAuth(['beheerder']);
        if (!auth) return;
        loadHeader();
        initContextMenu();
        setStoreId(auth.userData.winkel);
        const uploadGroup = document.querySelector('.upload-group');
        if (uploadGroup && auth.storeCode !== 'plus-lms') {
            uploadGroup.style.display = 'none';
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
