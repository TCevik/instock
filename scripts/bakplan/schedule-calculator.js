import { DAYS, DEFAULT_CARTS } from './state.js';
import { getPlateQuantity } from './logic.js';

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
                exactPlaten: exactPlaten,
                plateQty: plateQty
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
                wholePlates.push({ description: p.description, val: 1, pieces: p.plateQty });
            }
            if (fraction > 0) {
                fractions.push({ description: p.description, fraction: fraction, plateQty: p.plateQty });
            }
        });

        const physicalPlates = [];
        wholePlates.forEach(wp => {
            physicalPlates.push({
                products: [{ description: wp.description, val: wp.val, pieces: wp.pieces }],
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
                        { description: current.description, val: current.fraction, pieces: Math.round(current.fraction * current.plateQty) },
                        { description: partner.description, val: partner.fraction, pieces: Math.round(partner.fraction * partner.plateQty) }
                    ],
                    platen: 1
                });
            } else {
                physicalPlates.push({
                    products: [{ description: current.description, val: current.fraction, pieces: Math.round(current.fraction * current.plateQty) }],
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
            usedCapacity: 0,
            reservedCategory: c.reservedCategory
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

        const reservedCategorySet = new Set(
            cartsConfig
                .filter(c => c.oven && c.type === 'single' && c.reservedCategory)
                .map(c => c.reservedCategory)
        );

        const singleCarts = batchCarts.filter(c => c.oven && c.type === 'single');

        singleCarts.forEach(cart => {
            if (remainingPool.length === 0) return;

            let selectedCat = null;
            if (cart.reservedCategory) {
                selectedCat = cart.reservedCategory;
            } else {
                const catCounts = {};
                remainingPool.forEach(i => {
                    if (!reservedCategorySet.has(i.category)) {
                        catCounts[i.category] = (catCounts[i.category] || 0) + 1;
                    }
                });
                const sortedCats = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a]);
                selectedCat = sortedCats.find(c => catCounts[c] >= cart.capacity) || sortedCats[0];
            }

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
            let i = 0;
            while (i < remainingPool.length && capacityLeft > 0) {
                const poolItem = remainingPool[i];
                if (reservedCategorySet.has(poolItem.category)) {
                    i++;
                    continue;
                }
                remainingPool.splice(i, 1);
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
