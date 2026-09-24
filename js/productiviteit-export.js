import { escapeHtml } from "./main.js";

/**
 * Exporteert de Top 10 productiviteit naar een feestelijk gedecoreerd A4-document (print & PDF).
 * - Plek 1, 2 en 3 krijgen vol podium met trofeeën, medailles en voetstukken.
 * - Plek 4 en 5 krijgen speciale ererol-kaarten met lintjes en sterren.
 * - Plek 6 t/m 10 staan netjes onder elkaar in een compacte lijst.
 * - Past precies op 1 A4 portrait.
 * @param {Array} topFillers - Lijst met vullers
 * @param {Object} options - Optionele configuratie (bijv. date, title, subtitle)
 */
export function exportTopFillersA4(topFillers, options = {}) {
  if (!Array.isArray(topFillers) || topFillers.length === 0) {
    throw new Error(
      "Geen productiviteitsgegevens beschikbaar om te exporteren.",
    );
  }

  const fillers = topFillers.slice(0, 10);
  const dateLabel =
    options.dateLabel ||
    (options.date ? options.date : "Laatste 10 shifts per vuller");
  const generationDate = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Verdeel over categorieën
  const first = fillers[0] || null;
  const second = fillers[1] || null;
  const third = fillers[2] || null;
  const fourth = fillers[3] || null;
  const fifth = fillers[4] || null;
  const remainingOthers = fillers.slice(5); // 6 t/m 10

  let iframe = document.getElementById("printTopFillersIframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = "printTopFillersIframe";
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow.document;
  doc.open();

  const renderPodiumItem = (filler, rank, medal, title, stars) => {
    if (!filler) return '<div class="podium-col empty"></div>';
    const rawName = filler.full_name || filler.username || "Medewerker";
    const name = escapeHtml(rawName);
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const initials =
      rawName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "M";

    return `
            <div class="podium-col rank-${rank}">
                <div class="podium-crown-area">
                    <span class="podium-medal">${medal}</span>
                    ${rank === 1 ? '<span class="crown-icon">👑</span>' : ""}
                </div>
                <div class="podium-card rank-${rank}">
                    <div class="stars-row">${stars}</div>
                    <div class="avatar-wrapper">
                        <div class="podium-avatar">${initials}</div>
                        <span class="rank-number-badge">#${rank}</span>
                    </div>
                    <div class="podium-name" title="${name}">${name}</div>
                    <div class="podium-title-tag">${title}</div>
                    <div class="podium-prod-badge">
                        <span class="prod-percent">${avgProd}%</span>
                        <span class="prod-sub">productiviteit</span>
                    </div>
                    <div class="podium-shifts">${shiftCount} ${shiftCount === 1 ? "shift" : "shifts"}</div>
                </div>
                <div class="podium-pedestal rank-${rank}">
                    <span class="pedestal-rank">${rank}</span>
                </div>
            </div>
        `;
  };

  const renderHonorableItem = (filler, rank, medal, title) => {
    if (!filler) return "";
    const rawName = filler.full_name || filler.username || "Medewerker";
    const name = escapeHtml(rawName);
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const initials =
      rawName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "M";

    return `
            <div class="honorable-card rank-${rank}">
                <div class="honorable-badge-wrapper">
                    <span class="honorable-medal">${medal}</span>
                    <span class="honorable-rank-tag">#${rank}</span>
                </div>
                <div class="honorable-avatar">${initials}</div>
                <div class="honorable-info">
                    <div class="honorable-name-row">
                        <span class="honorable-name">${name}</span>
                        <span class="honorable-title-tag">${title}</span>
                    </div>
                    <span class="honorable-shifts">${shiftCount} ${shiftCount === 1 ? "shift" : "shifts"} opgeslagen</span>
                </div>
                <div class="honorable-prod-badge">
                    <span class="honorable-prod-val">${avgProd}%</span>
                    <span class="honorable-prod-sub">productiviteit</span>
                </div>
            </div>
        `;
  };

  const renderRemainingRow = (filler, rank) => {
    const rawName = filler.full_name || filler.username || "Medewerker";
    const name = escapeHtml(rawName);
    const avgProd = Math.round(Number(filler.average_productivity) || 0);
    const shiftCount = Number(filler.shifts_count) || 0;
    const initials =
      rawName
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "M";

    return `
            <div class="remaining-row">
                <div class="remaining-rank-badge">#${rank}</div>
                <div class="remaining-avatar">${initials}</div>
                <div class="remaining-info">
                    <div class="remaining-name">${name}</div>
                    <div class="remaining-shifts">${shiftCount} ${shiftCount === 1 ? "shift" : "shifts"}</div>
                </div>
                <div class="remaining-prod-badge">
                    <span class="remaining-prod-val">${avgProd}%</span>
                </div>
            </div>
        `;
  };

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Top 10 Vullers - Eregalerij</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap');

        @page {
            size: A4 portrait;
            margin: 6mm;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        body {
            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #ffffff;
            color: #1a1a1a;
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
        }

        .a4-page {
            width: 100%;
            max-width: 198mm;
            height: 284mm;
            max-height: 284mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            background: #ffffff;
            border: 2px solid #22c55e25;
            border-radius: 16px;
            padding: 8mm 9mm 6mm 9mm;
            box-sizing: border-box;
            overflow: hidden;
        }

        /* Feestelijke achtergrondaccenten */
        .page-bg-accent {
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: 
                radial-gradient(circle at 10% 8%, rgba(234, 179, 8, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 90% 12%, rgba(101, 141, 36, 0.09) 0%, transparent 35%),
                radial-gradient(circle at 50% 95%, rgba(59, 130, 246, 0.05) 0%, transparent 40%);
            z-index: 0;
        }

        .corner-ribbon {
            position: absolute;
            top: 12px;
            right: 12px;
            background: linear-gradient(135deg, #eab308, #ca8a04);
            color: #ffffff;
            font-weight: 800;
            font-size: 10.5px;
            letter-spacing: 1px;
            text-transform: uppercase;
            padding: 4px 12px;
            border-radius: 20px;
            box-shadow: 0 2px 5px rgba(234, 179, 8, 0.35);
            display: flex;
            align-items: center;
            gap: 5px;
            z-index: 10;
        }

        /* HEADER */
        .poster-header {
            position: relative;
            z-index: 1;
            text-align: center;
            padding-bottom: 6px;
            border-bottom: 2px dashed #e2e8f0;
        }

        .instock-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #f0fdf4;
            color: #16a34a;
            border: 1px solid #bbf7d0;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            margin-bottom: 2px;
        }

        .poster-title {
            font-size: 24px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: -0.5px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            line-height: 1.15;
        }

        .poster-title .trophy {
            font-size: 25px;
            filter: drop-shadow(0 2px 4px rgba(234, 179, 8, 0.4));
        }

        .poster-subtitle {
            font-size: 12px;
            font-weight: 600;
            color: #475569;
            margin-top: 1px;
        }

        .poster-meta {
            font-size: 10px;
            color: #94a3b8;
            margin-top: 1px;
        }

        /* PODIUM (TOP 3) */
        .podium-section {
            position: relative;
            z-index: 1;
            margin-top: 4px;
            margin-bottom: 6px;
        }

        .section-label {
            text-align: center;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            color: #64748b;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .section-label::before,
        .section-label::after {
            content: '';
            height: 1px;
            width: 30px;
            background: #cbd5e1;
        }

        .podium-container {
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 10px;
            padding: 0 4px;
        }

        .podium-col {
            flex: 1;
            max-width: 165px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .podium-col.rank-1 {
            order: 2;
            transform: scale(1.03);
            z-index: 3;
        }

        .podium-col.rank-2 {
            order: 1;
            z-index: 2;
        }

        .podium-col.rank-3 {
            order: 3;
            z-index: 2;
        }

        .podium-crown-area {
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            position: relative;
        }

        .podium-medal {
            font-size: 22px;
        }

        .crown-icon {
            font-size: 20px;
        }

        .podium-card {
            width: 100%;
            background: #ffffff;
            border-radius: 12px 12px 0 0;
            padding: 8px 6px 6px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            border-top: 3px solid #ccc;
            border-left: 2px solid #ccc;
            border-right: 2px solid #ccc;
            border-bottom: none;
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.05);
        }

        .podium-card.rank-1 {
            background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
            border-color: #f59e0b;
            box-shadow: 0 5px 12px rgba(245, 158, 11, 0.2);
        }

        .podium-card.rank-2 {
            background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
            border-color: #94a3b8;
        }

        .podium-card.rank-3 {
            background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
            border-color: #f97316;
        }

        .stars-row {
            font-size: 10px;
            line-height: 1;
            margin-bottom: 3px;
            color: #eab308;
            letter-spacing: 1px;
        }

        .avatar-wrapper {
            position: relative;
            margin-bottom: 4px;
        }

        .podium-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: #ffffff;
            font-weight: 800;
            font-size: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #0f172a;
            border: 3px solid;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        }

        .rank-1 .podium-avatar {
            border-color: #f59e0b;
            background: #fffbeb;
            width: 48px;
            height: 48px;
            font-size: 17px;
        }

        .rank-2 .podium-avatar {
            border-color: #94a3b8;
            background: #f8fafc;
        }

        .rank-3 .podium-avatar {
            border-color: #ea580c;
            background: #fff7ed;
        }

        .rank-number-badge {
            position: absolute;
            bottom: -2px;
            right: -2px;
            font-size: 9.5px;
            font-weight: 900;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
        }

        .rank-1 .rank-number-badge { background: #f59e0b; border: 2px solid #ffffff; }
        .rank-2 .rank-number-badge { background: #64748b; border: 2px solid #ffffff; }
        .rank-3 .rank-number-badge { background: #ea580c; border: 2px solid #ffffff; }

        .podium-name {
            font-size: 12.5px;
            font-weight: 800;
            color: #0f172a;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }

        .rank-1 .podium-name {
            font-size: 13.5px;
            color: #78350f;
        }

        .podium-title-tag {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 2px 5px;
            border-radius: 6px;
            margin-top: 2px;
            margin-bottom: 5px;
        }

        .rank-1 .podium-title-tag { background: #fde68a; color: #92400e; }
        .rank-2 .podium-title-tag { background: #e2e8f0; color: #334155; }
        .rank-3 .podium-title-tag { background: #fed7aa; color: #9a3412; }

        .podium-prod-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 3px 8px;
            border-radius: 7px;
            background: #ffffff;
            border: 1px solid rgba(0,0,0,0.08);
            width: 90%;
        }

        .rank-1 .podium-prod-badge {
            background: #f59e0b;
            color: #ffffff;
            border-color: #d97706;
            box-shadow: 0 2px 5px rgba(245, 158, 11, 0.3);
        }

        .prod-percent {
            font-size: 15px;
            font-weight: 900;
            line-height: 1.1;
        }

        .rank-1 .prod-percent {
            font-size: 17px;
        }

        .prod-sub {
            font-size: 7.5px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            opacity: 0.85;
        }

        .podium-shifts {
            font-size: 9.5px;
            font-weight: 600;
            color: #64748b;
            margin-top: 3px;
        }

        .podium-pedestal {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-weight: 900;
            border-radius: 0 0 10px 10px;
        }

        .podium-pedestal.rank-1 {
            height: 42px;
            background: linear-gradient(180deg, #f59e0b, #d97706);
            font-size: 24px;
            border-top: 2px solid #fbbf24;
        }

        .podium-pedestal.rank-2 {
            height: 32px;
            background: linear-gradient(180deg, #94a3b8, #64748b);
            font-size: 20px;
            border-top: 2px solid #cbd5e1;
        }

        .podium-pedestal.rank-3 {
            height: 25px;
            background: linear-gradient(180deg, #f97316, #c2410c);
            font-size: 17px;
            border-top: 2px solid #fdba74;
        }

        /* PLEK 4 EN 5 (EXTRA ROEM) */
        .honorable-section {
            position: relative;
            z-index: 1;
            margin-top: 6px;
            margin-bottom: 6px;
        }

        .honorable-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            width: 100%;
        }

        .honorable-card {
            background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
            border: 1.5px solid #bfdbfe;
            border-radius: 10px;
            padding: 6px 10px;
            display: flex;
            align-items: center;
            gap: 9px;
            box-shadow: 0 2px 6px rgba(59, 130, 246, 0.08);
            position: relative;
        }

        .honorable-card.rank-4 {
            border-color: #93c5fd;
            background: linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);
        }

        .honorable-card.rank-5 {
            border-color: #cbd5e1;
            background: linear-gradient(135deg, #faf5ff 0%, #f1f5f9 100%);
        }

        .honorable-badge-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 1px;
            flex-shrink: 0;
        }

        .honorable-medal {
            font-size: 16px;
            line-height: 1;
        }

        .honorable-rank-tag {
            font-size: 10px;
            font-weight: 900;
            color: #2563eb;
            background: #ffffff;
            border: 1px solid #93c5fd;
            border-radius: 4px;
            padding: 1px 4px;
            line-height: 1;
        }

        .rank-5 .honorable-rank-tag {
            color: #7c3aed;
            border-color: #c4b5fd;
        }

        .honorable-avatar {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: #ffffff;
            color: #1e293b;
            font-size: 11px;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            border: 2px solid #93c5fd;
        }

        .rank-5 .honorable-avatar {
            border-color: #c4b5fd;
        }

        .honorable-info {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;
            gap: 1px;
        }

        .honorable-name-row {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }

        .honorable-name {
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }

        .honorable-title-tag {
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 1px 5px;
            border-radius: 4px;
            background: #dbeafe;
            color: #1d4ed8;
        }

        .rank-5 .honorable-title-tag {
            background: #ede9fe;
            color: #6d28d9;
        }

        .honorable-shifts {
            font-size: 9px;
            color: #64748b;
        }

        .honorable-prod-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 3px 8px;
            border-radius: 6px;
            background: #2563eb;
            color: #ffffff;
            flex-shrink: 0;
            min-width: 54px;
        }

        .rank-5 .honorable-prod-badge {
            background: #7c3aed;
        }

        .honorable-prod-val {
            font-size: 13px;
            font-weight: 900;
            line-height: 1.1;
        }

        .honorable-prod-sub {
            font-size: 6.5px;
            font-weight: 600;
            text-transform: uppercase;
            opacity: 0.9;
        }

        /* PLEK 6 T/M 10 (GEWOON ONDER ELKAAR) */
        .remaining-section {
            position: relative;
            z-index: 1;
            flex: 1;
            display: flex;
            flex-direction: column;
            margin-top: 4px;
        }

        .remaining-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
        }

        .remaining-row {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 5px 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-sizing: border-box;
        }

        .remaining-rank-badge {
            font-size: 11px;
            font-weight: 800;
            color: #64748b;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 5px;
            width: 30px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .remaining-avatar {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: #e2e8f0;
            color: #1e293b;
            font-size: 9.5px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        .remaining-info {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            min-width: 0;
            flex: 1;
            gap: 8px;
        }

        .remaining-name {
            font-size: 11.5px;
            font-weight: 700;
            color: #1e293b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }

        .remaining-shifts {
            font-size: 9.5px;
            color: #94a3b8;
            white-space: nowrap;
        }

        .remaining-prod-badge {
            padding: 2px 8px;
            border-radius: 5px;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            color: #047857;
            font-weight: 800;
            font-size: 11.5px;
            flex-shrink: 0;
        }

        /* FOOTER */
        .poster-footer {
            position: relative;
            z-index: 1;
            margin-top: 6px;
            padding-top: 6px;
            border-top: 2px dashed #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .footer-quote {
            font-size: 10.5px;
            font-weight: 600;
            color: #15803d;
            background: #f0fdf4;
            padding: 3px 8px;
            border-radius: 6px;
            border: 1px solid #dcfce7;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .footer-brand {
            font-size: 9.5px;
            color: #94a3b8;
            font-weight: 600;
            text-align: right;
        }

        @media print {
            body {
                background: #ffffff;
                padding: 0;
            }
            .a4-page {
                border: 2px solid #22c55e25;
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="a4-page">
        <div class="page-bg-accent"></div>
        <div class="corner-ribbon">⭐ TOP 10 ⭐</div>

        <!-- HEADER -->
        <header class="poster-header">
            <div class="instock-badge">⚡ InStock Productiviteit</div>
            <h1 class="poster-title">
                <span class="trophy">🏆</span>
                <span>Eregalerij der Vullers</span>
                <span class="trophy">🏆</span>
            </h1>
            <p class="poster-subtitle">${escapeHtml(dateLabel)}</p>
            <p class="poster-meta">Geëxporteerd op ${generationDate}</p>
        </header>

        <!-- PODIUM TOP 3 -->
        <section class="podium-section">
            <div class="section-label">🌟 Het Ere-Podium 🌟</div>
            <div class="podium-container">
                ${renderPodiumItem(second, 2, "🥈", "Zilveren Vuller", "⭐⭐⭐⭐")}
                ${renderPodiumItem(first, 1, "🥇", "Kampioen der Vullers", "⭐⭐⭐⭐⭐")}
                ${renderPodiumItem(third, 3, "🥉", "Bronzen Vuller", "⭐⭐⭐")}
            </div>
        </section>

        <!-- PLEK 4 EN 5 MET EXTRA ROEM -->
        ${
          fourth || fifth
            ? `
        <section class="honorable-section">
            <div class="section-label">✨ Top Vullers &bull; Eervolle Vermeldingen ✨</div>
            <div class="honorable-grid">
                ${renderHonorableItem(fourth, 4, "🎖️", "Toppresteerder")}
                ${renderHonorableItem(fifth, 5, "⭐", "Krachtpatser")}
            </div>
        </section>
        `
            : ""
        }

        <!-- PLEK 6 T/M 10 GEWOON ONDER ELKAAR -->
        <section class="remaining-section">
            <div class="section-label">
                <span>Ranglijst Plek 6 t/m 10</span>
                <span>Productiviteit</span>
            </div>
            <div class="remaining-list">
                ${
                  remainingOthers.length > 0
                    ? remainingOthers
                        .map((filler, idx) =>
                          renderRemainingRow(filler, idx + 6),
                        )
                        .join("")
                    : '<div style="text-align: center; color: #94a3b8; padding: 6px; font-size: 10px;">Geen verdere vullers in de ranglijst</div>'
                }
            </div>
        </section>

        <!-- FOOTER -->
        <footer class="poster-footer">
            <div class="footer-quote">
                <span>🚀</span>
                <span>Geweldige prestatie van het hele team! Blijf knallen!</span>
            </div>
            <div class="footer-brand">
                <div>Gegevens uit inStock Vulplanning</div>
                <div>Ga nu naar instock.tctam.nl en log in om het live scorebord te bekijken!</div>
            </div>
        </footer>
    </div>
</body>
</html>`;

  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 250);
}
