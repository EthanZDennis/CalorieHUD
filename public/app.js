let currentUser = 'husband';
let weightChartInstance = null;
let calChartInstance = null;
const GOALS = { husband: 4000, wife: 2000 };

function init() { setUser('husband'); }

function setUser(user) {
  currentUser = user;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(user === 'husband' ? 'tabHusband' : 'tabWife').classList.add('active');
  document.getElementById('goalDisplay').innerText = GOALS[user];
  const tz = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
  document.getElementById('mDate').value = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  loadStats();
}

async function loadStats() {
  const res = await fetch(`/api/stats?user=${currentUser}`);
  const data = await res.json();
  const goal = GOALS[currentUser];
  const pct = Math.min(100, Math.round((data.totalCals / goal) * 100));

  document.getElementById('consumedDisplay').innerText = data.totalCals;
  document.getElementById('remainingDisplay').innerText = Math.max(0, goal - data.totalCals) + " kcal left";
  document.getElementById('percentDisplay').innerText = pct + "%";
  document.getElementById('progressBar').style.width = pct + "%";
  document.getElementById('weightDisplay').innerText = data.lastWeight || '--';
  
  renderCharts(data);
  renderHistory(data.recentLogs);
}

async function handlePhoto(input) {
  if (!input.files || !input.files[0]) return;
  const btn = document.getElementById('photoBtn');
  const originalText = btn.innerText;
  
  btn.innerText = "⌛ Uploading...";
  const file = input.files[0];
  const formData = new FormData();
  formData.append('photo', file); 
  formData.append('user', currentUser);

  try {
    const res = await fetch('/api/log/photo', { method: 'POST', body: formData });
    const data = await res.json();
    
    if (data && data.item) {
      alert(`Logged: ${data.item} (${data.calories} kcal)`);
      loadStats();
    } else {
      alert("AI was unsure. Try another angle.");
    }
  } catch (err) {
    alert("Upload failed.");
  } finally {
    btn.innerText = originalText;
  }
}

// ... include your existing renderCharts and renderHistory functions
