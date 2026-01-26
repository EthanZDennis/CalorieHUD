import express from "express";
import multer from "multer";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { db } from "./db";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Serve the 'public' folder as a website
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json()); // Allow sending JSON data manually

// --- CONFIG ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- ROUTES ---

// 1. DASHBOARD DATA
app.get("/api/stats", async (req, res) => {
  const user = (req.query.user as 'husband' | 'wife') || 'husband';
  const data = await db.getStats(user);
  res.json(data);
});

// 2. LOG MEAL (AI PHOTO)
app.post("/api/log/photo", upload.single("image"), async (req: any, res: any) => {
  try {
    const user = req.body.user || 'husband';
    if (!req.file) throw new Error("No photo");

    // Optimize
    const optimizedBuffer = await sharp(req.file.buffer).resize(600).jpeg({ quality: 50 }).toBuffer();

    // AI Analysis
    const prompt = `Identify food. Estimate calories/protein. CRITICAL: Err on lower side (-15%). Return JSON: { "item": string, "calories": number, "protein": number, "category": "Breakfast"|"Lunch"|"Dinner"|"Snack"|"Protein Shake" }`;
    const result = await model.generateContent([prompt, { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }]);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const aiData = JSON.parse(text);

    // Save to DB
    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      user,
      ...aiData
    };
    await db.addLog(entry);

    res.json(entry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. LOG MEAL (MANUAL)
app.post("/api/log/manual", async (req, res) => {
  try {
    const { user, item, calories, protein, category } = req.body;
    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      user, item, calories: Number(calories), protein: Number(protein), category
    };
    await db.addLog(entry);
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// 4. LOG WEIGHT
app.post("/api/weight", async (req, res) => {
  try {
    const { user, weight } = req.body;
    await db.addWeight({ date: new Date().toISOString(), user, weight: Number(weight) });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
