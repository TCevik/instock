import { supabase, showToast, escapeHtml } from './main.js';
import { formatDuration } from './vulplanning/time-utils.js';

document.addEventListener('DOMContentLoaded', initProductivityPage);

async function initProductivityPage() {
    const loadingEl = document.getElementById('productivityLoading');
    const emptyEl = document.getElementById('productivityEmpty');
    const listEl = document.getElementById('productivityList');
    const statsEl = document.getElementById('productivitySummaryStats');

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) emptyEl.style.display = 'flex';
            return;
        }

        const { data: userData, error } = await supabase
            .from('user_data')
            .select('user_id, username, full_name, productivity')
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (loadingEl) loadingEl.style.display = 'none';

        const entries = extractProductivities(userData?.productivity);

        const myShiftsSection = document.getElementById('myShiftsSection');
        const sectionDivider = document.getElementById('productivitySectionDivider');

        if (!entries || entries.length === 0) {
            if (emptyEl) emptyEl.style.display = 'flex';
            if (myShiftsSection) myShiftsSection.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            if (statsEl) statsEl.style.display = 'none';
            loadTopFillers(session.user.id);
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (myShiftsSection) myShiftsSection.style.display = 'flex';
        if (statsEl) statsEl.style.display = 'flex';

        renderSummaryStats(entries);
        renderProductivityList(entries, listEl);
        loadTopFillers(session.user.id);

    } catch (err) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        showToast('error', err.message || 'Kon productiviteitsgegevens niet ophalen');
    }
}

async function loadTopFillers(currentUserId) {
    const sectionEl = document.getElementById('topFillersSection');
    const listEl = document.getElementById('topFillersList');
    const userRankEl = document.getElementById('topFillerUserRank');
    const myShiftsSection = document.getElementById('myShiftsSection');
    const sectionDivider = document.getElementById('productivitySectionDivider');
    if (!sectionEl || !listEl) return;

    try {
        const { data, error } = await supabase.functions.invoke('get-top-fillers');
        if (error || !data || !Array.isArray(data.topFillers) || data.topFillers.length === 0) {
            sectionEl.style.display = 'none';
            if (userRankEl) userRankEl.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            return;
        }

        renderTopFillers(data.topFillers, listEl, currentUserId);

        const isInTop5 = data.topFillers.some(f => f.user_id === currentUserId);
        if (userRankEl) {
            if (!isInTop5 && data.currentUserRanking && data.currentUserRanking.rank) {
                userRankEl.innerHTML = '';
                userRankEl.appendChild(createTopFillerCard(data.currentUserRanking, data.currentUserRanking.rank, true));
                userRankEl.style.display = 'flex';
            } else {
                userRankEl.innerHTML = '';
                userRankEl.style.display = 'none';
            }
        }

        sectionEl.style.display = 'flex';
        if (sectionDivider) {
            sectionDivider.style.display = (myShiftsSection && myShiftsSection.style.display !== 'none') ? 'block' : 'none';
        }
    } catch (_) {
        sectionEl.style.display = 'none';
        if (userRankEl) userRankEl.style.display = 'none';
        if (sectionDivider) sectionDivider.style.display = 'none';
    }
}

function createTopFillerCard(filler, rank, isCurrentUser) {
    const name = escapeHtml(filler.full_name || filler.username || 'Medewerker');
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const statusClass = getStatusClass(avgProd);
    const statusIcon = getStatusIcon(avgProd);

    const card = document.createElement('div');
    card.className = `top-filler-card${isCurrentUser ? ' is-current-user' : ''}`;

    card.innerHTML = `
        <div class="top-filler-left">
            <span class="rank-badge${rank <= 3 ? ` rank-${rank}` : ''}">#${rank}</span>
            <div class="top-filler-info">
                <div class="top-filler-name-row">
                    <span class="top-filler-name" title="${name}">${name}</span>
                    ${isCurrentUser ? '<span class="you-pill">Jij</span>' : ''}
                </div>
                <span class="top-filler-shifts">${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'}</span>
            </div>
        </div>
        <span class="prod-badge ${statusClass}">
            <span class="material-icons" style="font-size:13px;">${statusIcon}</span>
            <span>${avgProd}%</span>
        </span>
    `;

    return card;
}

function renderTopFillers(topFillers, container, currentUserId) {
    container.innerHTML = '';

    topFillers.forEach((filler, index) => {
        const isCurrentUser = filler.user_id === currentUserId;
        container.appendChild(createTopFillerCard(filler, index + 1, isCurrentUser));
    });
}

