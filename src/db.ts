import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// --- TYPES ---
export interface LogEntry {
  id: string;
  date: string;
  user: 'husband' | 'wife';
  item: string;
  calories: number;
  protein: number;
  category: string;
  timestamp: number;
}

export interface WeightEntry {
  date: string;
  user: 'husband' | 'wife';
  weight: number;
}

// --- MEMORY STORAGE ---
let MEMORY_LOGS: LogEntry[] = [];
let MEMORY_WEIGHTS: WeightEntry[] = [];

// --- GOOGLE SHEETS SETUP ---
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

export const db = {
  // 1. INITIALIZE (READ FROM SHEET)
  async init() {
    if (!SERVICE_EMAIL || !PRIVATE_KEY || !SHEET_ID) return;
    try {
      console.log("📥 Loading data from Sheets...");
      const doc = await getDoc();
      
      // Load Logs (Sheet 1)
      const sheetLogs = doc.sheetsByIndex[0];
      const logRows = await sheetLogs.getRows();
      MEMORY_LOGS = logRows.map((row, index) => {
        const dateStr = row.get('Date');
        const timeStr = row.get('Time');
        const fullDate = new Date(`${dateStr} ${timeStr}`);
        return {
          id: index.toString(),
          date: fullDate.toISOString(),
          timestamp: fullDate.getTime(),
          user: row.get('User'),
          item: row.get('Item'),
          calories: Number(row.get('Calories')),
          protein: Number(row.get('Protein')),
          category: row.get('Category')
        };
      });

      // Load Weight (Sheet 2)
      const sheetWeight = doc.sheetsByIndex[1];
      if (sheetWeight) {
        const weightRows = await sheetWeight.getRows();
        MEMORY_WEIGHTS = weightRows.map(row => ({
          date: row.get('Date'),
          user: row.get('User'),
          weight: Number(row.get('Weight'))
        }));
      }
      console.log(`✅ Loaded ${MEMORY_LOGS.length} meals and ${MEMORY_WEIGHTS.length} weights.`);
    } catch (e) { console.error("❌ Failed to load sheet:", e); }
  },

  // 2. ADD FOOD
  async addLog(entry: LogEntry) {
    MEMORY_LOGS.push(entry);
    if (SERVICE_EMAIL) {
      try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0];
        const timeZone = entry.user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
        await sheet.addRow({
          Date: new Date(entry.timestamp).toLocaleDateString('en-US', { timeZone }),
          Time: new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone }),
          User: entry.user,
          Item: entry.item,
          Calories: entry.calories,
          Protein: entry.protein,
          Category: entry.category
        });
      } catch (e) { console.error("Sheet Error:", e); }
    }
  },

  // 3. ADD WEIGHT
  async addWeight(entry: WeightEntry) {
    MEMORY_WEIGHTS.push(entry);
    if (SERVICE_EMAIL) {
      try {
        const doc = await getDoc();
        let sheet = doc.sheetsByIndex[1];
        if (!sheet) sheet = await doc.addSheet({ title: "Weight" });
        await sheet.addRow({ Date: entry.date, User: entry.user, Weight: entry.weight });
      } catch (e) { console.error("Sheet Error:", e); }
    }
  },

  // 4. GET STATS
  async getStats(user: 'husband' | 'wife') {
    const timeZone = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    const now = new Date();
    const todayString = now.toLocaleDateString('en-US', { timeZone });

    // Filter and Sort Newest First
    const userLogs = MEMORY_LOGS
      .filter(l => l.user === user)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    // Today's Totals
    const todayLogs = userLogs.filter(l => {
      const logDate = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone });
      return logDate === todayString;
    });

    const totalCals = todayLogs.reduce((sum, l) => sum + l.calories, 0);
    const totalProtein = todayLogs.reduce((sum, l) => sum + l.protein, 0);

    // Last Weight
    const userWeights = MEMORY_WEIGHTS.filter(w => w.user === user);
    const lastWeight = userWeights.length > 0 ? userWeights[userWeights.length - 1].weight : 0;

    return { 
      totalCals, totalProtein, lastWeight, 
      recentLogs: userLogs.slice(0, 30), 
      chartData: getChartData(userLogs, timeZone)
    };
  }
};

// --- HELPERS ---
async function getDoc() {
  const jwt = new JWT({ email: SERVICE_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID as string, jwt);
  await doc.loadInfo();
  return doc;
}

function getChartData(logs: LogEntry[], timeZone: string) {
  const last7Days: Record<string, number> = {};
  for(let i=6; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    last7Days[dateStr] = 0;
  }
  logs.forEach(l => {
    const dateStr = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone, month:'short', day:'numeric' });
    if (last7Days[dateStr] !== undefined) last7Days[dateStr] += l.calories;
  });
  return { labels: Object.keys(last7Days), values: Object.values(last7Days) };
}
