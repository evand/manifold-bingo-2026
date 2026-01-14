/**
 * Manifold Bingo 2026 - Viewer Application
 *
 * Loads and displays bingo card data from JSON files.
 * Works as a static site (no server required).
 */

// Configuration
const DATA_PATH = 'cards/';
const INDEX_FILE = 'index.json';

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

        displayStats(data);
        displayCardsList(data.cards);
    } catch (error) {
        console.error('Failed to load cards index:', error);
        document.getElementById('card-grid').innerHTML =
            '<p class="loading">Failed to load cards. Check console for details.</p>';
    }
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

        displayCard(card);
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
    document.getElementById('card-prob').textContent =
        `Win Probability: ${(card.win_probability * 100).toFixed(1)}%`;

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
           class="${cellClass}" title="${cell.question || ''}">
            <div class="question">${question}</div>
            <div class="prob">${prob}%</div>
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

// Initialize on page load (for index page)
if (document.getElementById('card-grid')) {
    loadCardsIndex();
}
