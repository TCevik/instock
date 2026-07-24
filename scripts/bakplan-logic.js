export const DAYS = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG', 'ZONDAG'];

export const getPlateQuantity = (desc, productPlateConfig) => {
    const key = desc.trim();
    const val = parseInt((productPlateConfig || {})[key]);
    return (!isNaN(val) && val > 0) ? val : 12;
};

export const normalizeDaysData = (data, state) => {
    if (!data) return;
    if (data.categories) {
        const categories = data.categories || [];
        const dailyValues = data.dailyValues || {};

        DAYS.forEach(day => {
            const dayObj = dailyValues[day] || {};
            state.daysData[day] = categories.map(cat => ({
                category: cat.category,
                thawInBatch1: !!cat.thawInBatch1,
                products: (cat.products || []).map(p => {
                    const vals = dayObj[p.ceNr] || {};
                    const prodObj = {
                        ceNr: p.ceNr,
                        description: p.description,
                        price: vals.price !== undefined ? vals.price : p.price,
                        promo: vals.promo !== undefined ? vals.promo : p.promo,
                        gemVerk: vals.gemVerk !== undefined ? vals.gemVerk : '0',
                        derving: vals.derving !== undefined ? vals.derving : '0'
                    };
                    if (p._pdfMissing || vals._pdfMissing) prodObj._pdfMissing = true;
                    if (p._pdfNew || vals._pdfNew) prodObj._pdfNew = true;
                    return prodObj;
                })
            }));
        });
    } else if (data.daysData) {
        const daysData = data.daysData;
        DAYS.forEach(day => {
            if (daysData[day]) {
                if (Array.isArray(daysData[day])) {
                    state.daysData[day] = daysData[day];
                } else {
                    state.daysData[day] = Object.keys(daysData[day]).map(catName => ({
                        category: catName,
                        products: daysData[day][catName] || []
                    }));
                }
            } else {
                state.daysData[day] = [];
            }
        });
    }
};

export const syncStructureAcrossDays = (state) => {
    const baseDay = state.daysData[state.selectedDay] || [];
    DAYS.forEach(day => {
        if (day === state.selectedDay) return;
        const targetDayList = state.daysData[day] || [];
        const newDayList = [];

        baseDay.forEach((baseCat, catIdx) => {
            const existingTargetCat = targetDayList[catIdx] || targetDayList.find(c => c.category === baseCat.category);
            const newProducts = [];

            baseCat.products.forEach((baseProd, prodIdx) => {
                const existingTargetProd = existingTargetCat ? (
                    (existingTargetCat.products || [])[prodIdx] ||
                    (existingTargetCat.products || []).find(p => p.ceNr === baseProd.ceNr)
                ) : null;

                newProducts.push({
                    ceNr: baseProd.ceNr,
                    description: baseProd.description,
                    price: existingTargetProd ? existingTargetProd.price : baseProd.price,
                    promo: existingTargetProd ? existingTargetProd.promo : baseProd.promo,
                    gemVerk: existingTargetProd ? existingTargetProd.gemVerk : '0',
                    derving: existingTargetProd ? existingTargetProd.derving : '0'
                });
            });

            newDayList.push({
                category: baseCat.category,
                thawInBatch1: !!baseCat.thawInBatch1,
                products: newProducts
            });
        });

        state.daysData[day] = newDayList;
    });
};

export const DEFAULT_CARTS = [
    { id: 1, name: 'Kar 1', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 2, name: 'Kar 2', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 3, name: 'Kar 3', type: 'single', capacity: 15, oven: true, desc: '15 plekken in 1 keer in de oven (1 categorie)' },
    { id: 4, name: 'Kar 4', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 5, name: 'Kar 5', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 6, name: 'Kar 6', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 7, name: 'Kar 7', type: 'mixed', capacity: 18, oven: true, desc: '18 plekken gemixt in de oven' },
    { id: 8, name: 'Kar 8 (Ontdooien)', type: 'thaw', capacity: 18, oven: false, desc: '18 plekken om te laten ontdooien (alleen Batch 1)' }
];

