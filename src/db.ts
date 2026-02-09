import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID!, serviceAccountAuth);

let isInitialized = false;

export async function initDB() {
  if (!isInitialized) {
    await doc.loadInfo();
    isInitialized = true;
  }
}

export async function logMeal(user: string, data: any) {
  await initDB();
  const sheet = doc.sheetsByTitle['Sheet1'];
  const dateOnly = data.date.split('T')[0]; 
  await sheet.addRow({
    Date: dateOnly,
    User: user,
    Item: data.item,
    Calories: data.calories,
    Protein: data.protein || 0,
    Category: data.category
  });
}

export async function deleteLog(user: string, id: string) {
  await initDB();
  const sheet = doc.sheetsByTitle['Sheet1'];
  const rows = await sheet.getRows();
  const row = rows.find(r => r.rowNumber === parseInt(id));
  if (row) await row.delete();
}

export async function logWeight(user: string, weight: number, date: string) {
  await initDB();
  const sheet = doc.sheetsByTitle['Sheet2'];
  const dateOnly = date.split('T')[0];
  await sheet.addRow({ Date: dateOnly, User: user, Weight: weight });
}

export async function getStats(user: string) {
  await initDB();
  const sheet1 = doc.sheetsByTitle['Sheet1'];
  const sheet2 = doc.sheetsByTitle['Sheet2'];
  const [rows1, rows2] = await Promise.all([sheet1.getRows(), sheet2.getRows()]);

  const userRows = rows1.filter(r => r.get('User').toLowerCase() === user.toLowerCase());
  const weightRows = rows2.filter(r => r.get('User').toLowerCase() === user.toLowerCase());

  // FIX: Create a robust "Today" string that matches the sheet's format
  const tz = user.toLowerCase() === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
  const now = new Date();
  const todayTarget = now.toLocaleDateString("en-CA", { timeZone: tz }); 
  
  // Summing today's calories by checking for exact string match OR date-parsed match
  const todayCals = userRows
    .filter(r => {
        const rowDate = r.get('Date');
        // Matches if string is identical (2026-01-26) OR if they represent the same day
        return rowDate === todayTarget || new Date(rowDate).toLocaleDateString("en-CA") === todayTarget;
    })
    .reduce((sum, r) => sum + parseInt(r.get('Calories') || 0), 0);

  return {
    totalCals: todayCals,
    lastWeight: weightRows.length > 0 ? weightRows[weightRows.length - 1].get('Weight') : null,
    recentLogs: userRows.map(r => ({
      id: r.rowNumber,
      timestamp: r.get('Date'),
      item: r.get('Item'),
      calories: r.get('Calories'),
      category: r.get('Category')
    })).reverse(),
    chartData: {
      labels: userRows.map(r => r.get('Date')),
      values: userRows.map(r => parseInt(r.get('Calories') || 0))
    },
    weightHistory: weightRows.map(r => ({ x: r.get('Date'), y: r.get('Weight') }))
  };
}
