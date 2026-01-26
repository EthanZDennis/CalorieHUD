import express from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

const app = express();
// Limit uploads to 10MB to save RAM
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

// --- CONFIGURATION ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// Using the validated model from your list
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- THE WEBSITE UI ---
const HTML_UI = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>CalorieHUD</title>
  <style>
    :root { --primary: #4f46e5; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; -webkit-tap-highlight-color: transparent; }
    
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .brand { font-size: 24px; font-weight: 800; color: #1e1b4b; letter-spacing: -0.5px; }
    
    .tabs { display: flex; gap: 8px; background: #e0e7ff; padding: 4px; border-radius: 12px; margin-bottom: 24px; }
    .tab { flex: 1; text-align: center; padding: 12px; border-radius: 10px; font-weight: 600; color: #6366f1; cursor: pointer; transition: all 0.2s; font-size: 15px; }
    .tab.active { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.05); color: #1e1b4b; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { background: var(--card); padding: 16px; border-radius: 20px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05); }
    .card-label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .card-value { font-size: 26px; font-weight: 800; color: #0f172a; }
    .unit { font-size: 14px; color: #94a3b8; font-weight: 600; }
    
    .progress-container { background: var(--card); padding: 24px; border-radius: 24px; margin-bottom: 100px; box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05); }
    .bar-bg { background: #f1f5f9; height: 14px; border-radius: 7px; overflow: hidden; margin-top: 12px; }
    .bar-fill { background: linear-gradient(90deg, #f59e0b, #ea580c); height: 100%; width: 26%; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }

    .action-area { background: white; padding: 16px; border-top: 1px solid #f1f5f9; position: fixed; bottom: 0; left: 0; right: 0; padding-bottom: max(20px, env(safe-area-inset-bottom)); box-shadow: 0 -4px 20px rgba(0,0,0,0.05); text-align: center; }
    .upload-btn { background: var(--primary); color: white; width: 100%; padding: 18px; border-radius: 16px; font-size: 18px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transition: transform 0.1s; }
    .upload-btn:active { transform: scale(0.97); }
    
    #fileInput { display: none; }
    #status { margin-top: 12px; font-size: 14px; font-weight: 600; color: #64748b; min-height: 20px; }
    
    .spinner { display: inline-block; width: 16px; height: 16px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s ease-in-out infinite; margin-right: 8px; display: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <div class="header">
    <div class="brand">CalorieHUD 🥩</div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="switchUser('husband')">🇺🇸 Husband</div>
    <div class="tab" onclick="switchUser('wife')">🇯🇵 Wife</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Daily Goal</div>
      <div class="card-value">4000 <span class="unit">kcal</span></div>
    </div>
    <div class="card">
      <div class="card-label">Weight</div>
      <div class="card-value">143 <span class="unit">lbs</span></div>
    </div>
  </div>

  <div class="progress-container">
    <div class="card-label">Consumed Today</div>
    <div class="card-value" id="consumedDisplay">1020 <span class="unit">kcal</span></div>
    <div class="bar-bg">
      <div class="bar-fill" id="progressBar"></div>
    </div>
  </div>

  <div class="action-area">
    <input type="file" id="fileInput" accept="image/*" onchange="uploadPhoto()">
    <button class="upload-btn" id="btnLabel" onclick="document.getElementById('fileInput').click()">
      <div class="spinner" id="spinner"></div>
      📸 Add Meal Photo
    </button>
    <div id="status">Ready to track</div>
  </div>

  <script>
    async function uploadPhoto() {
      const fileInput = document.getElementById('fileInput');
      const status = document.getElementById('status');
      const btn = document.getElementById('btnLabel');
      
      if (!fileInput.files[0]) return;

      const originalText = btn.innerHTML;
      btn.innerHTML = '<div class="spinner" style="display:inline-block"></div> Analyzing...';
      btn.style.opacity = "0.8";
      status.innerText = "⏳ Compressing & Sending to AI...";
      status.style.color = "#d97706";

      const formData = new FormData();
      formData.append("image", fileInput.files[0]);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch("/log", { 
          method: "POST", 
          body: formData,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();
        
        if (data.error) throw new Error(data.error);

        status.innerText = "✅ " + data.food + " added!";
        status.style.color = "#16a34a";
        
        const current = parseInt(document.getElementById('consumedDisplay').innerText);
        const newTotal = current + data.calories;
        document.getElementById('consumedDisplay').innerText = newTotal + " kcal";

      } catch (error) {
        if (error.name === 'AbortError') {
          status.innerText = "❌ Network Timeout. Try a smaller photo.";
        } else {
          status.innerText = "❌ " + error.message;
        }
        status.style.color = "#dc2626";
      } finally {
        btn.innerHTML = '📸 Add Meal Photo';
        btn.style.opacity = "1";
        fileInput.value = "";
      }
    }

    function switchUser(user) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
    }
  </script>
</body>
</html>
`;

// --- SERVER ROUTES ---
app.get("/", (req, res) => res.send(HTML_UI));

app.post("/log", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No photo" });

    // Optimize
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(600) 
      .jpeg({ quality: 50 })
      .toBuffer();

    // Gemini 2.5 Prompt
    const prompt = `
      Identify food. Estimate calories/protein. 
      CRITICAL: Hardgainer bulk -> err on lower side (subtract 15%).
      Return JSON only: { "food": string, "calories": number, "protein": number }
    `;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text();
    // CLEAN FIX: Removed markdown artifacts here
    const cleanJson = text.replace(/```json|```/g, "").trim();
    
    res.json(JSON.parse(cleanJson));

  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Analysis Failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
