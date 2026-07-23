import { getSupabase, checkAuth, showMessage, handleFormSubmit, initPadenModal } from './main.js';
import { loadHeader, updateHeaderMenu, applyStoreTheme } from './header.js';

const AVAILABLE_MODULES = [
    { key: "product_checker", label: "Product Checker", icon: "find_in_page" },
    { key: "voorraadmutaties", label: "Voorraadmutaties", icon: "import_export" },
    { key: "tht_module", label: "THT Module", icon: "calendar_today" },
    { key: "tht_registratie", label: "THT Registratie", icon: "event_note" },
    { key: "tellen", label: "Tellen", icon: "calculate" },
    { key: "acties", label: "Acties", icon: "local_offer" },
    { key: "rapportages", label: "Rapportages", icon: "bar_chart" },
    { key: "bakplan", label: "Bakplan", icon: "bakery_dining" },
    { key: "vulplanning", label: "Vulplanning Maker", icon: "assignment" }
];

document.addEventListener('DOMContentLoaded', async () => {
    loadHeader();

    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    const { userData } = auth;
    const currentWinkelId = userData.winkel;
    const supabase = await getSupabase();

    initPadenModal(supabase, currentWinkelId);

    const modulesContainer = document.getElementById('modules-container');
    const form = document.getElementById('store-settings-form');
    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    let currentModulesState = {};

    const loadStoreModules = async () => {
        if (!currentWinkelId) return;
        const { data: storeInfo } = await supabase
            .from('stores_info')
            .select('modules, color')
            .eq('store_id', currentWinkelId)
            .maybeSingle();

        const storedModules = storeInfo?.modules || {};
        currentModulesState = {};

        AVAILABLE_MODULES.forEach(mod => {
            currentModulesState[mod.key] = storedModules[mod.key] !== undefined ? Boolean(storedModules[mod.key]) : true;
        });

        if (storeInfo?.color && storeInfo.color.primary) {
            const colorRadio = form.querySelector(`input[name="store_color"][value="${storeInfo.color.primary}"]`);
            if (colorRadio) colorRadio.checked = true;
        }

        renderModules();
    };

    const renderModules = () => {
        if (!modulesContainer) return;
        modulesContainer.innerHTML = AVAILABLE_MODULES.map(mod => {
            const isEnabled = currentModulesState[mod.key];
            return `
                <label class="module-card">
                    <div class="module-info">
                        <i class="material-icons">${mod.icon}</i>
                        <span>${mod.label}</span>
                    </div>
                    <div class="switch">
                        <input type="checkbox" name="module-${mod.key}" data-key="${mod.key}" ${isEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </div>
                </label>
            `;
        }).join('');
    };

    await loadStoreModules();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updatedModules = {};
        AVAILABLE_MODULES.forEach(mod => {
            const checkbox = form.querySelector(`input[data-key="${mod.key}"]`);
            updatedModules[mod.key] = checkbox ? checkbox.checked : true;
        });

        const selectedColorInput = form.querySelector('input[name="store_color"]:checked');
        const colorData = { primary: selectedColorInput ? selectedColorInput.value : '#658d24' };

        await handleFormSubmit(submitBtn, 'Opslaan...', messageBox, async () => {
            const { error } = await supabase
                .from('stores_info')
                .upsert({ store_id: currentWinkelId, modules: updatedModules, color: colorData }, { onConflict: 'store_id' });

            if (error) {
                showMessage(messageBox, messageText, messageIcon, error.message || 'Fout bij opslaan van instellingen.', 'error');
            } else {
                showMessage(messageBox, messageText, messageIcon, 'Winkelinstellingen succesvol opgeslagen!', 'success');
                currentModulesState = updatedModules;
                if (colorData.primary) {
                    applyStoreTheme(colorData.primary);
                    localStorage.setItem('store_primary_color', colorData.primary);
                }
                await loadStoreModules();
                await updateHeaderMenu();
            }
        });
    });
});
