require('dotenv').config();
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
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_TOKEN;
const OLLAMA_CLOUD_API_KEY = process.env.GROQ_API_KEY || process.env.OLLAMA_CLOUD_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY || process.env.SERP_API_KEY;

// Use /tmp for transient storage in Vercel. For persistent storage, use a DB.
const CHATS_FILE = '/tmp/chats.json';
const LINKING_CODES = new Map();

// Use direct require for JSON files to ensure they are bundled by Vercel
const holidays = require('../src/data/holidays.json');
const saints = require('../src/data/saints.json');
const worldDays = require('../src/data/worldDays.json');
const regional = require('../src/data/regional.json');
const eadicLarDb = require('../src/data/eadic_lar.json');

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

// Currently Active OpenRouter Free Models fallback list
const OPENROUTER_FREE_MODELS = [
  "openrouter/free", // Generic router that dynamically routes to the best free model!
  "qwen/qwen3-next-80b-a3b-instruct:free", // Qwen free model!
  "meta-llama/llama-3.3-70b-instruct:free", // Llama 3.3 70B free!
  "deepseek/deepseek-v4-flash:free", // DeepSeek free!
  "qwen/qwen3-coder:free" // Qwen Coder free!
];

/** AI LOGIC **/
const runAI = async (prompt, isJson = true) => {
  let lastError = null;
  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      console.log(`Intentando con el modelo: ${model}...`);
      const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: model,
        messages: [
          { role: 'system', content: 'Eres un Asistente Experto en Creación de Contenidos.' },
          { role: 'user', content: prompt + (isJson ? " (Responde SOLO en JSON puro, sin markdown ni backticks)" : "") }
        ],
        temperature: 0.1
      }, {
        headers: { 
          'Authorization': `Bearer ${OLLAMA_CLOUD_API_KEY}`, 
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://calendario-yolanda.vercel.app',
          'X-Title': 'Calendario Yolanda'
        }
      });
      
      let content = resp.data.choices[0].message.content;
      if (isJson) {
        // Handle markdown backticks if any
        const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
        return JSON.parse(match[1].trim());
      }
      return content;
    } catch (err) {
      console.warn(`Error con el modelo ${model} en OpenRouter:`, err.response?.data || err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("Todos los modelos de OpenRouter fallaron");
};

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
    // Search Google News for the event
    let newsResults = [];
    try {
      const newsResp = await axios.get(`https://serpapi.com/search.json`, {
        params: {
          engine: "google_news",
          q: eventName,
          api_key: SERP_API_KEY
        },
        timeout: 4000
      });
      newsResults = (newsResp.data.news_results || []).slice(0, 3).map(n => ({
        title: n.title,
        snippet: n.snippet,
        source: n.source?.name || 'Google News'
      }));
    } catch (e) {
      console.warn("SerpApi news search failed.", e.message);
    }
    
    contextInfo = `Efeméride/Evento del día: "${eventName}".
El post se publicará a nombre de la institución **${entity}** y deberá enlazar estratégicamente el significado de este día festivo/efeméride con los valores, visión y especialidades técnicas de **${entity}**.
${customTopic ? `INSTRUCCIÓN DE ENFOQUE ADICIONAL DEL USUARIO: El usuario ha solicitado enfocar/redactar este festivo con la siguiente instrucción: "${customTopic}".` : ''}

Base de conocimientos e información clave de **${entity}**:
${entityDb}
${newsResults.length > 0 ? `\nNoticias y contexto reciente sobre "${eventName}":\n${newsResults.map(n => `- ${n.title} (Fuente: ${n.source}): ${n.snippet}`).join('\n')}` : ''}
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

Devuelve JSON ESTRICTO con este formato exacto:
{ 
  "angles": [
    { "id": 1, "title": "Nombre de la Variante", "description": "...", "newsRef": "..." },
    { "id": 2, "title": "...", "description": "...", "newsRef": "..." },
    { "id": 3, "title": "...", "description": "...", "newsRef": "..." }
  ] 
}`;

  try {
    const aiData = await runAI(prompt);
    res.json(aiData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate-full-post', async (req, res) => {
  const { eventName, chosenAngle, platform = 'LinkedIn', customTopic = "", entity = "EADIC", includeImage = false } = req.body;
  
  let isBlankDay = !eventName || eventName === "Sin eventos" || eventName.trim() === "";
  
  let entityDb = "";
  if (entity === 'EADIC') {
    entityDb = `
- EADIC (${eadicLarDb.EADIC.name}): ${eadicLarDb.EADIC.description}
  Áreas: ${eadicLarDb.EADIC.key_areas.map(a => `${a.area}`).join(', ')}
`;
  } else {
    entityDb = `
- LAR University (${eadicLarDb.LAR_University.name}): ${eadicLarDb.LAR_University.description}
  Enfoques: ${eadicLarDb.LAR_University.key_areas.map(a => `${a.area}`).join(', ')}
`;
  }

  const prompt = `Actúa como un Redactor de Contenidos y Community Manager Senior para la marca **${entity}**.
Redacta una publicación final para la plataforma ${platform}.

TEMA/EVENTO PRINCIPAL: "${isBlankDay ? (customTopic || chosenAngle.title) : eventName}"
ÁNGULO DE CONTENIDO SELECCIONADO: "${chosenAngle.title}" - "${chosenAngle.description}".
${customTopic && !isBlankDay ? `ENFOQUE O INSTRUCCIÓN ADICIONAL SOLICITADA POR EL USUARIO: "${customTopic}"` : ''}

Información de contexto de la marca ${entity}:
${entityDb}

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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/refine-post', async (req, res) => {
  const { currentPost, instruction } = req.body;
  const prompt = `Actúa como un experto en estrategia de contenido y redes sociales.
Tengo este post:
---
${currentPost}
---
Aplica la siguiente instrucción de mejora: "${instruction}".
Mantén el tono y formato adecuado para la red social original.
Devuelve JSON ESTRICTO con este formato: { "content": "Aquí el post corregido..." }`;
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
  if (events.worldDay) { message += `🌐 Día Internacional: ${events.worldDay}\n`; hasEvents = true; }
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




