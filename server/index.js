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
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'; // Default to local but can be cloud IP
const PREFERRED_MODEL_SOURCE = process.env.MODEL_SOURCE || 'GROQ'; // 'GROQ' or 'OLLAMA'

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
 * AI POST GENERATION
 */
app.post('/api/generate-post', async (req, res) => {
  const { eventName, nature, newsContext } = req.body;

  const systemPrompt = `Actúa como un Director de Estrategia de Contenidos senior. Redacta 3 variantes de un post de LinkedIn para un Centro de Formación.
Buscamos la VOZ de un HUMANO experto, no de un bot corporativo.

REGLAS DE ORO (Filtro Anti-IA):
- Prohibido usar clichés: "En el dinámico entorno actual", "Es crucial", "Un viaje hacia...", "No solo... sino también".
- El Gancho (Hook): 2 líneas obligatorias impactantes.
- Estructura: Gancho -> Desarrollo breve -> Cierre con pregunta debativa.
- Ritmo: Frases cortas y contundentes.
- Noticias: Si se proporciona contexto, úsalo para dar actualidad.

Variables:
Tema: ${eventName}
Naturaleza: ${nature}
Contexto de Noticias: ${newsContext || 'N/A'}

IMPORTANTE: Devuelve la respuesta en formato JSON puro con esta estructura:
{
  "variants": [
    { "title": "Variante 1 (Enfoque Empatía)", "content": "..." },
    { "title": "Variante 2 (Enfoque Autoritario)", "content": "..." },
    { "title": "Variante 3 (Enfoque Provocador)", "content": "..." }
  ]
}`;

  try {
    if (PREFERRED_MODEL_SOURCE === 'OLLAMA') {
      const resp = await axios.post(`${OLLAMA_HOST}/api/generate`, {
        model: "llama3.3",
        prompt: systemPrompt,
        stream: false,
        format: "json"
      });
      const data = JSON.parse(resp.data.response);
      res.json(data);
    } else {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'system', content: systemPrompt + " (Asegúrate de responder en formato JSON)" }],
        model: "llama-3.3-70b-versatile",
        response_format: { "type": "json_object" }
      });
      const data = JSON.parse(completion.choices[0].message.content);
      res.json(data);
    }
  } catch (error) {
    console.error('Generation Error:', error);
    res.status(500).json({ error: 'Error generating variants' });
  }
});

/**
 * NEWS SEARCH (SIMULATED FOR NOW WITH REAL DATA FOR DEMO)
 */
app.get('/api/search-news', (req, res) => {
  const query = req.query.q || '';
  // Simulated news response based on the search I performed
  const news = [
    {
      id: 1,
      title: "Campaña 'Menos juicios. Más apoyos' - Día Autismo 2026",
      snippet: "La Confederación Autismo España pide evitar prejuicios cotidianos ante comportamientos diferentes, promoviendo la neurodiversidad.",
      source: "servimedia.es",
      url: "https://www.servimedia.es"
    },
    {
      id: 2,
      title: "Asamblea de Madrid se ilumina de azul",
      snippet: "Edificios emblemáticos de toda España se tiñen de azul para visibilizar el TEA y las necesidades de salud mental.",
      source: "europapress.es",
      url: "https://www.europapress.es"
    }
  ];
  res.json({ results: news });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running. API on port ${PORT}`);
});

