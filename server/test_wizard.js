import axios from 'axios';

async function testWizard() {
  console.log("🚀 Iniciando Test de Flujo: Asistente de Redacción...");

  try {
    // 1. PLANIFICACIÓN
    console.log("\n1️⃣ Fase: Planificación (Noticias + Ángulos)");
    const planRes = await axios.post('http://localhost:3001/api/plan-post', {
      eventName: "Día Mundial de la Educación"
    });
    
    const { angles, newsUsed } = planRes.data;
    console.log(`✅ Noticias encontradas: ${newsUsed?.length || 0}`);
    console.log("📐 Ángulos propuestos:");
    angles.forEach(a => console.log(`   - [${a.id}] ${a.title}: ${a.description}`));

    // 2. GENERACIÓN
    const selectedAngle = angles[0];
    console.log(`\n2️⃣ Fase: Generación de Post (Ángulo seleccionado: ${selectedAngle.title})`);
    const genRes = await axios.post('http://localhost:3001/api/generate-full-post', {
      eventName: "Día Mundial de la Educación",
      holidayKey: "01-24",
      selectedAngle: selectedAngle
    });

    const { postContent } = genRes.data;
    console.log("📝 Post Generado:");
    console.log("--------------------------------------------------");
    console.log(postContent);
    console.log("--------------------------------------------------");

    // 3. REFINAMIENTO
    console.log("\n3️⃣ Fase: Refinamiento (Chat)");
    const refineRes = await axios.post('http://localhost:3001/api/refine-post', {
      originalPost: postContent,
      feedback: "Añade un tono más motivador y menciona la importancia de la digitalización."
    });

    console.log("✨ Post Refinado:");
    console.log(refineRes.data.refinedPost);

  } catch (error) {
    console.error("❌ Fallo en el test:", error.response?.data || error.message);
  }
}

testWizard();
