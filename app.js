/**
 * Manifold Bingo 2026 - Viewer Application
 *
 * Loads and displays bingo card data from JSON files.
 * Fetches live prices from Manifold API for real-time updates.
 * Works as a static site (no server required).
 */

// Configuration
const DATA_PATH = 'cards/';
const INDEX_FILE = 'index.json';
const MANIFOLD_API = 'https://api.manifold.markets/v0';

// Line indices for display
const LINES = [
    { name: 'Row 1', indices: [0, 1, 2, 3, 4] },
    { name: 'Row 2', indices: [5, 6, 7, 8, 9] },
    { name: 'Row 3', indices: [10, 11, 12, 13, 14] },
    { name: 'Row 4', indices: [15, 16, 17, 18, 19] },
    { name: 'Row 5', indices: [20, 21, 22, 23, 24] },
    { name: 'Col 1', indices: [0, 5, 10, 15, 20] },
    { name: 'Col 2', indices: [1, 6, 11, 16, 21] },
    { name: 'Col 3', indices: [2, 7, 12, 17, 22] },
    { name: 'Col 4', indices: [3, 8, 13, 18, 23] },
    { name: 'Col 5', indices: [4, 9, 14, 19, 24] },
    { name: 'Diag \\', indices: [0, 6, 12, 18, 24] },
    { name: 'Diag /', indices: [4, 8, 12, 16, 20] },
];

const FREE_SPACE_INDEX = 12;

// Global state for current card (used by live price updates)
let currentCard = null;

// Global state for index page (used by leaderboard)
let allCardsData = null;

// localStorage key for tracking card changes
const STORAGE_KEY = 'manifold_bingo_last_seen';

// localStorage key for display preferences
const PREFS_KEY = 'manifold_bingo_prefs';

// ============================================================================
// INDEX PAGE FUNCTIONS
// ============================================================================

/**
 * Load all cards index and display on main page
 */
async function loadCardsIndex() {
    try {
        const response = await fetch(DATA_PATH + INDEX_FILE);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        allCardsData = data;

        displayStats(data);
        displayCardsList(data.cards);
        displayLeaderboard(data.cards);
        setupTabs();

        // Auto-save baseline on first visit
        const lastSeen = getLastSeenProbs();
        if (Object.keys(lastSeen).length === 0) {
            saveLastSeenProbs(data.cards);
        }

        // Load market activity feed (async, after initial render)
        displayMarketActivity(data.cards);
    } catch (error) {
        console.error('Failed to load cards index:', error);
        const grid = document.getElementById('card-grid');
        const activity = document.getElementById('market-activity');
        if (grid) grid.innerHTML = '<p class="loading">Failed to load cards. Check console for details.</p>';
        if (activity) activity.innerHTML = '<p class="loading">Failed to load market activity.</p>';
    }
}

/**
 * Set up tab switching for index page
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.view-tabs .tab');
    const views = ['activity', 'grid', 'leaderboard'];

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding view
            const view = tab.dataset.view;
            views.forEach(v => {
                const el = document.getElementById(`${v}-view`);
                if (el) el.style.display = v === view ? 'block' : 'none';
            });
        });
    });
}

/**
 * Display stats summary
 */
function displayStats(data) {
    const cards = data.cards || [];
    const total = cards.length;
    const active = cards.filter(c => c.status === 'active').length;
    const winners = cards.filter(c => c.status === 'resolved_yes').length;

    document.getElementById('total-cards').textContent = total;
    document.getElementById('active-cards').textContent = active;
    document.getElementById('winners').textContent = winners;
}

/**
 * Display cards list
 */
function displayCardsList(cards) {
    const grid = document.getElementById('card-grid');

    if (!cards || cards.length === 0) {
        grid.innerHTML = '<p class="loading">No cards yet. Be the first!</p>';
        return;
    }

    grid.innerHTML = cards.map(card => createCardPreview(card)).join('');
}

/**
 * Get last-seen win probabilities from localStorage
 */
function getLastSeenProbs() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Save current win probabilities to localStorage
 */
function saveLastSeenProbs(cards) {
    const probs = {};
    cards.forEach(card => {
        probs[card.card_id] = {
            win_probability: card.win_probability,
            timestamp: Date.now()
        };
    });
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(probs));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

/**
 * Calculate card deltas from last seen
 */
function calculateCardDeltas(cards) {
    const lastSeen = getLastSeenProbs();
    return cards.map(card => {
        const last = lastSeen[card.card_id];
        let delta = null;
        let hoursSince = null;

        if (last) {
            delta = card.win_probability - last.win_probability;
            hoursSince = (Date.now() - last.timestamp) / (1000 * 60 * 60);
        }

        return { ...card, delta, hoursSince };
    });
}

/**
 * Display hot cards (sorted by biggest movers)
 */
function displayHotCards(cards) {
    const container = document.getElementById('hot-cards');
    if (!container) return;

    const cardsWithDeltas = calculateCardDeltas(cards)
        .filter(c => c.status === 'active' && c.delta !== null && Math.abs(c.delta) >= 0.005);

    if (cardsWithDeltas.length === 0) {
        container.innerHTML = '<p class="loading">No significant changes since your last visit.</p>';
        return;
    }

    // Sort by absolute delta (biggest movers first)
    cardsWithDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const rows = cardsWithDeltas.map((card, i) => {
        const winProb = (card.win_probability * 100).toFixed(1);
        const deltaPct = (card.delta * 100).toFixed(1);
        const deltaClass = card.delta >= 0 ? 'positive' : 'negative';
        const deltaSign = card.delta >= 0 ? '+' : '';
        const timeAgo = formatTimeAgo(card.hoursSince);

        return `
            <a href="card.html?id=${card.card_id}" class="leaderboard-row hot-card-row">
                <span class="rank">${card.delta >= 0 ? '📈' : '📉'}</span>
                <span class="handle">@${card.user_handle}</span>
                <span class="win-prob">${winProb}%</span>
                <span class="edge ${deltaClass}">${deltaSign}${deltaPct}%</span>
            </a>
        `;
    }).join('');

    container.innerHTML = `
        <div class="leaderboard-header">
            <span class="rank"></span>
            <span class="handle">Player</span>
            <span class="win-prob">Win %</span>
            <span class="edge">Change</span>
        </div>
        ${rows}
        <div class="hot-cards-footer">
            <button id="refresh-baseline" class="refresh-btn">Update Baseline</button>
            <span class="last-seen-info" id="last-seen-info"></span>
        </div>
    `;

    // Add refresh button handler
    document.getElementById('refresh-baseline').addEventListener('click', () => {
        saveLastSeenProbs(cards);
        displayHotCards(cards);
        updateLastSeenInfo();
    });

    updateLastSeenInfo();
}

