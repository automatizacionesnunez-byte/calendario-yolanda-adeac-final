import axios from 'axios';

const KEY = '2c5da62822b44fe592c97b24aa1d198a.vcdp6sFgJDf-YyRj5ykeAWKZ';

async function testSilicon() {
  console.log("🔍 Probando SiliconFlow...");
  try {
    const resp = await axios.post('https://api.siliconflow.cn/v1/chat/completions', {
      model: "vendor/meta-llama/Llama-3.3-70B-Instruct", // Common model name there
      messages: [{ role: 'user', content: 'test' }],
    }, {
      headers: { 'Authorization': `Bearer ${KEY}` }
    });
    console.log("✅ SiliconFlow funciona!", resp.data.choices[0].message.content);
  } catch (e) {
    console.log("❌ SiliconFlow falló:", e.response?.data || e.message);
  }
}

testSilicon();
