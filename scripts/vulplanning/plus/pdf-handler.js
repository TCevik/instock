import { extractTextLinesFromPage } from '../../pdf-utils.js';
import { HARDCODED_PATHS_MAPPING, HARDCODED_NORMS, HARDCODED_MIRROR_TIMES, HARDCODED_RESTANTEN_TIMES } from './pdf-defaults.js';
import { state } from '../state.js';

export const parsePDFAndGetNames = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const namesSet = new Set();

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const rows = await extractTextLinesFromPage(page);

        for (let row of rows) {
            const timeIndex = row.rawText.search(/\b\d{2}:\d{2}\b/);
            if (timeIndex !== -1) {
                let name = row.rawText.substring(0, timeIndex).trim();
                name = name.replace(/[…\.\s\-]+$/, '').trim();
                if (name && !['TAAK', 'AANWEZIG', 'TIJDEN', 'DAGROOSTER', 'WINKEL', 'GOEDERENVERWERKING'].includes(name.toUpperCase()) && !name.toUpperCase().includes('AFGEDRUKT')) {
                    const timeMatch = row.rawText.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?[…\.]*/);
                    const timeStr = timeMatch ? timeMatch[0].replace(/[…\.]+$/, '').trim() : '';
                    const displayName = timeStr ? `${name} - ${timeStr}` : name;
                    namesSet.add(displayName);

                    const timeMatches = [...row.rawText.matchAll(/\b\d{2}:\d{2}\b/g)].map(m => m[0]);
                    if (timeMatches.length >= 2) {
                        const shiftMatch = row.rawText.match(/\b\d{2}:\d{2}\s*-\s*\d{2}(?::\d{2})?\b/);
                        if (shiftMatch) {
                            const afterShift = row.rawText.substring(shiftMatch.index + shiftMatch[0].length);
                            const pauseMatch = afterShift.match(/\b\d{2}:\d{2}\b/);
                            if (pauseMatch) {
                                const pParts = pauseMatch[0].split(':');
                                const pMin = (parseInt(pParts[0], 10) || 0) * 60 + (parseInt(pParts[1], 10) || 0);
                                state.fillerBreaks[displayName] = pMin;
                            }
                        }
                    }
                }
            }
        }
    }
    return Array.from(namesSet).sort();
};

export const parseColliPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const colliMap = {};
    const categoryColli = {};

    Object.keys(HARDCODED_PATHS_MAPPING).forEach(path => {
        colliMap[path] = { colli: 0, duration: 0 };
    });

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const rows = await extractTextLinesFromPage(page);

        for (let row of rows) {
            const match = row.rawText.match(/99999\s+\d+\s+(.+?)\s+(\d+)\s+(RDC|VDC|CDC|DDC|VDM|AGF|TRS|RZL|VDZ|VLG)/i);
            if (match) {
                const category = match[1].trim();
                const colli = parseInt(match[2].trim()) || 0;
                let foundPath = null;
                for (const [pathName, categories] of Object.entries(HARDCODED_PATHS_MAPPING)) {
                    if (categories.some(cat => cat.trim().toLowerCase() === category.toLowerCase())) {
                        foundPath = pathName;
                        break;
                    }
                }
                if (foundPath) {
                    const norm = HARDCODED_NORMS[category.toLowerCase()] || 62;
                    colliMap[foundPath].colli += colli;
                    colliMap[foundPath].duration += (colli / norm) * 60;
                }
                const catKey = category.toLowerCase();
                categoryColli[catKey] = (categoryColli[catKey] || 0) + colli;
            }
        }
    }
    return { colliMap, categoryColli };
};

export const getDefaultPDFPaden = () => {
    return Object.entries(HARDCODED_PATHS_MAPPING).map(([pathName, categories]) => ({
        name: pathName,
        mirrorNorm: HARDCODED_MIRROR_TIMES[pathName] ?? 21,
        restantenNorm: HARDCODED_RESTANTEN_TIMES[pathName] ?? 20,
        categories: categories.map(cat => ({
            name: cat,
            norm: HARDCODED_NORMS[cat.toLowerCase()] ?? 62
        }))
    }));
};

export const doSettingsMatchPDF = (padenList) => {
    if (!Array.isArray(padenList) || padenList.length === 0) return false;
    const defaultPaden = getDefaultPDFPaden();
    if (padenList.length !== defaultPaden.length) return false;
    for (let i = 0; i < defaultPaden.length; i++) {
        const defP = defaultPaden[i];
        const storeP = padenList.find(p => p.name && p.name.trim().toLowerCase() === defP.name.toLowerCase());
        if (!storeP) return false;
        if (!Array.isArray(storeP.categories) || storeP.categories.length !== defP.categories.length) return false;
        for (let j = 0; j < defP.categories.length; j++) {
            const defC = defP.categories[j];
            const storeC = storeP.categories.find(c => c.name && c.name.trim().toLowerCase() === defC.name.toLowerCase());
            if (!storeC) return false;
        }
    }
    return true;
};
