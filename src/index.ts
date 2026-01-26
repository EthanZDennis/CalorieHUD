import express from "express";
import multer from "multer";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";
import { db } from "./db";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- ROUTES ---

app.get("/api/stats", async (req, res) => {
  const user = (req.query.user as 'husband' | 'wife') || 'husband';
  const data = await db.getStats(user);
  res.json(data);
});

// DELETE ROUTE
app.delete("/api/log/:id", async (req, res) => {
  const { id } = req.params;
  const user = (req.body.user as 'husband' | 'wife') || 'husband';
  await db.deleteLog(id, user);
  res.json({ success: true });
});

// MANUAL LOG (With Date Support)
app.post("/api/log/manual", async (req, res) => {
  try {
    const { user, item, calories, protein, category, date } = req.body;
    
    // Handle Date: If provided, combine with current time. If not, use now.
    let timestamp = Date.now();
    if (date) {
      // If user selected "2024-01-14", we set time to 12:00 PM to avoid timezone shifting issues
      timestamp = new Date(date + "T12:00:00").getTime();
    }

    const entry = {
      id: timestamp.toString(),
      date: new Date(timestamp).toISOString(),
      timestamp: timestamp,
      user, 
      item: item || "Manual Entry",
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      category: category || "Snack"
    };
    await db.addLog(entry);
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/log/photo", upload.single("image"), async (req: any, res: any) => {
  // Photo always uses "Now" as the time
  try {
    const user = req.body.user || 'husband';
    if (!req.file) throw new Error("No photo");

    const optimizedBuffer = await sharp(req.file.buffer).resize(600).jpeg({ quality: 50 }).toBuffer();
    const prompt = `Identify food. Estimate calories/protein. Err on lower side (-15%). Return JSON: { "item": string, "calories": number, "protein": number, "category": "Breakfast"|"Lunch"|"Dinner"|"Snack"|"Protein Shake" }`;
    const result = await model.generateContent([prompt, { inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/jpeg" } }]);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const aiData = JSON.parse(text);

    const entry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      timestamp: Date.now(),
      user, ...aiData
    };
    await db.addLog(entry);
    res.json(entry);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

app.post("/api/weight", async (req, res) => {
  const { user, weight } = req.body;
  await db.addWeight({ date: new Date().toISOString(), user, weight: Number(weight) });
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
db.init().then(() => {
  app.listen(PORT, () => console.log(`Server running on ${PORT}`));
});