function extractProductivities(prodData) {
    if (!prodData) return [];
    const entries = [];
    const seen = new Set();

    const addEntry = (item) => {
        if (!item || typeof item !== 'object') return;
        const key = item.date ? String(item.date).trim() : `${item.finalized_at || ''}_${item.productivity !== undefined ? item.productivity : ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        entries.push(item);
    };

    if (Array.isArray(prodData)) {
        prodData.forEach(addEntry);
    } else if (typeof prodData === 'object') {
        if (Array.isArray(prodData.history)) {
            prodData.history.forEach(addEntry);
        }
        const { history, ...topLevel } = prodData;
        if (topLevel.date || topLevel.productivity !== undefined) {
            addEntry(topLevel);
        }
    }

    return entries.sort((a, b) => {
        const timeA = new Date(a.date || a.finalized_at || 0).getTime();
        const timeB = new Date(b.date || b.finalized_at || 0).getTime();
        return timeB - timeA;
    });
}

function getStatusClass(percent) {
    const p = Number(percent);
    if (isNaN(p)) return 'orange';
    if (p >= 100) return 'success';
    if (p >= 80) return 'yellow';
    if (p >= 60) return 'orange';
    return 'danger';
}

function getStatusIcon(percent) {
    const p = Number(percent);
    if (isNaN(p)) return 'trending_flat';
    if (p >= 100) return 'trending_up';
    if (p >= 80) return 'check_circle';
    if (p >= 60) return 'trending_flat';
    return 'trending_down';
}

function formatDate(dateStr) {
    if (!dateStr) return 'Onbekende datum';
    const parts = String(dateStr).split('T')[0].split('-');
    if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
            return d.toLocaleDateString('nl-NL', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('nl-NL', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    return dateStr;
}

function getTypeBadge(type) {
    const t = String(type || 'overige').toLowerCase();
    switch (t) {
        case 'vullen':
            return `<span class="task-badge-pill type-vullen"><span class="material-icons" style="font-size:12px;">inventory_2</span>Vullen</span>`;
        case 'spiegelen':
            return `<span class="task-badge-pill type-spiegelen"><span class="material-icons" style="font-size:12px;">auto_fix_high</span>Spiegelen</span>`;
        case 'restanten':
            return `<span class="task-badge-pill type-restanten"><span class="material-icons" style="font-size:12px;">layers</span>Restanten</span>`;
        case 'pauze':
            return `<span class="task-badge-pill type-pauze"><span class="material-icons" style="font-size:12px;">free_breakfast</span>Pauze</span>`;
        default:
            return `<span class="task-badge-pill type-overige"><span class="material-icons" style="font-size:12px;">assignment</span>Overige</span>`;
    }
}

function getTaskIcon(type) {
    const t = String(type || 'overige').toLowerCase();
    switch (t) {
        case 'vullen': return 'inventory_2';
        case 'spiegelen': return 'auto_fix_high';
        case 'restanten': return 'layers';
        case 'pauze': return 'free_breakfast';
        default: return 'assignment';
    }
}

function renderSummaryStats(entries) {
    const avgEl = document.getElementById('statAvgProd');
    const colliEl = document.getElementById('statTotalColli');
    const daysEl = document.getElementById('statTotalDays');

    let totalProd = 0;
    let prodCount = 0;
    let totalColli = 0;

    entries.forEach(e => {
        if (e.productivity !== undefined && e.productivity !== null && !isNaN(Number(e.productivity))) {
            totalProd += Number(e.productivity);
            prodCount++;
        }
        if (e.total_colli && Number(e.total_colli) > 0) {
            totalColli += Number(e.total_colli);
        } else if (Array.isArray(e.tasks)) {
            e.tasks.forEach(t => {
                if (t.colli && Number(t.colli) > 0) {
                    totalColli += Number(t.colli);
                }
            });
        }
    });

    if (avgEl) {
        const avg = prodCount > 0 ? Math.round(totalProd / prodCount) : 0;
        avgEl.textContent = `${avg}%`;
    }

    if (colliEl) {
        colliEl.textContent = totalColli.toLocaleString('nl-NL');
    }

    if (daysEl) {
        daysEl.textContent = entries.length;
    }
}

function renderProductivityList(entries, container) {
    container.innerHTML = '';

    entries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'productivity-day-card';

        const percent = entry.productivity !== undefined ? Math.round(Number(entry.productivity)) : null;
        const statusClass = percent !== null ? getStatusClass(percent) : 'orange';
        const statusIcon = percent !== null ? getStatusIcon(percent) : 'trending_flat';

        const shift = entry.shift || {};
        const startTime = shift.start || '';
        const endTime = shift.actual_end || shift.planned_end || '';
        const pauseMinutes = Number(shift.pause_minutes) || 0;
        const workMinutes = Number(entry.total_work_minutes) || 0;

        let totalColli = Number(entry.total_colli) || 0;
        const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];

        if (totalColli === 0 && tasks.length > 0) {
            tasks.forEach(t => {
                if (t.colli && Number(t.colli) > 0) {
                    totalColli += Number(t.colli);
                }
            });
        }

        const dateStr = formatDate(entry.date || entry.finalized_at);

        let pillsHtml = '';
        if (startTime && endTime) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">schedule</span>
                    <span>${escapeHtml(startTime)} - ${escapeHtml(endTime)}</span>
                </span>
            `;
        }
        if (workMinutes > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">timer</span>
                    <span>${formatDuration(workMinutes)} gewerkt</span>
                </span>
            `;
        }
        if (totalColli > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">inventory_2</span>
                    <span>${totalColli} colli</span>
                </span>
            `;
        }
        if (pauseMinutes > 0) {
            pillsHtml += `
                <span class="day-meta-pill">
                    <span class="material-icons">free_breakfast</span>
                    <span>${pauseMinutes}m pauze</span>
                </span>
            `;
        }

        let tasksHtml = '';
        if (tasks.length > 0) {
            const taskCards = tasks.map(task => {
                const title = escapeHtml(task.title || task.pathName || task.name || 'Taak');
                const type = task.type || 'overige';
                const colli = Number(task.colli) || 0;
                const dur = Number(task.duration_minutes) || Number(task.duration) || 0;
                const sTime = task.start_time || '';
                const eTime = task.end_time || '';

                let timeHtml = '';
                if (sTime && eTime) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>${escapeHtml(sTime)} - ${escapeHtml(eTime)}${dur > 0 ? ` (${formatDuration(dur)})` : ''}</span>
                        </span>
                    `;
                } else if (dur > 0) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>${formatDuration(dur)}</span>
                        </span>
                    `;
                }

                let colliHtml = '';
                if (colli > 0) {
                    colliHtml = `
                        <span class="day-task-colli">
                            <span class="material-icons">inventory_2</span>
                            <span>${colli} colli</span>
                        </span>
                    `;
                }

                let metaBottom = `${timeHtml}${colliHtml}`;

                return `
                    <div class="day-task-card">
                        <div class="day-task-top">
                            <div class="day-task-name-group">
                                <span class="material-icons day-task-icon">${getTaskIcon(type)}</span>
                                <span class="day-task-name" title="${title}">${title}</span>
                            </div>
                            ${getTypeBadge(type)}
                        </div>
                        ${metaBottom ? `<div class="day-task-bottom">${metaBottom}</div>` : ''}
                    </div>
                `;
            }).join('');

            tasksHtml = `
                <div class="day-tasks-grid">
                    ${taskCards}
                </div>
            `;
        } else {
            tasksHtml = `<div class="day-tasks-empty">Geen afzonderlijke paden geregistreerd voor deze shift.</div>`;
        }

        card.innerHTML = `
            <div class="day-card-header">
                <div class="day-card-header-left">
                    <div class="day-date-row">
                        <span class="material-icons day-date-icon">event</span>
                        <span class="day-date-text">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="day-meta-pills">
                        ${pillsHtml}
                    </div>
                </div>
                <div class="day-card-header-right">
                    ${percent !== null ? `
                        <span class="prod-badge ${statusClass}">
                            <span class="material-icons" style="font-size:14px;">${statusIcon}</span>
                            <span>${percent}%</span>
                        </span>
                    ` : ''}
                </div>
            </div>
            <div class="day-card-body">
                <div class="day-tasks-title-row">
                    <span class="day-tasks-heading">
                        <span class="material-icons">route</span>
                        <span>Uitgevoerde paden & taken</span>
                    </span>
                    <span class="day-tasks-count">${tasks.length} ${tasks.length === 1 ? 'pad / taak' : 'paden / taken'}</span>
                </div>
                ${tasksHtml}
            </div>
        `;

        container.appendChild(card);
    });
}
