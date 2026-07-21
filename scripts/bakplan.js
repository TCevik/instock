import { loadHeader } from './header.js';
import { checkAuth, getSupabase } from './main.js';

(() => {
    let storeId = null;
    let saveTimeout = null;

    const state = {
        selectedDay: 'MAANDAG',
        daysData: {
            'MAANDAG': [],
            'DINSDAG': [],
            'WOENSDAG': [],
            'DONDERDAG': [],
            'VRIJDAG': [],
            'ZATERDAG': [],
            'ZONDAG': []
        },
        productPlateConfig: {}
    };

    const DAYS = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG', 'ZONDAG'];

    const getPlateQuantity = (desc) => {
        const key = desc.trim();
        const val = parseInt(state.productPlateConfig[key]);
        return (!isNaN(val) && val > 0) ? val : 12;
    };

    const normalizeDaysData = (data) => {
        if (!data) return;
        if (data.categories) {
            const categories = data.categories || [];
            const dailyValues = data.dailyValues || {};

            DAYS.forEach(day => {
                const dayObj = dailyValues[day] || {};
                state.daysData[day] = categories.map(cat => ({
                    category: cat.category,
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

    const triggerSave = () => {
        if (!storeId) return;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            const supabase = await getSupabase();

            const activeProds = new Set();
            DAYS.forEach(day => {
                (state.daysData[day] || []).forEach(c => {
                    (c.products || []).forEach(p => {
                        if (p.description) {
                            activeProds.add(p.description.trim());
                        }
                    });
                });
            });
            Object.keys(state.productPlateConfig).forEach(key => {
                if (!activeProds.has(key.trim())) {
                    delete state.productPlateConfig[key];
                }
            });

            const baseDayList = state.daysData[state.selectedDay] || [];
            const categories = baseDayList.map(c => ({
                category: c.category,
                products: (c.products || []).map(p => {
                    const prodObj = {
                        ceNr: p.ceNr,
                        description: p.description,
                        price: p.price,
                        promo: p.promo
                    };
                    if (p._pdfMissing) prodObj._pdfMissing = true;
                    if (p._pdfNew) prodObj._pdfNew = true;
                    return prodObj;
                })
            }));

            const dailyValues = {};
            DAYS.forEach(day => {
                dailyValues[day] = {};
                (state.daysData[day] || []).forEach(c => {
                    (c.products || []).forEach(p => {
                        const vals = {
                            gemVerk: p.gemVerk || '0',
                            derving: p.derving || '0',
                            price: p.price || '0.00',
                            promo: p.promo || ''
                        };
                        if (p._pdfMissing) vals._pdfMissing = true;
                        if (p._pdfNew) vals._pdfNew = true;
                        dailyValues[day][p.ceNr] = vals;
                    });
                });
            });

            const payload = {
                categories,
                dailyValues,
                productPlateConfig: state.productPlateConfig
            };
            await supabase.from('bakplannen').upsert({ id: storeId, bakplan: payload });
        }, 500);
    };

    const loadData = async () => {
        if (!storeId) return;
        const supabase = await getSupabase();
        const { data } = await supabase.from('bakplannen').select('bakplan').eq('id', storeId).single();
        if (data && data.bakplan) {
            normalizeDaysData(data.bakplan);
            if (data.bakplan.productPlateConfig) state.productPlateConfig = data.bakplan.productPlateConfig;
        }
    };

    let previousStateData = null;

    const pdfParser = {
        async parsePDF(file, mode = 'overwrite') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            previousStateData = JSON.parse(JSON.stringify(state.daysData));

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
                const rows = await this.extractTextLinesFromPage(page);
                
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
                        catObj = { category: currentCategory, products: [] };
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
                                    catObj = { category: oldCat.category, products: [] };
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
                            catObj = { category: newCat.category, products: [] };
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
        },

        async extractTextLinesFromPage(page) {
            const textContent = await page.getTextContent();
            if (!textContent || !textContent.items || textContent.items.length === 0) {
                return [];
            }

            const items = textContent.items
                .map(item => ({
                    text: item.str,
                    x: item.transform[4],
                    y: item.transform[5]
                }))
                .filter(item => item.text.trim() !== '');

            if (items.length === 0) return [];

            const tolerance = 5;
            const linesMap = [];
            for (let item of items) {
                let foundLine = linesMap.find(line => Math.abs(line.y - item.y) <= tolerance);
                if (!foundLine) {
                    foundLine = { y: item.y, items: [] };
                    linesMap.push(foundLine);
                }
                foundLine.items.push(item);
            }

            linesMap.sort((a, b) => b.y - a.y);

            return linesMap.map(line => {
                line.items.sort((a, b) => a.x - b.x);
                return {
                    rawText: line.items.map(item => item.text).join(' '),
                    items: line.items
                };
            });
        }
    };

    const showConfirmModal = (title, message, onConfirm) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const okBtn = document.getElementById('confirm-ok-btn');

        if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) return;

        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = 'flex';

        const close = () => {
            modal.style.display = 'none';
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleOk);
        };

        const handleCancel = () => close();
        const handleOk = () => {
            close();
            onConfirm();
        };

        cancelBtn.addEventListener('click', handleCancel);
        okBtn.addEventListener('click', handleOk);
    };

    const syncStructureAcrossDays = () => {
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
                    products: newProducts
                });
            });

            state.daysData[day] = newDayList;
        });
    };

    const uiRenderer = {
        init() {
            const input = document.getElementById('bakplan-input');
            let selectedFile = null;
            const pdfModal = document.getElementById('pdf-upload-modal');
            const undoBtn = document.getElementById('undo-pdf-btn');

            const handlePdfParse = async (mode) => {
                if (!selectedFile) return;
                try {
                    await pdfParser.parsePDF(selectedFile, mode);
                    this.renderTabs();
                    this.renderTable();
                    triggerSave();
                    if (undoBtn) undoBtn.style.display = 'inline-flex';
                } catch (err) {
                    console.error(err);
                } finally {
                    selectedFile = null;
                    if (input) input.value = '';
                    if (pdfModal) pdfModal.style.display = 'none';
                }
            };

            if (input) {
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    selectedFile = file;
                    if (pdfModal) {
                        pdfModal.style.display = 'flex';
                    }
                });
            }

            const modalConfirmBtn = document.getElementById('pdf-modal-confirm-btn');
            if (modalConfirmBtn) {
                modalConfirmBtn.addEventListener('click', () => handlePdfParse('overwrite'));
            }

            const modalCancelBtn = document.getElementById('pdf-modal-cancel-btn');
            if (modalCancelBtn) {
                modalCancelBtn.addEventListener('click', () => {
                    selectedFile = null;
                    if (input) input.value = '';
                    if (pdfModal) pdfModal.style.display = 'none';
                });
            }

            if (undoBtn) {
                undoBtn.addEventListener('click', () => {
                    if (previousStateData) {
                        state.daysData = JSON.parse(JSON.stringify(previousStateData));
                        previousStateData = null;
                        this.renderTabs();
                        this.renderTable();
                        triggerSave();
                        undoBtn.style.display = 'none';
                    }
                });
            }

            const addCatBtn = document.getElementById('add-category-btn');
            if (addCatBtn) {
                addCatBtn.addEventListener('click', () => {
                    const dayList = state.daysData[state.selectedDay];
                    let catIndex = dayList.length + 1;
                    let newCatName = `Nieuwe Categorie ${catIndex}`;
                    while (dayList.some(c => c.category === newCatName)) {
                        catIndex++;
                        newCatName = `Nieuwe Categorie ${catIndex}`;
                    }
                    dayList.push({
                        category: newCatName,
                        products: [{
                            ceNr: String(Date.now()).slice(-6),
                            description: 'Nieuw product',
                            price: '0.00',
                            promo: '',
                            gemVerk: '0',
                            derving: '0'
                        }]
                    });
                    syncStructureAcrossDays();
                    this.renderTabs();
                    this.renderTable();
                    triggerSave();
                });
            }

            const addBtn = document.getElementById('add-product-btn');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    const dayList = state.daysData[state.selectedDay];
                    let catObj = dayList.length > 0 ? dayList[0] : null;
                    if (!catObj) {
                        catObj = { category: 'Overig', products: [] };
                        dayList.push(catObj);
                    }
                    catObj.products.push({
                        ceNr: String(Date.now()).slice(-6),
                        description: 'Nieuw product',
                        price: '0.00',
                        promo: '',
                        gemVerk: '0',
                        derving: '0'
                    });
                    syncStructureAcrossDays();
                    this.renderTabs();
                    this.renderTable();
                    triggerSave();
                });
            }

            const settingsBtn = document.getElementById('bakplan-settings-btn');
            const settingsModal = document.getElementById('bakplan-settings-modal');
            const settingsCancelBtn = document.getElementById('settings-cancel-btn');
            const settingsSaveBtn = document.getElementById('settings-save-btn');
            let tempConfig = {};

            if (settingsBtn && settingsModal) {
                settingsBtn.addEventListener('click', () => {
                    tempConfig = { ...state.productPlateConfig };
                    this.renderSettingsTable(tempConfig);
                    settingsModal.style.display = 'flex';
                });
            }

            if (settingsCancelBtn && settingsModal) {
                settingsCancelBtn.addEventListener('click', () => {
                    tempConfig = {};
                    settingsModal.style.display = 'none';
                });
            }

            if (settingsSaveBtn && settingsModal) {
                settingsSaveBtn.addEventListener('click', () => {
                    state.productPlateConfig = { ...tempConfig };
                    settingsModal.style.display = 'none';
                    this.renderTable();
                    triggerSave();
                });
            }
        },

        getAllProducts() {
            const productsMap = new Map();
            DAYS.forEach(day => {
                const categories = state.daysData[day] || [];
                categories.forEach(catObj => {
                    (catObj.products || []).forEach(prod => {
                        if (prod.description && !productsMap.has(prod.description.trim())) {
                            productsMap.set(prod.description.trim(), prod);
                        }
                    });
                });
            });
            return Array.from(productsMap.values());
        },

        renderSettingsTable(tempConfig) {
            const tbody = document.getElementById('settings-table-body');
            if (!tbody) return;

            const products = this.getAllProducts();
            if (products.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="loading-cell">Geen producten geladen. Voeg eerst een product toe.</td></tr>';
                return;
            }

            let html = '';
            products.forEach(prod => {
                const desc = prod.description.trim();
                const plateQty = (!isNaN(parseInt(tempConfig[desc])) && parseInt(tempConfig[desc]) > 0) ? parseInt(tempConfig[desc]) : getPlateQuantity(desc);
                html += `
                    <tr>
                        <td>${desc}</td>
                        <td>
                            <input type="number" min="1" class="plate-input" data-desc="${desc}" value="${plateQty}" style="width: 100%; padding: 6px 10px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color);">
                        </td>
                    </tr>
                `;
            });

            tbody.innerHTML = html;

            tbody.querySelectorAll('.plate-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const desc = e.target.dataset.desc;
                    const val = parseInt(e.target.value);
                    tempConfig[desc] = (!isNaN(val) && val > 0) ? val : 12;
                });
            });
        },

        renderTabs() {
            const nav = document.querySelector('.day-navigation');
            if (!nav) return;

            nav.innerHTML = '';
            DAYS.forEach(day => {
                const btn = document.createElement('button');
                btn.className = 'day-nav-btn';

                if (day === state.selectedDay) {
                    btn.classList.add('active');
                }

                btn.textContent = day.charAt(0) + day.slice(1).toLowerCase();
                btn.addEventListener('click', () => {
                    state.selectedDay = day;
                    this.renderTabs();
                    this.renderTable();
                });
                nav.appendChild(btn);
            });
        },

        renderTable() {
            const tbody = document.getElementById('bakplan-table-body');
            if (!tbody) return;

            const categories = state.daysData[state.selectedDay] || [];

            if (categories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Geen gegevens beschikbaar. Voeg een product toe met \'Product Toevoegen\'.</td></tr>';
                return;
            }

            let html = '';
            categories.forEach((catObj, catIdx) => {
                const cat = catObj.category;
                html += `
                    <tr class="category-header-row">
                        <td colspan="6" contenteditable="true" data-catidx="${catIdx}">
                            ${cat}
                        </td>
                        <td style="text-align: right; display: flex; gap: 4px; justify-content: flex-end; align-items: center;">
                            <button class="action-btn add-prod-to-cat-btn" data-catidx="${catIdx}" style="padding: 4px; background-color: var(--accent-color); color: #fff;" title="Product Toevoegen aan Categorie">
                                <i class="material-icons" style="font-size: 16px;">add</i>
                            </button>
                            <button class="action-btn delete delete-cat-btn" data-catidx="${catIdx}" style="padding: 4px;" title="Categorie Verwijderen">
                                <i class="material-icons" style="font-size: 16px;">delete</i>
                            </button>
                        </td>
                    </tr>
                `;

                (catObj.products || []).forEach((prod, index) => {
                    const dervingClass = parseInt(prod.derving) < 0 ? 'class="derving-negative"' : '';
                    const gemVerkNum = parseInt(prod.gemVerk) || 0;
                    const plateQty = getPlateQuantity(prod.description);
                    const platen = Math.round((gemVerkNum / plateQty) * 10) / 10;
                    
                    let rowClass = 'bakplan-row';
                    if (prod._pdfMissing) {
                        rowClass += ' row-pdf-flagged';
                    } else if (prod._pdfNew) {
                        rowClass += ' row-pdf-new';
                    }

                    const isFlagged = prod._pdfMissing || prod._pdfNew;
                    const titleText = prod._pdfMissing ? 'Dit product stond niet meer in het geüploade PDF bestand' : (prod._pdfNew ? 'Nieuw product uit PDF bestand' : '');

                    let badgeHtml = '';
                    if (prod._pdfNew) {
                        badgeHtml = '<span class="status-badge new" contenteditable="false">Nieuw in PDF</span>';
                    } else if (prod._pdfMissing) {
                        badgeHtml = '<span class="status-badge missing" contenteditable="false">Niet meer in PDF</span>';
                    }

                    const approveButtonHtml = isFlagged ? `
                        <button class="action-btn approve-row-btn" data-catidx="${catIdx}" data-idx="${index}" style="padding: 4px; background-color: var(--accent-color); color: #fff;" title="Product Goedkeuren">
                            <i class="material-icons" style="font-size: 16px;">check</i>
                        </button>
                    ` : '';

                    html += `
                        <tr class="${rowClass}" ${titleText ? `title="${titleText}"` : ''}>
                            <td data-label="Productomschrijving"><span contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="description">${prod.description}</span> ${badgeHtml}</td>
                            <td data-label="Prijs" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="price">€ ${prod.price}</td>
                            <td data-label="Promo" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="promo">${prod.promo ? '€ ' + prod.promo : '-'}</td>
                            <td data-label="Opleggen" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="gemVerk">${prod.gemVerk}</td>
                            <td data-label="Platen">${platen}</td>
                            <td data-label="Derving" contenteditable="true" data-catidx="${catIdx}" data-idx="${index}" data-field="derving" ${dervingClass}>${prod.derving}</td>
                            <td data-label="Actie" style="display: flex; gap: 4px; align-items: center; justify-content: flex-end;">
                                ${approveButtonHtml}
                                <button class="action-btn delete delete-row-btn" data-catidx="${catIdx}" data-idx="${index}" style="padding: 4px;" title="Verwijderen">
                                    <i class="material-icons" style="font-size: 16px;">delete</i>
                                </button>
                            </td>
                        </tr>
                    `;
                });
            });

            tbody.innerHTML = html;

            tbody.querySelectorAll('.add-prod-to-cat-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.target.closest('.add-prod-to-cat-btn');
                    const catIdx = parseInt(targetBtn.dataset.catidx);
                    const dayList = state.daysData[state.selectedDay];
                    const catObj = dayList[catIdx];
                    if (catObj) {
                        catObj.products.push({
                            ceNr: String(Date.now()).slice(-6),
                            description: 'Nieuw product',
                            price: '0.00',
                            promo: '',
                            gemVerk: '0',
                            derving: '0'
                        });
                        syncStructureAcrossDays();
                        this.renderTabs();
                        this.renderTable();
                        triggerSave();
                    }
                });
            });

            tbody.querySelectorAll('.approve-row-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.target.closest('.approve-row-btn');
                    const catIdx = parseInt(targetBtn.dataset.catidx);
                    const idx = parseInt(targetBtn.dataset.idx);
                    const catObj = state.daysData[state.selectedDay][catIdx];
                    if (catObj && catObj.products && catObj.products[idx]) {
                        const targetProd = catObj.products[idx];
                        const targetCeNr = targetProd.ceNr;
                        
                        DAYS.forEach(d => {
                            (state.daysData[d] || []).forEach(c => {
                                (c.products || []).forEach(p => {
                                    if (p.ceNr === targetCeNr || (p.description && p.description === targetProd.description)) {
                                        delete p._pdfMissing;
                                        delete p._pdfNew;
                                    }
                                });
                            });
                        });

                        this.renderTable();
                        triggerSave();
                    }
                });
            });

            tbody.querySelectorAll('.delete-cat-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.target.closest('.delete-cat-btn');
                    const catIdx = parseInt(targetBtn.dataset.catidx);
                    const catObj = state.daysData[state.selectedDay][catIdx];
                    if (catObj) {
                        showConfirmModal(
                            'Categorie Verwijderen',
                            `Weet je zeker dat je categorie "${catObj.category}" wilt verwijderen voor alle dagen?`,
                            () => {
                                (catObj.products || []).forEach(p => {
                                    if (p.description) {
                                        delete state.productPlateConfig[p.description.trim()];
                                    }
                                });
                                state.daysData[state.selectedDay].splice(catIdx, 1);
                                syncStructureAcrossDays();
                                this.renderTabs();
                                this.renderTable();
                                triggerSave();
                            }
                        );
                    }
                });
            });

            tbody.querySelectorAll('.category-header-row td[contenteditable="true"]').forEach(cell => {
                cell.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        cell.blur();
                    }
                });

                cell.addEventListener('input', (e) => {
                    const catIdx = parseInt(e.target.dataset.catidx);
                    const newCat = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');
                    if (state.daysData[state.selectedDay][catIdx]) {
                        state.daysData[state.selectedDay][catIdx].category = newCat;
                        syncStructureAcrossDays();
                        triggerSave();
                    }
                });

                cell.addEventListener('blur', (e) => {
                    const catIdx = parseInt(e.target.dataset.catidx);
                    const newCat = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');
                    if (!newCat && state.daysData[state.selectedDay][catIdx]) {
                        e.target.textContent = state.daysData[state.selectedDay][catIdx].category || 'Overig';
                    } else {
                        this.renderTable();
                    }
                });
            });

            tbody.querySelectorAll('.delete-row-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetBtn = e.target.closest('.delete-row-btn');
                    const catIdx = parseInt(targetBtn.dataset.catidx);
                    const idx = parseInt(targetBtn.dataset.idx);
                    const catObj = state.daysData[state.selectedDay][catIdx];
                    if (catObj && catObj.products && catObj.products[idx]) {
                        const prodName = catObj.products[idx].description || 'dit product';
                        showConfirmModal(
                            'Product Verwijderen',
                            `Weet je zeker dat je "${prodName}" wilt verwijderen voor alle dagen?`,
                            () => {
                                const prodDesc = catObj.products[idx].description;
                                if (prodDesc) {
                                    delete state.productPlateConfig[prodDesc.trim()];
                                }
                                catObj.products.splice(idx, 1);
                                if (catObj.products.length === 0) {
                                    state.daysData[state.selectedDay].splice(catIdx, 1);
                                }
                                syncStructureAcrossDays();
                                this.renderTabs();
                                this.renderTable();
                                triggerSave();
                            }
                        );
                    }
                });
            });

            const editableCells = Array.from(tbody.querySelectorAll('.bakplan-row [contenteditable="true"]'));
            editableCells.forEach((cell, idx) => {
                cell.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const nextCell = editableCells[idx + 1];
                        if (nextCell) {
                            nextCell.focus();
                        } else {
                            cell.blur();
                        }
                    }
                });

                cell.addEventListener('input', (e) => {
                    const catIdx = parseInt(e.target.dataset.catidx);
                    const idx = parseInt(e.target.dataset.idx);
                    const field = e.target.dataset.field;
                    let text = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');

                    if (field === 'price' || field === 'promo') {
                        text = text.replace('€', '').trim();
                        if (text === '-') text = '';
                    }

                    const catObj = state.daysData[state.selectedDay][catIdx];
                    if (catObj && catObj.products && catObj.products[idx]) {
                        catObj.products[idx][field] = text;
                        if (field === 'description') {
                            syncStructureAcrossDays();
                        }
                        if (field === 'gemVerk' || field === 'description') {
                            const currentProd = catObj.products[idx];
                            const gemVerkNum = parseInt(currentProd.gemVerk) || 0;
                            const plateQty = getPlateQuantity(currentProd.description);
                            const platen = Math.round((gemVerkNum / plateQty) * 10) / 10;
                            const row = e.target.closest('tr');
                            if (row) {
                                const platenCell = row.querySelector('td[data-label="Platen"]');
                                if (platenCell) platenCell.textContent = platen;
                            }
                        }
                        triggerSave();
                    }
                });

                cell.addEventListener('contextmenu', (e) => {
                    const catIdx = parseInt(e.target.dataset.catidx);
                    const prodIdx = parseInt(e.target.dataset.idx);
                    const field = e.target.dataset.field;
                    if (!isNaN(catIdx) && !isNaN(prodIdx) && field) {
                        openContextMenu(e, catIdx, prodIdx, field);
                    }
                });
            });
        }
    };

    const syncFieldAcrossDays = (catIdx, prodIdx, field, value) => {
        DAYS.forEach(day => {
            const dayList = state.daysData[day];
            if (dayList && dayList[catIdx] && dayList[catIdx].products && dayList[catIdx].products[prodIdx]) {
                dayList[catIdx].products[prodIdx][field] = value;
            }
        });
        triggerSave();
    };

    const syncProductAcrossDays = (catIdx, prodIdx) => {
        const sourceProd = state.daysData[state.selectedDay][catIdx].products[prodIdx];
        if (!sourceProd) return;
        DAYS.forEach(day => {
            const dayList = state.daysData[day];
            if (dayList && dayList[catIdx] && dayList[catIdx].products && dayList[catIdx].products[prodIdx]) {
                const targetProd = dayList[catIdx].products[prodIdx];
                targetProd.description = sourceProd.description;
                targetProd.price = sourceProd.price;
                targetProd.promo = sourceProd.promo;
                targetProd.gemVerk = sourceProd.gemVerk;
                targetProd.derving = sourceProd.derving;
            }
        });
        triggerSave();
    };

    const fieldNamesNL = {
        description: 'Productomschrijving',
        price: 'Prijs',
        promo: 'Promo',
        gemVerk: 'Opleggen',
        derving: 'Derving'
    };

    let activeContextMenuTarget = null;

    const initContextMenu = () => {
        const menu = document.getElementById('context-menu');
        const syncFieldBtn = document.getElementById('ctx-sync-field');
        const syncProductBtn = document.getElementById('ctx-sync-product');
        const fieldTextSpan = document.getElementById('ctx-field-text');

        if (!menu || !syncFieldBtn || !syncProductBtn) return;

        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target)) {
                menu.style.display = 'none';
            }
        });

        syncFieldBtn.addEventListener('click', () => {
            if (activeContextMenuTarget) {
                const { catIdx, prodIdx, field } = activeContextMenuTarget;
                const catObj = state.daysData[state.selectedDay][catIdx];
                if (catObj && catObj.products && catObj.products[prodIdx]) {
                    const value = catObj.products[prodIdx][field];
                    syncFieldAcrossDays(catIdx, prodIdx, field, value);
                }
            }
            menu.style.display = 'none';
        });

        syncProductBtn.addEventListener('click', () => {
            if (activeContextMenuTarget) {
                const { catIdx, prodIdx } = activeContextMenuTarget;
                syncProductAcrossDays(catIdx, prodIdx);
            }
            menu.style.display = 'none';
        });

        window.openContextMenu = (e, catIdx, prodIdx, field) => {
            e.preventDefault();
            activeContextMenuTarget = { catIdx, prodIdx, field };
            const label = fieldNamesNL[field] || field;
            if (fieldTextSpan) {
                fieldTextSpan.textContent = `Sync alleen ${label.toLowerCase()} voor alle dagen`;
            }
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            menu.style.display = 'block';
        };
    };

    document.addEventListener('DOMContentLoaded', async () => {
        loadHeader();
        initContextMenu();
        const auth = await checkAuth(['beheerder']);
        if (!auth) return;
        storeId = auth.userData.winkel;
        const uploadGroup = document.querySelector('.upload-group');
        if (uploadGroup && auth.storeCode !== 'plus-lms') {
            uploadGroup.style.display = 'none';
        }
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }
        uiRenderer.init();
        await loadData();
        uiRenderer.renderTabs();
        uiRenderer.renderTable();
    });
})();



