export async function extractTextFromPdf(file) {
    if (!window.pdfjsLib) {
        throw new Error('PDF bibliotheek niet geladen.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        const items = textContent.items.map(it => ({
            str: it.str,
            x: it.transform[4],
            y: it.transform[5]
        }));

        const linesMap = new Map();
        for (let it of items) {
            if (!it.str || !it.str.trim()) continue;
            let foundKey = null;
            for (let yKey of linesMap.keys()) {
                if (Math.abs(it.y - yKey) <= 4) {
                    foundKey = yKey;
                    break;
                }
            }
            if (foundKey === null) {
                foundKey = it.y;
                linesMap.set(foundKey, [it]);
            } else {
                linesMap.get(foundKey).push(it);
            }
        }

        const sortedYKeys = [...linesMap.keys()].sort((a, b) => b - a);
        const pageLines = [];

        for (let yKey of sortedYKeys) {
            const lineItems = linesMap.get(yKey).sort((a, b) => a.x - b.x);
            const lineStr = lineItems.map(item => item.str.trim()).filter(Boolean).join(' ');
            if (lineStr) {
                pageLines.push(lineStr);
            }
        }

        fullText += pageLines.join('\n') + '\n';
    }

    return fullText;
}
