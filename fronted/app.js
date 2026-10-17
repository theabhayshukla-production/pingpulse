// REPLACE THIS URL with your deployed Render backend URL after Step 2
const BACKEND_URL = 'http://localhost:5000'; 

const form = document.getElementById('checkForm');
const urlInput = document.getElementById('urlInput');
const submitBtn = document.getElementById('submitBtn');

const resultCard = document.getElementById('resultCard');
const targetUrl = document.getElementById('targetUrl');
const statusBadge = document.getElementById('statusBadge');
const statusCode = document.getElementById('statusCode');
const responseTime = document.getElementById('responseTime');
const checkTime = document.getElementById('checkTime');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const url = urlInput.value.trim();
  if (!url) return;

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