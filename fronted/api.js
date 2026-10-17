const API_BASE_URL = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  ? 'http://localhost:5000'
  : 'https://pingpulse-backend.onrender.com';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const monitorKey = path.startsWith('/api/monitors')
    ? sessionStorage.getItem('pingpulse.monitorAccessKey')
    : null;
  if (monitorKey) {
    headers.set('x-monitor-key', monitorKey);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Could not reach PingPulse. Check your connection and try again.');
  }

  if (response.status === 204) {
    return null;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('PingPulse returned an invalid response. Try again later.');
  }

  if (!response.ok) {
    const error = new Error(data.error && data.error.message || 'The request could not be completed.');
    error.code = data.error && data.error.code;
    throw error;
  }
  return data;
}

export function checkUrl(url) {
  return request('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
}

export async function getMonitors() {
  const data = await request('/api/monitors');
  return data.monitors;
}

export async function createMonitor(monitor) {
  const data = await request('/api/monitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(monitor)
  });
  return data.monitor;
}

export function deleteMonitor(id) {
  return request(`/api/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
