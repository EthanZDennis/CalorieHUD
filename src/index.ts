import express, { Request, Response } from 'express';
import multer from 'multer';
// Sharp import removed
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as db from './db';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

app.use(express.json());
app.use(express.static('public'));

app.post('/api/log/photo', upload.single('photo'), async (req: any, res: Response) => {
  try {
    const user = req.body.user;
    if (!req.file) return res.status(400).json({ error: "No photo" });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imageParts = [{
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: "image/jpeg"
      },
    }];

    // Back to the three specific rules to ensure it sees the whole tray
    const prompt = `Identify food. Estimate calories/protein. 
    User: Army hardgainer (142 lbs). 
    Rule 1: Food will be touching or overlapping; guess the separate items anyway.
    Rule 2: You MUST provide an estimate for the WHOLE meal. Do not say you are unsure.
    Rule 3: Err on the LOWER side for calories. 
    Respond ONLY in raw JSON: {"item": "name of all foods", "calories": 0, "protein": 0}`;
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const rawText = response.text();

    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    
    if (!jsonMatch) {
      return res.status(422).json({ error: rawText.trim() });
    }

    const data = JSON.parse(jsonMatch[0]);

    const tz = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const date = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    
    await db.logMeal(user, { ...data, date, category: "AI Photo" });
    res.json(data);
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.get('/api/stats', async (req: Request, res: Response) => {
  const stats = await db.getStats(req.query.user as string);
  res.json(stats);
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
  app.listen(PORT, () => console.log(`🚀 Server live on port ${PORT}`));
});
