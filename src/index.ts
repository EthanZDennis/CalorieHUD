import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as db from './db';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

app.use(express.json());
app.use(express.static('public'));

app.get('/api/stats', async (req: Request, res: Response) => {
  const stats = await db.getStats(req.query.user as string);
  res.json(stats);
});

app.post('/api/log/photo', upload.single('photo'), async (req: any, res: Response) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const user = req.body.user;

    const imageParts = [{
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype
      },
    }];

    // Strict prompt to ensure Gemini doesn't send "chatty" text or markdown
    const prompt = `Analyze this food photo for a high-activity Army service member at Schofield Barracks. 
    Estimate the item name, total calories, and protein. 
    As a hardgainer trying to bulk, the user prefers calorie estimates to err on the LOWER side. 
    Return ONLY a raw JSON object with no markdown (\`\`\`) and no extra text.
    Format: {"item": "name", "calories": 0, "protein": 0}`;
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    let text = response.text();
    
    // Safety: Remove markdown code blocks if the AI includes them
    const cleanJson = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleanJson);

    const tz = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const date = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    
    await db.logMeal(user, { ...data, date, category: "AI Photo" });
    res.json(data);
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.post('/api/log/manual', async (req: Request, res: Response) => {
  await db.logMeal(req.body.user, req.body);
  res.sendStatus(200);
});

app.post('/api/weight', async (req: Request, res: Response) => {
  await db.logWeight(req.body.user, req.body.weight, req.body.date);
  res.sendStatus(200);
});

app.delete('/api/log/:id', async (req: Request, res: Response) => {
  await db.deleteLog(req.body.user, req.params.id);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
});
