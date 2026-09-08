import { supabase, showToast, escapeHtml } from './main.js';
import { formatDuration, timeToMinutes, getProductivityStatusClass, getProductivityStatusIcon } from './vulplanning/time-utils.js';
import { createCustomSelect } from './select.js';

let cachedProductivityEntries = [];
let currentChartMode = 'individual';
let currentTimeframe = 'all';

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

        cachedProductivityEntries = entries || [];
        initChartControls();

        const chartCard = document.getElementById('productivityChartCard');

        if (!entries || entries.length === 0) {
            if (emptyEl) emptyEl.style.display = 'flex';
            if (myShiftsSection) myShiftsSection.style.display = 'none';
            if (sectionDivider) sectionDivider.style.display = 'none';
            if (statsEl) statsEl.style.display = 'none';
            if (chartCard) chartCard.style.display = 'none';
            loadTopFillers(session.user.id);
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (myShiftsSection) myShiftsSection.style.display = 'flex';
        if (statsEl) statsEl.style.display = 'flex';
        if (chartCard) chartCard.style.display = 'flex';

        renderSummaryStats(entries);
        renderProductivityList(entries, listEl);
        renderProductivityChart(entries);
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
    const rawName = filler.full_name || filler.username || 'Medewerker';
    const name = escapeHtml(rawName);
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const statusClass = getProductivityStatusClass(avgProd);
    const statusIcon = getProductivityStatusIcon(avgProd);
    const initials = rawName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || 'M';
    const rankIcon = rank === 1 ? 'workspace_premium' : (rank === 2 ? 'military_tech' : (rank === 3 ? 'stars' : ''));

    const card = document.createElement('div');
    card.className = `top-filler-card${isCurrentUser ? ' is-current-user' : ''}${rank <= 3 ? ` podium-card rank-${rank}` : ''}`;

    card.innerHTML = `
        <div class="top-filler-left">
            <div class="rank-badge${rank <= 3 ? ` rank-${rank}` : ''}">
                ${rankIcon ? `<span class="material-icons rank-medal-icon">${rankIcon}</span>` : ''}
                <span>#${rank}</span>
            </div>
            <div class="top-filler-avatar">${initials}</div>
            <div class="top-filler-info">
                <div class="top-filler-name-row">
                    <span class="top-filler-name" title="${name}">${name}</span>
                    ${isCurrentUser ? '<span class="you-pill">Jij</span>' : ''}
                </div>
                <span class="top-filler-shifts">${shiftCount} ${shiftCount === 1 ? 'shift' : 'shifts'} afgerond</span>
            </div>
        </div>
        <span class="prod-badge ${statusClass}">
            <span class="material-icons">${statusIcon}</span>
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

function initChartControls() {
    const btnIndividual = document.getElementById('chartModeIndividual');
    const btnAverage = document.getElementById('chartModeAverage');
    if (btnIndividual && btnAverage && !btnIndividual.dataset.bound) {
        btnIndividual.dataset.bound = 'true';
        btnIndividual.addEventListener('click', () => {
            if (currentChartMode === 'individual') return;
            currentChartMode = 'individual';
            btnIndividual.classList.add('active');
            btnAverage.classList.remove('active');
            renderProductivityChart(cachedProductivityEntries);
        });

        btnAverage.addEventListener('click', () => {
            if (currentChartMode === 'average') return;
            currentChartMode = 'average';
            btnAverage.classList.add('active');
            btnIndividual.classList.remove('active');
            renderProductivityChart(cachedProductivityEntries);
        });
    }

    const selectContainer = document.getElementById('chartTimeframeSelectContainer');
    if (selectContainer && !selectContainer.hasChildNodes()) {
        const timeframeOptions = [
            { value: 'all', label: 'Altijd' },
            { value: '1y', label: 'Laatste jaar' },
            { value: '6m', label: 'Laatste 6 maanden' },
            { value: '1m', label: 'Laatste maand' },
            { value: '2w', label: '2 weken' },
            { value: '1w', label: 'Een week' }
        ];

        createCustomSelect(
            selectContainer,
            timeframeOptions,
            currentTimeframe,
            'Periode...',
            (newVal) => {
                if (newVal === currentTimeframe) return;
                currentTimeframe = newVal;
                renderProductivityChart(cachedProductivityEntries);
            }
        );
    }
}

function renderProductivityChart(entries) {
    const container = document.getElementById('productivityChartContainer');
    if (!container) return;



    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="chart-empty-msg">
                <span class="material-icons">info</span>
                <span>Nog geen gewerkte diensten om een voortgangsgrafiek weer te geven.</span>
            </div>
        `;
        return;
    }

    const chronological = [...entries].sort((a, b) => {
        const timeA = new Date(a.date || a.finalized_at || 0).getTime();
        const timeB = new Date(b.date || b.finalized_at || 0).getTime();
        return timeA - timeB;
    });

    const enriched = chronological.map((e, idx) => {
        const rawP = Math.round(Number(e.productivity) || 0);
        const windowSlice = chronological.slice(Math.max(0, idx - 9), idx + 1);
        const windowProdList = windowSlice
            .map(item => Number(item.productivity))
            .filter(val => !isNaN(val));
        const windowAvg = windowProdList.length > 0
            ? Math.round(windowProdList.reduce((sum, val) => sum + val, 0) / windowProdList.length)
            : rawP;

        const dObj = new Date(e.date || e.finalized_at || 0);
        let dateLabel = '';
        if (!isNaN(dObj.getTime())) {
            dateLabel = dObj.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
        }

        const timestamp = dObj.getTime() || 0;

        return {
            timestamp,
            rawPercent: rawP,
            avgPercent: windowAvg,
            windowSize: windowProdList.length,
            dateLabel,
            colli: Number(e.total_colli) || 0
        };
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let cutoff = 0;
    if (currentTimeframe === '1w') cutoff = now - 7 * dayMs;
    else if (currentTimeframe === '2w') cutoff = now - 14 * dayMs;
    else if (currentTimeframe === '1m') cutoff = now - 31 * dayMs;
    else if (currentTimeframe === '6m') cutoff = now - 183 * dayMs;
    else if (currentTimeframe === '1y') cutoff = now - 365 * dayMs;

    const filtered = cutoff > 0 ? enriched.filter(e => e.timestamp >= cutoff) : enriched;

    const subtitleEl = document.getElementById('chartCardSubtitle');
    if (subtitleEl) {
        if (filtered.length > 12) {
            subtitleEl.textContent = currentChartMode === 'average'
                ? 'Gemiddelde trend per periode'
                : 'Productiviteit per periode';
        } else {
            subtitleEl.textContent = currentChartMode === 'average'
                ? 'Gemiddelde van de laatste 10 shifts per punt'
                : 'Productiviteit per gewerkte shift';
        }
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="chart-empty-msg">
                <span class="material-icons">info</span>
                <span>Geen diensten gevonden binnen de geselecteerde periode.</span>
            </div>
        `;
        return;
    }

    const maxPoints = 12;
    let dataPoints = [];

    if (filtered.length <= maxPoints) {
        dataPoints = filtered.map(e => {
            const percent = currentChartMode === 'average' ? e.avgPercent : e.rawPercent;
            return {
                ...e,
                percent,
                statusClass: getProductivityStatusClass(percent)
            };
        });
    } else {
        const bucketSize = filtered.length / maxPoints;
        for (let b = 0; b < maxPoints; b++) {
            const start = Math.floor(b * bucketSize);
            const end = Math.min(filtered.length, Math.floor((b + 1) * bucketSize));
            const chunk = filtered.slice(start, end);
            if (chunk.length === 0) continue;

            const avgRaw = Math.round(chunk.reduce((sum, c) => sum + c.rawPercent, 0) / chunk.length);
            const avgRoll = Math.round(chunk.reduce((sum, c) => sum + c.avgPercent, 0) / chunk.length);
            const totalColli = chunk.reduce((sum, c) => sum + c.colli, 0);

            const repItem = b === 0 ? chunk[0] : (b === maxPoints - 1 ? chunk[chunk.length - 1] : chunk[Math.floor(chunk.length / 2)]);
            const percent = currentChartMode === 'average' ? avgRoll : avgRaw;

            dataPoints.push({
                timestamp: repItem.timestamp,
                rawPercent: avgRaw,
                avgPercent: avgRoll,
                percent,
                windowSize: chunk.length,
                dateLabel: repItem.dateLabel,
                colli: totalColli,
                statusClass: getProductivityStatusClass(percent)
            });
        }
    }

    const width = 600;
    const height = 240;
    const padLeft = 46;
    const padRight = 32;
    const padTop = 32;
    const padBottom = 42;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const maxVal = Math.max(120, Math.ceil((Math.max(...dataPoints.map(d => d.percent)) + 10) / 10) * 10);
    const minVal = 0;

    const getY = (val) => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    const getX = (index) => {
        if (dataPoints.length === 1) return padLeft + chartW / 2;
        return padLeft + (index / (dataPoints.length - 1)) * chartW;
    };

    const targetY = getY(100);
    const midY = getY(50);
    const zeroY = getY(0);

    const coords = dataPoints.map((d, i) => ({
        x: getX(i),
        y: getY(d.percent),
        ...d
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    const statusColors = {
        success: 'var(--accent-color)',
        yellow: 'var(--yellow-color)',
        orange: 'var(--warning-color)',
        danger: 'var(--danger-color)'
    };

    const circlesSvg = coords.map((c) => {
        const dotColor = statusColors[c.statusClass] || 'var(--accent-color)';
        const titleText = c.windowSize > 1
            ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddeld over ${c.windowSize} shifts)`
            : (currentChartMode === 'average'
                ? `${escapeHtml(c.dateLabel)}: ${c.percent}% (gemiddelde over ${c.windowSize} ${c.windowSize === 1 ? 'shift' : 'shifts'})`
                : `${escapeHtml(c.dateLabel)}: ${c.percent}%${c.colli > 0 ? ` (${c.colli} colli)` : ''}`);

        return `
            <g class="chart-point-group">
                <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="var(--card-background)" stroke="${dotColor}" stroke-width="3">
                    <title>${titleText}</title>
                </circle>
                <text x="${c.x.toFixed(1)}" y="${(c.y - 10).toFixed(1)}" text-anchor="middle" fill="var(--text-color)" font-size="11" font-weight="700">
                    ${c.percent}%
                </text>
                <text x="${c.x.toFixed(1)}" y="${(padTop + chartH + 20).toFixed(1)}" text-anchor="middle" fill="var(--text-color-muted)" font-size="10.5">
                    ${escapeHtml(c.dateLabel)}
                </text>
            </g>
        `;
    }).join('');

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" class="productivity-svg-chart" preserveAspectRatio="none">
            <defs>
                <linearGradient id="prodChartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent-color)" stop-opacity="0.28"/>
                    <stop offset="100%" stop-color="var(--chart-area-stop)" stop-opacity="0.0"/>
                </linearGradient>
            </defs>

            <line x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${width - padRight}" y2="${zeroY.toFixed(1)}" stroke="var(--chart-grid-line)" stroke-width="1"/>
            <text x="${padLeft - 8}" y="${(zeroY + 4).toFixed(1)}" text-anchor="end" fill="var(--text-color-muted)" font-size="10">0%</text>

            <line x1="${padLeft}" y1="${midY.toFixed(1)}" x2="${width - padRight}" y2="${midY.toFixed(1)}" stroke="var(--chart-grid-line)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="${padLeft - 8}" y="${(midY + 4).toFixed(1)}" text-anchor="end" fill="var(--text-color-muted)" font-size="10">50%</text>

            <line x1="${padLeft}" y1="${targetY.toFixed(1)}" x2="${width - padRight}" y2="${targetY.toFixed(1)}" stroke="var(--chart-target-line)" stroke-width="1.5" stroke-dasharray="5,4"/>
            <text x="${padLeft - 8}" y="${(targetY + 4).toFixed(1)}" text-anchor="end" fill="var(--accent-color)" font-size="10.5" font-weight="700">100%</text>

            <path d="${areaD}" fill="url(#prodChartAreaGrad)"/>
            <path d="${pathD}" fill="none" stroke="var(--accent-color)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

            ${circlesSvg}
        </svg>
    `;
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
        const statusClass = percent !== null ? getProductivityStatusClass(percent) : 'danger';
        const statusIcon = percent !== null ? getProductivityStatusIcon(percent) : 'trending_down';

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
                let dur = Number(task.duration_minutes) || Number(task.duration) || 0;
                const sTime = task.start_time || task.start || '';
                const eTime = task.end_time || task.end || '';

                if (dur <= 0 && sTime && eTime) {
                    const startM = timeToMinutes(sTime);
                    let endM = timeToMinutes(eTime);
                    if (endM < startM) endM += 24 * 60;
                    dur = Math.max(0, endM - startM);
                }

                let timeHtml = '';
                if (sTime && eTime) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>${escapeHtml(sTime)} - ${escapeHtml(eTime)}${dur > 0 ? ` (${formatDuration(dur)})` : ''}</span>
                        </span>
                    `;
                } else if (sTime) {
                    timeHtml = `
                        <span class="day-task-time">
                            <span class="material-icons">schedule</span>
                            <span>Vanaf ${escapeHtml(sTime)}</span>
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
                                <div class="day-task-icon-box">
                                    <span class="material-icons day-task-icon">${getTaskIcon(type)}</span>
                                </div>
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
            tasksHtml = `<div class="day-tasks-empty"><span class="material-icons" style="font-size:18px;">info</span><span>Geen afzonderlijke paden geregistreerd voor deze shift.</span></div>`;
        }

        card.innerHTML = `
            <div class="day-card-header">
                <div class="day-card-header-left">
                    <div class="day-date-row">
                        <div class="day-date-icon-box">
                            <span class="material-icons day-date-icon">event</span>
                        </div>
                        <span class="day-date-text">${escapeHtml(dateStr)}</span>
                    </div>
                    <div class="day-meta-pills">
                        ${pillsHtml}
                    </div>
                </div>
                <div class="day-card-header-right">
                    ${percent !== null ? `
                        <span class="prod-badge ${statusClass}">
                            <span class="material-icons">${statusIcon}</span>
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