/**
 * Format hours ago as human-readable string
 */
function formatTimeAgo(hours) {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

/**
 * Update the "last seen" info display
 */
function updateLastSeenInfo() {
    const info = document.getElementById('last-seen-info');
    if (!info) return;

    const lastSeen = getLastSeenProbs();
    const timestamps = Object.values(lastSeen).map(v => v.timestamp);

    if (timestamps.length === 0) {
        info.textContent = 'First visit - changes will show next time';
    } else {
        const oldest = Math.min(...timestamps);
        const hours = (Date.now() - oldest) / (1000 * 60 * 60);
        info.textContent = `Comparing to ${formatTimeAgo(hours)}`;
    }
}

/**
 * Display leaderboard sorted by win probability (static, initial load)
 */
function displayLeaderboard(cards) {
    const leaderboard = document.getElementById('leaderboard');
    if (!leaderboard) return;

    if (!cards || cards.length === 0) {
        leaderboard.innerHTML = '<p class="loading">No cards yet.</p>';
        return;
    }

    leaderboard.innerHTML = '<p class="loading">Loading live probabilities...</p>';
}

// Current sort state for leaderboard
let leaderboardSortState = { column: 'prob', direction: 'desc' };

/**
 * Compute live card stats from market data
 * @param {Array} cards - Card objects
 * @param {Map} marketDataMap - Map of slug -> {currentProb, stats}
 * @returns {Array} Cards with liveWinProb, change24h, high24h, low24h
 */
function computeCardStats(cards, marketDataMap) {
    return cards.map(card => {
        if (!card.grid || card.status !== 'active') {
            return { ...card, liveWinProb: card.win_probability, change24h: null, high24h: null, low24h: null };
        }

        // Get live probs for all 25 cells
        const liveProbs = card.grid.map((cell, i) => {
            if (i === FREE_SPACE_INDEX) return 1.0; // Free space
            const marketData = marketDataMap.get(cell.slug);
            return marketData?.currentProb ?? cell.prob;
        });

        // Get 24h-ago probs for all 25 cells
        const probs24hAgo = card.grid.map((cell, i) => {
            if (i === FREE_SPACE_INDEX) return 1.0;
            const marketData = marketDataMap.get(cell.slug);
            return marketData?.stats?.prob24hAgo ?? cell.prob;
        });

        // Get 24h high probs (best case scenario in last 24h)
        const highProbs = card.grid.map((cell, i) => {
            if (i === FREE_SPACE_INDEX) return 1.0;
            const marketData = marketDataMap.get(cell.slug);
            return marketData?.stats?.high24h ?? cell.prob;
        });

        // Get 24h low probs (worst case scenario in last 24h)
        const lowProbs = card.grid.map((cell, i) => {
            if (i === FREE_SPACE_INDEX) return 1.0;
            const marketData = marketDataMap.get(cell.slug);
            return marketData?.stats?.low24h ?? cell.prob;
        });

        const liveWinProb = approximateWinProb(liveProbs);
        const winProb24hAgo = approximateWinProb(probs24hAgo);
        const high24h = approximateWinProb(highProbs);
        const low24h = approximateWinProb(lowProbs);
        const change24h = liveWinProb - winProb24hAgo;

        return { ...card, liveWinProb, change24h, high24h, low24h };
    });
}

/**
 * Sort cards by column (stable sort)
 */
function sortCards(cards, column, direction) {
    const multiplier = direction === 'desc' ? -1 : 1;

    return [...cards].sort((a, b) => {
        let valA, valB;

        switch (column) {
            case 'handle':
                valA = (a.user_handle || '').toLowerCase();
                valB = (b.user_handle || '').toLowerCase();
                return multiplier * valA.localeCompare(valB);
            case 'prob':
                valA = a.liveWinProb ?? a.win_probability ?? 0;
                valB = b.liveWinProb ?? b.win_probability ?? 0;
                break;
            case 'change':
                // Sort by actual value (winners first when desc)
                valA = a.change24h ?? 0;
                valB = b.change24h ?? 0;
                break;
            case 'upside':
                // How far below 24h high (room to grow)
                valA = (a.high24h ?? a.liveWinProb ?? 0) - (a.liveWinProb ?? 0);
                valB = (b.high24h ?? b.liveWinProb ?? 0) - (b.liveWinProb ?? 0);
                break;
            case 'downside':
                // How far above 24h low (room to fall)
                valA = (a.liveWinProb ?? 0) - (a.low24h ?? a.liveWinProb ?? 0);
                valB = (b.liveWinProb ?? 0) - (b.low24h ?? b.liveWinProb ?? 0);
                break;
            default:
                return 0;
        }

        if (valA === valB) return 0;
        return multiplier * (valA > valB ? 1 : -1);
    });
}

/**
 * Display live leaderboard with sortable columns
 */
function displayLiveLeaderboard(cardsWithStats, container) {
    if (!container) return;

    const activeCards = cardsWithStats.filter(c => c.status === 'active');

    if (activeCards.length === 0) {
        container.innerHTML = '<p class="loading">No active cards.</p>';
        return;
    }

    // Sort indicator helper
    const sortIndicator = (col) => {
        if (leaderboardSortState.column !== col) return '';
        return leaderboardSortState.direction === 'desc' ? ' &#x25BC;' : ' &#x25B2;';
    };

    // Sort cards
    const sorted = sortCards(activeCards, leaderboardSortState.column, leaderboardSortState.direction);

    const rows = sorted.map((card, i) => {
        const winProb = ((card.liveWinProb ?? card.win_probability) * 100).toFixed(1);
        const change = card.change24h;

        let changeHtml = '<span class="lb-change">-</span>';
        if (change !== null) {
            const changePct = (change * 100).toFixed(1);
            const sign = change >= 0 ? '+' : '';
            const changeClass = change > 0.005 ? 'positive' : change < -0.005 ? 'negative' : '';
            changeHtml = `<span class="lb-change ${changeClass}">${sign}${changePct}%</span>`;
        }

        // Range: show how far from high/low
        let rangeHtml = '<span class="lb-range">-</span>';
        if (card.high24h !== null && card.low24h !== null) {
            const current = card.liveWinProb ?? card.win_probability;
            const upside = ((card.high24h - current) * 100).toFixed(1);
            const downside = ((current - card.low24h) * 100).toFixed(1);
            rangeHtml = `<span class="lb-range" title="High: ${(card.high24h * 100).toFixed(1)}%, Low: ${(card.low24h * 100).toFixed(1)}%">+${upside} / -${downside}</span>`;
        }

        return `
            <a href="card.html?id=${card.card_id}" class="leaderboard-row">
                <span class="rank">#${i + 1}</span>
                <span class="handle">@${card.user_handle}</span>
                <span class="win-prob">${winProb}%</span>
                ${changeHtml}
                ${rangeHtml}
            </a>
        `;
    }).join('');

    container.innerHTML = `
        <div class="leaderboard-header">
            <span class="rank"></span>
            <span class="handle sortable" data-sort="handle">Player${sortIndicator('handle')}</span>
            <span class="win-prob sortable" data-sort="prob">Win %${sortIndicator('prob')}</span>
            <span class="lb-change sortable" data-sort="change">24h${sortIndicator('change')}</span>
            <span class="lb-range sortable" data-sort="upside">Range${sortIndicator('upside')}${sortIndicator('downside')}</span>
        </div>
        ${rows}
    `;

    // Set up sort handlers
    container.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (leaderboardSortState.column === column) {
                leaderboardSortState.direction = leaderboardSortState.direction === 'desc' ? 'asc' : 'desc';
            } else {
                leaderboardSortState.column = column;
                leaderboardSortState.direction = column === 'handle' ? 'asc' : 'desc';
            }
            displayLiveLeaderboard(cardsWithStats, container);
        });
    });
}

