import Groq from 'groq-sdk';
import axios from 'axios';

const GROQ_API_KEY = '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';

async function diagnose() {
  console.log("🔍 Diagnosticando Conexión AI...");

  // Test Groq models
  const models = ["llama-3.3-70b-versatile", "llama3-70b-8192", "mixtral-8x7b-32768"];
  for (const model of models) {
    console.log(`📡 Probando Groq model: ${model}...`);
    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: 'test' }],
        model: model,
      });
      console.log(`✅ ${model} funciona!`);
      break;
    } catch (e) {
      console.log(`❌ ${model} falló:`, e.message);
    }
  }

  // Test Local Ollama
  console.log("\n🏠 Probando Ollama Local (11434)...");
  try {
    const resp = await axios.get('http://localhost:11434/api/tags');
    console.log("✅ Ollama Local respondio!", resp.data.models.map(m => m.name));
  } catch (e) {
    console.log("❌ Ollama Local falló:", e.message);
  }
}

diagnose();
