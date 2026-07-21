export const extractTextLinesFromPage = async (page) => {
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
};