/**
 * Create HTML for card preview
 */
function createCardPreview(card) {
    const statusClass = getStatusClass(card.status);
    const statusText = getStatusText(card.status);

    // Create mini grid
    const miniCells = card.grid.map((cell, i) => {
        let cellClass = 'mini-cell';
        if (i === FREE_SPACE_INDEX) cellClass += ' free';
        else if (cell.resolved === true) cellClass += ' yes';
        else if (cell.resolved === false) cellClass += ' no';
        return `<div class="${cellClass}"></div>`;
    }).join('');

    return `
        <a href="card.html?id=${card.card_id}" class="card-preview">
            <h3>@${card.user_handle}</h3>
            <div class="mini-grid">${miniCells}</div>
            <div class="status-line">
                <span class="status-badge ${statusClass}">${statusText}</span>
                <span>${(card.win_probability * 100).toFixed(0)}% win</span>
            </div>
        </a>
    `;
}

// ============================================================================
// CARD PAGE FUNCTIONS
// ============================================================================

/**
 * Load and display a single card
 */
async function loadCard(cardId) {
    try {
        const response = await fetch(`${DATA_PATH}${cardId}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const card = await response.json();
        currentCard = card;

        displayCard(card);

        // Fetch live prices after initial display
        fetchLivePrices(card);
    } catch (error) {
        console.error('Failed to load card:', error);
        document.getElementById('card-title').textContent =
            'Failed to load card';
    }
}

/**
 * Display full card details
 */
function displayCard(card) {
    // Header
    document.getElementById('card-title').textContent =
        `@${card.user_handle}'s Card`;
    document.getElementById('card-status').textContent =
        getStatusText(card.status);
    document.getElementById('card-status').className =
        `status-badge ${getStatusClass(card.status)}`;

    // Win probability with "at creation" label
    const probEl = document.getElementById('card-prob');
    probEl.innerHTML = `
        <span class="prob-label">Win Prob:</span>
        <span class="prob-value" id="win-prob-value">${(card.win_probability * 100).toFixed(1)}%</span>
        <span class="prob-note" id="win-prob-note">(at creation)</span>
    `;

    // Bingo grid
    const gridEl = document.getElementById('bingo-grid');
    gridEl.innerHTML = card.grid.map((cell, i) => createBingoCell(cell, i)).join('');

    // Inline line probabilities (rows on right, cols on bottom, diags in corner)
    renderInlineLineProbs(card.grid);

    // Details
    document.getElementById('card-owner').textContent = `@${card.user_handle}`;
    document.getElementById('card-created').textContent =
        formatDate(card.created_time);
    document.getElementById('card-price').textContent =
        `M$${card.purchase_price?.toFixed(0) || '-'}`;
    document.getElementById('card-target').textContent =
        `${((card.target_win_prob || 0) * 100).toFixed(1)}%`;

    // Set up display controls
    setupDisplayControls();
}

/**
 * Create HTML for a bingo cell
 */
function createBingoCell(cell, index) {
    let cellClass = 'bingo-cell';
    if (index === FREE_SPACE_INDEX) cellClass += ' free';
    else if (cell.resolved === true) cellClass += ' yes';
    else if (cell.resolved === false) cellClass += ' no';

    // Check display preference
    const prefs = getPrefs();
    const fullText = cell.question || 'Unknown';
    const question = prefs.fullTitles ? fullText : smartTruncate(fullText, 60);

    // Add full-title class for styling when enabled
    if (prefs.fullTitles) {
        cellClass += ' full-title';
    }

    const prob = ((cell.prob || 0.5) * 100).toFixed(0);

    const marketUrl = cell.url
        || (cell.slug ? `https://manifold.markets/${cell.slug}` : '#');

    return `
        <a href="${marketUrl}" target="_blank"
           class="${cellClass}" title="${fullText}"
           data-index="${index}" data-stored-prob="${cell.prob || 0.5}">
            <div class="question">${question}</div>
            <div class="prob-container">
                <span class="prob">${prob}%</span>
                <span class="delta"></span>
            </div>
        </a>
    `;
}

/**
 * Calculate line probability (product of cell probs)
 */
function calculateLineProb(probs) {
    return probs.reduce((acc, p) => acc * p, 1);
}

/**
 * Get line status and probability
 */
function getLineStats(line, grid) {
    const cells = line.indices.map(i => grid[i]);
    const yesCount = cells.filter(c => c.resolved === true).length;
    const noCount = cells.filter(c => c.resolved === false).length;

    const probs = line.indices.map(i => {
        if (i === FREE_SPACE_INDEX) return 1.0;
        if (grid[i].resolved === true) return 1.0;
        if (grid[i].resolved === false) return 0.0;
        return grid[i].prob || 0.5;
    });
    const prob = calculateLineProb(probs);

    let status = 'active';
    if (yesCount === 5) status = 'complete';
    else if (noCount > 0) status = 'blocked';

    return { prob, status, yesCount };
}

/**
 * Create inline line probability cell HTML
 */
function createLineProbCell(lineIndex, stats, label = null) {
    const { prob, status } = stats;
    let probDisplay = status === 'complete' ? '100%' :
                      status === 'blocked' ? '0%' :
                      `${(prob * 100).toFixed(1)}%`;

    return `
        <div class="line-prob-cell ${status}" data-line="${lineIndex}">
            ${label ? `<div class="line-prob-label">${label}</div>` : ''}
            <div class="line-prob-value">${probDisplay}</div>
        </div>
    `;
}

/**
 * Render inline line probabilities (rows right, cols bottom, diags corners)
 */
function renderInlineLineProbs(grid) {
    // Rows 0-4 on the right
    const rowProbs = document.getElementById('row-probs');
    if (rowProbs) {
        rowProbs.innerHTML = LINES.slice(0, 5).map((line, i) => {
            const stats = getLineStats(line, grid);
            return createLineProbCell(i, stats);
        }).join('');
    }

    // Cols 5-9 on the bottom
    const colProbs = document.getElementById('col-probs');
    if (colProbs) {
        colProbs.innerHTML = LINES.slice(5, 10).map((line, i) => {
            const stats = getLineStats(line, grid);
            return createLineProbCell(5 + i, stats);
        }).join('');
    }

    // Diagonals 10-11 in corners (\ left, / right)
    const diagProbs = document.getElementById('diag-probs');
    if (diagProbs) {
        const diagBackslash = getLineStats(LINES[10], grid); // \
        const diagSlash = getLineStats(LINES[11], grid);     // /
        diagProbs.innerHTML = `
            ${createLineProbCell(10, diagBackslash, '\\')}
            ${createLineProbCell(11, diagSlash, '/')}
        `;
    }
}

/**
 * Update line probabilities with live prices
 */
function updateLineProbs(liveProbs) {
    LINES.forEach((line, i) => {
        const lineEl = document.querySelector(`.line-prob-cell[data-line="${i}"]`);
        if (!lineEl || lineEl.classList.contains('complete') || lineEl.classList.contains('blocked')) return;

        const probs = line.indices.map(idx => liveProbs[idx]);
        const lineProb = calculateLineProb(probs);
        const probEl = lineEl.querySelector('.line-prob-value');
        if (probEl) {
            probEl.textContent = `${(lineProb * 100).toFixed(1)}%`;
        }
    });
}

// ============================================================================
// SPARKLINE FUNCTIONS
// ============================================================================

// Cache for sparkline data (sessionStorage)
const SPARKLINE_CACHE_KEY = 'manifold_bingo_sparklines';

/**
 * Get cached sparkline data
 */
function getSparklineCache() {
    try {
        const stored = sessionStorage.getItem(SPARKLINE_CACHE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        return {};
    }
}

/**
 * Save sparkline data to cache
 */
function saveSparklineCache(contractId, data) {
    try {
        const cache = getSparklineCache();
        cache[contractId] = {
            data,
            timestamp: Date.now()
        };
        sessionStorage.setItem(SPARKLINE_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Failed to cache sparkline:', e);
    }
}

/**
 * Fetch bet history for a market
 */
async function fetchBetHistory(contractId) {
    // Check cache first (valid for 5 minutes)
    const cache = getSparklineCache();
    const cached = cache[contractId];
    if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
        return cached.data;
    }

    try {
        const response = await fetch(
            `${MANIFOLD_API}/bets?contractId=${contractId}&limit=200&order=asc`
        );
        if (!response.ok) return null;

        const bets = await response.json();

        // Extract probability timeline from bets
        const timeline = bets
            .filter(bet => bet.probAfter != null)
            .map(bet => ({
                time: bet.createdTime,
                prob: bet.probAfter
            }));

        saveSparklineCache(contractId, timeline);
        return timeline;
    } catch (error) {
        console.error('Failed to fetch bet history:', error);
        return null;
    }
}

/**
 * Render sparkline SVG from probability timeline
 */
function renderSparkline(timeline, width = 60, height = 20) {
    if (!timeline || timeline.length < 2) return '';

    // Normalize to SVG coordinates
    const probs = timeline.map(t => t.prob);
    const minProb = Math.min(...probs);
    const maxProb = Math.max(...probs);
    const range = maxProb - minProb || 0.1; // Avoid division by zero

    const points = timeline.map((t, i) => {
        const x = (i / (timeline.length - 1)) * width;
        const y = height - ((t.prob - minProb) / range) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Determine color based on trend
    const firstProb = probs[0];
    const lastProb = probs[probs.length - 1];
    const color = lastProb > firstProb ? 'var(--success)' :
                  lastProb < firstProb ? 'var(--danger)' : 'var(--accent)';

    return `
        <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" />
        </svg>
    `;
}

/**
 * Show sparkline popup for a cell
 */
async function showSparklinePopup(cell, contractId, question, marketUrl) {
    // Remove existing popup
    const existingPopup = document.querySelector('.sparkline-popup');
    if (existingPopup) existingPopup.remove();

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'sparkline-popup';
    popup.innerHTML = `
        <div class="sparkline-header">${truncate(question, 40)}</div>
        <div class="sparkline-loading">Loading price history...</div>
    `;

    // Position popup near cell
    const rect = cell.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 5}px`;

    // Keep popup on screen
    if (rect.left + 280 > window.innerWidth) {
        popup.style.left = `${window.innerWidth - 290}px`;
    }

    document.body.appendChild(popup);

    // Fetch and render sparkline
    const timeline = await fetchBetHistory(contractId);

    if (timeline && timeline.length >= 2) {
        const probs = timeline.map(t => t.prob);
        const firstProb = (probs[0] * 100).toFixed(0);
        const lastProb = (probs[probs.length - 1] * 100).toFixed(0);
        const minProb = (Math.min(...probs) * 100).toFixed(0);
        const maxProb = (Math.max(...probs) * 100).toFixed(0);

        popup.innerHTML = `
            <div class="sparkline-header">${truncate(question, 40)}</div>
            ${renderSparkline(timeline, 150, 40)}
            <div class="sparkline-stats">
                <span>Start: ${firstProb}%</span>
                <span>Now: ${lastProb}%</span>
                <span>Range: ${minProb}%-${maxProb}%</span>
            </div>
            <a href="${marketUrl}" target="_blank" class="sparkline-link">Open on Manifold →</a>
        `;
    } else {
        popup.innerHTML = `
            <div class="sparkline-header">${truncate(question, 40)}</div>
            <div class="sparkline-error">No price history available</div>
            <a href="${marketUrl}" target="_blank" class="sparkline-link">Open on Manifold →</a>
        `;
    }

    // Auto-close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target) && !cell.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 100);
}

/**
 * Set up sparkline click handlers for all cells
 */
function setupSparklineHandlers() {
    document.querySelectorAll('.bingo-cell').forEach(cell => {
        cell.addEventListener('click', async (e) => {
            // Don't trigger on link navigation - use right-click or ctrl+click for that
            if (e.metaKey || e.ctrlKey || e.button !== 0) return;

            e.preventDefault();

            const index = parseInt(cell.dataset.index);
            if (index === FREE_SPACE_INDEX) return; // Skip free space

            if (!currentCard) return;

            const market = currentCard.grid[index];
            if (!market || !market.contract_id) return;

            const marketUrl = market.url || `https://manifold.markets/${market.slug}`;
            showSparklinePopup(cell, market.contract_id, market.question, marketUrl);
        });
    });
}

