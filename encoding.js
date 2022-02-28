(() =>
{

window.EncodeDeckData = ((data) =>
{
    data.sort(([c1,a1],[c2,a2]) => ((c1-c2)*500000 + (a1-a2)));
    const parts = [String.fromCharCode(0x1)]; /* version identifier */
    for (const [cardId, artId, num] of data)
    {
        parts.push(
            String.fromCharCode((cardId >> 0) & 0xff) +
            String.fromCharCode((cardId >> 8) & 0xff) +
            String.fromCharCode(((artId << 3) | Math.min(num, 0x07)) & 0xff)
        );
    }
    return btoa(parts.join(''));
});

window.DecodeDeckData = ((str) =>
{
    str = atob(str);
    if (str.charCodeAt(0) !== 1)
        throw 'Unknown version';
    if ((str.length % 3) !== 1)
        throw 'Invalid string';
    
    const cards = [];
    for (let i=1, n=str.length; i<n; i+=3)
    {
        cards.push([
            (str.charCodeAt(i+0) << 0) |
            (str.charCodeAt(i+1) << 8)
            ,
            (str.charCodeAt(i+2) >> 3)
            ,
            (str.charCodeAt(i+2) & 0x07)
        ])
    }
    return cards;
});

})();
