const express = require('express');
const cors = require('cors');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { format, addDays } = require('date-fns');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURATION
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8345771818:AAFr46y69EMVJ_ykva9mS3KdAeQ2F4yYbuQ';
const OLLAMA_CLOUD_API_KEY = process.env.GROQ_API_KEY || '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';
const SERP_API_KEY = process.env.SERP_API_KEY || '16d402cb28d956a977b3c184717fec7f778784e938ec5547ae660792f3445be4';

// Use /tmp for transient storage in Vercel. For persistent storage, use a DB.
const CHATS_FILE = '/tmp/chats.json';
const LINKING_CODES = new Map();

// Helper to load data (moved logic from server/index.js)
// Use direct require for JSON files to ensure they are bundled by Vercel
const holidays = require('../src/data/holidays.json');
const saints = require('../src/data/saints.json');
const worldDays = require('../src/data/worldDays.json');
const regional = require('../src/data/regional.json');

const getEventsForDate = (date) => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;
  
  return { 
    holiday: holidays[key], 
    regional: regional[key], 
    saint: saints[key], 
    worldDay: worldDays[key] 
  };
};

/** API LOGIC **/
const runAI = async (prompt, isJson = true) => {
  try {
    const resp = await axios.post('https://ollama.com/api/chat', {
      model: "deepseek-v3.1:671b",
      messages: [
        { role: 'system', content: 'Eres un Asistente Experto en Creación de Contenidos.' },
        { role: 'user', content: prompt + (isJson ? " (Responde SOLO en JSON puro, sin markdown ni backticks)" : "") }
      ],
      stream: false,
      options: { temperature: 0.1 }
    }, {
      headers: { 'Authorization': `Bearer ${OLLAMA_CLOUD_API_KEY}`, 'Content-Type': 'application/json' }
    });
    let content = resp.data.message.content;
    if (isJson) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
      return JSON.parse(match[1].trim());
    }
    return content;
  } catch (err) { throw err; }
};

app.post('/api/plan-post', async (req, res) => {
  const { eventName } = req.body;
  const prompt = `Propón 3 ÁNGULOS estratégicos para un post de LinkedIn sobre "${eventName}". Devuelve JSON: { "angles": [...] }`;
  try {
    const aiData = await runAI(prompt);
    res.json(aiData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate-full-post', async (req, res) => {
  const { eventName, chosenAngle } = req.body;
  const prompt = `Redacta un post completo sobre ${eventName} con el ángulo ${chosenAngle.title}. Devuelve JSON: { "content": "..." }`;
  try {
    const data = await runAI(prompt);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/telegram/generate-code', (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  LINKING_CODES.set(code, Date.now());
  res.json({ code, botUsername: "CALENDARIO_ADEACBOT" });
});

app.get('/api/telegram/status', (req, res) => {
  res.json({ linked: false, count: 0, note: "Persistence disabled on Vercel" });
});

module.exports = app;