// ============================================================================
// 24-HOUR MARKET ACTIVITY FUNCTIONS
// ============================================================================

/**
 * Compute 24-hour statistics from a probability timeline
 * @param {Array} timeline - Array of {time, prob} objects (ascending order)
 * @param {number} currentProb - Current probability from live API
 * @returns {Object} Stats object with prob24hAgo, high24h, low24h, change24h
 */
function computeMarket24hStats(timeline, currentProb) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    if (!timeline || timeline.length === 0) {
        return {
            prob24hAgo: null,
            high24h: null,
            low24h: null,
            change24h: null,
            hasActivity: false
        };
    }

    // Find entries in the 24h window
    const entriesIn24h = timeline.filter(t => t.time >= oneDayAgo);

    // Find prob24hAgo - the probability closest to 24h ago
    let prob24hAgo;
    if (entriesIn24h.length === 0) {
        // No bets in 24h, use the most recent bet before 24h ago
        const beforeWindow = timeline.filter(t => t.time < oneDayAgo);
        if (beforeWindow.length > 0) {
            prob24hAgo = beforeWindow[beforeWindow.length - 1].prob;
        } else {
            prob24hAgo = timeline[0].prob;
        }
    } else {
        // Use the first entry in or just before the 24h window
        const beforeWindow = timeline.filter(t => t.time < oneDayAgo);
        if (beforeWindow.length > 0) {
            prob24hAgo = beforeWindow[beforeWindow.length - 1].prob;
        } else {
            prob24hAgo = entriesIn24h[0].prob;
        }
    }

    // Compute high/low within 24h window (include currentProb)
    let high24h, low24h;
    if (entriesIn24h.length > 0) {
        const probs24h = entriesIn24h.map(t => t.prob);
        probs24h.push(currentProb); // Include current prob in range
        high24h = Math.max(...probs24h);
        low24h = Math.min(...probs24h);
    } else {
        // No activity in 24h
        high24h = currentProb;
        low24h = currentProb;
    }

    const change24h = currentProb - prob24hAgo;

    return {
        prob24hAgo,
        high24h,
        low24h,
        change24h,
        hasActivity: entriesIn24h.length > 0
    };
}