export const generateBakplanSchedule = (dayCategories, productPlateConfig, customCarts) => {
    const cartsConfig = (customCarts && customCarts.length > 0) ? customCarts : DEFAULT_CARTS;

    const allBakeProducts = [];
    const allThawProducts = [];

    (dayCategories || []).forEach(catObj => {
        const catName = catObj.category || 'Overig';
        const isThawCat = !!catObj.thawInBatch1;
        (catObj.products || []).forEach(prod => {
            const gemVerkNum = parseInt(prod.gemVerk);
            if (isNaN(gemVerkNum) || gemVerkNum <= 0) return;
            const plateQty = getPlateQuantity(prod.description, productPlateConfig);
            const exactPlaten = gemVerkNum / plateQty;
            if (exactPlaten <= 0) return;

            const item = {
                category: catName,
                description: prod.description,
                exactPlaten: exactPlaten
            };

            if (isThawCat) {
                allThawProducts.push(item);
            } else {
                allBakeProducts.push(item);
            }
        });
    });

    const createPhysicalPlatesForCat = (prodItems) => {
        const wholePlates = [];
        const fractions = [];
        prodItems.forEach(p => {
            const wholeCount = Math.floor(p.exactPlaten);
            const fraction = p.exactPlaten - wholeCount;
            for (let i = 0; i < wholeCount; i++) {
                wholePlates.push({ description: p.description, val: 1 });
            }
            if (fraction > 0) {
                fractions.push({ description: p.description, fraction: fraction });
            }
        });

        const physicalPlates = [];
        wholePlates.forEach(wp => {
            physicalPlates.push({
                products: [{ description: wp.description, val: 1 }],
                platen: 1
            });
        });

        const pending = [...fractions];
        while (pending.length > 0) {
            const current = pending.shift();
            let partnerIdx = -1;
            for (let i = 0; i < pending.length; i++) {
                if (current.fraction + pending[i].fraction <= 1.0001) {
                    partnerIdx = i;
                    break;
                }
            }
            if (partnerIdx > -1) {
                const partner = pending.splice(partnerIdx, 1)[0];
                physicalPlates.push({
                    products: [
                        { description: current.description, val: current.fraction },
                        { description: partner.description, val: partner.fraction }
                    ],
                    platen: 1
                });
            } else {
                physicalPlates.push({
                    products: [{ description: current.description, val: current.fraction }],
                    platen: 1
                });
            }
        }

        return physicalPlates;
    };

    const bakeCatNames = Array.from(new Set(allBakeProducts.map(p => p.category)));
    const catPhysicalPlates = {};

    bakeCatNames.forEach(catName => {
        const catProds = allBakeProducts.filter(p => p.category === catName);
        catPhysicalPlates[catName] = createPhysicalPlatesForCat(catProds);
    });

    const batch1Pool = [];
    const restPool = [];

    bakeCatNames.forEach(catName => {
        const plates = catPhysicalPlates[catName];
        const uniqueDescsInCat = Array.from(new Set(plates.flatMap(p => p.products.map(pr => pr.description))));
        
        const reservedIndices = new Set();
        uniqueDescsInCat.forEach(desc => {
            const idx = plates.findIndex((p, i) => !reservedIndices.has(i) && p.products.some(pr => pr.description === desc));
            if (idx > -1) {
                reservedIndices.add(idx);
                batch1Pool.push({
                    category: catName,
                    plate: plates[idx]
                });
            }
        });

        plates.forEach((p, i) => {
            if (!reservedIndices.has(i)) {
                restPool.push({
                    category: catName,
                    plate: p
                });
            }
        });
    });

    const batch1OvenCapacity = cartsConfig.filter(c => c.oven).reduce((sum, c) => sum + c.capacity, 0);

    while (batch1Pool.length < batch1OvenCapacity && restPool.length > 0) {
        batch1Pool.push(restPool.shift());
    }

    const batch2Pool = [...restPool];

    const fillCartsForBatchPool = (batchNumber, poolItems, thawProds) => {
        const batchCarts = cartsConfig.map(c => ({
            id: c.id,
            name: c.name || `Kar ${c.id}`,
            type: c.type,
            capacity: c.capacity,
            oven: c.oven,
            desc: c.desc || '',
            items: [],
            usedCapacity: 0
        }));

        if (batchNumber === 1 && thawProds.length > 0) {
            const thawCarts = batchCarts.filter(c => !c.oven || c.type === 'thaw');
            if (thawCarts.length > 0) {
                const thawCatNames = Array.from(new Set(thawProds.map(p => p.category)));
                const thawPlates = [];
                thawCatNames.forEach(cName => {
                    const cProds = thawProds.filter(p => p.category === cName);
                    const pPlates = createPhysicalPlatesForCat(cProds);
                    pPlates.forEach(pp => {
                        thawPlates.push({ category: cName, plate: pp });
                    });
                });

                for (const cart of thawCarts) {
                    while (thawPlates.length > 0 && cart.usedCapacity < cart.capacity) {
                        const item = thawPlates.shift();
                        const existing = cart.items.find(i => i.category === item.category);
                        if (existing) {
                            existing.platen += 1;
                            existing.physicalPlates.push(item.plate);
                        } else {
                            cart.items.push({
                                category: item.category,
                                physicalPlates: [item.plate],
                                platen: 1
                            });
                        }
                        cart.usedCapacity += 1;
                    }
                }
            }
        }

        const remainingPool = [...poolItems];

        const singleCarts = batchCarts.filter(c => c.oven && c.type === 'single');
        singleCarts.forEach(cart => {
            if (remainingPool.length === 0) return;
            const catCounts = {};
            remainingPool.forEach(i => {
                catCounts[i.category] = (catCounts[i.category] || 0) + 1;
            });
            const sortedCats = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]);

            const selectedCat = sortedCats.find(c => catCounts[c] >= cart.capacity) || sortedCats[0];
            if (selectedCat) {
                let capacityLeft = cart.capacity;
                let i = 0;
                while (i < remainingPool.length && capacityLeft > 0) {
                    if (remainingPool[i].category === selectedCat) {
                        const poolItem = remainingPool.splice(i, 1)[0];
                        const existing = cart.items.find(it => it.category === selectedCat);
                        if (existing) {
                            existing.platen += 1;
                            existing.physicalPlates.push(poolItem.plate);
                        } else {
                            cart.items.push({
                                category: selectedCat,
                                physicalPlates: [poolItem.plate],
                                platen: 1
                            });
                        }
                        cart.usedCapacity += 1;
                        capacityLeft -= 1;
                    } else {
                        i++;
                    }
                }
            }
        });

        const mixedCarts = batchCarts.filter(c => c.oven && c.type === 'mixed');
        mixedCarts.forEach(cart => {
            let capacityLeft = cart.capacity - cart.usedCapacity;
            while (remainingPool.length > 0 && capacityLeft > 0) {
                const poolItem = remainingPool.shift();
                const existing = cart.items.find(it => it.category === poolItem.category);
                if (existing) {
                    existing.platen += 1;
                    existing.physicalPlates.push(poolItem.plate);
                } else {
                    cart.items.push({
                        category: poolItem.category,
                        physicalPlates: [poolItem.plate],
                        platen: 1
                    });
                }
                cart.usedCapacity += 1;
                capacityLeft -= 1;
            }
        });

        return {
            batchNumber: batchNumber,
            carts: batchCarts,
            leftoverPool: remainingPool
        };
    };

    const batches = [];
    const b1Result = fillCartsForBatchPool(1, batch1Pool, allThawProducts);
    batches.push({ batchNumber: 1, carts: b1Result.carts });

    const totalBatch2Pool = [...b1Result.leftoverPool, ...batch2Pool];

    if (totalBatch2Pool.length > 0) {
        let b2Pool = [...totalBatch2Pool];
        let b2BatchNum = 2;
        while (b2Pool.length > 0 && b2BatchNum <= 10) {
            const b2Result = fillCartsForBatchPool(b2BatchNum, b2Pool, []);
            batches.push({ batchNumber: b2BatchNum, carts: b2Result.carts });
            if (b2Result.leftoverPool.length === b2Pool.length) break;
            b2Pool = b2Result.leftoverPool;
            b2BatchNum++;
        }
    }

    return batches;
};

