import { loadHeader } from '../header.js';
import { checkAuth, getSupabase } from '../main.js';
import { showToast } from '../toast.js';
import { state, removeTaskFromAll, resetState } from './state.js';
import { setStoreId, getStoreId, triggerSave, loadData } from './storage.js';
import { setupModals, setRenderWorkspaceCallback } from './modals.js';
import { showConfirmModal } from '../modal.js';
import { parsePDFAndGetNames, parseColliPDF, getDefaultPDFPaden, doSettingsMatchPDF } from './plus/pdf-handler.js';
import { createManualInputManager, renderPeopleList } from './manual-input.js';
import { generatePrintablePlanning } from './printable-overview.js';
import { renderWorkspace } from './workspace.js';
import { formatMin, getFillerPause, parseNameAndSubtitle, getTaskDuration, matchEmployeeName } from './planning-logic.js';

(() => {
    setRenderWorkspaceCallback(renderWorkspace);

    document.addEventListener('DOMContentLoaded', async () => {
        const auth = await checkAuth(['beheerder']);
        if (!auth) return;
        loadHeader();
        const storeId = auth.userData.winkel;
        setStoreId(storeId);
        const isPlusLms = auth.storeCode === 'plus-lms';

        const showManualBtn = document.getElementById('show-manual-input-btn');
        const manualContainer = document.getElementById('manual-input-container');

        if (showManualBtn && manualContainer) {
            showManualBtn.addEventListener('click', () => {
                document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                manualContainer.style.display = 'flex';
            });
        }

        if (!isPlusLms) {
            document.querySelectorAll('.upload-group').forEach(el => {
                el.style.display = 'none';
            });
            if (manualContainer) manualContainer.style.display = 'flex';
        }

        let storeEmployees = [];
        let storeDefaultPaden = [];
        const supabase = await getSupabase();
        if (storeId && supabase) {
            const { data: users } = await supabase
                .from('user_data')
                .select('full_name')
                .eq('winkel', storeId)
                .order('full_name', { ascending: true });
            if (users) {
                storeEmployees = users.map(u => u.full_name).filter(Boolean);
            }

            const { data: vpData } = await supabase
                .from('vulplanningen')
                .select('instellingen')
                .eq('id', storeId)
                .maybeSingle();

            storeDefaultPaden = vpData?.instellingen?.paden_categorieen || [];
        }

        setupModals();

        const { addFillerRow, populatePaths } = createManualInputManager({
            renderWorkspace,
            storeEmployees,
            getStoreDefaultPaden: () => storeDefaultPaden,
            setStoreDefaultPaden: (p) => { storeDefaultPaden = p; },
            supabase,
            storeId
        });

        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }

        await loadData();

        const resetBtn = document.getElementById('reset-planning-btn');
        const generateBtn = document.getElementById('generate-planning-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Opnieuw Beginnen',
                    'Weet je zeker dat je opnieuw wilt beginnen? De huidige planning wordt overschreven.',
                    () => {
                        resetState();

                        const manualFillersList = document.getElementById('manual-fillers-list');
                        if (manualFillersList) manualFillersList.innerHTML = '';
                        document.querySelectorAll('.manual-cat-colli').forEach(input => input.value = '');

                        document.getElementById('step-1-container').style.display = 'block';
                        document.getElementById('step-2-container').style.display = 'none';
                        resetBtn.style.display = 'none';
                        if (generateBtn) generateBtn.style.display = 'none';
                        const peopleCard = document.getElementById('people-card');
                        if (peopleCard) peopleCard.style.display = 'none';
                        const manualContainerEl = document.getElementById('manual-input-container');
                        if (isPlusLms) {
                            document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'block');
                            if (manualContainerEl) manualContainerEl.style.display = 'none';
                        } else {
                            document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                            if (manualContainerEl) manualContainerEl.style.display = 'flex';
                        }
                        triggerSave();
                    }
                );
            });
        }

        const hasExistingPlanning = state.selectedFillers && state.selectedFillers.length > 0;
        if (hasExistingPlanning) {
            renderPeopleList(state.selectedFillers);
            state.selectedFillers.forEach(name => {
                const list = document.getElementById('people-list');
                if (list) {
                    const cb = list.querySelector(`input[value="${CSS.escape(name)}"]`);
                    if (cb) cb.checked = true;
                }
            });

            document.getElementById('step-1-container').style.display = 'none';
            document.getElementById('step-2-container').style.display = 'block';
            document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
            const manualContainerEl = document.getElementById('manual-input-container');
            if (manualContainerEl) manualContainerEl.style.display = 'none';
            renderWorkspace();
            if (resetBtn) resetBtn.style.display = 'inline-block';
            if (generateBtn) generateBtn.style.display = 'flex';
        }

        let pendingFillers = null;
        let pendingColli = null;

        const checkAndApplyBothUploads = async () => {
            if (!pendingFillers || !pendingColli) return;

            const populateFillersUI = () => {
                const manualFillersList = document.getElementById('manual-fillers-list');
                if (!manualFillersList) return;
                manualFillersList.innerHTML = '';
                if (pendingFillers && pendingFillers.length > 0) {
                    pendingFillers.forEach(displayName => {
                        const match = displayName.match(/^(.+?)\s*-\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
                        const rawName = match ? match[1].trim() : displayName.trim();
                        const { matchedUser, hasMultipleMatches, candidateMatches } = matchEmployeeName(rawName, storeEmployees);
                        const nameToUse = matchedUser || rawName;
                        const startVal = match ? match[2] : '';
                        const endVal = match ? match[3] : '';
                        const pause = state.fillerBreaks && state.fillerBreaks[displayName] !== undefined ? state.fillerBreaks[displayName] : '';

                        addFillerRow(nameToUse, startVal, endVal, pause, {
                            matched: !!matchedUser,
                            originalName: rawName,
                            hasMultipleMatches,
                            candidateMatches
                        });
                    });
                }
            };

            const fillManualScreen = (padenToUse) => {
                document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                const manualContainerEl = document.getElementById('manual-input-container');
                if (manualContainerEl) manualContainerEl.style.display = 'flex';
                populateFillersUI();
                populatePaths(padenToUse, pendingColli.categoryColli || {});
            };

            const matches = doSettingsMatchPDF(storeDefaultPaden);

            if (!matches) {
                showConfirmModal(
                    'Instellingen Aanpassen',
                    'De paden en categorieën in de instellingen matchen het geüploade document niet. Wil je de instellingen automatisch goedzetten naar de standaard PDF-indeling voor PLUS Lammenschans?',
                    'Goedzetten',
                    async () => {
                        const defaultPaden = getDefaultPDFPaden();
                        storeDefaultPaden = defaultPaden;
                        if (storeId && supabase) {
                            await supabase.from('vulplanningen').upsert({
                                id: storeId,
                                instellingen: { paden_categorieen: defaultPaden }
                            });
                        }
                        fillManualScreen(defaultPaden);
                    },
                    () => {
                        document.querySelectorAll('.upload-group').forEach(el => el.style.display = 'none');
                        const manualContainerEl = document.getElementById('manual-input-container');
                        if (manualContainerEl) manualContainerEl.style.display = 'flex';
                        populateFillersUI();
                        pendingFillers = null;
                        pendingColli = null;
                        const file1 = document.getElementById('vulplanning-input');
                        const file2 = document.getElementById('colli-input');
                        if (file1) file1.value = '';
                        if (file2) file2.value = '';
                        populatePaths(storeDefaultPaden);
                    },
                    'Alleen rooster importeren'
                );
            } else {
                fillManualScreen(storeDefaultPaden);
            }
        };

        const input = document.getElementById('vulplanning-input');
        if (input) {
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const names = await parsePDFAndGetNames(file);
                    pendingFillers = names;
                    await checkAndApplyBothUploads();
                } catch (err) {
                    console.error(err);
                }
            });
        }

        const sortSelect = document.getElementById('filler-sort-select');
        if (sortSelect) {
            sortSelect.value = state.fillerSortOrder;
            sortSelect.addEventListener('change', (e) => {
                state.fillerSortOrder = e.target.value;
                renderWorkspace();
            });
        }

        const tabFill = document.getElementById('tab-fill');
        const tabMirror = document.getElementById('tab-mirror');
        const tabOther = document.getElementById('tab-other');
        if (tabFill && tabMirror && tabOther) {
            tabFill.addEventListener('click', () => {
                state.activeTab = 'fill';
                renderWorkspace();
            });
            tabMirror.addEventListener('click', () => {
                state.activeTab = 'mirror';
                renderWorkspace();
            });
            tabOther.addEventListener('click', () => {
                state.activeTab = 'other';
                renderWorkspace();
            });
        }

        const colliInput = document.getElementById('colli-input');
        if (colliInput) {
            colliInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    pendingColli = await parseColliPDF(file);
                    await checkAndApplyBothUploads();
                } catch (err) {
                    console.error(err);
                }
            });
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                const visibleFillers = state.selectedFillers.filter(f => !(state.hiddenFillers || []).includes(f));
                const pauseDiscrepancies = [];

                visibleFillers.forEach(filler => {
                    const presetPause = getFillerPause(filler, state);
                    let taskBreaks = 0;
                    const tasks = state.fillerTasks[filler] || [];
                    tasks.forEach(tId => {
                        const [pName] = tId.replace('_helper', '').split('_');
                        if (pName === 'Pauze') {
                            taskBreaks += getTaskDuration(tId, state);
                        }
                    });
                    const diff = taskBreaks - presetPause;
                    if (diff !== 0) {
                        const cleanName = parseNameAndSubtitle(filler).name;
                        pauseDiscrepancies.push({
                            name: cleanName,
                            diff: diff,
                            isMore: diff > 0,
                            taskBreaks: taskBreaks,
                            presetPause: presetPause
                        });
                    }
                });

                if (pauseDiscrepancies.length > 0) {
                    const listItems = pauseDiscrepancies.map(d => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background-color: var(--input-bg); border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 6px;">
                            <span style="font-weight: 600; color: var(--text-color); font-size: 13px;">${d.name}</span>
                            <span style="font-size: 12px; color: ${d.isMore ? 'var(--warning-color)' : 'var(--danger-color)'}; font-weight: 500;">
                                ${d.isMore ? '+' : '-'}${formatMin(Math.abs(d.diff))} (${formatMin(d.taskBreaks)} / ${formatMin(d.presetPause)})
                            </span>
                        </div>
                    `).join('');
                    const message = `<div style="font-size: 13px; color: var(--text-color-muted); margin-bottom: 12px;">Er zijn pauze-afwijkingen geconstateerd bij de volgende medewerkers:</div>
                        <div style="max-height: 200px; overflow-y: auto; margin-bottom: 14px;">${listItems}</div>
                        <div style="font-size: 13px; color: var(--text-color);">Wil je doorgaan met genereren of de planning aanpassen?</div>`;
                    showConfirmModal(
                        'Pauze-afwijkingen',
                        message,
                        'Doorgaan met genereren',
                        () => { generatePrintablePlanning(); },
                        null,
                        'Aanpassen'
                    );
                } else {
                    generatePrintablePlanning();
                }
            });
        }

        const clearPlanningBtn = document.getElementById('clear-planning-btn');
        if (clearPlanningBtn) {
            clearPlanningBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Planning leegmaken',
                    'Weet je zeker dat je alle toegewezen taken van alle medewerkers wilt verwijderen?',
                    'Leegmaken',
                    () => {
                        state.fillerTasks = {};
                        state.helpers = {};
                        state.instanceTimes = {};
                        renderWorkspace();
                        triggerSave();
                        showToast('Planning leeggemaakt', 'success');
                    }
                );
            });
        }

        const toggleReallyHiddenBtn = document.getElementById('toggle-really-hidden-btn');
        if (toggleReallyHiddenBtn) {
            toggleReallyHiddenBtn.addEventListener('click', () => {
                state.showReallyHidden = !state.showReallyHidden;
                renderWorkspace();
                triggerSave();
            });
        }

        let globalDragCounter = 0;
        document.addEventListener('dragenter', (e) => {
            if (e.dataTransfer && e.dataTransfer.types.includes('text/plain')) {
                globalDragCounter++;
                const tasksContainerEl = document.getElementById('tasks-container');
                if (tasksContainerEl) tasksContainerEl.classList.add('drag-delete');
            }
        });
        document.addEventListener('dragleave', (e) => {
            if (e.dataTransfer && e.dataTransfer.types.includes('text/plain')) {
                globalDragCounter--;
                if (globalDragCounter === 0) {
                    const tasksContainerEl = document.getElementById('tasks-container');
                    if (tasksContainerEl) tasksContainerEl.classList.remove('drag-delete');
                }
            }
        });
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.addEventListener('drop', (e) => {
            globalDragCounter = 0;
            const tasksContainerEl = document.getElementById('tasks-container');
            if (tasksContainerEl) tasksContainerEl.classList.remove('drag-delete');

            const taskId = e.dataTransfer.getData('text/plain');
            if (!taskId || !document.getElementById(`task-${taskId}`)) return;

            const isFromAssigned = e.dataTransfer.getData('is-from-assigned') === 'true';

            if (e.target.closest('#tasks-container')) {
                e.preventDefault();
                if (taskId.endsWith('_helper')) {
                    const mainTaskId = taskId.replace('_helper', '');
                    removeTaskFromAll(taskId);
                    delete state.helpers[mainTaskId];
                } else if (!isFromAssigned) {
                    removeTaskFromAll(taskId);
                    removeTaskFromAll(taskId + '_helper');
                    delete state.helpers[taskId];
                    if (taskId.includes('_inst-')) {
                        delete state.instanceTimes[taskId];
                    }
                } renderWorkspace();
                triggerSave();
            } else if (!e.target.closest('.filler-card')) {
                e.preventDefault();
                renderWorkspace();
            }
        });
    });
})();