/**
 * Fetch 24h stats for a single market
 * @param {string} contractId - Manifold contract ID
 * @param {number} currentProb - Current probability
 * @returns {Object} Stats object
 */
async function fetchMarket24hStats(contractId, currentProb) {
    const timeline = await fetchBetHistory(contractId);
    return computeMarket24hStats(timeline, currentProb);
}

/**
 * Collect all unique markets across all cards
 * @param {Array} cards - Array of card objects
 * @returns {Map} Map of slug -> {question, cardIds, currentProb, url}
 */
function collectUniqueMarkets(cards) {
    const markets = new Map();

    for (const card of cards) {
        if (!card.grid) continue;

        for (let i = 0; i < card.grid.length; i++) {
            const cell = card.grid[i];
            if (!cell.slug || i === FREE_SPACE_INDEX) continue;

            if (!markets.has(cell.slug)) {
                markets.set(cell.slug, {
                    slug: cell.slug,
                    question: cell.question,
                    cardIds: [],
                    cardHandles: [],
                    currentProb: cell.prob, // Will be updated with live
                    url: cell.url || `https://manifold.markets/${cell.slug}`,
                    resolved: cell.resolved,
                    contractId: null // Will be filled when fetching live
                });
            }

            const market = markets.get(cell.slug);
            if (!market.cardIds.includes(card.card_id)) {
                market.cardIds.push(card.card_id);
                market.cardHandles.push(card.user_handle);
            }
        }
    }

    return markets;
}

