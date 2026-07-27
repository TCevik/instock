import { getSupabase, checkAuth, showMessage, handleFormSubmit } from './main.js';
import { loadHeader, updateHeaderMenu, applyStoreTheme } from './header.js';

const AVAILABLE_MODULES = [
    { key: "product_checker", label: "Product Checker", icon: "find_in_page", isFinished: true },
    { key: "voorraadmutaties", label: "Voorraadmutaties", icon: "import_export", isFinished: false },
    { key: "tht_module", label: "THT Module", icon: "calendar_today", isFinished: false },
    { key: "tht_registratie", label: "THT Registratie", icon: "event_note", isFinished: false },
    { key: "tellen", label: "Tellen", icon: "calculate", isFinished: false },
    { key: "acties", label: "Acties", icon: "local_offer", isFinished: false },
    { key: "rapportages", label: "Rapportages", icon: "bar_chart", isFinished: false },
    { key: "bakplan", label: "Bakplan", icon: "bakery_dining", isFinished: true },
    { key: "vulplanning", label: "Vulplanning Maker", icon: "assignment", isFinished: true }
];

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    loadHeader();

    const { userData } = auth;
    const currentWinkelId = userData.winkel;
    const supabase = await getSupabase();

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
            const isFinished = mod.isFinished;
            const disabledAttr = isFinished ? '' : 'disabled';
            const cardClass = isFinished ? 'module-card' : 'module-card module-card-disabled';
            const subtitleHtml = !isFinished ? '<span class="module-status-text">Nog niet beschikbaar</span>' : '';

            return `
                <label class="${cardClass}">
                    <div class="module-info">
                        <i class="material-icons">${mod.icon}</i>
                        <div class="module-text">
                            <span>${mod.label}</span>
                            ${subtitleHtml}
                        </div>
                    </div>
                    <div class="switch">
                        <input type="checkbox" name="module-${mod.key}" data-key="${mod.key}" ${isEnabled && isFinished ? 'checked' : ''} ${disabledAttr}>
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
            updatedModules[mod.key] = (mod.isFinished && checkbox) ? checkbox.checked : false;
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