export const openPrintableBakplan = (selectedDay, dayCategories, productPlateConfig, customCarts) => {
    const batches = generateBakplanSchedule(dayCategories, productPlateConfig, customCarts);
    const win = window.open('about:blank', '_blank');
    if (!win) return;

    let html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>Bakplan - ${selectedDay}</title>
    <style>
        body { font-family: 'Outfit', Arial, sans-serif; padding: 20px; background: #fff; color: #121212; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #658d24; padding-bottom: 12px; margin-bottom: 24px; }
        .header h1 { margin: 0; color: #658d24; font-size: 24px; }
        .header p { margin: 4px 0 0 0; color: #666; font-size: 14px; }
        .print-btn { background: #658d24; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .batch-title { font-size: 18px; font-weight: 700; background: #f4f4f5; padding: 10px 14px; border-radius: 8px; margin-top: 24px; margin-bottom: 14px; border-left: 5px solid #658d24; }
        .carts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .cart-card { border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px; background: #fafafa; page-break-inside: avoid; }
        .cart-header { font-weight: 700; font-size: 14px; color: #18181b; display: flex; justify-content: space-between; border-bottom: 1px solid #e4e4e7; padding-bottom: 6px; margin-bottom: 10px; }
        .cart-desc { font-size: 11px; color: #71717a; margin-bottom: 8px; }
        .cart-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .cart-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #71717a; border-bottom: 1px solid #e4e4e7; padding: 4px; }
        .cart-table td { padding: 6px 4px; border-bottom: 1px solid #f4f4f5; }
        .cart-table tr:last-child td { border-bottom: none; }
        .qty-badge { font-weight: 700; color: #658d24; }
        @media print {
            .print-btn { display: none; }
            body { padding: 0; }
            .cart-card { border: 1px solid #ccc; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Bakplan (${selectedDay})</h1>
            <p>Gegenereerd overzicht per kar en batch</p>
        </div>
        <button class="print-btn" onclick="window.print()">Afdrukken / Printen</button>
    </div>
`;

    if (batches.length === 0) {
        html += `<p>Geen producten of platen om te bakken voor ${selectedDay}.</p>`;
    } else {
        batches.forEach(batch => {
            html += `<div class="batch-title">Batch ${batch.batchNumber}</div>`;
            html += `<div class="carts-grid">`;
            batch.carts.forEach(cart => {
                if (cart.items.length === 0) return;
                html += `
                    <div class="cart-card">
                        <div class="cart-header">
                            <span>${cart.name} ${cart.oven ? '(Oven)' : '(Ontdooien)'}</span>
                            <span>${cart.usedCapacity}/${cart.capacity} platen</span>
                        </div>
                        <div class="cart-desc">${cart.desc}</div>
                        <table class="cart-table">
                            <thead>
                                <tr>
                                    <th>Categorie & Plaat details</th>
                                    <th style="text-align: right;">Platen</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                cart.items.forEach(item => {
                    const plateDetails = (item.physicalPlates || []).map((p, idx) => {
                        const prodsStr = p.products.map(pr => `${pr.description} (${pr.val.toFixed(2)} pl)`).join(' + ');
                        return `Plaat ${idx + 1}: ${prodsStr}`;
                    }).join('<br>');
                    html += `
                        <tr>
                            <td>
                                <strong>${item.category}</strong>
                                <div style="font-size: 11px; color: #666; margin-top: 4px; line-height: 1.4;">
                                    ${plateDetails}
                                </div>
                            </td>
                            <td style="text-align: right; vertical-align: top;" class="qty-badge">${item.platen}</td>
                        </tr>
                    `;
                });
                html += `
                            </tbody>
                        </table>
                    </div>
                `;
            });
            html += `</div>`;
        });
    }

    html += `
    <div style="margin-top: 30px; page-break-inside: avoid;">
        <h3 style="font-size: 14px; margin-bottom: 10px; color: #18181b;">Aantekeningen:</h3>
        <div style="border-bottom: 1px dashed #e4e4e7; height: 28px;"></div>
        <div style="border-bottom: 1px dashed #e4e4e7; height: 28px;"></div>
        <div style="border-bottom: 1px dashed #e4e4e7; height: 28px;"></div>
        <div style="border-bottom: 1px dashed #e4e4e7; height: 28px;"></div>
        <div style="border-bottom: 1px dashed #e4e4e7; height: 28px;"></div>
    </div>
    </body></html>`;
    win.document.write(html);
    win.document.close();
};

