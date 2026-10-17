// Replace this with your EXACT live Render backend URL from your Render dashboard
const BACKEND_URL = 'https://pingpulse-backend.onrender.com'
const form = document.getElementById('checkForm');
const urlInput = document.getElementById('urlInput');
const submitBtn = document.getElementById('submitBtn');
const inputError = document.getElementById('inputError');
const autoRefresh = document.getElementById('autoRefresh');
const recentSearches = document.getElementById('recentSearches');
const recentSearchChips = document.getElementById('recentSearchChips');

const resultCard = document.getElementById('resultCard');
const targetUrl = document.getElementById('targetUrl');
const statusBadge = document.getElementById('statusBadge');
const statusCode = document.getElementById('statusCode');
const responseTime = document.getElementById('responseTime');
const checkTime = document.getElementById('checkTime');
const sslBadge = document.getElementById('sslBadge');
const sslExpiresInDays = document.getElementById('sslExpiresInDays');
const sslIssuer = document.getElementById('sslIssuer');
const sslError = document.getElementById('sslError');
const statusHistoryTicker = document.getElementById('statusHistoryTicker');
const RECENT_SEARCHES_KEY = 'pingpulse.recentSearches';
const MAX_RECENT_SEARCHES = 5;
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const MAX_STATUS_HISTORY = 5;

let recentUrls = loadRecentUrls();
const statusHistory = [];
let refreshTimer = null;
let lastSuccessfulUrl = null;
let isChecking = false;

function formatAndValidateUrl(input) {
  const trimmedInput = input.trim().replace(/^(?:ping|check)\s+/i, '');
  const formattedUrl = /^[a-z][a-z\d+.-]*:/i.test(trimmedInput)
    ? trimmedInput
    : `https://${trimmedInput}`;

  try {
    const parsedUrl = new URL(formattedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
      return null;
    }
    return parsedUrl.href;
  } catch {
    return null;
  }
}

function loadRecentUrls() {
  try {
    const savedUrls = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    if (!Array.isArray(savedUrls)) {
      return [];
    }
    return savedUrls
      .filter((url) => typeof url === 'string' && formatAndValidateUrl(url) === url)
      .slice(0, MAX_RECENT_SEARCHES);
  } catch (error) {
    console.error('Could not load recent searches from localStorage.', error);
    return [];
  }
}

function renderRecentUrls() {
  recentSearchChips.replaceChildren();
  recentSearches.classList.toggle('hidden', recentUrls.length === 0);

  recentUrls.forEach((url) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'search-chip';
    chip.textContent = url;
    chip.addEventListener('click', () => {
      urlInput.value = url;
      form.requestSubmit();
    });
    recentSearchChips.appendChild(chip);
  });
}

function saveRecentUrl(url) {
  recentUrls = [url, ...recentUrls.filter((recentUrl) => recentUrl !== url)]
    .slice(0, MAX_RECENT_SEARCHES);
  renderRecentUrls();

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentUrls));
  } catch (error) {
    console.error('Could not save recent searches to localStorage.', error);
  }
}

function renderStatusHistory() {
  statusHistoryTicker.replaceChildren();

  statusHistory.forEach((result, index) => {
    const block = document.createElement('span');
    const statusClass = result.status.toLowerCase();
    block.className = `status-history-block ${statusClass}`;
    block.setAttribute('role', 'listitem');
    block.setAttribute('aria-label', `Check ${index + 1}: ${result.status}, status ${result.statusCode}`);
    block.title = `${result.status} (${result.statusCode}) at ${result.checkedAt.toLocaleTimeString()}`;
    statusHistoryTicker.appendChild(block);
  });
}

function addStatusHistoryResult(data) {
  statusHistory.unshift({
    status: ['ONLINE', 'DEGRADED', 'OFFLINE'].includes(data.status) ? data.status : 'OFFLINE',
    statusCode: data.statusCode,
    checkedAt: new Date(data.timestamp)
  });
  statusHistory.length = Math.min(statusHistory.length, MAX_STATUS_HISTORY);
  renderStatusHistory();
}

function stopAutoRefresh() {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!autoRefresh.checked || !lastSuccessfulUrl) {
    return;
  }

  refreshTimer = setInterval(() => {
    if (!isChecking) {
      checkUrl(lastSuccessfulUrl, true);
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}

async function checkUrl(url, isAutomatic = false) {
  if (isChecking) {
    return;
  }

  isChecking = true;
  if (!isAutomatic) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Checking...';
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}.`);
    }

    const data = await response.json();

    targetUrl.innerText = data.url;
    statusCode.innerText = data.statusCode;
    responseTime.innerText = data.responseTimeMs;
    checkTime.innerText = new Date(data.timestamp).toLocaleTimeString();

    statusBadge.innerText = data.status;
    statusBadge.className = 'badge ' + data.status.toLowerCase();
    const sslNotApplicable = data.issuer === 'Not applicable';
    sslBadge.innerText = sslNotApplicable
      ? 'Not applicable'
      : data.sslValid ? 'Valid' : 'Invalid / unavailable';
    sslBadge.className = `ssl-badge ${sslNotApplicable ? 'not-applicable' : data.sslValid ? 'valid' : 'invalid'}`;
    sslExpiresInDays.innerText = Number.isFinite(data.expiresInDays)
      ? `${data.expiresInDays} ${data.expiresInDays === 1 ? 'day' : 'days'}`
      : 'Not available';
    sslIssuer.innerText = data.issuer || 'Not available';
    sslError.innerText = data.sslError || '';
    sslError.classList.toggle('hidden', !data.sslError);

    resultCard.classList.remove('hidden');
    addStatusHistoryResult(data);
    lastSuccessfulUrl = url;
    saveRecentUrl(url);
    inputError.classList.add('hidden');
    startAutoRefresh();
  } catch (error) {
    console.error('Health check failed.', error);
    if (isAutomatic) {
      inputError.innerText = 'Auto-refresh failed. Check your connection and try again.';
      inputError.classList.remove('hidden');
    } else {
      alert('Failed to connect to backend server. Make sure it is running.');
    }
  } finally {
    isChecking = false;
    if (!isAutomatic) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Check Health';
    }
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const url = formatAndValidateUrl(urlInput.value);
  if (!url) {
    inputError.innerText = 'Enter a valid website address, such as google.com or https://google.com.';
    inputError.classList.remove('hidden');
    return;
  }
  inputError.classList.add('hidden');

  stopAutoRefresh();
  checkUrl(url);
});

autoRefresh.addEventListener('change', () => {
  startAutoRefresh();
});

renderRecentUrls();