/**
 * Display market activity feed (main index page)
 * Shows markets sorted by: resolutions first, then biggest movers
 */
async function displayMarketActivity(cards) {
    const container = document.getElementById('market-activity');
    if (!container) return;

    container.innerHTML = '<p class="loading">Fetching live market data...</p>';

    // Collect unique markets
    const marketsMap = collectUniqueMarkets(cards);
    const markets = Array.from(marketsMap.values());

    if (markets.length === 0) {
        container.innerHTML = '<p class="loading">No markets found.</p>';
        return;
    }

    // Fetch live prices for all markets (with rate limiting)
    const BATCH_SIZE = 10;
    const marketsList = [];

    for (let i = 0; i < markets.length; i += BATCH_SIZE) {
        const batch = markets.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (market) => {
            try {
                const response = await fetch(`${MANIFOLD_API}/slug/${market.slug}?lite=true`);
                if (!response.ok) return { ...market, liveData: null };

                const data = await response.json();
                return {
                    ...market,
                    currentProb: data.probability || data.prob || market.currentProb,
                    contractId: data.id,
                    isResolved: data.isResolved,
                    resolution: data.resolution,
                    liveData: data
                };
            } catch (e) {
                return { ...market, liveData: null };
            }
        });

        const results = await Promise.all(promises);
        marketsList.push(...results);

        // Update progress
        const progress = Math.min(100, Math.round((i + batch.length) / markets.length * 100));
        container.innerHTML = `<p class="loading">Fetching market data... ${progress}%</p>`;
    }

    // Now fetch 24h stats for markets with contract IDs
    container.innerHTML = '<p class="loading">Computing 24h changes...</p>';

    const marketsWithStats = [];
    for (let i = 0; i < marketsList.length; i += BATCH_SIZE) {
        const batch = marketsList.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (market) => {
            if (!market.contractId) {
                return { ...market, stats: null };
            }
            const stats = await fetchMarket24hStats(market.contractId, market.currentProb);
            return { ...market, stats };
        });

        const results = await Promise.all(promises);
        marketsWithStats.push(...results);
    }

    // Sort markets: resolutions first, then by absolute 24h change
    marketsWithStats.sort((a, b) => {
        // Resolved markets first
        if (a.isResolved && !b.isResolved) return -1;
        if (!a.isResolved && b.isResolved) return 1;

        // Then by absolute change (biggest movers first)
        const changeA = a.stats?.change24h ?? 0;
        const changeB = b.stats?.change24h ?? 0;
        return Math.abs(changeB) - Math.abs(changeA);
    });

    // Render the activity feed
    renderActivityFeed(container, marketsWithStats);

    // Build market data map for card stats
    const marketDataMap = new Map();
    marketsWithStats.forEach(m => {
        marketDataMap.set(m.slug, {
            currentProb: m.currentProb,
            stats: m.stats
        });
    });

    // Compute and display card stats in leaderboard
    const cardsWithStats = computeCardStats(cards, marketDataMap);
    const leaderboard = document.getElementById('leaderboard');
    displayLiveLeaderboard(cardsWithStats, leaderboard);
}

// Current sort state for activity feed
let activitySortState = { column: 'change', direction: 'desc' };

/**
 * Sort markets by a column (stable sort - preserves previous order for ties)
 */
function sortMarkets(markets, column, direction) {
    const multiplier = direction === 'desc' ? -1 : 1;

    return [...markets].sort((a, b) => {
        let valA, valB;

        switch (column) {
            case 'resolved':
                // Resolved first (desc) or last (asc)
                valA = a.isResolved ? 1 : 0;
                valB = b.isResolved ? 1 : 0;
                break;
            case 'question':
                valA = (a.question || '').toLowerCase();
                valB = (b.question || '').toLowerCase();
                return multiplier * valA.localeCompare(valB);
            case 'prob':
                valA = a.currentProb ?? 0;
                valB = b.currentProb ?? 0;
                break;
            case 'change':
                // Sort by actual value (biggest gainers first when desc)
                valA = a.stats?.change24h ?? 0;
                valB = b.stats?.change24h ?? 0;
                break;
            case 'range':
                // Sort by range width (high - low)
                valA = (a.stats?.high24h ?? 0) - (a.stats?.low24h ?? 0);
                valB = (b.stats?.high24h ?? 0) - (b.stats?.low24h ?? 0);
                break;
            case 'cards':
                valA = a.cardIds?.length ?? 0;
                valB = b.cardIds?.length ?? 0;
                break;
            default:
                return 0;
        }

        if (valA === valB) return 0;
        return multiplier * (valA > valB ? 1 : -1);
    });
}

/**
 * Handle sort header click
 */
function handleSortClick(markets, column, container) {
    // Toggle direction if same column, otherwise keep current order (stable sort)
    if (activitySortState.column === column) {
        activitySortState.direction = activitySortState.direction === 'desc' ? 'asc' : 'desc';
    } else {
        // New column - default to desc for most, asc for question
        activitySortState.column = column;
        activitySortState.direction = column === 'question' ? 'asc' : 'desc';
    }

    const sorted = sortMarkets(markets, column, activitySortState.direction);
    renderActivityFeed(container, sorted, markets);
}

/**
 * Render the market activity feed
 * @param {Element} container - DOM container
 * @param {Array} markets - Markets to display (possibly sorted)
 * @param {Array} originalMarkets - Original unsorted markets (for re-sorting)
 */
