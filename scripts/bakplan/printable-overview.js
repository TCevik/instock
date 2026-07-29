import { DAYS, DEFAULT_CARTS } from './state.js';
import { generateBakplanSchedule } from './schedule-calculator.js';

export { DEFAULT_CARTS, generateBakplanSchedule };

export const openPrintableBakplan = (daysData, productPlateConfig, customCarts) => {
    let iframe = document.getElementById('print-bakplan-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-bakplan-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow.document;
    doc.open();

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
        .print-btn { display: none; }
        
        .day-section { margin-bottom: 16px; page-break-after: always; }
        .day-section:last-child { page-break-after: auto; }
        .day-header { font-size: 14px; font-weight: 700; background: #658d24; color: #fff; padding: 4px 8px; border-radius: 3px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .batch-section { margin-bottom: 8px; }
        .batch-header { font-size: 11px; font-weight: 700; background: #658d24; color: #fff; padding: 2px 6px; border-radius: 2px; margin-bottom: 4px; text-transform: uppercase; break-after: avoid; }

        .print-repeating-header th {
            background: #658d24; color: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; text-align: left; border: 1px solid #658d24; }
        
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

        .summary-page { page-break-before: always; page-break-after: always; }
        .summary-container { display: flex; gap: 8px; align-items: flex-start; }
        .summary-col { flex: 1; }
        .summary-table { font-size: 9.5px; line-height: 1.15; width: 100%; border-collapse: collapse; }
        .summary-table th, .summary-table td { padding: 2px 4px; border: 1px solid #aaa; }
        .summary-table th { background: #f0f4e8; color: #2d3e10; font-size: 10px; }

        @media print {
            .print-btn { display: none; }
            body { padding: 0; }
            .day-section { page-break-after: always; }
            .day-section:last-child { page-break-after: auto; }
            .summary-page { page-break-before: always; page-break-after: auto; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Weekbakplan</h1>
            <p>Volledig overzicht voor alle dagen van de week</p>
        </div>
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
                        <table class="baktable">
                            <thead>
                                <tr class="print-repeating-header">
                                    <th colspan="4">${day} - BATCH ${batch.batchNumber}</th>
                                </tr>
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

        if (batches.length > 0) {
            const productStats = {};
            let maxBatchNum = 0;

            batches.forEach(b => {
                if (b.batchNumber > maxBatchNum) maxBatchNum = b.batchNumber;
                b.carts.forEach(c => {
                    (c.items || []).forEach(it => {
                        (it.physicalPlates || []).forEach(pp => {
                            (pp.products || []).forEach(p => {
                                const desc = p.description;
                                if (!productStats[desc]) {
                                    productStats[desc] = { total: 0, byBatch: {} };
                                }
                                const stuks = p.pieces !== undefined ? p.pieces : Math.round(p.val * 12);
                                productStats[desc].total += stuks;
                                productStats[desc].byBatch[b.batchNumber] = (productStats[desc].byBatch[b.batchNumber] || 0) + stuks;
                            });
                        });
                    });
                });
            });

            const sortedProds = Object.keys(productStats).sort((a, b) => a.localeCompare(b));
            const batchChunkSize = 5;
            const totalBatchChunks = Math.max(1, Math.ceil(maxBatchNum / batchChunkSize));

            for (let bChunkIdx = 0; bChunkIdx < totalBatchChunks; bChunkIdx++) {
                const startBatch = bChunkIdx * batchChunkSize + 1;
                const endBatch = Math.min(maxBatchNum, (bChunkIdx + 1) * batchChunkSize);
                
                const currentBatches = [];
                for (let b = startBatch; b <= endBatch; b++) {
                    currentBatches.push(b);
                }

                const midIndex = Math.ceil(sortedProds.length / 2);
                const col1Prods = sortedProds.slice(0, midIndex);
                const col2Prods = sortedProds.slice(midIndex);

                const renderTableCol = (prods) => `
                    <table class="baktable summary-table">
                        <thead>
                            <tr class="print-repeating-header">
                                <th>Productnaam</th>
                                ${currentBatches.map(b => `<th style="text-align: center; width: 45px;">Batch ${b}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${prods.map(prodName => {
                                const stats = productStats[prodName];
                                const batchCells = currentBatches.map(b => {
                                    const count = stats.byBatch[b] || 0;
                                    return `<td style="text-align: center;">${count > 0 ? `<strong>${count}</strong>` : '-'}</td>`;
                                }).join('');
                                return `
                                    <tr>
                                        <td><strong>${prodName}</strong></td>
                                        ${batchCells}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;

                let batchLabel = totalBatchChunks > 1 ? ` (Batches ${startBatch}-${endBatch})` : '';

                html += `
                    <div class="summary-page">
                        <div class="day-header">${day} - PRODUCTEN OVERZICHT PER BATCH${batchLabel}</div>
                        <div class="summary-container">
                            <div class="summary-col">${renderTableCol(col1Prods)}</div>
                            <div class="summary-col">${renderTableCol(col2Prods)}</div>
                        </div>
                    </div>
                `;
            }
        }

        html += `</div>`;
    });

    html += `</body></html>`;

    doc.write(html);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 250);
};
