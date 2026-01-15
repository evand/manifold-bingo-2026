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
        displayHotCards(data.cards);
        setupTabs();

        // Auto-save baseline on first visit
        const lastSeen = getLastSeenProbs();
        if (Object.keys(lastSeen).length === 0) {
            saveLastSeenProbs(data.cards);
        }
    } catch (error) {
        console.error('Failed to load cards index:', error);
        document.getElementById('card-grid').innerHTML =
            '<p class="loading">Failed to load cards. Check console for details.</p>';
    }
}

/**
 * Set up tab switching for index page
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.view-tabs .tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding view
            const view = tab.dataset.view;
            document.getElementById('grid-view').style.display =
                view === 'grid' ? 'block' : 'none';
            document.getElementById('leaderboard-view').style.display =
                view === 'leaderboard' ? 'block' : 'none';
            document.getElementById('hot-cards-view').style.display =
                view === 'hot' ? 'block' : 'none';
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
 * Display leaderboard sorted by win probability
 */
function displayLeaderboard(cards) {
    const leaderboard = document.getElementById('leaderboard');
    if (!leaderboard) return;

    if (!cards || cards.length === 0) {
        leaderboard.innerHTML = '<p class="loading">No cards yet.</p>';
        return;
    }

    // Filter to active cards and sort by win probability
    const activeCards = cards
        .filter(c => c.status === 'active')
        .sort((a, b) => b.win_probability - a.win_probability);

    const rows = activeCards.map((card, i) => {
        const winProb = (card.win_probability * 100).toFixed(1);
        const purchaseProb = (card.purchase_prob * 100).toFixed(0);
        const edge = ((card.win_probability - card.purchase_prob) * 100).toFixed(1);
        const edgeClass = edge >= 0 ? 'positive' : 'negative';
        const edgeSign = edge >= 0 ? '+' : '';

        return `
            <a href="card.html?id=${card.card_id}" class="leaderboard-row">
                <span class="rank">#${i + 1}</span>
                <span class="handle">@${card.user_handle}</span>
                <span class="win-prob">${winProb}%</span>
                <span class="edge ${edgeClass}">${edgeSign}${edge}%</span>
            </a>
        `;
    }).join('');

    leaderboard.innerHTML = `
        <div class="leaderboard-header">
            <span class="rank"></span>
            <span class="handle">Player</span>
            <span class="win-prob">Win %</span>
            <span class="edge">Edge</span>
        </div>
        ${rows}
    `;
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

    // Lines progress
    const linesEl = document.getElementById('lines-progress');
    linesEl.innerHTML = LINES.map(line => createLineStatus(line, card.grid)).join('');

    // Details
    document.getElementById('card-owner').textContent = `@${card.user_handle}`;
    document.getElementById('card-created').textContent =
        formatDate(card.created_time);
    document.getElementById('card-price').textContent =
        `M$${card.purchase_price?.toFixed(0) || '-'}`;
    document.getElementById('card-target').textContent =
        `${((card.target_win_prob || 0) * 100).toFixed(1)}%`;
}

/**
 * Create HTML for a bingo cell
 */
function createBingoCell(cell, index) {
    let cellClass = 'bingo-cell';
    if (index === FREE_SPACE_INDEX) cellClass += ' free';
    else if (cell.resolved === true) cellClass += ' yes';
    else if (cell.resolved === false) cellClass += ' no';

    const question = truncate(cell.question || 'Unknown', 60);
    const prob = ((cell.prob || 0.5) * 100).toFixed(0);

    const marketUrl = cell.url
        || (cell.slug ? `https://manifold.markets/${cell.slug}` : '#');

    return `
        <a href="${marketUrl}" target="_blank"
           class="${cellClass}" title="${cell.question || ''}"
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
 * Create HTML for line status
 */
function createLineStatus(line, grid) {
    const cells = line.indices.map(i => grid[i]);
    const yesCount = cells.filter(c => c.resolved === true).length;
    const noCount = cells.filter(c => c.resolved === false).length;

    let statusClass = '';
    let progress = '';

    if (yesCount === 5) {
        statusClass = 'complete';
        progress = 'BINGO!';
    } else if (noCount > 0) {
        statusClass = 'blocked';
        progress = `${yesCount}/5 (blocked)`;
    } else {
        progress = `${yesCount}/5`;
    }

    return `
        <div class="line-item ${statusClass}">
            <div class="line-name">${line.name}</div>
            <div class="line-progress">${progress}</div>
        </div>
    `;
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

        // Update cells with live data
        const liveProbs = [];
        results.forEach((market, i) => {
            if (market) {
                const liveProb = market.probability || market.prob || card.grid[i].prob;
                liveProbs.push(liveProb);
                updateCellWithLivePrice(i, card.grid[i].prob, liveProb);
            } else {
                liveProbs.push(card.grid[i].prob);
            }
        });

        // Recalculate and display live win probability
        const liveWinProb = approximateWinProb(liveProbs);
        updateWinProbability(card.win_probability, liveWinProb);

        if (loadingEl) {
            loadingEl.textContent = 'Live prices loaded';
            loadingEl.className = 'live-status success';
            setTimeout(() => { loadingEl.textContent = ''; }, 2000);
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
