import { checkUrl as requestCheck, createMonitor, deleteMonitor, getMonitors } from './api.js';

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
const monitorForm = document.getElementById('monitorForm');
const monitorAuthForm = document.getElementById('monitorAuthForm');
const monitorAccessKey = document.getElementById('monitorAccessKey');
const unlockMonitorsBtn = document.getElementById('unlockMonitorsBtn');
const monitorAuthMessage = document.getElementById('monitorAuthMessage');
const monitorContent = document.getElementById('monitorContent');
const monitorNameInput = document.getElementById('monitorName');
const monitorUrlInput = document.getElementById('monitorUrl');
const monitorInterval = document.getElementById('monitorInterval');
const addMonitorBtn = document.getElementById('addMonitorBtn');
const monitorMessage = document.getElementById('monitorMessage');
const monitorList = document.getElementById('monitorList');
const RECENT_SEARCHES_KEY = 'pingpulse.recentSearches';
const MAX_RECENT_SEARCHES = 5;
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const MAX_STATUS_HISTORY = 5;

let recentUrls = loadRecentUrls();
const statusHistory = [];
let refreshTimer = null;
let lastSuccessfulUrl = null;
let isChecking = false;
let isLoadingMonitors = false;

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

function showMonitorMessage(message, isError = false) {
  monitorMessage.textContent = message;
  monitorMessage.classList.toggle('hidden', !message);
  monitorMessage.classList.toggle('error', isError);
}

function renderMonitors(monitors) {
  monitorList.replaceChildren();

  if (monitors.length === 0) {
    const emptyState = document.createElement('p');
    emptyState.className = 'monitor-empty';
    emptyState.textContent = 'No monitors yet. Add a website or API above to get started.';
    monitorList.appendChild(emptyState);
    return;
  }

  monitors.forEach((monitor) => {
    const card = document.createElement('article');
    card.className = 'monitor-card';

    const details = document.createElement('div');
    details.className = 'monitor-details';
    const name = document.createElement('h3');
    name.textContent = monitor.name;
    const url = document.createElement('p');
    url.className = 'monitor-url';
    url.textContent = monitor.url;
    details.append(name, url);

    const summary = document.createElement('div');
    summary.className = 'monitor-summary';
    const status = document.createElement('span');
    const statusClass = monitor.last_status ? monitor.last_status.toLowerCase() : 'pending';
    status.className = `monitor-status ${statusClass}`;
    status.textContent = monitor.last_status || 'PENDING';
    const lastChecked = document.createElement('span');
    lastChecked.className = 'monitor-last-checked';
    lastChecked.textContent = monitor.latest_checked_at
      ? `Checked ${new Date(monitor.latest_checked_at).toLocaleString()}`
      : `Every ${monitor.interval_minutes} min · waiting for first check`;
    summary.append(status, lastChecked);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'monitor-delete-button';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove ${monitor.name} monitor`);
    removeButton.addEventListener('click', async () => {
      removeButton.disabled = true;
      try {
        await deleteMonitor(monitor.id);
        await loadMonitors();
        showMonitorMessage('Monitor removed.');
      } catch (error) {
        showMonitorMessage(error.message, true);
        removeButton.disabled = false;
      }
    });

    card.append(details, summary, removeButton);
    monitorList.appendChild(card);
  });
}

async function loadMonitors(showLoading = true) {
  if (!sessionStorage.getItem('pingpulse.monitorAccessKey')) {
    return;
  }
  if (isLoadingMonitors) {
    return;
  }
  isLoadingMonitors = true;
  if (showLoading) {
    monitorList.setAttribute('aria-busy', 'true');
    const loadingState = document.createElement('p');
    loadingState.className = 'monitor-loading';
    loadingState.textContent = 'Loading monitors…';
    monitorList.replaceChildren(loadingState);
  }
  try {
    renderMonitors(await getMonitors());
  } catch (error) {
    if (error.code === 'INVALID_MONITOR_KEY') {
      sessionStorage.removeItem('pingpulse.monitorAccessKey');
      monitorContent.hidden = true;
      monitorAuthForm.hidden = false;
      monitorAuthMessage.textContent = error.message;
      monitorAuthMessage.classList.remove('hidden');
      monitorAccessKey.focus();
      return;
    }
    monitorList.replaceChildren();
    const errorState = document.createElement('p');
    errorState.className = 'monitor-empty error';
    errorState.textContent = error.message;
    monitorList.appendChild(errorState);
  } finally {
    isLoadingMonitors = false;
    if (showLoading) {
      monitorList.removeAttribute('aria-busy');
    }
  }
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
    const data = await requestCheck(url);

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
      inputError.innerText = error.message;
      inputError.classList.remove('hidden');
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

monitorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMonitorMessage('');
  addMonitorBtn.disabled = true;
  addMonitorBtn.textContent = 'Adding…';

  try {
    await createMonitor({
      name: monitorNameInput.value.trim(),
      url: monitorUrlInput.value.trim(),
      interval_minutes: Number(monitorInterval.value)
    });
    monitorForm.reset();
    monitorInterval.value = '5';
    await loadMonitors();
    showMonitorMessage('Monitor added. Its first check is queued for the next scheduler run.');
  } catch (error) {
    showMonitorMessage(error.message, true);
  } finally {
    addMonitorBtn.disabled = false;
    addMonitorBtn.textContent = 'Add monitor';
  }
});

monitorAuthForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  unlockMonitorsBtn.disabled = true;
  unlockMonitorsBtn.textContent = 'Checking…';
  monitorAuthMessage.textContent = '';
  monitorAuthMessage.classList.add('hidden');

  const key = monitorAccessKey.value.trim();
  try {
    sessionStorage.setItem('pingpulse.monitorAccessKey', key);
    renderMonitors(await getMonitors());
    monitorAuthForm.hidden = true;
    monitorContent.hidden = false;
    monitorAccessKey.value = '';
  } catch (error) {
    sessionStorage.removeItem('pingpulse.monitorAccessKey');
    monitorAuthMessage.textContent = error.message;
    monitorAuthMessage.classList.remove('hidden');
  } finally {
    unlockMonitorsBtn.disabled = false;
    unlockMonitorsBtn.textContent = 'Unlock monitors';
  }
});

renderRecentUrls();
monitorAuthForm.hidden = Boolean(sessionStorage.getItem('pingpulse.monitorAccessKey'));
monitorContent.hidden = !monitorAuthForm.hidden;
loadMonitors();
setInterval(() => {
  if (!document.hidden) {
    loadMonitors(false);
  }
}, 60_000);