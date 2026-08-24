import { loadHeader } from '../header.js';
import { checkAuth, getSupabase, invokeFunction } from '../main.js';
import { showToast } from '../toast.js';
import { state, removeTaskFromAll, resetState } from './state.js';
import { setStoreId, getStoreId, triggerSave, loadData } from './storage.js';
import { setupModals, setRenderWorkspaceCallback } from './modals.js';
import { showConfirmModal, showLoadingOverlay, hideLoadingOverlay } from '../modal.js';
import { parsePDFAndGetNames, parseColliPDF, getDefaultPDFPaden, doSettingsMatchPDF } from './plus/pdf-handler.js';
import { createManualInputManager, renderPeopleList } from './manual-input.js';
import { generatePrintablePlanning } from './printable-overview.js';
import { renderWorkspace } from './workspace.js';
import { formatMin, getFillerPause, parseNameAndSubtitle, getTaskDuration, getEffectiveTaskDuration, matchEmployeeName, getFillerProductivity, formatTaskDisplayName, getProductivityStatusClass } from './planning-logic.js';
import { initHistory, resetHistory, setupHistoryListeners } from './history.js';

(() => {
    setRenderWorkspaceCallback(renderWorkspace);

    document.addEventListener('DOMContentLoaded', async () => {
        const auth = await checkAuth(['beheerder']);
        if (!auth) return;
        loadHeader();
        setupHistoryListeners();
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

        const { addFillerRow, populatePaths, recalculateStep1 } = createManualInputManager({
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
        const finalizeBtn = document.getElementById('finalize-planning-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                showConfirmModal(
                    'Opnieuw Beginnen',
                    'Weet je zeker dat je opnieuw wilt beginnen? De huidige planning wordt overschreven.',
                    () => {
                        resetState();
                        resetHistory();

                        const manualFillersList = document.getElementById('manual-fillers-list');
                        if (manualFillersList) manualFillersList.innerHTML = '';
                        document.querySelectorAll('.manual-cat-colli').forEach(input => input.value = '');

                        document.getElementById('step-1-container').style.display = 'block';
                        document.getElementById('step-2-container').style.display = 'none';
                        resetBtn.style.display = 'none';
                        if (generateBtn) generateBtn.style.display = 'none';
                        if (finalizeBtn) finalizeBtn.style.display = 'none';
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
            if (finalizeBtn) finalizeBtn.style.display = 'flex';
            initHistory();
        }

        if (finalizeBtn) {
            const finalizeModal = document.getElementById('finalize-modal');
            const finalizeList = document.getElementById('finalize-list');
            const finalizeSelectAll = document.getElementById('finalize-select-all');
            const finalizeSelectedCount = document.getElementById('finalize-selected-count');
            const finalizeCancelBtn = document.getElementById('finalize-modal-cancel-btn');
            const finalizeCloseBtn = document.getElementById('close-finalize-modal-btn');
            const finalizeSaveBtn = document.getElementById('finalize-modal-save-btn');

            let currentMatchedEmployees = [];

            const updateFinalizeCount = () => {
                if (!finalizeList || !finalizeSelectedCount) return;
                const checkboxes = finalizeList.querySelectorAll('.finalize-emp-checkbox');
                const checked = finalizeList.querySelectorAll('.finalize-emp-checkbox:checked');
                finalizeSelectedCount.textContent = `${checked.length}/${checkboxes.length} geselecteerd`;
                if (finalizeSelectAll) {
                    finalizeSelectAll.checked = checkboxes.length > 0 && checked.length === checkboxes.length;
                    finalizeSelectAll.indeterminate = checked.length > 0 && checked.length < checkboxes.length;
                }
                if (finalizeSaveBtn) {
                    finalizeSaveBtn.disabled = checked.length === 0;
                    finalizeSaveBtn.style.opacity = checked.length === 0 ? '0.5' : '1';
                    finalizeSaveBtn.style.cursor = checked.length === 0 ? 'not-allowed' : 'pointer';
                }
            };

            const closeFinalizeModal = () => {
                if (finalizeModal) finalizeModal.style.display = 'none';
            };

            if (finalizeCancelBtn) finalizeCancelBtn.addEventListener('click', closeFinalizeModal);
            if (finalizeCloseBtn) finalizeCloseBtn.addEventListener('click', closeFinalizeModal);
            if (finalizeModal) {
                finalizeModal.addEventListener('click', (e) => {
                    if (e.target === finalizeModal) closeFinalizeModal();
                });
            }

            if (finalizeSelectAll) {
                finalizeSelectAll.addEventListener('change', () => {
                    if (!finalizeList) return;
                    const checkboxes = finalizeList.querySelectorAll('.finalize-emp-checkbox:not(:disabled)');
                    checkboxes.forEach(cb => { cb.checked = finalizeSelectAll.checked; });
                    updateFinalizeCount();
                });
            }

            finalizeBtn.addEventListener('click', async () => {
                finalizeBtn.disabled = true;
                try {
                    const supabaseClient = await getSupabase();
                    if (!supabaseClient || !storeId) {
                        showToast('Geen databaseverbinding', 'error');
                        finalizeBtn.disabled = false;
                        return;
                    }

                    const { data: users, error } = await supabaseClient
                        .from('user_data')
                        .select('id, full_name, history_productivity')
                        .eq('winkel', storeId);

                    if (error || !users) {
                        showToast('Kon gebruikersgegevens niet ophalen', 'error');
                        finalizeBtn.disabled = false;
                        return;
                    }

                    const today = new Date().toISOString().split('T')[0];
                    const matchedEmployees = [];

                    (state.selectedFillers || []).forEach(filler => {
                        const { name } = parseNameAndSubtitle(filler);
                        const user = users.find(u => u.full_name && u.full_name.trim().toLowerCase() === name.trim().toLowerCase());
                        if (user) {
                            const rawTasks = state.fillerTasks[filler] || [];
                            const tasksWithDurations = rawTasks.map(tId => {
                                const dur = Math.round(getEffectiveTaskDuration(tId, state));
                                return dur > 0 ? `${tId}|${dur}` : tId;
                            });
                            const history = Array.isArray(user.history_productivity) ? user.history_productivity : [];
                            const existingEntry = history.find(entry => entry && entry.date === today);

                            matchedEmployees.push({
                                user,
                                filler,
                                productivity: getFillerProductivity(filler, state),
                                tasks: tasksWithDurations,
                                hasExisting: !!existingEntry,
                                oldProductivity: existingEntry ? (existingEntry.productivity ?? null) : null
                            });
                        }
                    });

                    if (matchedEmployees.length === 0) {
                        showToast('Geen gekoppelde gebruikers gevonden', 'warning');
                        finalizeBtn.disabled = false;
                        return;
                    }

                    currentMatchedEmployees = matchedEmployees;

                    if (finalizeList) {
                        finalizeList.innerHTML = matchedEmployees.map((emp, idx) => {
                            const currentProd = emp.productivity !== undefined ? emp.productivity : null;
                            const oldProd = emp.oldProductivity !== undefined ? emp.oldProductivity : null;
                            const isIdentical = emp.hasExisting && currentProd === oldProd;
                            const hasProd = currentProd !== null;
                            const isSelectable = !isIdentical && (hasProd || emp.hasExisting);
                            const prodClass = getProductivityStatusClass(emp.productivity);
                            const prodBadge = hasProd
                                ? `<span class="filler-stat-item prod ${prodClass}" style="padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid;">${emp.productivity}%</span>`
                                : `<span style="font-size: 12px; color: var(--text-color-muted); font-weight: 600;">-</span>`;

                            let overwriteBadge = '';
                            if (isIdentical) {
                                overwriteBadge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background-color: var(--border-color); color: var(--text-color-muted); border: 1px solid var(--border-color); display: inline-flex; align-items: center; gap: 4px;"><i class="material-icons" style="font-size: 12px;">check_circle</i> Reeds opgeslagen</span>`;
                            } else if (emp.hasExisting) {
                                overwriteBadge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background-color: var(--prod-warning-bg); color: var(--prod-warning-color); border: 1px solid var(--prod-warning-border); display: inline-flex; align-items: center; gap: 4px;"><i class="material-icons" style="font-size: 12px;">sync</i> Overschrijven${emp.oldProductivity !== null ? ` (${emp.oldProductivity}%)` : ''}</span>`;
                            } else {
                                overwriteBadge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background-color: var(--prod-healthy-bg); color: var(--prod-healthy-color); border: 1px solid var(--prod-healthy-border);">Nieuw</span>`;
                            }

                            const rowStyle = isSelectable
                                ? 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; gap: 10px;'
                                : 'display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; cursor: not-allowed; opacity: 0.5; gap: 10px;';

                            const tooltip = isIdentical
                                ? 'Reeds opgeslagen met dezelfde productiviteit'
                                : (!isSelectable ? 'Geen productiviteit berekend' : '');

                            return `
                                <label class="finalize-emp-row" style="${rowStyle}" ${tooltip ? `title="${tooltip}"` : ''}>
                                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                                        <input type="checkbox" class="finalize-emp-checkbox" data-index="${idx}" ${isSelectable ? 'checked' : 'disabled'} style="accent-color: var(--accent-color); cursor: ${isSelectable ? 'pointer' : 'not-allowed'}; width: 16px; height: 16px; flex-shrink: 0;">
                                        <span style="font-size: 14px; font-weight: 500; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${emp.user.full_name}</span>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                        ${prodBadge}
                                        ${overwriteBadge}
                                    </div>
                                </label>
                            `;
                        }).join('');

                        finalizeList.querySelectorAll('.finalize-emp-checkbox:not(:disabled)').forEach(cb => {
                            cb.addEventListener('change', updateFinalizeCount);
                        });
                    }

                    if (finalizeSelectAll) {
                        const enabledCheckboxes = finalizeList ? finalizeList.querySelectorAll('.finalize-emp-checkbox:not(:disabled)') : [];
                        finalizeSelectAll.checked = enabledCheckboxes.length > 0;
                        finalizeSelectAll.disabled = enabledCheckboxes.length === 0;
                    }
                    updateFinalizeCount();
                    if (finalizeModal) finalizeModal.style.display = 'flex';
                } catch (err) {
                    showToast('Er is een fout opgetreden', 'error');
                } finally {
                    finalizeBtn.disabled = false;
                }
            });

            if (finalizeSaveBtn) {
                finalizeSaveBtn.addEventListener('click', async () => {
                    const checkedBoxes = finalizeList ? finalizeList.querySelectorAll('.finalize-emp-checkbox:checked') : [];
                    if (checkedBoxes.length === 0) {
                        showToast('Geen medewerkers geselecteerd', 'warning');
                        return;
                    }

                    const today = new Date().toISOString().split('T')[0];
                    const approvedPayload = [];
                    checkedBoxes.forEach(cb => {
                        const idx = parseInt(cb.dataset.index, 10);
                        const emp = currentMatchedEmployees[idx];
                        if (emp) {
                            approvedPayload.push({
                                userId: emp.user.id,
                                date: today,
                                productivity: emp.productivity,
                                tasks: emp.tasks
                            });
                        }
                    });

                    closeFinalizeModal();
                    showLoadingOverlay('Opslaan...');

                    try {
                        const supabaseClient = await getSupabase();
                        const { data: { session } } = await supabaseClient.auth.getSession();
                        const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
                        const { data: invokeData, error: invokeError, detailedError } = await invokeFunction('save_productivity', {
                            productivityData: approvedPayload
                        }, headers);

                        if (invokeError || (invokeData && invokeData.error)) {
                            let failedDirectly = false;
                            for (const item of approvedPayload) {
                                const { data: currentUser, error: selectErr } = await supabaseClient
                                    .from('user_data')
                                    .select('history_productivity')
                                    .eq('id', item.userId)
                                    .single();

                                if (selectErr) {
                                    failedDirectly = true;
                                    break;
                                }

                                const history = Array.isArray(currentUser?.history_productivity)
                                    ? currentUser.history_productivity.filter(h => h && h.date !== item.date)
                                    : [];

                                history.push({
                                    date: item.date,
                                    productivity: item.productivity,
                                    tasks: item.tasks
                                });

                                const { error: updateError } = await supabaseClient
                                    .from('user_data')
                                    .update({ history_productivity: history })
                                    .eq('id', item.userId);

                                if (updateError) {
                                    failedDirectly = true;
                                    break;
                                }
                            }

                            if (failedDirectly) {
                                const errDetail = invokeData?.error || detailedError || invokeError?.message || 'Fout bij opslaan';
                                showToast(errDetail, 'error');
                            } else {
                                showToast('Productiviteit opgeslagen', 'success');
                            }
                        } else {
                            showToast('Productiviteit opgeslagen', 'success');
                        }
                    } catch (err) {
                        showToast('Er is een fout opgetreden bij het opslaan', 'error');
                    } finally {
                        hideLoadingOverlay();
                    }
                });
            }
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
        const tabRestanten = document.getElementById('tab-restanten');
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
            if (tabRestanten) {
                tabRestanten.addEventListener('click', () => {
                    state.activeTab = 'restanten';
                    renderWorkspace();
                });
            }
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
                        const [pName] = (tId.includes('_helper') ? tId.split('_helper')[0] : tId).split('_');
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
                        <div style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">${listItems}</div>
                        <div style="font-size: 12px; color: var(--warning-color); background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 14px; line-height: 1.4;">
                            <strong>Let op hoe pauzes werken:</strong><br>
                            • Heb je <strong>wel een pauzetaak ingepland</strong> (ook al is het minder dan ingesteld)? Dan wordt er op het overzicht volledig rekening gehouden met wat je hebt ingepland en vervalt de vooraf ingestelde pauze.<br>
                            • Heb je <strong>helemaal geen pauzetaak ingepland</strong>? Dan wordt automatisch de vooraf ingestelde pauze afgetrokken van de productieve tijd, waardoor de berekende tijden niet meer kunnen aansluiten op de daadwerkelijke dienst.
                        </div>
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
                    'Weet je zeker dat je alle toegewezen taken van alle medewerkers wilt verwijderen? De normen en tijden worden opnieuw berekend.',
                    'Leegmaken',
                    () => {
                        state.fillerTasks = {};
                        state.helpers = {};
                        state.instanceTimes = {};
                        state.actualEndTimes = {};
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
                if (taskId.includes('_helper')) {
                    removeTaskFromAll(taskId);
                } else if (!isFromAssigned) {
                    removeTaskFromAll(taskId);
                    if (taskId.includes('_inst-')) {
                        delete state.instanceTimes[taskId];
                    }
                }
                renderWorkspace();
                triggerSave();
            } else if (!e.target.closest('.filler-card')) {
                e.preventDefault();
                renderWorkspace();
            }
        });
    });
})();
