import express from "express";
import multer from "multer";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

// --- CONFIGURATION ---
// Defaulting to the safest model for now
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- THE WEBSITE UI ---
const HTML_UI = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>CalorieHUD</title>
  <style>
    :root { --primary: #6366f1; --bg: #f8fafc; --text: #1e293b; }
    body { font-family: -apple-system, sans-serif; background: var(--bg); color: var(--text); padding: 20px; }
    .btn { background: var(--primary); color: white; padding: 15px; border-radius: 12px; border: none; font-size: 16px; width: 100%; font-weight: bold; margin-top: 10px; cursor: pointer; }
    .card { background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; text-align: center; }
    #status { margin-top: 15px; font-weight: 600; color: #64748b; }
    a { display: block; margin-top: 20px; color: #64748b; text-align: center; text-decoration: none; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>CalorieHUD 🥩</h2>
    <h1>4000 <small>kcal goal</small></h1>
    <h3 id="consumedDisplay">1020 kcal</h3>
  </div>

  <div class="card">
    <input type="file" id="fileInput" accept="image/*" style="display: none" onchange="uploadPhoto()">
    <button class="btn" onclick="document.getElementById('fileInput').click()">📸 Add Meal Photo</button>
    <div id="status">Ready</div>
  </div>

  <a href="/models" target="_blank">🔍 Debug: List Available Models</a>

  <script>
    async function uploadPhoto() {
      const file = document.getElementById('fileInput').files[0];
      const status = document.getElementById('status');
      if (!file) return;

      status.innerText = "⏳ Compressing & Sending...";
      status.style.color = "#d97706";

      const formData = new FormData();
      formData.append("image", file);

      try {
        const res = await fetch("/log", { method: "POST", body: formData });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        status.innerText = "✅ " + data.food + " (" + data.calories + " kcal)";
        status.style.color = "#16a34a";
        
        const current = parseInt(document.getElementById('consumedDisplay').innerText);
        document.getElementById('consumedDisplay').innerText = (current + data.calories) + " kcal";
      } catch (e) {
        status.innerText = "❌ " + e.message;
        status.style.color = "#dc2626";
      }
    }
  </script>
</body>
</html>
`;

// --- ROUTE 1: UI ---
app.get("/", (req, res) => res.send(HTML_UI));

// --- ROUTE 2: LIST MODELS (New!) ---
app.get("/models", async (req, res) => {
  try {
    // Directly ask Google's API what models are enabled for your key
    const key = process.env.GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await response.json();
    
    // Format it nicely for your phone screen
    const modelList = data.models
      .filter((m: any) => m.name.includes("gemini"))
      .map((m: any) => `<li><b>${m.name.replace("models/", "")}</b><br><small>${m.version}</small></li>`)
      .join("");

    res.send(`
      <body style="font-family: sans-serif; padding: 20px;">
        <h2>Available Models</h2>
        <ul>${modelList}</ul>
        <p><i>If you see <b>gemini-1.5-flash</b>, we are good.</i></p>
      </body>
    `);
  } catch (error: any) {
    res.send(`<pre>Error fetching models: ${error.message}</pre>`);
  }
});

// --- ROUTE 3: LOG MEAL ---
app.post("/log", upload.single("image"), async (req: any, res: any) => {
  try {
    if (!req.file) throw new Error("No photo");

    // Resize to 600px to be safe on RAM
    const optimizedBuffer = await sharp(req.file.buffer)
      .resize(600)
      .jpeg({ quality: 50 })
      .toBuffer();

    const prompt = `Identify food. Estimate calories/protein for hardgainer (err on lower side -15%). Return JSON: { "food": string, "calories": number, "protein": number }`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }
    ]);

    const text = result.response.text().replace(/```json|```/g, "").trim();
    res.json(JSON.parse(text));

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Analysis Failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
