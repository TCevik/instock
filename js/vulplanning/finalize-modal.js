import { showModal, closeModal, showToast, showConfirmModal, escapeHtml, supabase } from '../main.js';
import { planningState } from './state.js';
import { getFillerStats, getFormattedTasksWithTimes, formatDuration, calculateShiftTotalColli } from './time-utils.js';
import { findExactUser, findUserByUsername } from './rooster.js';
import { createDatePicker } from '../datepicker.js';

export async function openFinalizeModal() {
    const fillersWithUser = [];

    const { data: dbUsers } = await supabase
        .from('user_data')
        .select('user_id, username, full_name');

    const dbUserMap = new Map();
    (dbUsers || []).forEach(u => {
        if (u.username) {
            dbUserMap.set(u.username.toLowerCase().trim(), u);
        }
    });

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    (planningState.fillers || []).forEach(filler => {
        let uname = filler.username;
        let matchedUser = null;
        if (uname) {
            matchedUser = findUserByUsername(uname);
        } else if (filler.name) {
            matchedUser = findExactUser(filler.name);
            if (matchedUser?.username) {
                uname = matchedUser.username;
            }
        }
        if (!uname) return;

        const cleanUname = uname.toLowerCase().trim();
        const dbUser = dbUserMap.get(cleanUname);
        const assigned = planningState.assignedTasks[filler.id] || [];
        const stats = getFillerStats(filler, assigned);
        const hasEndTime = !!(filler.actualEndTime && String(filler.actualEndTime).trim().length >= 4 && stats.prodResult);

        fillersWithUser.push({
            filler,
            username: uname,
            resolvedUser: matchedUser || dbUser,
            assigned,
            stats,
            hasEndTime,
            isIdentical: false,
            isOverwrite: false,
            prevProdPercent: null,
            checked: hasEndTime
        });
    });

    async function recalculateStatusesForDate(selectedDateStr) {
        let userStatuses = {};
        try {
            const { data, error } = await supabase.functions.invoke('manage-productivity', {
                body: { action: 'get_date_status', date: selectedDateStr }
            });
            if (!error && data?.userStatuses) {
                userStatuses = data.userStatuses;
            }
        } catch (_) {}

        fillersWithUser.forEach(item => {
            const cleanU = item.username.toLowerCase().trim();
            const existingRecord = userStatuses[cleanU] || null;
            const assigned = item.assigned;
            const stats = item.stats;
            const hasEndTime = item.hasEndTime;

            item.isIdentical = false;
            item.isOverwrite = false;
            item.prevProdPercent = null;

            if (existingRecord && hasEndTime) {
                item.prevProdPercent = existingRecord.productivity;
                const oldEnd = String(existingRecord.actual_end_time || existingRecord.shift?.actual_end || '').trim();
                const newEnd = String(item.filler.actualEndTime || '').trim();
                const oldColli = calculateShiftTotalColli(existingRecord);
                const newColli = Number(stats.totalColli) || 0;
                const oldTasksLen = Array.isArray(existingRecord.tasks) ? existingRecord.tasks.length : null;
                const newTasksLen = assigned.length;

                const sameProd = Number(item.prevProdPercent) === Number(stats.prodResult?.percent);
                const sameEnd = oldEnd === newEnd;
                const sameColli = oldColli === newColli;
                const sameTasks = oldTasksLen === null || oldTasksLen === newTasksLen;

                if (sameProd && sameEnd && sameColli && sameTasks) {
                    item.isIdentical = true;
                    item.checked = false;
                } else {
                    item.isOverwrite = true;
                    item.checked = hasEndTime;
                }
            } else {
                item.checked = hasEndTime;
            }
        });
    }

    await recalculateStatusesForDate(todayStr);

    if (fillersWithUser.length === 0) {
        showToast('error', 'Geen medewerkers met een gekoppelde gebruikersnaam gevonden in de planning.');
        return;
    }

    fillersWithUser.sort((a, b) => {
        const aReady = a.hasEndTime && !a.isIdentical;
        const bReady = b.hasEndTime && !b.isIdentical;
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        if (a.hasEndTime && !b.hasEndTime) return -1;
        if (!a.hasEndTime && b.hasEndTime) return 1;
        return (a.filler.name || '').localeCompare(b.filler.name || '');
    });

    const readyCount = fillersWithUser.filter(f => f.hasEndTime && !f.isIdentical).length;
    const overwriteCount = fillersWithUser.filter(f => f.hasEndTime && f.isOverwrite).length;
    const identicalCount = fillersWithUser.filter(f => f.hasEndTime && f.isIdentical).length;

    let bannerExtra = '';
    if (overwriteCount > 0 || identicalCount > 0) {
        const parts = [];
        if (overwriteCount > 0) parts.push(`${overwriteCount} overschrijven`);
        if (identicalCount > 0) parts.push(`${identicalCount} al identiek`);
        bannerExtra = ` (${parts.join(', ')})`;
    }

    const modalContent = `
        <div class="modal-header" style="display: flex; flex-direction: row; align-items: center; gap: 14px; padding-right: 28px;">
            <div class="finalize-modal-icon-wrap">
                <span class="material-icons" style="font-size: 22px;">fact_check</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <h2 class="modal-title" style="font-size: 18px;">Productiviteiten Finaliseren</h2>
                <p class="modal-subtitle" style="font-size: 12px;">Sla productiviteit en taakstatistieken op naar gebruikersprofielen</p>
            </div>
        </div>

        <div class="finalize-info-banner">
            <span class="material-icons">info</span>
            <span id="finalize-banner-text">${readyCount} van de ${fillersWithUser.length} medewerkers gereed om te finaliseren${bannerExtra}</span>
        </div>

        <div class="finalize-controls-row">
            <label class="finalize-select-all-label">
                <input type="checkbox" id="finalize-select-all" ${readyCount > 0 ? 'checked' : ''} />
                <span>Alles selecteren</span>
            </label>
            <div class="finalize-controls-right">
                <label class="finalize-date-label">Datum:</label>
                <div id="finalizeDatePickerContainer"></div>
                <span class="finalize-count-indicator" id="finalize-selected-count">0 geselecteerd</span>
            </div>
        </div>

        <div class="finalize-list" id="finalize-list-container">
            ${renderWorkersList(fillersWithUser)}
        </div>

        <div class="modal-footer" style="margin-top: 14px;">
            <button type="button" class="modal-btn-secondary" id="btn-cancel-finalize">Annuleren</button>
            <button type="button" class="btn" id="btn-submit-finalize">
                <span class="material-icons btn-icon">check</span>
                <span id="btn-finalize-text">Finaliseren</span>
            </button>
        </div>
    `;

    function renderWorkersList(items) {
        return items.map((item, idx) => {
            const f = item.filler;
            const displayName = escapeHtml(f.name || item.resolvedUser?.full_name || 'Medewerker');
            const unameBadge = `@${escapeHtml(item.username)}`;
            const shiftStr = `${escapeHtml(f.from || '00:00')} - ${escapeHtml(f.to || '00:00')}`;
            const taskCount = item.assigned.length;
            const colliCount = item.stats.totalColli;
            const workDur = formatDuration(item.stats.workAssignedMins);
            const taskSummary = `${taskCount} ${taskCount === 1 ? 'taak' : 'taken'}${colliCount > 0 ? ` • ${colliCount} colli` : ''} • ${workDur}`;

            if (item.hasEndTime) {
                const prod = item.stats.prodResult;
                const prodPercent = prod ? prod.percent : 0;
                const statusClass = prod ? prod.statusClass : 'yellow';

                let statusTagHtml = '';
                if (item.isIdentical) {
                    statusTagHtml = `<span class="finalize-status-badge is-identical"><span class="material-icons">check_circle</span>Al identiek opgeslagen</span>`;
                } else if (item.isOverwrite) {
                    statusTagHtml = `<span class="finalize-status-badge is-overwrite"><span class="material-icons">warning</span>Wordt overschreven (was ${item.prevProdPercent}%)</span>`;
                }

                const itemClass = item.isIdentical ? 'is-disabled' : (item.checked ? 'is-checked' : '');
                const checkboxHtml = item.isIdentical
                    ? `<div class="finalize-checkbox is-disabled" title="Al identiek opgeslagen"><span class="material-icons">lock</span></div>`
                    : `<div class="finalize-checkbox ${item.checked ? 'is-checked' : ''}"><span class="material-icons">check</span></div>`;

                return `
                    <div class="finalize-item ${itemClass}" data-idx="${idx}" ${item.isIdentical ? 'title="Al identiek opgeslagen in profiel"' : ''}>
                        <div class="finalize-item-left">
                            ${checkboxHtml}
                            <div class="finalize-user-details">
                                <div class="finalize-user-header">
                                    <span class="finalize-user-name">${displayName}</span>
                                    <span class="finalize-user-uname">${unameBadge}</span>
                                </div>
                                <div class="finalize-user-sub">
                                    <span>${shiftStr}</span>
                                    <span class="finalize-dot">•</span>
                                    <span>${taskSummary}</span>
                                </div>
                                ${statusTagHtml ? `<div class="finalize-user-tag-row">${statusTagHtml}</div>` : ''}
                            </div>
                        </div>
                        <div class="finalize-item-right">
                            <div class="finalize-end-time-pill">
                                <span class="material-icons">schedule</span>
                                <span>${escapeHtml(f.actualEndTime)}</span>
                            </div>
                            <span class="finalize-prod-badge ${statusClass}">Prod: ${prodPercent}%</span>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="finalize-item is-disabled" data-idx="${idx}" title="Vul eerst een eindtijd in op de tijdlijn">
                    <div class="finalize-item-left">
                        <div class="finalize-checkbox is-disabled">
                            <span class="material-icons">lock</span>
                        </div>
                        <div class="finalize-user-details">
                            <div class="finalize-user-header">
                                <span class="finalize-user-name">${displayName}</span>
                                <span class="finalize-user-uname">${unameBadge}</span>
                            </div>
                            <div class="finalize-user-sub">
                                <span>${shiftStr}</span>
                                <span class="finalize-dot">•</span>
                                <span>${taskSummary}</span>
                            </div>
                        </div>
                    </div>
                    <div class="finalize-item-right">
                        <span class="finalize-no-end-badge">Geen eindtijd</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    const overlay = await showModal(modalContent, 'finalize-modal-overlay');
    if (overlay && !overlay.classList.contains('finalize-modal-overlay')) {
        overlay.classList.add('finalize-modal-overlay');
    }

    const listContainer = document.getElementById('finalize-list-container');
    const selectAllCheckbox = document.getElementById('finalize-select-all');
    const selectedCountLabel = document.getElementById('finalize-selected-count');
    const btnSubmit = document.getElementById('btn-submit-finalize');
    const btnFinalizeText = document.getElementById('btn-finalize-text');
    const btnCancel = document.getElementById('btn-cancel-finalize');

    const datePickerContainer = document.getElementById('finalizeDatePickerContainer');
    let finalizeDatePicker = null;
    if (datePickerContainer) {
        finalizeDatePicker = createDatePicker(datePickerContainer, todayStr, async (selectedDateVal) => {
            if (!selectedDateVal) return;
            await recalculateStatusesForDate(selectedDateVal);

            fillersWithUser.sort((a, b) => {
                const aReady = a.hasEndTime && !a.isIdentical;
                const bReady = b.hasEndTime && !b.isIdentical;
                if (aReady && !bReady) return -1;
                if (!aReady && bReady) return 1;
                if (a.hasEndTime && !b.hasEndTime) return -1;
                if (!a.hasEndTime && b.hasEndTime) return 1;
                return (a.filler.name || '').localeCompare(b.filler.name || '');
            });

            const readyCount = fillersWithUser.filter(f => f.hasEndTime && !f.isIdentical).length;
            const overwriteCount = fillersWithUser.filter(f => f.hasEndTime && f.isOverwrite).length;
            const identicalCount = fillersWithUser.filter(f => f.hasEndTime && f.isIdentical).length;

            let bannerExtra = '';
            if (overwriteCount > 0 || identicalCount > 0) {
                const parts = [];
                if (overwriteCount > 0) parts.push(`${overwriteCount} overschrijven`);
                if (identicalCount > 0) parts.push(`${identicalCount} al identiek`);
                bannerExtra = ` (${parts.join(', ')})`;
            }

            const bannerText = document.getElementById('finalize-banner-text');
            if (bannerText) {
                bannerText.textContent = `${readyCount} van de ${fillersWithUser.length} medewerkers gereed om te finaliseren${bannerExtra}`;
            }

            if (listContainer) {
                listContainer.innerHTML = renderWorkersList(fillersWithUser);
                bindItemClicks();
            }
            updateUiState();
        });
    }

    function updateUiState() {
        const checkedCount = fillersWithUser.filter(f => f.hasEndTime && !f.isIdentical && f.checked).length;
        const eligibleCount = fillersWithUser.filter(f => f.hasEndTime && !f.isIdentical).length;

        if (selectedCountLabel) {
            selectedCountLabel.textContent = `${checkedCount} geselecteerd`;
        }
        if (btnFinalizeText) {
            btnFinalizeText.textContent = checkedCount > 0 ? `Finaliseren (${checkedCount})` : 'Finaliseren';
        }
        if (btnSubmit) {
            btnSubmit.disabled = checkedCount === 0;
            btnSubmit.style.opacity = checkedCount === 0 ? '0.5' : '1';
            btnSubmit.style.cursor = checkedCount === 0 ? 'not-allowed' : 'pointer';
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.disabled = eligibleCount === 0;
            selectAllCheckbox.checked = eligibleCount > 0 && checkedCount === eligibleCount;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < eligibleCount;
        }
    }

    updateUiState();

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', () => {
            const isChecked = selectAllCheckbox.checked;
            fillersWithUser.forEach(item => {
                if (item.hasEndTime && !item.isIdentical) {
                    item.checked = isChecked;
                }
            });
            if (listContainer) {
                listContainer.innerHTML = renderWorkersList(fillersWithUser);
                bindItemClicks();
            }
            updateUiState();
        });
    }

    function bindItemClicks() {
        if (!listContainer) return;
        const itemRows = listContainer.querySelectorAll('.finalize-item');
        itemRows.forEach(row => {
            row.addEventListener('click', () => {
                const idx = parseInt(row.getAttribute('data-idx'), 10);
                const item = fillersWithUser[idx];
                if (!item || !item.hasEndTime || item.isIdentical) return;

                item.checked = !item.checked;
                row.classList.toggle('is-checked', item.checked);
                const cb = row.querySelector('.finalize-checkbox');
                if (cb) {
                    cb.classList.toggle('is-checked', item.checked);
                }
                updateUiState();
            });
        });
    }

    bindItemClicks();

    if (btnCancel) {
        btnCancel.addEventListener('click', () => closeModal());
    }

    if (btnSubmit) {
        btnSubmit.addEventListener('click', async () => {
            const selected = fillersWithUser.filter(f => f.hasEndTime && !f.isIdentical && f.checked);
            if (selected.length === 0) return;

            const targetDate = (finalizeDatePicker ? finalizeDatePicker.getValue() : '') || todayStr;

            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const isTargetToday = targetDate === todayStr;

            const futureEndItems = isTargetToday ? selected.filter(item => {
                if (!item.filler?.actualEndTime) return false;
                const parts = String(item.filler.actualEndTime).trim().split(':');
                if (parts.length < 2) return false;
                const endMins = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                return endMins > currentMins;
            }) : [];

            if (futureEndItems.length > 0) {
                const names = futureEndItems.map(i => i.filler.name || i.username).join(', ');
                const confirmed = await showConfirmModal({
                    title: 'Weet je het zeker?',
                    message: `Er ${futureEndItems.length === 1 ? 'is' : 'zijn'} ${futureEndItems.length} ${futureEndItems.length === 1 ? 'medewerker' : 'medewerkers'} (${names}) waarvan de eindtijd later is dan de huidige tijd van vandaag. Weet je zeker dat je wilt finaliseren?`,
                    confirmText: 'Ja, finaliseren',
                    cancelText: 'Annuleren',
                    isDanger: true
                });
                if (!confirmed) return;
            }

            btnSubmit.disabled = true;
            btnSubmit.style.opacity = '0.7';
            btnSubmit.style.cursor = 'wait';
            if (btnFinalizeText) {
                btnFinalizeText.textContent = 'Finaliseren...';
            }

            try {
                const records = selected.map(item => {
                    const formattedTasks = getFormattedTasksWithTimes(item.filler, item.assigned);
                    const prodPercent = item.stats.prodResult ? item.stats.prodResult.percent : 0;

                    return {
                        username: item.username,
                        productivity: {
                            productivity: prodPercent,
                            finalized_at: new Date().toISOString(),
                            date: targetDate,
                            shift: {
                                start: item.filler.from,
                                planned_end: item.filler.to,
                                actual_end: item.filler.actualEndTime,
                                pause_minutes: item.stats.effectivePause
                            },
                            tasks: formattedTasks
                        }
                    };
                });

                const { data, error } = await supabase.functions.invoke('manage-productivity', {
                    body: {
                        action: 'finalize_productivity',
                        records
                    }
                });

                if (error) {
                    let errMsg = error.message || 'Fout bij finaliseren van productiviteiten';
                    if (error.context && typeof error.context.json === 'function') {
                        try {
                            const errBody = await error.context.json();
                            if (errBody && errBody.error) errMsg = errBody.error;
                        } catch (_) {}
                    }
                    throw new Error(errMsg);
                }

                if (data && data.error) {
                    throw new Error(data.error);
                }

                const finalizedCount = data?.finalizedCount || records.length;
                showToast('success', `${finalizedCount} ${finalizedCount === 1 ? 'medewerker' : 'medewerkers'} succesvol gefinaliseerd!`);
                closeModal();

            } catch (err) {
                showToast('error', err.message || 'Er is een fout opgetreden bij het finaliseren');
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = '1';
                btnSubmit.style.cursor = 'pointer';
                updateUiState();
            }
        });
    }
}
