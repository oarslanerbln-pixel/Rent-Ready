const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(cors());

// --- TELEGRAM BOT SETUP ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;
if (TELEGRAM_TOKEN) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log("Telegram Bot Initialized. Listening for messages...");
} else {
  console.warn("No TELEGRAM_BOT_TOKEN found in .env. Telegram integration acts in mock mode.");
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- TRACKED CHANNELS & KEYWORDS ---
// List of channels to monitor (if bot is an admin or user forwards from them)
const TRACKED_CHANNELS = ["Clash Report", "TC Defense", "OSINTdefender", "WarMonitor", "ConflictTR"];
const ALERT_KEYWORDS = ["strike", "missile", "explosion", "air defense", "intercepted", "urgent", "breaking", "siren", "saldırı", "patlama", "füze"];

const CONFLICT_ZONES = {
  "Middle East": { coords: [33.848, 35.511], keywords: ["lebanon", "beirut", "israel", "tel aviv", "gaza", "idf", "hezbollah", "iran", "tehran", "syria", "damascus", "lübnan", "beyrut", "israil", "gazze", "suriye", "şam"] },
  "Eastern Europe": { coords: [50.450, 30.523], keywords: ["ukraine", "russia", "kyiv", "moscow", "crimea", "ukrayna", "rusya", "kiev", "moskova"] },
  "Global Shipping": { coords: [12.583, 43.333], keywords: ["red sea", "houthi", "yemen", "cargo", "ship", "kızıldeniz", "husiler", "gemi"] }
};

// --- DATA PROCESSING UTILS ---
function detectRegion(text) {
  const lowerText = text.toLowerCase();
  for (const [region, data] of Object.entries(CONFLICT_ZONES)) {
    if (data.keywords.some(kw => lowerText.includes(kw))) {
      return { region, coords: data.coords };
    }
  }
  return { region: "Middle East", coords: CONFLICT_ZONES["Middle East"].coords }; // Default fallback
}

function calculateIntensity(text) {
  const lowerText = text.toLowerCase();
  let intensity = 50; // Base
  if (ALERT_KEYWORDS.some(kw => lowerText.includes(kw))) intensity += 30;
  if (lowerText.includes("urgent") || lowerText.includes("breaking") || lowerText.includes("son dakika")) intensity += 15;
  return Math.min(intensity, 99);
}

// --- GDELT INTEGRATION ---
async function fetchGDELT() {
  try {
    // Using GDELT Context 2.0 API (JSON format) - querying for US/IRAN/ISRAEL conflict terms
    // This is a simplified query endpoint for demonstration. GDELT's full API is complex.
    const query = '(Iran OR Israel OR USA) (strike OR missile OR war OR tension)';
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=5&format=json&sort=datedesc`;
    
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data && response.data.articles) {
      response.data.articles.forEach(article => {
        const intel = processRawData(article.title, article.domain || "GDELT Network", "GDELT");
        if (intel) emitIntel(intel);
      });
    }
  } catch (error) {
    console.error("GDELT fetch error:", error.message);
  }
}

// --- CORE INTELLIGENCE PROCESSING ---
function processRawData(text, sourceName, sourceType) {
  if (!text) return null;
  const analyzed = detectRegion(text);
  const intensity = calculateIntensity(text);
  const isAnomaly = intensity >= 85;

  return {
    id: `${sourceType}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    source: sourceName,
    timestamp: new Date().toISOString(),
    location: analyzed.region, // In a real app, NLP would extract exact city
    coords: analyzed.coords,
    region: analyzed.region,
    summary: text.substring(0, 150) + (text.length > 150 ? "..." : ""),
    intensity: intensity,
    isAnomaly: isAnomaly,
    category: isAnomaly ? "KINETIC" : "OSINT_HOT",
    prediction: isAnomaly ? "SIGNIFICANT IMPACT" : "CONTINUOUS MONITORING",
    stateLevel: isAnomaly ? 2 : 1,
    isRealData: true,
    sourceType: sourceType // 'TELEGRAM' or 'GDELT'
  };
}

function emitIntel(intelData) {
  io.emit('intel_update', intelData);
  console.log(`[LIVE INTEL - ${intelData.intensity > 80 ? 'HIGH' : 'LOW'}] ${intelData.source}: ${intelData.summary.substring(0, 50)}...`);
}

// --- TELEGRAM BOT EVENT LISTENER ---
if (bot) {
  bot.on('message', (msg) => {
    // Map forwarded messages or messages from specific chats to our intel feed
    // In a prod app, check msg.chat.id against an allowed list.
    const text = msg.text || msg.caption;
    if (text) {
      const sourceName = msg.forward_from_chat ? msg.forward_from_chat.title : 
                         msg.chat.title || msg.from.first_name;
      
      const intel = processRawData(text, sourceName, "TELEGRAM");
      if (intel) emitIntel(intel);
    }
  });
}

// --- SCHEDULE JOBS ---
// Fetch GDELT every 5 minutes
cron.schedule('*/5 * * * *', () => {
    console.log("Fetching latest GDELT timeline...");
    fetchGDELT();
});

// --- MOCK FALLBACK (Keep map active if no real events are firing) ---
function generateMockIntel() {
  const mockSources = ["Osint613", "ConflictTR", "tcdefence"];
  const texts = [
    "Satellite imagery confirms transport activity at facility.",
    "Unidentified aircraft tracked off the coast.",
    "Cyber anomalies detected in financial sector."
  ];
  return processRawData(texts[Math.floor(Math.random() * texts.length)], mockSources[Math.floor(Math.random() * mockSources.length)], "MOCK");
}

let mockInterval;

io.on('connection', (socket) => {
  console.log('A client connected. ID:', socket.id);
  
  // Send some initial mock data to populate
  const initialData = Array(3).fill(0).map(() => generateMockIntel());
  socket.emit('initial_data', initialData);

  // Trigger GDELT fetch on new connection just to get fresh data
  fetchGDELT();

  // If no new real data comes in, emit a mock event every 45s to keep UI alive
  if (!mockInterval) {
      mockInterval = setInterval(() => {
          emitIntel(generateMockIntel());
      }, 45000);
  }

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`GlobalPulse Intelligence Backend running on port ${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
  console.log(`GDELT Polling: Active (Every 5 mins)`);
  console.log(`Telegram Bot: ${bot ? 'Active' : 'Missing Token'}`);
});
