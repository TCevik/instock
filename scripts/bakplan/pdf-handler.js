import { extractTextLinesFromPage } from '../pdf-utils.js';
import { DAYS, state, setPreviousStateData } from './state.js';

export const pdfParser = {
    async parsePDF(file, mode = 'overwrite') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const previousStateData = JSON.parse(JSON.stringify(state.daysData));
        setPreviousStateData(previousStateData);

        const oldCeNrs = new Set();
        DAYS.forEach(d => {
            (state.daysData[d] || []).forEach(cat => {
                (cat.products || []).forEach(p => {
                    if (p.ceNr) oldCeNrs.add(p.ceNr);
                });
            });
        });

        const parsedDataByDay = {};
        const pdfCeNrs = new Set();
        DAYS.forEach(d => { parsedDataByDay[d] = []; });

        let currentDay = 'MAANDAG';
        let currentCategory = 'Overig';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const rows = await extractTextLinesFromPage(page);
            
            let pageMaxX = 500;
            for (let row of rows) {
                for (let item of row.items) {
                    if (item.x > pageMaxX) {
                        pageMaxX = item.x;
                    }
                }
            }

            for (let row of rows) {
                const upperLine = row.rawText.toUpperCase();
                let dayFound = false;
                for (let day of DAYS) {
                    if (upperLine.includes(day)) {
                        currentDay = day;
                        dayFound = true;
                        break;
                    }
                }
                if (dayFound) continue;

                if (upperLine.includes('BAKVOLGORDE')) {
                    currentCategory = row.rawText.trim();
                    continue;
                }

                const mergedItems = [];
                for (let item of row.items) {
                    if (mergedItems.length > 0) {
                        const last = mergedItems[mergedItems.length - 1];
                        if (item.x - last.x < 35 && (item.text.startsWith('(') || item.text === '()')) {
                            last.text += item.text;
                            continue;
                        }
                    }
                    mergedItems.push({ ...item });
                }

                const ceItem = mergedItems.find(item => /^\d{5,7}$/.test(item.text));
                if (!ceItem) continue;

                const priceItem = mergedItems.find(item => item.x > ceItem.x && /^\d+[\.,]\d{2}$/.test(item.text));
                if (!priceItem) {
                    console.warn('Ontbrekende prijs in rij:', row.rawText, { ceNr: ceItem.text });
                    continue;
                }

                const descVal = mergedItems
                    .filter(item => item.x > ceItem.x && item.x < priceItem.x)
                    .map(item => item.text)
                    .join(' ')
                    .trim();

                const priceVal = priceItem.text;

                const promoItem = mergedItems.find(item => item.x > priceItem.x && item.x < priceItem.x + 80 && /^\d+[\.,]\d{2}$/.test(item.text));
                const promoVal = promoItem ? promoItem.text : '';

                const parenItems = mergedItems.filter(item => 
                    item.x > priceItem.x && 
                    /^-?\d+\s*\(\s*-?\d*\s*\)$/.test(item.text) && 
                    !item.text.includes(':')
                );

                let cleanGemVerk = '0';
                let cleanDerving = '0';

                if (parenItems.length >= 2) {
                    const gemVerkMatch = parenItems[0].text.match(/(-?\d+)/);
                    if (gemVerkMatch) cleanGemVerk = gemVerkMatch[1];

                    const dervingMatch = parenItems[1].text.match(/(-?\d+)/);
                    if (dervingMatch) cleanDerving = dervingMatch[1];
                } else if (parenItems.length === 1) {
                    const item = parenItems[0];
                    const numMatch = item.text.match(/(-?\d+)/);
                    if (numMatch) {
                        if (item.x > 0.85 * pageMaxX) {
                            cleanDerving = numMatch[1];
                        } else {
                            cleanGemVerk = numMatch[1];
                        }
                    }
                }

                const priceCleanMatch = priceVal.match(/(\d+(?:[\.,]\d{2})?)/);
                const cleanPrice = priceCleanMatch ? priceCleanMatch[1].replace(',', '.') : '0.00';

                let cleanPromo = '';
                if (promoVal) {
                    const promoCleanMatch = promoVal.match(/(\d+(?:[\.,]\d{2})?)/);
                    if (promoCleanMatch) {
                        cleanPromo = promoCleanMatch[1].replace(',', '.');
                    }
                }

                pdfCeNrs.add(ceItem.text);

                let catObj = parsedDataByDay[currentDay].find(c => c.category === currentCategory);
                if (!catObj) {
                    const isThawed = Boolean(
                        (previousStateData[currentDay] || []).find(c => c.category === currentCategory)?.thawInBatch1 ||
                        Object.values(previousStateData).some(dayCats => (dayCats || []).some(c => c.category === currentCategory && c.thawInBatch1))
                    );
                    catObj = { category: currentCategory, thawInBatch1: isThawed, products: [] };
                    parsedDataByDay[currentDay].push(catObj);
                }

                const isNewProduct = oldCeNrs.size > 0 && !oldCeNrs.has(ceItem.text);
                const existingInParsed = catObj.products.find(p => p.ceNr === ceItem.text);
                if (existingInParsed) {
                    existingInParsed.description = descVal;
                    existingInParsed.price = cleanPrice;
                    existingInParsed.promo = cleanPromo;
                    existingInParsed.gemVerk = cleanGemVerk;
                    existingInParsed.derving = cleanDerving;
                    if (isNewProduct) existingInParsed._pdfNew = true;
                } else {
                    const prodObj = {
                        ceNr: ceItem.text,
                        description: descVal,
                        price: cleanPrice,
                        promo: cleanPromo,
                        gemVerk: cleanGemVerk,
                        derving: cleanDerving
                    };
                    if (isNewProduct) prodObj._pdfNew = true;
                    catObj.products.push(prodObj);
                }
            }
        }

        if (mode === 'overwrite') {
            for (let d of DAYS) {
                state.daysData[d] = parsedDataByDay[d];
            }
            DAYS.forEach(d => {
                const oldCats = previousStateData[d] || [];
                oldCats.forEach(oldCat => {
                    (oldCat.products || []).forEach(oldProd => {
                        if (!pdfCeNrs.has(oldProd.ceNr)) {
                            let catObj = state.daysData[d].find(c => c.category === oldCat.category);
                            if (!catObj) {
                                catObj = { category: oldCat.category, thawInBatch1: !!oldCat.thawInBatch1, products: [] };
                                state.daysData[d].push(catObj);
                            }
                            const missingProd = JSON.parse(JSON.stringify(oldProd));
                            missingProd._pdfMissing = true;
                            catObj.products.push(missingProd);
                        }
                    });
                });
            });
        } else {
            DAYS.forEach(d => {
                (parsedDataByDay[d] || []).forEach(newCat => {
                    let catObj = state.daysData[d].find(c => c.category === newCat.category);
                    if (!catObj) {
                        catObj = { category: newCat.category, thawInBatch1: !!newCat.thawInBatch1, products: [] };
                        state.daysData[d].push(catObj);
                    }
                    (newCat.products || []).forEach(newProd => {
                        const existing = catObj.products.find(p => p.ceNr === newProd.ceNr);
                        if (existing) {
                            existing.description = newProd.description;
                            existing.price = newProd.price;
                            existing.promo = newProd.promo;
                            existing.gemVerk = newProd.gemVerk;
                            existing.derving = newProd.derving;
                            if (newProd._pdfNew) existing._pdfNew = true;
                        } else {
                            catObj.products.push(newProd);
                        }
                    });
                });
            });
        }
    }
};
