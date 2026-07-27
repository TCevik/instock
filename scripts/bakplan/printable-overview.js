import { DAYS, DEFAULT_CARTS } from './state.js';
import { generateBakplanSchedule } from './schedule-calculator.js';

export { DEFAULT_CARTS, generateBakplanSchedule };

export const openPrintableBakplan = (daysData, productPlateConfig, customCarts) => {
    const win = window.open('about:blank', '_blank');
    if (!win) return;

    let html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Weekbakplan</title>
    <style>
        @page { size: A4 portrait; margin: 5mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Outfit', Arial, sans-serif; margin: 0; padding: 4px; background: #fff; color: #000; font-size: 11px; line-height: 1.2; }
        
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #658d24; padding-bottom: 4px; margin-bottom: 6px; }
        .header h1 { margin: 0; color: #658d24; font-size: 16px; text-transform: uppercase; }
        .header p { margin: 0; color: #444; font-size: 10px; }
        .print-btn { background: #658d24; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 11px; }
        
        .day-section { margin-bottom: 16px; page-break-after: always; }
        .day-section:last-child { page-break-after: auto; }
        .day-header { font-size: 14px; font-weight: 700; background: #658d24; color: #fff; padding: 4px 8px; border-radius: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .batch-section { margin-bottom: 8px; }
        .batch-header { font-size: 11px; font-weight: 700; background: #658d24; color: #fff; padding: 2px 6px; border-radius: 2px; margin-bottom: 4px; text-transform: uppercase; break-after: avoid; }
        
        .baktable { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: auto; }
        .baktable th { background: #f0f4e8; color: #2d3e10; border: 1px solid #658d24; padding: 4px 6px; text-align: left; font-weight: 700; white-space: nowrap; }
        .baktable tr { break-inside: avoid; page-break-inside: avoid; }
        .baktable td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
        
        .cart-tag { font-weight: 700; color: #000; font-size: 11px; white-space: nowrap; }
        .cart-type { font-size: 9px; color: #555; font-weight: normal; white-space: nowrap; }
        .platen-badge { font-weight: 700; color: #658d24; text-align: center; font-size: 11px; width: 50px; }
        
        .plate-list { display: flex; flex-direction: column; gap: 1px; }
        .plate-row { display: flex; align-items: baseline; gap: 4px; font-size: 10px; }
        .plate-num { font-weight: 700; color: #333; font-size: 9px; white-space: nowrap; }
        .plate-content { color: #000; }
        .stuks-highlight { font-weight: 700; color: #2d3e10; background: #e2ebd0; padding: 0 3px; border-radius: 2px; }

        @media print {
            .print-btn { display: none; }
            body { padding: 0; }
            .day-section { page-break-after: always; }
            .day-section:last-child { page-break-after: auto; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Weekbakplan</h1>
            <p>Volledig overzicht voor alle dagen van de week</p>
        </div>
        <button class="print-btn" onclick="window.print()">Afdrukken / Printen</button>
    </div>
`;

    DAYS.forEach(day => {
        const dayCategories = daysData[day] || [];
        const batches = generateBakplanSchedule(dayCategories, productPlateConfig, customCarts);

        html += `
            <div class="day-section">
                <div class="day-header">${day}</div>
        `;

        if (batches.length === 0) {
            html += `<p style="padding: 6px; color: #666;">Geen producten om te bakken op ${day.toLowerCase()}.</p>`;
        } else {
            batches.forEach(batch => {
                html += `
                    <div class="batch-section">
                        <div class="batch-header">Batch ${batch.batchNumber}</div>
                        <table class="baktable">
                            <thead>
                                <tr>
                                    <th>Kar</th>
                                    <th>Categorie</th>
                                    <th>Inhoud (Per Plaat in Stuks)</th>
                                    <th style="text-align: center;">Platen</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                let hasCarts = false;
                batch.carts.forEach(cart => {
                    if (cart.items.length === 0) return;
                    hasCarts = true;

                    cart.items.forEach((item, itemIdx) => {
                        const plateRowsHtml = (item.physicalPlates || []).map((p, pIdx) => {
                            const prodsStr = p.products.map(pr => {
                                const stuks = pr.pieces !== undefined ? pr.pieces : Math.round(pr.val * 12);
                                return `<strong>${pr.description}</strong>: <span class="stuks-highlight">${stuks} st</span>`;
                            }).join(' + ');
                            return `<div class="plate-row"><span class="plate-num">Plaat ${pIdx + 1}:</span><span class="plate-content">${prodsStr}</span></div>`;
                        }).join('');

                        html += `
                            <tr>
                                ${itemIdx === 0 ? `
                                    <td rowspan="${cart.items.length}">
                                        <div class="cart-tag">${cart.name}</div>
                                        <div class="cart-type">${cart.oven ? 'Oven' : 'Ontdooien'} (${cart.usedCapacity}/${cart.capacity})</div>
                                    </td>
                                ` : ''}
                                <td style="white-space: nowrap;"><strong>${item.category}</strong></td>
                                <td><div class="plate-list">${plateRowsHtml}</div></td>
                                <td class="platen-badge">${item.platen}</td>
                            </tr>
                        `;
                    });
                });

                if (!hasCarts) {
                    html += `<tr><td colspan="4">Geen karren ingedeeld voor deze batch.</td></tr>`;
                }

                html += `
                            </tbody>
                        </table>
                    </div>
                `;
            });
        }

        html += `</div>`;
    });

    html += `</body></html>`;

    win.document.write(html);
    win.document.close();
};
