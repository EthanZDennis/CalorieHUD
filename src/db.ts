// src/db.ts
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth);

export async function initDB() {
  await doc.loadInfo();
}

export async function logMeal(user: string, data: any) {
  const sheet = doc.sheetsByTitle['Sheet1'];
  // Keep the date-only fix to prevent the "yesterday snack" bug
  const dateOnly = data.date.split('T')[0]; 
  await sheet.addRow({
    Date: dateOnly,
    User: user,
    Item: data.item,
    Calories: data.calories,
    Protein: data.protein || 0, // Restores protein logging
    Category: data.category
  });
}

export async function deleteLog(user: string, id: string) {
  const sheet = doc.sheetsByTitle['Sheet1'];
  const rows = await sheet.getRows();
  const row = rows.find(r => r.rowNumber === parseInt(id));
  if (row) await row.delete(); // Restores trash can functionality
}

export async function logWeight(user: string, weight: number, date: string) {
  const sheet = doc.sheetsByTitle['Sheet2'];
  const dateOnly = date.split('T')[0];
  await sheet.addRow({ Date: dateOnly, User: user, Weight: weight });
}

export async function getStats(user: string) {
  const sheet1 = doc.sheetsByTitle['Sheet1'];
  const sheet2 = doc.sheetsByTitle['Sheet2'];
  const [rows1, rows2] = await Promise.all([sheet1.getRows(), sheet2.getRows()]);

  const userRows = rows1.filter(r => r.get('User').toLowerCase() === user.toLowerCase());
  const weightRows = rows2.filter(r => r.get('User').toLowerCase() === user.toLowerCase());

  // Hard-lock today's date based on location to fix the "0 cals" bug
  const tz = user.toLowerCase() === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  
  const todayCals = userRows
    .filter(r => r.get('Date') === today)
    .reduce((sum, r) => sum + parseInt(r.get('Calories') || 0), 0);

  return {
    totalCals: todayCals,
    lastWeight: weightRows.length > 0 ? weightRows[weightRows.length - 1].get('Weight') : null,
    recentLogs: userRows.slice(-15).map(r => ({
      id: r.rowNumber,
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
  };
}
