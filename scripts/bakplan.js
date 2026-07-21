import { loadHeader } from './header.js';

(() => {
    const state = {
        selectedDay: 'MAANDAG',
        daysData: {
            'MAANDAG': {},
            'DINSDAG': {},
            'WOENSDAG': {},
            'DONDERDAG': {},
            'VRIJDAG': {},
            'ZATERDAG': {},
            'ZONDAG': {}
        }
    };

    const DAYS = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG', 'ZATERDAG', 'ZONDAG'];

    const pdfParser = {
        async parsePDF(file) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            for (let d of DAYS) {
                state.daysData[d] = {};
            }

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

                    if (!state.daysData[currentDay][currentCategory]) {
                        state.daysData[currentDay][currentCategory] = [];
                    }

                    const exists = state.daysData[currentDay][currentCategory].some(p => p.ceNr === ceItem.text);
                    if (!exists) {
                        state.daysData[currentDay][currentCategory].push({
                            ceNr: ceItem.text,
                            description: descVal,
                            price: cleanPrice,
                            promo: cleanPromo,
                            gemVerk: cleanGemVerk,
                            derving: cleanDerving
                        });
                    }
                }
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

    const uiRenderer = {
        init() {
            const input = document.getElementById('bakplan-input');
            if (input) {
                input.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                        await pdfParser.parsePDF(file);
                        this.renderTabs();
                        this.renderTable();
                    } catch (err) {
                        console.error(err);
                    }
                });
            }
        },

        renderTabs() {
            const nav = document.querySelector('.day-navigation');
            if (!nav) return;

            nav.innerHTML = '';
            DAYS.forEach(day => {
                const btn = document.createElement('button');
                btn.className = 'day-nav-btn';
                
                const hasData = Object.keys(state.daysData[day]).length > 0;
                if (!hasData) {
                    btn.classList.add('disabled');
                }

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

            const dayData = state.daysData[state.selectedDay];
            const categories = Object.keys(dayData);

             if (categories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Geen gegevens beschikbaar. Upload een PDF bestand.</td></tr>';
                return;
            }

            let html = '';
            categories.forEach(cat => {
                html += `
                    <tr class="category-header-row">
                        <td colspan="6">
                            ${cat}
                        </td>
                    </tr>
                `;

                dayData[cat].forEach((prod, index) => {
                    const dervingClass = parseInt(prod.derving) < 0 ? 'class="derving-negative"' : '';
                    const gemVerkNum = parseInt(prod.gemVerk) || 0;
                    const platen = Math.round((gemVerkNum / 12) * 10) / 10;
                    html += `
                        <tr class="bakplan-row">
                            <td data-label="Productomschrijving" contenteditable="true" data-cat="${cat}" data-idx="${index}" data-field="description">${prod.description}</td>
                            <td data-label="Prijs" contenteditable="true" data-cat="${cat}" data-idx="${index}" data-field="price">€ ${prod.price}</td>
                            <td data-label="Promo" contenteditable="true" data-cat="${cat}" data-idx="${index}" data-field="promo">${prod.promo ? '€ ' + prod.promo : '-'}</td>
                            <td data-label="Gem Verk" contenteditable="true" data-cat="${cat}" data-idx="${index}" data-field="gemVerk">${prod.gemVerk}</td>
                            <td data-label="Platen">${platen}</td>
                            <td data-label="Derving" contenteditable="true" data-cat="${cat}" data-idx="${index}" data-field="derving" ${dervingClass}>${prod.derving}</td>
                        </tr>
                    `;
                });
            });

            tbody.innerHTML = html;

            const editableCells = Array.from(tbody.querySelectorAll('td[contenteditable="true"]'));
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

                cell.addEventListener('blur', (e) => {
                    const cat = e.target.dataset.cat;
                    const idx = parseInt(e.target.dataset.idx);
                    const field = e.target.dataset.field;
                    let text = e.target.textContent.trim().replace(/[\r\n]+/g, ' ');

                    if (field === 'price' || field === 'promo') {
                        text = text.replace('€', '').trim();
                        if (text === '-') text = '';
                    }

                    if (state.daysData[state.selectedDay][cat] && state.daysData[state.selectedDay][cat][idx]) {
                        state.daysData[state.selectedDay][cat][idx][field] = text;
                        if (field === 'gemVerk') {
                            const gemVerkNum = parseInt(text) || 0;
                            const platen = Math.round((gemVerkNum / 12) * 10) / 10;
                            const row = e.target.closest('tr');
                            if (row) {
                                const platenCell = row.querySelector('td[data-label="Platen"]');
                                if (platenCell) platenCell.textContent = platen;
                            }
                        }
                    }
                });
            });
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadHeader();
        if (window.pdfjsLib) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        }
        uiRenderer.init();
        uiRenderer.renderTabs();
        uiRenderer.renderTable();
    });
})();
