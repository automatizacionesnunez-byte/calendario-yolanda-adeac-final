require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { format, addDays } = require('date-fns');
const { es } = require('date-fns/locale');
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURATION
const TELEGRAM_TOKEN = '8345771818:AAFr46y69EMVJ_ykva9mS3KdAeQ2F4yYbuQ';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';
const SERP_API_KEY = '16d402cb28d956a977b3c184717fec7f778784e938ec5547ae660792f3445be4';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'; // Optimized for strategic content
const PREFERRED_MODEL_SOURCE = process.env.MODEL_SOURCE || 'GROQ';

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });

// STORAGE
const CHATS_FILE = path.join(__dirname, 'chats.json');
const DATA_DIR = path.join(__dirname, '../src/data');

/**
 * TELEGRAM NOTIFICATION LOGIC
 */
const getEventsForDate = (date) => {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const key = `${mm}-${dd}`;

  try {
    const holidays = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'holidays.json'), 'utf8'));
    const saints = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'saints.json'), 'utf8'));
    const worldDays = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'worldDays.json'), 'utf8'));
    const regional = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'regional.json'), 'utf8'));

    return {
      holiday: holidays[key],
      regional: regional[key],
      saint: saints[key],
      worldDay: worldDays[key]
    };
  } catch (e) {
    return {};
  }
};

const formatEventMessage = (title, events) => {
  let message = `<b>${title}</b>\n`;
  let hasEvents = false;
  if (events.holiday) { message += `🎉 Festivo Nacional: ${events.holiday}\n`; hasEvents = true; }
  if (events.regional) { message += `🏛️ Festivo Autonómico: ${events.regional}\n`; hasEvents = true; }
  if (events.worldDay) { message += `🌍 Día Internacional: ${events.worldDay}\n`; hasEvents = true; }
  if (events.saint) { message += `⛪ Santo: ${events.saint}\n`; hasEvents = true; }
  return hasEvents ? message : '';
};

const sendDailyUpdates = () => {
  if (!fs.existsSync(CHATS_FILE)) return;
  const chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '[]');
  if (chats.length === 0) return;

  const today = new Date();
  const tomorrow = addDays(today, 1);
  const todayMsg = formatEventMessage(`📅 EVENTOS HOY (${format(today, 'dd/MM/yyyy')})`, getEventsForDate(today));
  const tomorrowMsg = formatEventMessage(`🔔 RECORDATORIO PARA MAÑANA (${format(tomorrow, 'dd/MM/yyyy')})`, getEventsForDate(tomorrow));

  let finalMessage = "";
  if (todayMsg) finalMessage += todayMsg + "\n";
  if (tomorrowMsg) finalMessage += tomorrowMsg;

  if (finalMessage) {
    chats.forEach(chatId => bot.sendMessage(chatId, finalMessage, { parse_mode: 'HTML' }));
  }
};

cron.schedule('50 8 * * *', () => sendDailyUpdates(), { timezone: "Europe/Madrid" });

bot.onText(/\/vincular/, (msg) => {
  let chats = fs.existsSync(CHATS_FILE) ? JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '[]') : [];
  if (!chats.includes(msg.chat.id)) {
    chats.push(msg.chat.id);
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats));
    bot.sendMessage(msg.chat.id, "✅ ¡Cuenta vinculada con éxito!");
  } else {
    bot.sendMessage(msg.chat.id, "⚠️ Ya vinculado.");
  }
});

bot.onText(/\/test/, (msg) => sendDailyUpdates());

/**
 * AI CORE UTILS
 */
const runAI = async (prompt, isJson = true) => {
  try {
    if (PREFERRED_MODEL_SOURCE === 'OLLAMA') {
      const resp = await axios.post(`${OLLAMA_HOST}/api/generate`, {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        format: isJson ? "json" : undefined
      });
      return isJson ? JSON.parse(resp.data.response) : resp.data.response;
    } else {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt + (isJson ? " (Responde solo en JSON puro)" : "") }],
        model: "llama-3.3-70b-versatile",
        response_format: isJson ? { "type": "json_object" } : undefined
      });
      const content = completion.choices[0].message.content;
      return isJson ? JSON.parse(content) : content;
    }
  } catch (err) {
    console.error("AI Error:", err);
    throw err;
  }
};

