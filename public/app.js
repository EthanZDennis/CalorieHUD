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
  loadStats();
}

async function loadStats() {
  const res = await fetch(`/api/stats?user=${currentUser}`);
  const data = await res.json();
  
  const consumed = data.totalCals;
  const goal = GOALS[currentUser];
  const remaining = Math.max(0, goal - consumed);
  const pct = Math.min(100, Math.round((consumed / goal) * 100));

  document.getElementById('consumedDisplay').innerText = consumed;
  // These IDs must match your index.html spans
  if(document.getElementById('remainingDisplay')) {
    document.getElementById('remainingDisplay').innerText = remaining + " kcal left";
  }
  document.getElementById('weightDisplay').innerText = data.lastWeight || '--';
  document.getElementById('progressBar').style.width = pct + '%';
  
  renderCharts(data);
  renderHistory(data.recentLogs);
}

async function handlePhoto(input) {
  if (!input.files || !input.files[0]) return;
  const btn = document.getElementById('photoBtn');
  const originalText = btn.innerText;
  btn.innerText = "⌛ Shrinking...";

  const file = input.files[0];
  const img = new Image();
  img.src = URL.createObjectURL(file);

  img.onload = () => {
    const canvas = document.createElement('canvas');
    // HIGH RESOLUTION for Live Photo clarity
    const MAX_WIDTH = 2000; 
    const scale = MAX_WIDTH / img.width;
    canvas.width = MAX_WIDTH;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      btn.innerText = "⌛ Analyzing...";
      const formData = new FormData();
      formData.append('photo', blob, 'shrunk.jpg');
      formData.append('user', currentUser);
      try {
        const res = await fetch('/api/log/photo', { method: 'POST', body: formData });
        const data = await res.json();
        
        // FIX for the "undefined" error
        if (data && data.item && data.calories !== undefined) {
          alert(`Logged: ${data.item} (${data.calories} kcal)`);
          loadStats();
        } else {
          alert("AI was unsure. Please try a clearer photo or log manually.");
        }
      } catch (err) { 
        alert("Upload failed. Check your connection."); 
      } finally {
        btn.innerText = originalText;
      }
    }, 'image/jpeg', 0.95); // HIGH QUALITY boost for AI identification
  };
}

function renderCharts(data) {
  const labels = []; const calValues = []; const weightPoints = []; const goalLine = [];
  const tz = currentUser === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
  let start = new Date(new Date().toLocaleString("en-US", {timeZone: tz}));
  start.setDate(start.getDate() - 29);

  for(let i=0; i < 30; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const isoDate = d.toLocaleDateString("en-CA");
    const displayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    labels.push(displayLabel);
    goalLine.push(GOALS[currentUser]);

    let daySum = 0;
    data.chartData.labels.forEach((l, idx) => {
      if (l === isoDate) daySum += data.chartData.values[idx];
    });
    calValues.push(daySum);

    const weightMatch = (data.weightHistory || []).find(w => w.x === isoDate);
    if(weightMatch) weightPoints.push({ x: displayLabel, y: weightMatch.y });
  }

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

  const ctxW = document.getElementById('weightChart').getContext('2d');
  if(weightChartInstance) weightChartInstance.destroy();
  weightChartInstance = new Chart(ctxW, {
    type: 'line',
    data: { labels, datasets: [{ 
      data: labels.map(l => (weightPoints.find(p => p.x === l) || {}).y || null), 
      borderColor: '#10b981', spanGaps: true 
    }]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 135 }} }
  });
}

function renderHistory(logs) {
  const list = document.getElementById('historyList');
  if(!list) return;
  list.innerHTML = logs.map(i => `
    <div class="history-item">
      <div><b>${i.item}</b><br><small>${new Date(i.timestamp).toLocaleTimeString()}</small></div>
      <div><b>${i.calories} kcal</b> <span style="cursor:pointer" onclick="deleteLog('${i.id}')">🗑️</span></div>
    </div>
  `).join('');
}

async function submitManual() { 
  const val = document.getElementById('mCals').value;
  const isWeight = document.getElementById('mCals').placeholder === "Weight";
  const body = isWeight 
    ? { user: currentUser, weight: val, date: document.getElementById('mDate').value }
    : { user: currentUser, item: "Manual Log", calories: val, protein: document.getElementById('mProt').value, date: document.getElementById('mDate').value };
  
  await fetch(isWeight ? "/api/weight" : "/api/log/manual", { 
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) 
  });
  
  document.getElementById('mCals').value = "";
  document.getElementById('modeManual').classList.add('hidden');
  loadStats();
}

async function deleteLog(id) { 
  if(confirm("Delete?")) { 
    await fetch(`/api/log/${id}`, { 
      method: 'DELETE', body: JSON.stringify({ user: currentUser }), headers: {'Content-Type':'application/json'} 
    }); 
    loadStats(); 
  } 
}

function setMode(m) { 
  document.getElementById('modeManual').classList.toggle('hidden', m!=='manual'); 
}

function toggleWeight() { 
  document.getElementById('modeManual').classList.remove('hidden'); 
  document.getElementById('mCals').placeholder="Weight"; 
}
