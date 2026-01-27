import express from 'express';
import path from 'path';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Setup Auth
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth);

// Routes
app.get('/api/stats', async (req, res) => {
  await doc.loadInfo();
  const user = (req.query.user as string).toLowerCase();
  const rows1 = await doc.sheetsByTitle['Sheet1'].getRows();
  const rows2 = await doc.sheetsByTitle['Sheet2'].getRows();

  const userRows = rows1.filter(r => r.get('User').toLowerCase() === user);
  const weightRows = rows2.filter(r => r.get('User').toLowerCase() === user);

  // Day-Only Lock: Strip time to fix the "Yesterday Snack" bug
  const today = new Date().toLocaleDateString("en-CA", { timeZone: user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo' });
  
  const totalCals = userRows
    .filter(r => r.get('Date') === today)
    .reduce((sum, r) => sum + parseInt(r.get('Calories') || 0), 0);

  res.json({
    totalCals,
    lastWeight: weightRows.length > 0 ? weightRows[weightRows.length - 1].get('Weight') : null,
    recentLogs: userRows.slice(-15).map(r => ({
      timestamp: r.get('Date'),
      item: r.get('Item'),
      calories: r.get('Calories'),
      category: r.get('Category')
    })),
    chartData: {
      labels: userRows.map(r => r.get('Date')),
      values: userRows.map(r => parseInt(r.get('Calories') || 0))
    },
    weightHistory: weightRows.map(r => ({ x: r.get('Date'), y: r.get('Weight') }))
  });
});

app.post('/api/log/manual', async (req, res) => {
  const sheet = doc.sheetsByTitle['Sheet1'];
  await sheet.addRow({
    Date: req.body.date,
    User: req.body.user,
    Item: req.body.item,
    Calories: req.body.calories,
    Protein: req.body.protein,
    Category: req.body.category
  });
  res.sendStatus(200);
});

app.post('/api/weight', async (req, res) => {
  const sheet = doc.sheetsByTitle['Sheet2'];
  await sheet.addRow({ Date: req.body.date, User: req.body.user, Weight: req.body.weight });
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Back Online on Port ${PORT}`));
