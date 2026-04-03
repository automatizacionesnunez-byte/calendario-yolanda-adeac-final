require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { format, addDays } = require('date-fns');
const { es } = require('date-fns/locale');
const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURATION
const TELEGRAM_TOKEN = '8345771818:AAFr46y69EMVJ_ykva9mS3KdAeQ2F4yYbuQ';
// USING OLLAMA CLOUD AS INSTRUCTED:
const OLLAMA_CLOUD_API_KEY = process.env.GROQ_API_KEY || '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';
const SERP_API_KEY = '16d402cb28d956a977b3c184717fec7f778784e938ec5547ae660792f3445be4';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'; // Optimized for strategic content
const PREFERRED_MODEL_SOURCE = process.env.MODEL_SOURCE || 'CLOUD'; // default to cloud

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// STORAGE
const CHATS_FILE = path.join(__dirname, 'chats.json');
const DATA_DIR = path.join(__dirname, '../src/data');
const LINKING_CODES = new Map(); // Store code -> timestamp
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

bot.onText(/\/start (.+)/, (msg, match) => {
  const code = match[1];
  if (LINKING_CODES.has(code)) {
    let chats = fs.existsSync(CHATS_FILE) ? JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '[]') : [];
    if (!chats.includes(msg.chat.id)) {
      chats.push(msg.chat.id);
      fs.writeFileSync(CHATS_FILE, JSON.stringify(chats));
    }
    LINKING_CODES.delete(code);
    bot.sendMessage(msg.chat.id, "✅ ¡Cuenta vinculada con éxito desde la web!");
  } else {
    bot.sendMessage(msg.chat.id, "❌ Código inválido o expirado.");
  }
});

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
    if (PREFERRED_MODEL_SOURCE === 'LOCAL') {
      const resp = await axios.post(`${OLLAMA_HOST}/api/generate`, {
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        format: isJson ? "json" : undefined
      });
      return isJson ? JSON.parse(resp.data.response) : resp.data.response;
    } else {
      // OLLAMA NATIVO
      const resp = await axios.post(
        'https://ollama.com/api/chat',
        {
          model: "deepseek-v3.1:671b",
          messages: [
            { role: 'system', content: 'Eres un Asistente Experto en Creación de Contenidos.' },
            { role: 'user', content: prompt + (isJson ? " (Responde SOLO en JSON puro, sin markdown ni backticks)" : "") }
          ],
          stream: false,
          options: {
            temperature: 0.1
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${OLLAMA_CLOUD_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      let content = resp.data.message.content;
      if (isJson) {
        // En caso de que el LLM incluya backticks de markdown
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          content = jsonMatch[1];
        } else {
          // Alternative fallback for just backticks
          const anyMatch = content.match(/```\s*([\s\S]*?)\s*```/);
          if (anyMatch) content = anyMatch[1];
        }
        return JSON.parse(content.trim());
      }
      return content;
    }
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message);
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
    let newsResults = [];
    try {
      // 1. Search Google News via SerpApi
      const newsResp = await axios.get(`https://serpapi.com/search.json`, {
        params: {
          engine: "google_news",
          q: eventName,
          api_key: SERP_API_KEY
        },
        timeout: 5000
      });

      newsResults = (newsResp.data.news_results || []).slice(0, 3).map(n => ({
        title: n.title,
        source: n.source?.name || 'News',
        snippet: n.snippet,
        link: n.link,
        thumbnail: n.thumbnail
      }));
      
      // Extract full news content for preview
      for (const n of newsResults) {
        if (n.link) {
          try {
            const pageResp = await axios.get(n.link, { timeout: 3500 });
            const $ = cheerio.load(pageResp.data);
            let text = $('p').text().replace(/\s+/g, ' ').trim().slice(0, 1200);
            n.fullContent = text || n.snippet;
          } catch(e) {
            n.fullContent = n.snippet;
          }
        } else {
          n.fullContent = n.snippet;
        }
      }
    } catch (e) {
      console.warn("SerpApi failed, using fallback strategy", e.message);
    }

    // 2. Generate 3 Strategic Angles based on news (or fallback if empty)
    const newsContext = newsResults.length > 0 
      ? newsResults.map(n => `- TÍTULO: ${n.title}\nCONTENIDO: ${n.fullContent}`).join('\n\n')
      : "No hay noticias frescas disponibles en este momento.";

    const prompt = `Actúa como un Director de Estrategia de Contenidos senior. 
Basado en el evento "${eventName}" ${newsResults.length > 0 ? "y estas noticias recientes de Google News:" : ""}
${newsResults.length > 0 ? newsContext : ""}

Propón 3 POSTS COMPLETOS O VARIANTES para LinkedIn de un Centro de Formación Profesional.
Cada variante debe abordar la noticia/evento de forma distinta. No redactes solo el título, resume también el contenido propuesto.

IMPORTANTE: Responde solo JSON con esta estructura:
{
  "angles": [
    { "id": 1, "title": "Nombre de la Variante", "description": "Contexto general del post propuesto...", "newsRef": "${newsResults.length > 0 ? "Noticia 1" : "Tendencia General"}" },
    { "id": 2, "title": "...", "description": "...", "newsRef": "..." },
    { "id": 3, "title": "...", "description": "...", "newsRef": "..." }
  ]
}`;
    
    const aiData = await runAI(prompt);
    aiData.newsUsed = newsResults;
    res.json(aiData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en la fase de redacción. Revisa la conexión con IA." });
  }
});

// TELEGRAM LINKING ENDPOINTS
app.get('/api/telegram/status', (req, res) => {
  const chats = fs.existsSync(CHATS_FILE) ? JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8') || '[]') : [];
  res.json({ linked: chats.length > 0, count: chats.length });
});

app.post('/api/telegram/generate-code', (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  LINKING_CODES.set(code, Date.now());
  
  // Cleanup old codes (10 mins)
  setTimeout(() => LINKING_CODES.delete(code), 10 * 60 * 1000);

  res.json({ code, botUsername: "CALENDARIO_ADEACBOT" });
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

