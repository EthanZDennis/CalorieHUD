// public/app.js
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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  document.getElementById('mDate').value = today;
  document.getElementById('weightDate').value = today;
  loadStats();
}

async function loadStats() {
  const res = await fetch(`/api/stats?user=${currentUser}`);
  const data = await res.json();
  document.getElementById('consumedDisplay').innerText = data.totalCals;
  document.getElementById('weightDisplay').innerText = data.lastWeight || '--';
  const pct = Math.min(100, (data.totalCals / GOALS[currentUser]) * 100);
  document.getElementById('progressBar').style.width = pct + '%';
  renderCharts(data);
  renderHistory(data.recentLogs);
}

function renderCharts(data) {
  const viewMode = document.getElementById('viewSelector').value;
  const labels = [];
  const calValues = [];
  const weightPoints = [];
  const goalLine = [];
  let start = new Date();
  
  if(viewMode === 'rolling') start.setDate(start.getDate() - 29);
  else start = new Date(2026, 0, 1);

  for(let i=0; i < 31; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    if(viewMode !== 'rolling' && d.getMonth() !== 0) break;
    const l = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    labels.push(l);
    
    // Calorie Data
    const cIdx = data.chartData.labels.indexOf(d.toLocaleDateString("en-CA"));
    calValues.push(cIdx > -1 ? data.chartData.values[cIdx] : 0);
    goalLine.push(GOALS[currentUser]);

    // Weight Data - Day Only Sync
    const weightMatch = (data.weightHistory || []).find(w => w.x === d.toLocaleDateString("en-CA"));
    if(weightMatch) weightPoints.push({ x: l, y: weightMatch.y });
  }

  // Draw Calorie Chart
  const ctxCal = document.getElementById('calChart').getContext('2d');
  if(calChartInstance) calChartInstance.destroy();
  calChartInstance = new Chart(ctxCal, {
    type: 'bar',
    data: { labels, datasets: [
      { type: 'line', data: goalLine, borderColor: '#ef4444', borderDash:[5,5], pointRadius:0 },
      { data: calValues, backgroundColor: '#6366f1', borderRadius: 6, barThickness: 35 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // Draw Weight Chart
  const ctxW = document.getElementById('weightChart').getContext('2d');
  if(weightChartInstance) weightChartInstance.destroy();
  weightChartInstance = new Chart(ctxW, {
    type: 'line',
    data: { labels, datasets: [{ 
      data: labels.map(l => {
        const p = weightPoints.find(pt => pt.x === l);
        return p ? p.y : null;
      }), 
      borderColor: '#10b981', 
      spanGaps: true 
    }]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

async function submitManual() { 
  const btn = document.getElementById('logBtn');
  btn.disabled = true;
  const body = { 
    user: currentUser, 
    item: "Manual " + document.getElementById('mCategory').value, 
    calories: document.getElementById('mCals').value, 
    protein: document.getElementById('mProt').value, 
    category: document.getElementById('mCategory').value, 
    date: document.getElementById('mDate').value 
  };
  await fetch("/api/log/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  
  // Auto-Close Fix
  document.getElementById('mCals').value = "";
  btn.disabled = false;
  setMode('photo'); 
  loadStats();
}

function setMode(m) {
  document.getElementById('modePhoto').classList.toggle('hidden', m!=='photo');
  document.getElementById('modeManual').classList.toggle('hidden', m!=='manual');
  document.getElementById('btnModePhoto').classList.add('active'); // simplified toggle
  document.getElementById('btnModeManual').classList.remove('active');
}
// ... remaining helper functions (toggleWeight, submitWeight, etc.)

