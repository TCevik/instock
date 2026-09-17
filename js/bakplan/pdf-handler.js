import { extractTextLinesFromPage } from '../pdf-helper.js';
import { DAYS } from './state.js';
import { getRememberedPerPlaatMap, syncBakplanPerPlaatMemory } from './utils.js';

export async function parseBakplanPdf(file, existingData = []) {
    if (!window.pdfjsLib) {
        throw new Error('PDF bibliotheek niet geladen.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const resultData = JSON.parse(JSON.stringify(existingData));
    const rememberedMap = getRememberedPerPlaatMap();
    const existingItemsMap = new Map();

    if (Array.isArray(existingData)) {
        for (const cat of existingData) {
            if (Array.isArray(cat?.items)) {
                for (const item of cat.items) {
                    if (item?.omschrijving) {
                        const key = item.omschrijving.trim().toLowerCase();
                        if (!existingItemsMap.has(key)) {
                            existingItemsMap.set(key, item);
                        }
                    }
                }
            }
        }
    }

    let currentDay = 'maandag';
    let currentCatName = 'Overig';

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
                if (upperLine.includes(day.toUpperCase())) {
                    currentDay = day;
                    dayFound = true;
                    break;
                }
            }
            if (dayFound) continue;

            if (upperLine.includes('BAKVOLGORDE')) {
                currentCatName = row.rawText.trim();
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
                    if (item.x - last.x < 25 && (
                        (last.text.match(/\d+$/) && item.text === ':') ||
                        (last.text.endsWith(':') && item.text.match(/^\d+/))
                    )) {
                        last.text += item.text;
                        continue;
                    }
                }
                mergedItems.push({ ...item });
            }

            const ceItem = mergedItems.find(item => /^\d{5,8}$/.test(item.text));
            if (!ceItem) continue;

            const priceItem = mergedItems.find(item => item.x > ceItem.x && /^\d+[\.,]\d{2}$/.test(item.text));
            if (!priceItem) continue;

            const descVal = mergedItems
                .filter(item => item.x > ceItem.x && item.x < priceItem.x)
                .map(item => item.text)
                .join(' ')
                .trim();

            if (!descVal) continue;

            const priceVal = priceItem.text;
            const promoItem = mergedItems.find(item => item.x > priceItem.x && item.x < priceItem.x + 80 && /^\d+[\.,]\d{2}$/.test(item.text));
            const promoVal = promoItem ? promoItem.text : '';

            let cleanGemVerk = 0;
            let cleanDerving = 0;

            const numericTrailingItems = mergedItems.filter(item =>
                item.x > priceItem.x + 50 &&
                !item.text.includes(':') &&
                !item.text.includes('.') &&
                !item.text.includes(',') &&
                item.text.length < 10 &&
                /\d/.test(item.text)
            ).sort((a, b) => a.x - b.x);

            if (numericTrailingItems.length >= 2) {
                const dervingItem = numericTrailingItems[numericTrailingItems.length - 1];
                const opleggenItem = numericTrailingItems[numericTrailingItems.length - 2];
                
                const dervingMatch = dervingItem.text.match(/(-?\d+)/);
                if (dervingMatch) {
                    cleanDerving = Math.abs(parseInt(dervingMatch[1]) || 0);
                }

                const opleggenMatch = opleggenItem.text.match(/(-?\d+)/);
                if (opleggenMatch) {
                    cleanGemVerk = Math.max(0, parseInt(opleggenMatch[1]) || 0);
                }
            } else if (numericTrailingItems.length === 1) {
                const match = numericTrailingItems[0].text.match(/(-?\d+)/);
                if (match) {
                    cleanGemVerk = Math.max(0, parseInt(match[1]) || 0);
                }
            }

            const priceCleanMatch = priceVal.match(/(\d+(?:[\.,]\d{2})?)/);
            const cleanPrice = priceCleanMatch ? parseFloat(priceCleanMatch[1].replace(',', '.')) : null;

            let cleanPromo = null;
            if (promoVal) {
                const promoCleanMatch = promoVal.match(/(\d+(?:[\.,]\d{2})?)/);
                if (promoCleanMatch) {
                    cleanPromo = parseFloat(promoCleanMatch[1].replace(',', '.'));
                }
            }

            let catObj = resultData.find(c => c.name.toLowerCase() === currentCatName.toLowerCase());
            if (!catObj) {
                catObj = {
                    id: 'cat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                    name: currentCatName,
                    cartType: currentCatName.toLowerCase().includes('ontdooi') ? 'ontdooi' : 'normaal',
                    collapsed: false,
                    items: []
                };
                resultData.push(catObj);
            }

            let prodObj = catObj.items.find(p => p.omschrijving.toLowerCase() === descVal.toLowerCase());
            if (!prodObj) {
                const key = descVal.trim().toLowerCase();
                const matchedExisting = existingItemsMap.get(key);
                let initialPerPlaat = 12;
                if (matchedExisting && matchedExisting.perPlaat !== null && matchedExisting.perPlaat !== undefined && matchedExisting.perPlaat !== '') {
                    initialPerPlaat = matchedExisting.perPlaat;
                } else if (rememberedMap[key] !== undefined && rememberedMap[key] !== null) {
                    initialPerPlaat = rememberedMap[key];
                }

                prodObj = {
                    id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                    omschrijving: descVal,
                    perPlaat: initialPerPlaat,
                    prijs: cleanPrice,
                    promo: cleanPromo,
                    opleggen: cleanGemVerk,
                    derving: cleanDerving,
                    days: {}
                };
                catObj.items.push(prodObj);
                existingItemsMap.set(key, prodObj);
            } else {
                if (cleanPrice !== null) {
                    prodObj.prijs = cleanPrice;
                }
                prodObj.promo = cleanPromo;
                prodObj.opleggen = cleanGemVerk;
                prodObj.derving = cleanDerving;

                if (prodObj.perPlaat === null || prodObj.perPlaat === undefined || prodObj.perPlaat === '') {
                    const key = descVal.trim().toLowerCase();
                    if (rememberedMap[key] !== undefined && rememberedMap[key] !== null) {
                        prodObj.perPlaat = rememberedMap[key];
                    }
                }
            }

            if (!prodObj.days) prodObj.days = {};
            prodObj.days[currentDay] = {
                promo: cleanPromo,
                opleggen: cleanGemVerk,
                derving: cleanDerving
            };
        }
    }

    syncBakplanPerPlaatMemory(resultData);
    return resultData;
}