function renderActivityFeed(container, markets, originalMarkets = null) {
    if (markets.length === 0) {
        container.innerHTML = '<p class="loading">No market activity.</p>';
        return;
    }

    // Keep reference to original for re-sorting
    const marketsRef = originalMarkets || markets;

    const rows = markets.map(market => {
        const cardCount = market.cardIds.length;
        const question = truncate(market.question, 50);

        // Determine display based on resolution status
        if (market.isResolved) {
            const resIcon = market.resolution === 'YES' ? '&#x2705;' :
                           market.resolution === 'NO' ? '&#x274C;' : '&#x2753;';
            const resText = market.resolution || 'N/A';

            return `
                <div class="activity-row resolved" data-slug="${market.slug}">
                    <span class="activity-icon">${resIcon}</span>
                    <a href="${market.url}" target="_blank" class="activity-question">${question}</a>
                    <span class="activity-prob resolved-${resText.toLowerCase()}">${resText}</span>
                    <span class="activity-change">RESOLVED</span>
                    <span class="activity-range"></span>
                    <span class="activity-cards" title="${market.cardHandles.map(h => '@' + h).join(', ')}">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
                </div>
            `;
        }

        // Active market with 24h stats
        const prob = (market.currentProb * 100).toFixed(0);
        const stats = market.stats;

        let changeHtml = '<span class="activity-change">-</span>';
        let rangeHtml = '<span class="activity-range"></span>';
        let icon = '&#x2796;'; // neutral dash

        if (stats && stats.change24h !== null) {
            const changePct = (stats.change24h * 100).toFixed(1);
            const sign = stats.change24h >= 0 ? '+' : '';
            const changeClass = stats.change24h > 0 ? 'positive' : stats.change24h < 0 ? 'negative' : '';

            if (Math.abs(stats.change24h) >= 0.01) {
                icon = stats.change24h > 0 ? '&#x1F4C8;' : '&#x1F4C9;'; // chart up/down
            }

            changeHtml = `<span class="activity-change ${changeClass}">${sign}${changePct}%</span>`;

            if (stats.high24h !== null && stats.low24h !== null) {
                const low = (stats.low24h * 100).toFixed(0);
                const high = (stats.high24h * 100).toFixed(0);
                if (low !== high) {
                    rangeHtml = `<span class="activity-range">${low}-${high}%</span>`;
                }
            }
        }

        return `
            <div class="activity-row" data-slug="${market.slug}">
                <span class="activity-icon">${icon}</span>
                <a href="${market.url}" target="_blank" class="activity-question">${question}</a>
                <span class="activity-prob">${prob}%</span>
                ${changeHtml}
                ${rangeHtml}
                <span class="activity-cards" title="${market.cardHandles.map(h => '@' + h).join(', ')}">${cardCount} card${cardCount !== 1 ? 's' : ''}</span>
            </div>
        `;
    }).join('');

    // Helper to render sort indicator
    const sortIndicator = (col) => {
        if (activitySortState.column !== col) return '';
        return activitySortState.direction === 'desc' ? ' &#x25BC;' : ' &#x25B2;';
    };

    container.innerHTML = `
        <div class="activity-header">
            <span class="activity-icon"></span>
            <span class="activity-question sortable" data-sort="question">Market${sortIndicator('question')}</span>
            <span class="activity-prob sortable" data-sort="prob">Prob${sortIndicator('prob')}</span>
            <span class="activity-change sortable" data-sort="change">24h${sortIndicator('change')}</span>
            <span class="activity-range sortable" data-sort="range">Range${sortIndicator('range')}</span>
            <span class="activity-cards sortable" data-sort="cards">Cards${sortIndicator('cards')}</span>
        </div>
        ${rows}
        <div class="activity-footer">
            <span class="activity-info">Showing ${markets.length} markets across all bingo cards</span>
        </div>
    `;

    // Set up click handlers for expandable per-card details and sorting
    setupActivityRowHandlers(marketsRef, container);
}

/**
 * Set up click handlers for activity rows and sort headers
 */
function setupActivityRowHandlers(markets, container) {
    // Sort header click handlers
    const sortables = container.querySelectorAll('.sortable');
    sortables.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            handleSortClick(markets, column, container);
        });
    });

    // Row expansion click handlers
    const rows = container.querySelectorAll('.activity-row');
    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            // Don't trigger on link clicks
            if (e.target.tagName === 'A') return;

            const slug = row.dataset.slug;
            const market = markets.find(m => m.slug === slug);
            if (!market) return;

            // Toggle expanded state
            const existing = row.querySelector('.activity-expansion');
            if (existing) {
                existing.remove();
                row.classList.remove('expanded');
                return;
            }

            // Create expansion panel
            const expansion = document.createElement('div');
            expansion.className = 'activity-expansion';
            expansion.innerHTML = `
                <div class="expansion-header">Cards containing this market:</div>
                ${market.cardIds.map((cardId, i) => `
                    <a href="card.html?id=${cardId}" class="expansion-card">
                        @${market.cardHandles[i]}
                    </a>
                `).join('')}
            `;

            row.appendChild(expansion);
            row.classList.add('expanded');
        });
    });
}

// ============================================================================
// LIVE PRICE FUNCTIONS
// ============================================================================

/**
 * Fetch live prices for all markets on the card
 */
