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

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURATION
const TELEGRAM_TOKEN = '8345771818:AAFr46y69EMVJ_ykva9mS3KdAeQ2F4yYbuQ';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';

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
 * AI POST GENERATION (GROQ)
 */
app.post('/api/generate-post', async (req, res) => {
  const { fileName, eventName, nature } = req.body; // nature: 'SERIO' or 'RELAJADO'

  try {
    const systemPrompt = `Actúa como un Director de Estrategia de Contenidos senior. Redacta un post de LinkedIn para un Centro de Formación. No queremos un texto corporativo estándar, sino la voz de un experto que habla de tú a tú.

REGLAS DE ORO (Filtro Anti-IA):
- Prohibido usar clichés: "En el dinámico entorno actual", "Es crucial destacar", "Un viaje hacia...", "No solo... sino también".
- El Gancho (Hook): 2 líneas obligatorias (emocional o provocador).
- Estructura: Gancho -> Desarrollo de máximo 3 párrafos cortos -> Cierre con pregunta debativa.
- Ritmo: Varía longitud de frases. Usa frases muy cortas.
- Voz: Primera persona (yo o nosotros). No uses voz pasiva.
- "Empatía Basada en el Respeto" para temas serios y "Curiosidad Profesional" para festividades.
- SÉ HUMANO: Escribe como si lo redactaras tras un café.

Variables:
Tema: ${eventName}
Naturaleza: ${nature}

IMPORTANTE: Devuelve la respuesta en formato JSON puro con esta estructura:
{
  "post": "El contenido del post aquí"
}`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'system', content: systemPrompt + " (Asegúrate de responder en formato JSON)" }],
      model: "llama-3.3-70b-versatile",
      response_format: { "type": "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    res.json(response);
  } catch (error) {
    console.error('Groq Error:', error);
    res.status(500).json({ error: 'Error generating post' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server and Bot running. API on port ${PORT}`);
});
