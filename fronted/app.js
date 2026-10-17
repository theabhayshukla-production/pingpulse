// Replace this with your EXACT live Render backend URL from your Render dashboard
const BACKEND_URL = 'https://pingpulse-backend.onrender.com'
const form = document.getElementById('checkForm');
const urlInput = document.getElementById('urlInput');
const submitBtn = document.getElementById('submitBtn');
const inputError = document.getElementById('inputError');

const resultCard = document.getElementById('resultCard');
const targetUrl = document.getElementById('targetUrl');
const statusBadge = document.getElementById('statusBadge');
const statusCode = document.getElementById('statusCode');
const responseTime = document.getElementById('responseTime');
const checkTime = document.getElementById('checkTime');

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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const url = formatAndValidateUrl(urlInput.value);
  if (!url) {
    inputError.innerText = 'Enter a valid website address, such as google.com or https://google.com.';
    inputError.classList.remove('hidden');
    return;
  }
  inputError.classList.add('hidden');

  submitBtn.disabled = true;
  submitBtn.innerText = 'Checking...';

  try {
    const response = await fetch(`${BACKEND_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await response.json();

    // Render output
    targetUrl.innerText = data.url;
    statusCode.innerText = data.statusCode;
    responseTime.innerText = data.responseTimeMs;
    checkTime.innerText = new Date(data.timestamp).toLocaleTimeString();

    statusBadge.innerText = data.status;
    statusBadge.className = 'badge ' + data.status.toLowerCase();

    resultCard.classList.remove('hidden');
  } catch (error) {
    alert('Failed to connect to backend server. Make sure it is running.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Check Health';
  }
});