(()=>{

const sleep = ((ms) => new Promise((r) => window.setTimeout(r,ms)));

const openFrame = document.getElementById('open-frame');
const injectCSSPromise = new Promise((res) =>
{
    openFrame.addEventListener('load', () =>
    {
        openFrame.contentWindow.postMessage({
            cssFile: new URL('/ygodeck-iframe.css', window.location).href,
            requestDeckInfoUpdate: true,
        }, 'https://yugiohdeck.github.io/');
        window.setInterval(() => { if (document.body.className === 'state-open') openFrame.focus() }, 50); /* ... i can't seem to get blur events to play nice with an iframe ... */
        res();
    });
});

window.addEventListener('message', (e) =>
{
    if (e.source !== openFrame.contentWindow)
        return;
    
    if (document.body.className !== 'state-open')
        return;
    
    const decks = e.data.deckInfo.decks;
    if (decks.main)
        setTargetHash(decks);
    else
        setTargetHash(false);
});

let targetHash = null;
let targetHashNotifier = null;

const setTargetHash = ((h) =>
{
    targetHash = h;
    if (targetHashNotifier !== null)
        targetHashNotifier();
});

document.getElementById('close-btn').addEventListener('click', () => { window.location.hash = ''; });

const cyGraph = cytoscape({
    container: document.getElementById('graph'),
    layout: { name: 'null' },
    style: fetch('cytoscape.css').then(r => r.text()),
});
cyGraph.style().selector('node').style({
    'background-image': (e => e.data('bg')),
    'label': (e => e.data('num')+'x'),
});
cyGraph.style().selector('edge.bridged').style({ 'width': (e => 3*Math.sqrt(e.data('weight'))) });
cyGraph.style().selector('edge.bridge').style({
    'label': (e => {
        const [which, value] = e.data('match');
        switch (which)
        {
            case 'attribute':
            case 'type':
                return value;
            case 'level':
                return ('Level '+value);
            case 'atk':
                return (value+' ATK');
            case 'def':
                return (value+' DEF');
            default:
                return '??? bug ???';
        }
    }),
});

let currentFocus = undefined;
let isAnimating = null;
const _animationDone = (() => { isAnimating = null; });
const setFocus = ((elm) =>
{
    if (isAnimating)
        isAnimating.stop();
    
    if (!(elm && ((elm.isEdge && elm.isEdge()) || (elm.isNode && elm.isNode()))))
        elm = null;
    
    if (elm && (elm.isEdge && elm.isEdge()) && !elm.hasClass('bridged'))
        return;
    
    if (currentFocus === elm)
        return;
    
    const isFirst = (currentFocus === undefined);
    currentFocus = elm;
    
    cyGraph.edges().style('display',null);
    if (elm && elm.isEdge && elm.isEdge())
    {
        cyGraph.edges('.bridged').style('display','none');
        const node1 = elm.source();
        const node2 = elm.target();
        const linkingNodes = node1.connectedEdges('.bridge').connectedNodes().intersect(node2.connectedEdges('.bridge').connectedNodes()).difference(node1).difference(node2);
        const linkingEdges = node1.connectedEdges('.bridge').union(node2.connectedEdges('.bridge')).intersect(linkingNodes.connectedEdges('.bridge'));
        const otherNodes = linkingNodes.union(node1).union(node2).absoluteComplement().nodes();
        const topHalf = otherNodes.slice(Math.ceil(otherNodes.size()/2));
        const bottomHalf = otherNodes.difference(topHalf);
        const nCols = Math.max(topHalf.size(), bottomHalf.size(), linkingNodes.size());
        const middleColumn = (nCols-1)/2;
        let nextTopColumn = (nCols-topHalf.size())/2;
        let nextCenterColumn = (nCols-linkingNodes.size())/2;
        let nextBottomColumn = (nCols-bottomHalf.size())/2;
        
        linkingEdges.style('display','element');
        isAnimating = cyGraph.layout({
            name: 'grid',
            rows: 3 + (topHalf.nonempty() ? 1 : 0) + (bottomHalf.nonempty() ? 1 : 0),
            cols: nCols,
            avoidOverlapPadding: 30,
            position: (e =>
            {
                if (e.same(node1))
                    return { col: middleColumn, row: (topHalf.nonempty() ? 1 : 0) };
                if (e.same(node2))
                    return { col: middleColumn, row: (topHalf.nonempty() ? 3 : 2) };
                if (linkingNodes.contains(e))
                    return { col: nextCenterColumn++, row: (topHalf.nonempty() ? 2 : 1) };
                if (topHalf.contains(e))
                    return { col: nextTopColumn++, row: 0 };
                return { col: nextBottomColumn++, row: (topHalf.nonempty() ? 4 : 3) };
            }),
            animate: true,
            condense: true,
            stop: _animationDone,
        }).run();
    }
    else if (elm && elm.isNode && elm.isNode())
    {
        const myEdges = elm.connectedEdges('.bridged');
        console.log(myEdges);
        myEdges.absoluteComplement().edges('.bridged').style('display','none');
        isAnimating = cyGraph.layout({
            name: 'concentric',
            avoidOverlap: true,
            concentric: (e) => (elm.same(e) ? 3 : myEdges.connectedNodes().contains(e) ? 2 : 1),
            levelWidth: () => 1,
            animate: true,
            stop: _animationDone,
        }).run();
    }
    else
    {
        isAnimating = cyGraph.layout({
            name: 'cola',
            randomize: isFirst,
            animate: !isFirst,
            stop: _animationDone,
        }).run();
    }
});

cyGraph.on('dbltap', (e) => setFocus(e.target));

(async () =>
{
    let currentHash = null;
    while (true)
    {
        while (targetHash === null)
        {
            await new Promise((r) => { targetHashNotifier = r; });
        }
        
        const hash = targetHash;
        targetHash = null;
        targetHashNotifier = null;
        
        console.log(hash, currentHash);
        if (hash === currentHash)
            continue;
        
        try
        {
            if (hash === false)
            {
                document.body.className = 'state-loading';
                document.getElementById('loading-header').innerText = 'Initializing';
                document.getElementById('loading-bar-filled').style.width = '1px';
                document.getElementById('loading-bar-text').innerText = '';
                
                await sleep(50);
                await injectCSSPromise;
                
                openFrame.contentWindow.postMessage({
                    setDeckInfo: { decks: { main: null, extra: null, side: null }, title: null }
                }, 'https://yugiohdeck.github.io');
                
                document.getElementById('loading-bar-filled').style.width = '100%';
                /*await sleep(200);*/
                
                document.body.className = 'state-open';
                openFrame.focus();
            }
            else if (typeof(hash) === 'object')
            {
                document.body.className = 'state-loading';
                document.getElementById('loading-header').innerText = 'Loading Deck';
                document.getElementById('loading-bar-filled').style.width = '1px';
                document.getElementById('loading-bar-text').innerText = 'Initializing...';
                await sleep(0);
                
                const {main, extra, side} = hash;
                let nResolved = 0;
                const nTotal = main.length;
                document.getElementById('loading-bar-text').innerText = ('0/'+nTotal);
                
                const cards = {};
                await Promise.all(main.map(async ([passcode, num]) =>
                {
                    try
                    {
                        const {cardId, artId} = await window.ResolvePasscode(passcode);
                        
                        const existing = cards[cardId];
                        if (existing)
                            existing[1] += num;
                        else
                            cards[cardId] = [artId, num];
                    } catch (e) {
                        console.error(passcode, e);
                    }

                    ++nResolved;
                    document.getElementById('loading-bar-filled').style.width = ((nResolved*100/nTotal)+'%');
                    document.getElementById('loading-bar-text').innerText = (nResolved+'/'+nTotal);
                }));
                
                if (targetHash === null)
                    window.location.hash = window.EncodeDeckData(Object.entries(cards).map(([c,[a,n]]) => [c,a,n]));
            }
            else if (typeof(hash) === 'string')
            {
                const cardIds = window.DecodeDeckData(hash);
                
                document.getElementById('loading-header').innerText = 'Painting Card Art';
                document.getElementById('loading-bar-filled').style.width = '1px';
                document.getElementById('loading-bar-text').innerText = 'Please stand by...';
                await window.ArtworksReady;
                document.getElementById('loading-bar-filled').style.width = '100%';
                document.getElementById('loading-bar-text').innerText = 'Done, courtesy of artworks.ygoresources.com!';
                await sleep(200);
                
                const nTotal = cardIds.length;
                document.getElementById('loading-header').innerText = 'Loading Card Data';
                document.getElementById('loading-bar-filled').style.width = '1px';
                
                const loadingImg = document.createElement('img');
                document.getElementById('loading-bar-text').innerText = '';
                document.getElementById('loading-bar-text').appendChild(loadingImg);
                
                let animationQueue = [];
                let animationQueueNotifier = null;
                const cardDataPromise = Promise.all(cardIds.map(async (data) =>
                {
                    try
                    {
                        return await window.GetCardData(...data);
                    } catch (e) {
                        console.error('Failed to query card data', data);
                        console.error(e);
                        return null;
                    } finally {
                        animationQueue.push(data);
                        if (animationQueueNotifier)
                        {
                            animationQueueNotifier();
                            animationQueueNotifier = null;
                        }
                    }
                }));
                
                for (let nDone=1; nDone <= nTotal; ++nDone)
                {
                    while (!animationQueue.length)
                    {
                        await new Promise((r) => { animationQueueNotifier = r; });
                    }
                    loadingImg.src = window.GetArtworkURL(...(animationQueue.pop()));
                    document.getElementById('loading-bar-filled').style.width = ((nDone*100/nTotal)+'%')
                    await sleep(50);
                }
                
                let nTotalCards = 0;
                const artIdMap = Object.fromEntries(cardIds.map(([c,a,n]) => [c,a]));
                const countMap = Object.fromEntries(cardIds.map(([c,a,n]) => { nTotalCards += n; return [c,n] }));
                
                const cardData = (await cardDataPromise).filter((o)=>(o));
                
                const graph1 = cardData.map((card1) =>
                    cardData.map((card2) =>
                    {
                        if (card1 === card2)
                            return false;
                        let match = false;
                        for (const prop of ['attribute','type','level','atk','def'])
                        {
                            if ((card1[prop] === card2[prop]) && (card1[prop] !== -1))
                            {
                                if (!match)
                                    match = [prop, card1[prop]];
                                else
                                    return false;
                            }
                        }
                        return match;
                    })
                );
                
                const graph2 = cardData.map(() => cardData.map(() => ({ nKs: 0, Ks: [] })));
                const nCards = cardData.length;
                
                document.getElementById('loading-header').innerText = 'Pondering Combinations';
                document.getElementById('loading-bar-filled').style.width = '1px';
                document.getElementById('loading-bar-text').innerText = ('0/'+nCards);
                await sleep(200);
                
                for (let i=0; i<nCards;)
                {
                    for (let k=0; k<nCards; ++k)
                    {
                        if (!graph1[i][k])
                            continue;
                        for (let j=(i+1); j<nCards; ++j)
                        {
                            if (graph1[k][j])
                            {
                                const elm = graph2[i][j];
                                elm.nKs += countMap[cardData[k].cardId];
                                elm.Ks.push(k);
                            }
                        }
                    }
                    ++i;
                    document.getElementById('loading-bar-filled').style.width = ((i*100/nCards)+'%');
                    document.getElementById('loading-bar-text').innerText = (i+'/'+nCards);
                    await sleep(0);
                }
                await sleep(200);
                
                document.getElementById('loading-header').innerText = 'Rendering Graph';
                document.getElementById('loading-bar-filled').style.width = '1px';
                document.getElementById('loading-bar-text').innerText = '';
                await sleep(0);
                
                document.body.className = 'state-graph';
                cyGraph.startBatch();
                try
                {
                    cyGraph.remove('node');
                    for (let i=0; i<nCards; ++i)
                    {
                        const cardId = cardData[i].cardId;
                        const artId = artIdMap[cardId];
                        cyGraph.add({
                            group: 'nodes',
                            data: {
                                id: ('card-'+cardId),
                                cardId,
                                num: countMap[cardId],
                                bg: window.GetArtworkURL(cardId, artId),
                            },
                        })
                    }
                    for (let i=0; i<nCards;)
                    {
                        for (let j=(i+1); j<nCards; ++j)
                        {
                            const g1 = graph1[i][j];
                            if (g1)
                            {
                                cyGraph.add({
                                    group: 'edges',
                                    data: {
                                        source: ('card-'+(cardData[i].cardId)),
                                        target: ('card-'+(cardData[j].cardId)),
                                        match: g1,
                                    },
                                    classes: 'bridge',
                                    selectable: false,
                                });
                            }
                            
                            const nKs = graph2[i][j].nKs;
                            if (!nKs)
                                continue;
                            
                            const Ks = graph2[i][j].Ks;
                            Ks.sort((k1,k2) => countMap[cardData[k2].cardId]-countMap[cardData[k1].cardId]);

                            cyGraph.add({
                                group: 'edges',
                                data: {
                                    source: ('card-'+(cardData[i].cardId)),
                                    target: ('card-'+(cardData[j].cardId)),
                                    weight: (nKs/nTotalCards),
                                    Ks: Ks.map((k) => [cardData[k], countMap[cardData[k].cardId]]),
                                },
                                classes: 'bridged',
                            });
                        }
                        ++i;
                        document.getElementById('loading-bar-filled').style.width = ((i*100/nCards)+'%');
                        document.getElementById('loading-bar-text').innerText = (i+'/'+nCards);
                        await sleep(0);
                    }
                } finally { cyGraph.endBatch(); }
                document.body.className = 'state-graph';
                cyGraph.resize();
                setFocus(null);
            }
            currentHash = hash;
        } catch (e) {
            console.error('Failed to update to hash', hash);
            console.error(e);
        }
    }
})();

const importYDKE = ((ydke) =>
{
    const cards = {}
    const data = atob(ydke.split('!')[0])
    for (let i=0, n=data.length; i<n; i += 4)
    {
        const id = (
            (data.charCodeAt(i+0) <<  0) |
            (data.charCodeAt(i+1) <<  8) |
            (data.charCodeAt(i+2) << 16) |
            (data.charCodeAt(i+3) << 24));
        cards[id] = (cards[id] || 0) + 1;
    }
    setTargetHash({main: Object.entries(cards)});
});

const updateFromHash = (() =>
{
    const tag = document.location.hash;
    if (tag.length <= 1)
        setTargetHash(false)
    else if (tag.startsWith('#ydke://'))
        importYDKE(tag.substring(8))
    else
        setTargetHash(tag.substring(1));
});

window.addEventListener('hashchange', updateFromHash);

updateFromHash();

})();
