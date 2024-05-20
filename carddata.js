(()=>{ /* ygoprodeck: passcode -> cardid,artid */
    
let cache = {};
let queue = [];
let queueNotifier = null;

(async () =>
{
    while (true)
    {
        while (!queue.length)
        {
            await new Promise((r) => { queueNotifier = r; });
        }
        
        const toProcess = {};
        for (const [passcode, res, rej] of queue.splice(-20, 20))
            toProcess[passcode] = [res,rej];
        
        try
        {
            const resp = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?id='+Object.keys(toProcess).join(',')+'&misc=yes');
            if (!resp.ok)
                throw (resp.status+' '+resp.statusText);
            const json = await resp.json();
            
            const results = {}
            for (const entry of json.data)
            {
                const cardId = entry.misc_info[0].konami_id;
                if (cardId)
                {
                    const images = entry.card_images;
                    for (let i=0, n=images.length; i<n; ++i)
                        results[images[i].id] = {cardId, artId: (i+1)};
                    
                    if (!results[entry.id])
                        results[entry.id] = {cardId, artId: null};
                    
                    const betaId = entry.misc_info[0].beta_id
                    if (betaId && !results[betaId])
                        results[betaId] = {cardId, artId: null};
                }
            }
            
            for (const [passcode, konamiData] of Object.entries(results))
            {
                const promiseInfo = toProcess[passcode];
                if (promiseInfo)
                    promiseInfo[0](konamiData);
                else
                    cache[passcode] = Promise.resolve(konamiData);
            }
            for (const [passcode, [res,rej]] of Object.entries(toProcess))
            {
                if (!results[passcode])
                    rej('Could not resolve passcode');
            }
        } catch (e) {
            for (const [passcode, [res, rej]] of Object.entries(toProcess))
            {
                cache[passcode] = null;
                rej(e);
            }
            continue;
        }
    }
})();

window.ResolvePasscode = ((passcode) =>
{
    const existing = cache[passcode];
    if (existing)
        return existing;
    return (cache[passcode] = new Promise((res,rej) =>
    {
        queue.push([passcode, res, rej]);
        if (queueNotifier)
        {
            queueNotifier();
            queueNotifier = null;
        }
    }));
});

})();

(()=>{ /* artworks.ygoresources.com */

let artworkManifest = null;
window.ArtworksReady = (async ()=>
{
    try
    {
        artworkManifest = await (await fetch('https://artworks.ygoresources.com/manifest.json')).json();
    } catch (e) {
        console.error('Artwork initialization failed');
        console.error(e);
    }
})();

const NO_DATA_CARD = 'https://db.ygoresources.com/img/no_data_card.png';
window.GetArtworkURL = ((cardId, artId) =>
{
    if (!artworkManifest)
        return NO_DATA_CARD;
    const cardData = artworkManifest.cards[cardId];
    if (!cardData)
        return NO_DATA_CARD;

    if ((artId === null) || !(artId in cardData))
        artId = Object.keys(cardData)[0];
    
    const artworkData = cardData[artId];
    if (!artworkData)
        return NO_DATA_CARD;
    
    return (new URL(artworkData.bestArt, 'https://artworks.ygoresources.com/')).href;
});

})();

(()=>{ /* db.ygorganization.com */

const _autoMetadata = fetch('https://db.ygorganization.com/data/meta/auto').then(r => r.json());
const _propsMetadata = fetch('https://db.ygorganization.com/data/meta/mprop').then(r => r.json());
const _locales = ['en','ja','de','fr','it','es','pt','ko'];
const _GetCardData = (async (cardId) =>
{
    const cardDataAll = await (await fetch('https://db.ygorganization.com/data/card/'+cardId)).json();
    for (const locale of _locales)
    {
        const cardData = cardDataAll.cardData[locale];
        if (!cardData)
            continue;
        if (cardData.cardType !== 'monster')
            return null;
        return {
            cardId,
            name: cardData.name,
            attribute: (await _autoMetadata).attributes[cardData.attribute].en,
            type: (await _propsMetadata)[cardData.properties[0]].en,
            level: cardData.level,
            atk: cardData.atk,
            def: cardData.def,
        };
    }
    return null;
});

const cache = {};
window.GetCardData = ((cardId) => (cache[cardId] || (cache[cardId] = _GetCardData(cardId))));

})();
