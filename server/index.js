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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OLLAMA_CLOUD_API_KEY = process.env.GROQ_API_KEY || process.env.OLLAMA_CLOUD_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b'; // Optimized for strategic content
const PREFERRED_MODEL_SOURCE = process.env.MODEL_SOURCE || 'CLOUD'; // default to cloud

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// STORAGE
const CHATS_FILE = path.join(__dirname, 'chats.json');
const DATA_DIR = path.join(__dirname, '../src/data');
const LINKING_CODES = new Map(); // Store code -> timestamp

// Use direct require for JSON EADIC/LAR DB
const eadicLarDb = require('../src/data/eadic_lar.json');

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
  if (events.worldDay) { message += `🌐 Día Internacional: ${events.worldDay}\n`; hasEvents = true; }
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

// OpenRouter Free Models fallback list
const OPENROUTER_FREE_MODELS = [
  "openrouter/free", // Generic router that dynamically routes to the best free model!
  "qwen/qwen3-next-80b-a3b-instruct:free", // Qwen free model!
  "meta-llama/llama-3.3-70b-instruct:free", // Llama 3.3 70B free!
  "deepseek/deepseek-v4-flash:free", // DeepSeek free!
  "qwen/qwen3-coder:free" // Qwen Coder free!
];

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
      // OPENROUTER FALLBACK SYSTEM (Replacing OLLAMA NATIVO)
      let lastError = null;
      for (const model of OPENROUTER_FREE_MODELS) {
        try {
          const resp = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model: model,
              messages: [
                { role: 'system', content: 'Eres un Asistente Experto en Creación de Contenidos.' },
                { role: 'user', content: prompt + (isJson ? " (Responde SOLO en JSON puro, sin markdown ni backticks)" : "") }
              ],
              temperature: 0.1
            },
            {
              headers: {
                'Authorization': `Bearer ${OLLAMA_CLOUD_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://calendario-yolanda.vercel.app',
                'X-Title': 'Calendario Yolanda'
              }
            }
          );
          
          let content = resp.data.choices[0].message.content;
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
        } catch (err) {
          console.warn(`Error con el modelo ${model} en OpenRouter:`, err.response?.data || err.message);
          lastError = err;
        }
      }
      throw lastError || new Error("Todos los modelos de OpenRouter fallaron");
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
  const { eventName, platform = 'LinkedIn', customTopic = "", entity = "EADIC", includeImage = false } = req.body;

  let isBlankDay = !eventName || eventName === "Sin eventos" || eventName.trim() === "";
  let contextInfo = "";

  // Load from local JSON DB only for the selected entity!
  let entityDb = "";
  if (entity === 'EADIC') {
    entityDb = `
- EADIC (${eadicLarDb.EADIC.name}): ${eadicLarDb.EADIC.description}
  Áreas Clave: ${eadicLarDb.EADIC.key_areas.map(a => `${a.area} (${a.details})`).join('; ')}
  Fortalezas de EADIC: ${eadicLarDb.EADIC.strengths.join(' ')}
`;
  } else {
    entityDb = `
- LAR University (${eadicLarDb.LAR_University.name}): ${eadicLarDb.LAR_University.description}
  Áreas de Enfoque: ${eadicLarDb.LAR_University.key_areas.map(a => `${a.area} (${a.details})`).join('; ')}
  Ventajas de LAR University: ${eadicLarDb.LAR_University.strengths.join(' ')}
`;
  }

  try {
    if (isBlankDay) {
      // Search web using SerpApi focusing on entity + customTopic
      let searchQuery = `${entity} ${customTopic || "ingeniería educación posgrado"}`;
      let searchResults = [];
      try {
        const searchResp = await axios.get(`https://serpapi.com/search.json`, {
          params: {
            engine: "google",
            q: searchQuery,
            api_key: SERP_API_KEY
          },
          timeout: 4500
        });
        searchResults = (searchResp.data.organic_results || []).slice(0, 3).map(o => ({
          title: o.title,
          snippet: o.snippet
        }));
      } catch (e) {
        console.warn("SerpApi global search failed, using database.", e.message);
      }

      const searchContext = searchResults.length > 0
        ? searchResults.map(s => `- TÍTULO: ${s.title}\nSINOPSIS: ${s.snippet}`).join('\n')
        : "";

      contextInfo = `Día corporativo libre. El post debe centrarse única y exclusivamente en la marca **${entity}**.
${customTopic ? `El usuario ha pedido que la temática específica del post sea: "${customTopic}".` : 'El usuario no ha definido temática, puedes proponer temas corporativos generales de alto interés educativo.'}

Base de conocimientos de la marca ${entity}:
${entityDb}
${searchContext ? `\nInformación pública reciente encontrada en internet sobre ${searchQuery}:\n${searchContext}` : ''}
`;
    } else {
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

      contextInfo = `Efeméride/Evento del día: "${eventName}".
El post se publicará a nombre de la institución **${entity}** y deberá enlazar estratégicamente el significado de este día festivo/efeméride con los valores, visión y especialidades técnicas de **${entity}**.
${customTopic ? `INSTRUCCIÓN DE ENFOQUE ADICIONAL DEL USUARIO: El usuario ha solicitado enfocar/redactar este festivo con la siguiente instrucción: "${customTopic}".` : ''}

Base de conocimientos e información clave de **${entity}**:
${entityDb}
${newsContext.length > 0 ? `\nNoticias y contexto reciente sobre "${eventName}":\n${newsContext}` : ''}
`;
    }

    const prompt = `Actúa como Director de Estrategia de Contenidos y Redes Sociales de **${entity}**.
Plataforma de destino: ${platform}.
Contexto del día:
${contextInfo}

Propón 3 ángulos estratégicos de publicación adaptados específicamente para la red social ${platform}.
Asegúrate de que la temática de los ángulos esté directamente ligada al contexto e institución asignada (${entity}) y al evento si existiese.
- Si es LinkedIn: Enfoques profesionales, de liderazgo intelectual, empleabilidad o técnicos corporativos de gran solidez.
- Si es Instagram: Enfoques sumamente visuales, inspiradores, basados en estilo de vida técnico, retos de ingeniería, o infografías recomendadas.
- Si es Twitter: Enfoques ultra-concisos y directos, ganchos rápidos o preguntas constructivas del sector.

IMPORTANTE: Responde solo JSON con esta estructura:
{
  "angles": [
    { "id": 1, "title": "Nombre de la Variante", "description": "Contexto general del post propuesto...", "newsRef": "${isBlankDay ? "EADIC / LAR DB" : "Noticia 1"}" },
    { "id": 2, "title": "...", "description": "...", "newsRef": "..." },
    { "id": 3, "title": "...", "description": "...", "newsRef": "..." }
  ]
}`;
    
    const aiData = await runAI(prompt);
    // Attach search details if applicable
    aiData.newsUsed = isBlankDay ? [] : (contextInfo.includes('TÍTULO') ? contextInfo : []);
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
  const { eventName, chosenAngle, newsContext, platform = 'LinkedIn', customTopic = "", entity = "EADIC", includeImage = false } = req.body;

  let isBlankDay = !eventName || eventName === "Sin eventos" || eventName.trim() === "";

  const dbContext = isBlankDay ? `
- EADIC (${eadicLarDb.EADIC.name}): ${eadicLarDb.EADIC.description}
  Áreas: ${eadicLarDb.EADIC.key_areas.map(a => `${a.area}`).join(', ')}
- LAR University (${eadicLarDb.LAR_University.name}): ${eadicLarDb.LAR_University.description}
  Enfoques: ${eadicLarDb.LAR_University.key_areas.map(a => `${a.area}`).join(', ')}
` : "";

  const prompt = `Actúa como un Redactor de Contenidos y Community Manager Senior para la marca **${entity}**.
Redacta una publicación final para la plataforma ${platform}.

TEMA/EVENTO PRINCIPAL: "${isBlankDay ? (customTopic || chosenAngle.title) : eventName}"
ÁNGULO DE CONTENIDO SELECCIONADO: "${chosenAngle.title}" - "${chosenAngle.description}".
${customTopic && !isBlankDay ? `ENFOQUE O INSTRUCCIÓN ADICIONAL SOLICITADA POR EL USUARIO: "${customTopic}"` : ''}

Información de contexto de la marca ${entity}:
${dbContext}

REGLAS DE FORMATO POR RED SOCIAL:
- **LinkedIn**: Tono institucional, profesional y experto. Gancho potente en las primeras 2 líneas, desarrollo estructurado con viñetas claras, llamada a la acción (CTA) reflexiva y profesional, y 3-5 hashtags relevantes.
- **Instagram**: Tono inspirador, sumamente visual, cercano y dinámico. Usa emojis estratégicos al inicio de cada párrafo. Deja espacios y saltos de línea claros para lectura rápida. Llama a la acción para interactuar y comentar. Pon los hashtags en un bloque separado abajo.
- **Twitter (X)**: Tweet conciso y de alto impacto. Debe caber estrictamente en menos de 280 caracteres totales (incluyendo emojis y 1-2 hashtags clave).

${includeImage ? `ADICIONALMENTE: Dado que se solicitó incluir imagen (includeImage = true), debes diseñar un prompt de texto a imagen (Text-to-Image Prompt) optimizado en inglés.
- El prompt de la imagen debe estar estrechamente relacionado con el contenido del post.
- Adapta el estilo visual a la red social:
  - Para **Instagram**: Altamente estético, artístico, moderno, colores vibrantes y llamativos, diseño premium que wowee en el feed.
  - Para **LinkedIn**: Profesional, corporativo, limpio, técnicos o ingenieros trabajando con tecnología en oficinas modernas, o renders 3D minimalistas.
  - Para **Twitter**: Infografía técnica conceptual limpia, estilo vectorial minimalista o arte tecnológico futurista.
- El prompt debe estar en inglés y detallar entorno, sujeto, iluminación cinematográfica y detalles 8k para alta calidad.` : 'NOTA: includeImage = false. No debes preocupar por generar un prompt visual de alta calidad, pero puedes poner una breve sugerencia vacía en el JSON.'}

Devuelve obligatoriamente un objeto JSON ESTRICTO con la siguiente estructura:
{
  "postTitle": "Título interno o idea principal del post",
  "content": "Contenido completo del post redactado según las reglas de formato indicadas para la plataforma",
  "visualPrompt": "${includeImage ? "A highly detailed English image prompt strictly related to this post content... (e.g. 'A professional civil engineer in a smart city looking at holographic BIM structures...')" : ""}"
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
Tengo este post de LinkedIn/Instagram/Twitter:
---
${currentPost}
---
POR FAVOR, modifícalo siguiendo esta instrucción del usuario: "${instruction}"

Manten el tono institucional y la estructura profesional adecuada.
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


