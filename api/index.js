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

// Stateless code for vinculation
const STATIC_LINK_CODE = "123456";

/** AI LOGIC **/
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
  const prompt = `Actúa como Director de Comunicación de un Centro Educativo Privado de prestigio.
El evento u efeméride de hoy es: "${eventName}".
Propón 3 ÁNGULOS estratégicos para redactar una publicación institucional en redes sociales.
Los enfoques deben estar orientados a relacionar el evento con la educación, el desarrollo de los alumnos, la innovación o valores del centro.
Devuelve JSON ESTRICTO con este formato exacto: { "angles": [{ "id": 1, "title": "...", "description": "...", "newsRef": "Idea para acompañar con foto/recurso" }, ... ] }`;
  try {
    const aiData = await runAI(prompt);
    res.json(aiData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate-full-post', async (req, res) => {
  const { eventName, chosenAngle } = req.body;
  const prompt = `Actúa como Director de Comunicación de un Centro Educativo Privado.
Redacta el texto FINAL de un post institucional sobre "${eventName}" utilizando este enfoque estratégico: "${chosenAngle.title}" - "${chosenAngle.description}".
El tono debe ser profesional, inspirador y cercano, destacando el impacto positivo en los alumnos y la comunidad escolar. 
Añade emojis adecuados y llamadas a la acción (CTAs) sutiles.
Devuelve JSON ESTRICTO con este formato: { "content": "Aquí va todo el texto del post..." }`;
  try {
    const data = await runAI(prompt);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/telegram/generate-code', (req, res) => {
  res.json({ code: STATIC_LINK_CODE, botUsername: "CALENDARIO_ADEACBOT" });
});

// Vercel Telegram Webhook endpoint
app.post('/api/telegram/webhook', async (req, res) => {
  const body = req.body;
  if (body.message && body.message.text) {
    const text = body.message.text;
    const chatId = body.message.chat.id;
    
    if (text.startsWith(`/start ${STATIC_LINK_CODE}`) || text.startsWith('/vincular')) {
      try {
        // Save ChatID directly into Telegram Bot Description (Zero-Config Database Hack)
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setMyDescription`, {
          description: `Base de datos interna. NO BORRAR.\n[CHAT_DB:${chatId}]`
        });

        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "✅ ¡Cuenta vinculada mágicamente! ✨\nHe guardado tu conexión directamente en Telegram, por lo que ya NO necesitas configurar manualmente el Chat ID en Vercel.\nTodos tus avisos automáticos funcionarán correctamente desde la nube."
        });
      } catch (err) {
        console.error("Error setting bot description as DB:", err);
      }
    }
  }
  res.sendStatus(200);
});

// Setup webhook automatically 
app.get('/api/telegram/setup-webhook', async (req, res) => {
  const host = req.headers.host;
  const webhookUrl = `https://${host}/api/telegram/webhook`;
  try {
    const r = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, { url: webhookUrl });
    res.json({ success: true, url: webhookUrl, telegramResponse: r.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/telegram/status', async (req, res) => {
  // Read if it's linked from the Telegram DB Hack
  try {
    const resp = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMyDescription`);
    const isLinked = resp.data?.result?.description?.includes('[CHAT_DB:');
    res.json({ linked: isLinked, count: isLinked ? 1 : 0, note: "Serverless Mode (Native Telegram DB)" });
  } catch(e) {
    res.json({ linked: false, count: 0 });
  }
});

const formatEventMessage = (title, events) => {
  let message = `<b>${title}</b>\n`;
  let hasEvents = false;
  if (events.holiday) { message += `🎉 Festivo Nacional: ${events.holiday}\n`; hasEvents = true; }
  if (events.regional) { message += `🏛️ Festivo Autonómico: ${events.regional}\n`; hasEvents = true; }
  if (events.worldDay) { message += `🌍 Día Internacional: ${events.worldDay}\n`; hasEvents = true; }
  if (events.saint) { message += `⛪ Santo: ${events.saint}\n`; hasEvents = true; }
  return hasEvents ? message : '';
};

app.get('/api/cron/daily', async (req, res) => {
  try {
    // Retrieve persistence from Telegram bot description
    const descResp = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMyDescription`);
    const desc = descResp.data?.result?.description || "";
    const match = desc.match(/\[CHAT_DB:(.+)\]/);
    
    if (!match || !match[1]) {
      return res.status(400).json({ error: "No target chat connected in Telegram DB." });
    }
    
    const chatId = match[1];
    
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const todayMsg = formatEventMessage(`📅 EVENTOS HOY (${format(today, 'dd/MM/yyyy')})`, getEventsForDate(today));
    const tomorrowMsg = formatEventMessage(`🔔 RECORDATORIO PARA MAÑANA (${format(tomorrow, 'dd/MM/yyyy')})`, getEventsForDate(tomorrow));

    let finalMessage = "";
    if (todayMsg) finalMessage += todayMsg + "\n";
    if (tomorrowMsg) finalMessage += tomorrowMsg;

    if (finalMessage) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: finalMessage,
        parse_mode: 'HTML'
      });
      res.json({ success: true, message: "Avisos enviados." });
    } else {
      res.json({ success: true, message: "No hay eventos." });
    }
  } catch (err) {
    res.status(500).json({ error: "Error running daily cron: " + err.message });
  }
});

module.exports = app;