/**
 * STEP 1: PLAN POST (Search News + Generate 3 Angles)
 */
app.post('/api/plan-post', async (req, res) => {
  const { eventName } = req.body;
  if (!eventName) return res.status(400).json({ error: "Missing eventName" });

  try {
    // 1. Search Google News via SerpApi
    const newsResp = await axios.get(`https://serpapi.com/search.json`, {
      params: {
        engine: "google_news",
        q: eventName,
        api_key: SERP_API_KEY
      }
    });

    const newsResults = (newsResp.data.news_results || []).slice(0, 3).map(n => ({
      title: n.title,
      source: n.source?.name || 'News',
      snippet: n.snippet,
      link: n.link,
      thumbnail: n.thumbnail
    }));

    // 2. Generate 3 Strategic Angles based on news
    const newsContext = newsResults.map(n => `- ${n.title}: ${n.snippet}`).join('\n');
    const prompt = `Actúa como un Director de Estrategia de Contenidos senior. 
Basado en el evento "${eventName}" y estas noticias recientes de Google News:
${newsContext}

Propón 3 ÁNGULOS estratégicos diferentes para un post de LinkedIn de un Centro de Formación Profesional.
No redactes el post todavía, solo define la ESTRATEGIA (Título del ángulo y descripción de 2 líneas).
Usa un tono INSTITUCIONAL pero EXPERTO.

IMPORTANTE: Responde solo JSON con esta estructura:
{
  "angles": [
    { "id": 1, "title": "Nombre del Ángulo", "description": "Qué busca este enfoque...", "newsRef": "Título noticia" },
    { "id": 2, "title": "...", "description": "...", "newsRef": "..." },
    { "id": 3, "title": "...", "description": "...", "newsRef": "..." }
  ]
}`;
    
    const aiData = await runAI(prompt);
    aiData.newsUsed = newsResults;
    res.json(aiData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error in planning phase" });
  }
});

/**
 * STEP 2: GENERATE FULL POST
 */
app.post('/api/generate-full-post', async (req, res) => {
  const { eventName, chosenAngle, newsContext } = req.body;

  const prompt = `Actúa como un Director de Estrategia de Contenidos. 
Redacta un post de LinkedIn INSTITUCIONAL y PROFESIONAL para un Centro de Formación.

CONTEXTO:
- TEMA: ${eventName}
- ESTRATEGIA ELEGIDA: ${chosenAngle.title} - ${chosenAngle.description}
- NOTICIA DE APOYO: ${newsContext}

REGLAS DE ORO:
1. Tono Institucional pero Humano (Experto).
2. Estructura:
   - Título impactante (Mayúsculas si cabe).
   - Gancho (2 líneas).
   - Desarrollo con Bullet Points (3-4 max).
   - Reflexión final / CTA.
   - 3-5 Hashtags relevantes.
3. Evita clichés de IA ("En el mundo de hoy...", "Es vital...").

Devuelve JSON:
{
  "postTitle": "Título para el post",
  "content": "Contenido completo del post..."
}`;

  try {
    const data = await runAI(prompt);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error generating full post" });
  }
});

/**
 * STEP 3: REFINE POST (CHAT)
 */
app.post('/api/refine-post', async (req, res) => {
  const { currentPost, instruction } = req.body;

  const prompt = `Actúa como un Editor Senior. 
Tengo este post de LinkedIn:
---
${currentPost}
---
POR FAVOR, modifícalo siguiendo esta instrucción del usuario: "${instruction}"

Manten el tono institucional y la estructura profesional.
Devuelve JSON:
{
  "content": "Post modificado con éxito"
}`;

  try {
    const data = await runAI(prompt);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error refining post" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running. API on port ${PORT}`);
});

