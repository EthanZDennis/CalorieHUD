import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// --- INTERFACES ---
export interface LogEntry {
  id: string;
  date: string; // ISO String
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

// --- IN-MEMORY FALLBACK (Until you set up Sheets) ---
let MEMORY_LOGS: LogEntry[] = [];
let MEMORY_WEIGHTS: WeightEntry[] = [];

// --- GOOGLE SHEETS SETUP ---
// We will look for these in your Render Environment Variables later
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

export const db = {
  // 1. ADD FOOD LOG
  async addLog(entry: LogEntry) {
    // Always save to memory first (for speed)
    MEMORY_LOGS.push(entry);

    // If Sheets is set up, save there too
    if (SERVICE_EMAIL && PRIVATE_KEY && SHEET_ID) {
      try {
        const doc = await getDoc();
        const sheet = doc.sheetsByIndex[0]; // Assume first tab is Logs
        // Calculate Local Time for the Sheet columns
        const timeZone = entry.user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
        const localDate = new Date(entry.timestamp).toLocaleDateString('en-US', { timeZone });
        const localTime = new Date(entry.timestamp).toLocaleTimeString('en-US', { timeZone });
        
        await sheet.addRow({
          Date: localDate,
          Time: localTime,
          User: entry.user,
          Item: entry.item,
          Calories: entry.calories,
          Protein: entry.protein,
          Category: entry.category
        });
      } catch (e) { console.error("Sheet Error:", e); }
    }
  },

  // 2. ADD WEIGHT
  async addWeight(entry: WeightEntry) {
    MEMORY_WEIGHTS.push(entry);
    if (SERVICE_EMAIL && PRIVATE_KEY && SHEET_ID) {
      try {
        const doc = await getDoc();
        let sheet = doc.sheetsByIndex[1]; // Assume second tab is Weight
        if (!sheet) sheet = await doc.addSheet({ title: "Weight" });
        await sheet.addRow({ Date: entry.date, User: entry.user, Weight: entry.weight });
      } catch (e) { console.error("Sheet Error:", e); }
    }
  },

  // 3. GET HISTORY (Last 30 Days)
  async getHistory(user: 'husband' | 'wife') {
    // Filter memory logs by user
    return MEMORY_LOGS
      .filter(l => l.user === user)
      .sort((a, b) => b.timestamp - a.timestamp) // Newest first
      .slice(0, 50); // Limit to last 50 items
  },

  // 4. GET STATS (Today's Total + Last Weight)
  async getStats(user: 'husband' | 'wife') {
    const timeZone = user === 'husband' ? 'Pacific/Honolulu' : 'Asia/Tokyo';
    
    // Get "Today" in the user's timezone
    const now = new Date();
    const todayString = now.toLocaleDateString('en-US', { timeZone });

    const todayLogs = MEMORY_LOGS.filter(l => {
      const logDate = new Date(l.timestamp).toLocaleDateString('en-US', { timeZone });
      return l.user === user && logDate === todayString;
    });

    const totalCals = todayLogs.reduce((sum, l) => sum + l.calories, 0);
    const totalProtein = todayLogs.reduce((sum, l) => sum + l.protein, 0);
    
    // Get last recorded weight
    const userWeights = MEMORY_WEIGHTS.filter(w => w.user === user);
    const lastWeight = userWeights.length > 0 ? userWeights[userWeights.length - 1].weight : 0;

    return { totalCals, totalProtein, lastWeight, todayLogs };
  }
};

// Helper to connect to Sheets
async function getDoc() {
  const jwt = new JWT({ email: SERVICE_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID as string, jwt);
  await doc.loadInfo();
  return doc;
}