async function fetchLivePrices(card) {
    const loadingEl = document.getElementById('live-status');
    if (loadingEl) {
        loadingEl.textContent = 'Fetching live prices...';
        loadingEl.className = 'live-status loading';
    }

    try {
        // Fetch all 25 markets in parallel
        const promises = card.grid.map(cell =>
            fetch(`${MANIFOLD_API}/slug/${cell.slug}?lite=true`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        );

        const results = await Promise.all(promises);

        // Update cells with live data and store contract IDs
        const liveProbs = [];
        results.forEach((market, i) => {
            if (market) {
                const liveProb = market.probability || market.prob || card.grid[i].prob;
                liveProbs.push(liveProb);
                updateCellWithLivePrice(i, card.grid[i].prob, liveProb);

                // Store contract ID for sparkline use
                card.grid[i].contract_id = market.id;
            } else {
                liveProbs.push(card.grid[i].prob);
            }
        });

        // Recalculate and display live win probability
        const liveWinProb = approximateWinProb(liveProbs);
        updateWinProbability(card.win_probability, liveWinProb);

        // Update line probabilities with live prices
        updateLineProbs(liveProbs);

        // Set up sparkline handlers now that we have contract IDs
        setupSparklineHandlers();

        if (loadingEl) {
            loadingEl.textContent = 'Live prices loaded (click cells for price history)';
            loadingEl.className = 'live-status success';
            setTimeout(() => { loadingEl.textContent = ''; }, 3000);
        }
    } catch (error) {
        console.error('Failed to fetch live prices:', error);
        if (loadingEl) {
            loadingEl.textContent = 'Failed to load live prices';
            loadingEl.className = 'live-status error';
        }
    }
}

/**
 * Update a single cell with live price data
 */
function updateCellWithLivePrice(index, storedProb, liveProb) {
    const cell = document.querySelector(`.bingo-cell[data-index="${index}"]`);
    if (!cell) return;

    const probEl = cell.querySelector('.prob');
    const deltaEl = cell.querySelector('.delta');

    const storedPct = storedProb * 100;
    const livePct = liveProb * 100;
    const deltaPct = livePct - storedPct;

    // Update probability display
    probEl.textContent = `${livePct.toFixed(0)}%`;

    // Show delta if significant (>= 1%)
    if (Math.abs(deltaPct) >= 1) {
        const sign = deltaPct > 0 ? '+' : '';
        deltaEl.textContent = `${sign}${deltaPct.toFixed(0)}`;
        deltaEl.className = deltaPct > 0 ? 'delta up' : 'delta down';

        // Add hot indicator for large moves (>= 5%)
        if (Math.abs(deltaPct) >= 5) {
            cell.classList.add(deltaPct > 0 ? 'hot-up' : 'hot-down');
        }
    }
}

/**
 * Update win probability display with live value
 */
function updateWinProbability(storedProb, liveProb) {
    const valueEl = document.getElementById('win-prob-value');
    const noteEl = document.getElementById('win-prob-note');

    if (!valueEl || !noteEl) return;

    const storedPct = storedProb * 100;
    const livePct = liveProb * 100;
    const deltaPct = livePct - storedPct;

    valueEl.textContent = `${livePct.toFixed(1)}%`;

    if (Math.abs(deltaPct) >= 0.5) {
        const sign = deltaPct > 0 ? '+' : '';
        const deltaClass = deltaPct > 0 ? 'up' : 'down';
        noteEl.innerHTML = `<span class="delta ${deltaClass}">${sign}${deltaPct.toFixed(1)}% from creation</span>`;
    } else {
        noteEl.textContent = '(live)';
    }
}

/**
 * Approximate win probability using line independence assumption
 * P(win) = 1 - P(all 12 lines fail)
 * P(line fails) = 1 - P(all 5 cells resolve YES)
 */
function approximateWinProb(probs) {
    let probAllLinesFail = 1;

    for (const line of LINES) {
        // P(this line completes) = product of all 5 cell probs
        let lineProb = 1;
        for (const idx of line.indices) {
            lineProb *= probs[idx];
        }
        // P(this line fails) = 1 - P(line completes)
        probAllLinesFail *= (1 - lineProb);
    }

    return 1 - probAllLinesFail;
}

// ============================================================================
// DISPLAY PREFERENCES
// ============================================================================

/**
 * Get display preferences from localStorage
 */
function getPrefs() {
    try {
        const stored = localStorage.getItem(PREFS_KEY);
        return stored ? JSON.parse(stored) : { fullTitles: false };
    } catch (e) {
        return { fullTitles: false };
    }
}

/**
 * Save display preference
 */
function setPref(key, value) {
    try {
        const prefs = getPrefs();
        prefs[key] = value;
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.warn('Failed to save preference:', e);
    }
}

/**
 * Toggle title display mode and re-render grid
 */
function toggleTitleDisplay() {
    const prefs = getPrefs();
    const newValue = !prefs.fullTitles;
    setPref('fullTitles', newValue);

    // Update button text
    const btn = document.getElementById('title-toggle');
    if (btn) {
        btn.textContent = newValue ? 'Short Titles' : 'Full Titles';
    }

    // Re-render grid
    if (currentCard) {
        const gridEl = document.getElementById('bingo-grid');
        gridEl.innerHTML = currentCard.grid.map((cell, i) => createBingoCell(cell, i)).join('');

        // Re-setup sparkline handlers
        setupSparklineHandlers();
    }
}

/**
 * Set up display toggle controls
 */
function setupDisplayControls() {
    const btn = document.getElementById('title-toggle');
    if (btn) {
        const prefs = getPrefs();
        btn.textContent = prefs.fullTitles ? 'Short Titles' : 'Full Titles';
        btn.addEventListener('click', toggleTitleDisplay);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get CSS class for status
 */
function getStatusClass(status) {
    switch (status) {
        case 'active':
        case 'pending_fill':
            return 'active';
        case 'resolved_yes':
            return 'winner';
        case 'resolved_no':
            return 'loser';
        default:
            return '';
    }
}

/**
 * Get display text for status
 */
function getStatusText(status) {
    switch (status) {
        case 'pending_fill':
            return 'Pending';
        case 'active':
            return 'Active';
        case 'resolved_yes':
            return 'Winner!';
        case 'resolved_no':
            return 'No Bingo';
        default:
            return status;
    }
}

/**
 * Truncate text to max length
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Smart truncate - break on word boundaries when possible
 */
function smartTruncate(text, maxLength) {
    if (text.length <= maxLength) return text;

    // Try to break at a word boundary
    const truncated = text.substring(0, maxLength - 1);
    const lastSpace = truncated.lastIndexOf(' ');

    // If we found a space in the second half, break there
    if (lastSpace > maxLength * 0.4) {
        return truncated.substring(0, lastSpace) + '...';
    }

    // Otherwise just truncate
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize on page load (for index page)
if (document.getElementById('card-grid')) {
    loadCardsIndex();
}
