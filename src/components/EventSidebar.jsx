import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../apiConfig';

function EventSidebar({ selectedDate, events }) {
  // WIZARD STATES: 'IDLE', 'PLANNING', 'CHOOSING', 'GENERATING', 'FINAL'
  const [wizardStep, setWizardStep] = useState('IDLE');
  const [loading, setLoading] = useState(false);
  const [planData, setPlanData] = useState(null); // { angles: [], newsUsed: [] }
  const [chosenAngle, setChosenAngle] = useState(null);
  const [finalPost, setFinalPost] = useState(null); // { postTitle, content, visualPrompt }
  const [refineText, setRefineText] = useState('');
  const [history, setHistory] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [platform, setPlatform] = useState('LinkedIn'); // 'LinkedIn', 'Instagram', 'Twitter'

  // STATES FOR CUSTOM TOPICS & CONDITIONAL IMAGES
  const [customTopic, setCustomTopic] = useState('');
  const [entity, setEntity] = useState('EADIC'); // 'EADIC' or 'LAR University'
  const [includeImage, setIncludeImage] = useState(false); // Optional by default for LinkedIn

  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = selectedDate.toLocaleDateString('es-ES', options);
  const hasEvents = events.holiday || events.regional || events.saint || events.worldDay;
  const allEventsString = [events.holiday, events.regional, events.worldDay, events.saint].filter(Boolean).join(', ');

  // Reset wizard when date changes
  useEffect(() => {
    setWizardStep('IDLE');
    setPlanData(null);
    setChosenAngle(null);
    setFinalPost(null);
    setPreviewMode(false);
    setCustomTopic('');
    setEntity('EADIC');
    setIncludeImage(platform === 'Instagram');
  }, [selectedDate]);

  // STEP 1: START PLANNING
  const startPlanning = async () => {
    setWizardStep('PLANNING');
    setLoading(true);
    try {
      const resp = await fetch(API_ENDPOINTS.PLAN_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventName: hasEvents ? allEventsString : "Sin eventos",
          platform: platform,
          customTopic: customTopic,
          entity: entity,
          includeImage: platform === 'Instagram' ? true : includeImage
        })
      });
      const data = await resp.json();
      if (data.error || !data.angles) {
        throw new Error(data.error || "No se pudieron obtener los ángulos estratégicos de la IA.");
      }
      setPlanData(data);
      setWizardStep('CHOOSING');
    } catch (err) {
      console.error(err);
      alert('Error en la planificación: ' + err.message);
      setWizardStep('IDLE');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: CHOOSE ANGLE AND GENERATE FULL POST
  const selectAngle = async (angle) => {
    setChosenAngle(angle);
    setWizardStep('GENERATING');
    setLoading(true);
    
    // Use the news snippet associated or the first one as context
    const newsContext = planData.newsUsed?.[0] ? `${planData.newsUsed[0].title}: ${planData.newsUsed[0].snippet}` : '';

    try {
      const resp = await fetch(API_ENDPOINTS.GEN_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventName: hasEvents ? allEventsString : "Sin eventos",
          chosenAngle: angle,
          newsContext,
          platform: platform,
          customTopic: customTopic,
          entity: entity,
          includeImage: platform === 'Instagram' ? true : includeImage
        })
      });
      const data = await resp.json();
      if (data.error || !data.content) {
        throw new Error(data.error || "No se pudo generar el contenido final del post.");
      }
      setFinalPost(data);
      setWizardStep('FINAL');
    } catch (err) {
      console.error(err);
      alert('Error al generar el post final: ' + err.message);
      setWizardStep('CHOOSING');
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: REFINE VIA CHAT
  const refinePost = async () => {
    if (!refineText) return;
    setLoading(true);
    try {
      const resp = await fetch(API_ENDPOINTS.REFINE_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPost: finalPost.content,
          instruction: refineText
        })
      });
      const data = await resp.json();
      if (data.error || !data.content) {
        throw new Error(data.error || "No se pudo refinar el post.");
      }
      setFinalPost({ ...finalPost, content: data.content });
      setRefineText('');
    } catch (err) {
      console.error(err);
      alert('Error al refinar el post: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('¡Copiado con éxito!');
  };

  const addToHistory = () => {
    setHistory([finalPost, ...history]);
    alert('Post guardado en historial local.');
  };

  return (
    <div className="event-details fade-in">
      <h2>Día seleccionado</h2>
      <p className="date-display">{formattedDate}</p>

      {hasEvents ? (
        <div className="event-list">
          {[events.holiday, events.regional, events.worldDay, events.saint].map((ev, i) => ev && (
            <div key={i} className="event-item">• {ev}</div>
          ))}
        </div>
      ) : (
        <div className="no-events-badge">
          <span>✨ Día Corporativo LAR University & EADIC</span>
        </div>
      )}

      {/* WIZARD CONTAINER */}
      <div className="wizard-container glass-panel">
        
        {/* IDLE STATE */}
        {wizardStep === 'IDLE' && (
          <div className="step-idle">
             <div className="wizard-icon">✍️</div>
             <h3>Asistente de Redacción Multipantalla</h3>
             <p>Elige la red social de destino antes de generar el contenido:</p>
             
             {/* Platform selector */}
             <div className="platform-selector-pills">
               <button 
                 type="button"
                 className={`pill-btn ${platform === 'LinkedIn' ? 'active' : ''}`}
                 onClick={() => {
                   setPlatform('LinkedIn');
                   setIncludeImage(false); // Default false for LinkedIn
                 }}
               >
                 👔 LinkedIn
               </button>
               <button 
                 type="button"
                 className={`pill-btn ${platform === 'Instagram' ? 'active' : ''}`}
                 onClick={() => {
                   setPlatform('Instagram');
                   setIncludeImage(true); // Always true for Instagram
                 }}
               >
                 📸 Instagram
               </button>
               <button 
                 type="button"
                 className={`pill-btn ${platform === 'Twitter' ? 'active' : ''}`}
                 onClick={() => {
                   setPlatform('Twitter');
                   setIncludeImage(false); // Default false for Twitter
                 }}
               >
                 🐦 Twitter (X)
               </button>
             </div>

             {/* UNIFIED INTERACTIVE FORM */}
             <div className="blank-day-form fade-in">
               <div className="form-group">
                 <label className="form-label">
                   {hasEvents 
                     ? "💡 Enfoque o instrucción personalizada (Opcional):" 
                     : "💡 ¿Sobre qué quieres la publicación/noticia?"
                   }
                 </label>
                 <input 
                   type="text"
                   className="custom-topic-input"
                   placeholder={hasEvents 
                     ? "Ej: Enlazar con sostenibilidad, destacar oferta de matrículas..." 
                     : "Ej: Tendencias BIM 2026, IA en cimentaciones..."
                   }
                   value={customTopic}
                   onChange={(e) => setCustomTopic(e.target.value)}
                 />
               </div>
               
               <div className="form-group">
                 <label className="form-label">🏢 Selecciona la Institución que publica:</label>
                 <div className="entity-selector-pills">
                   <button
                     type="button"
                     className={`entity-pill ${entity === 'EADIC' ? 'active' : ''}`}
                     onClick={() => setEntity('EADIC')}
                   >
                     🏗️ EADIC
                   </button>
                   <button
                     type="button"
                     className={`entity-pill ${entity === 'LAR University' ? 'active' : ''}`}
                     onClick={() => setEntity('LAR University')}
                   >
                     🎓 LAR University
                   </button>
                 </div>
               </div>
             </div>

             {/* IMAGE SUGGESTION CHECKBOX (ONLY IF NOT INSTAGRAM) */}
             {platform !== 'Instagram' && (
               <div className="image-option-container fade-in">
                 <label className="checkbox-label">
                   <input 
                     type="checkbox"
                     checked={includeImage}
                     onChange={(e) => setIncludeImage(e.target.checked)}
                   />
                   <span>📸 Incluir sugerencia de imagen por IA (Opcional)</span>
                 </label>
               </div>
             )}

             <p className="helper-text">
               {hasEvents 
                 ? `Redactaremos la efeméride bajo el enfoque de ${entity}.`
                 : `Generaremos un post corporativo de ${entity} en base a tus preferencias.`
               }
             </p>

             <button 
               onClick={startPlanning} 
               className="primary-btn"
             >
               🚀 {hasEvents ? "Preparar noticia" : "Crear post LAR / EADIC"}
             </button>
          </div>
        )}

        {/* PLANNING STATE */}
        {wizardStep === 'PLANNING' && (
          <div className="step-loading">
            <div className="spinner"></div>
            <p>Buscando contexto y preparando borradores estratégicos...</p>
          </div>
        )}

        {/* CHOOSING STATE */}
        {wizardStep === 'CHOOSING' && planData && planData.angles && (
          <div className="step-choosing fade-in">
            <h4 className="step-title">Selecciona un Enfoque Estratégico</h4>
            <div className="angles-grid">
              {planData.angles.map(angle => (
                <div key={angle.id} className="angle-card" onClick={() => selectAngle(angle)}>
                  <div className="angle-header">
                    <span className="angle-id">#{angle.id}</span>
                    <span className="angle-label">{angle.title}</span>
                  </div>
                  <p className="angle-desc">{angle.description || "Enfoque general para el evento."}</p>
                  <div className="angle-news">📢 Ref: {angle.newsRef || "EADIC / LAR DB"}</div>
                </div>
              ))}
            </div>
            <button className="text-btn" onClick={() => setWizardStep('IDLE')}>← Volver</button>
          </div>
        )}

        {/* GENERATING STATE */}
        {wizardStep === 'GENERATING' && (
          <div className="step-loading">
            <div className="spinner"></div>
            <p>Redactando post para <b>{platform}</b> con enfoque: <b>{chosenAngle?.title}</b>...</p>
          </div>
        )}

        {wizardStep === 'FINAL' && finalPost && (
          <div className="step-final fade-in">
            <div className="final-header">
                <h4>✨ Post para {platform}</h4>
               <div className="actions">
                 <button onClick={() => setPreviewMode(true)} className="icon-btn">👁️ Preview</button>
                 <button onClick={() => copyToClipboard(finalPost.content)} className="icon-btn">📋 Copiar</button>
                 <button onClick={addToHistory} className="icon-btn">💾</button>
               </div>
            </div>

            <textarea 
              className="post-editor"
              value={finalPost.content}
              onChange={(e) => setFinalPost({...finalPost, content: e.target.value})}
              rows={10}
            />

            {finalPost.visualPrompt && (
              <div className="visual-prompt-card">
                <h5>🎨 Prompt sugerido para imágenes (Stable Diffusion XL / Midjourney)</h5>
                <p className="visual-prompt-text">{finalPost.visualPrompt}</p>
                <button 
                  type="button" 
                  onClick={() => copyToClipboard(finalPost.visualPrompt)} 
                  className="copy-prompt-btn"
                >
                  📋 Copiar prompt de imagen
                </button>
              </div>
            )}

            <div className="refine-chat">
              <input 
                type="text" 
                placeholder="Pedir cambios a la IA... (ej: más corto)"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && refinePost()}
              />
              <button onClick={refinePost} disabled={loading || !refineText} className="refine-btn">
                {loading ? '...' : '➤'}
              </button>
            </div>
            
            <button className="secondary-btn" style={{marginTop: '1rem', width: '100%'}} onClick={() => { setWizardStep('CHOOSING'); setPreviewMode(false); }}>
              🔄 Probar otro ángulo
            </button>

            {/* PREVIEW MODAL */}
            {previewMode && (
              <div className="preview-modal-overlay fade-in" onClick={() => setPreviewMode(false)}>
                <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
                   <button className="li-close-btn" onClick={() => setPreviewMode(false)}>✖</button>
                   
                   {/* DYNAMIC PLATFORM PREVIEWS */}
                   {platform === 'LinkedIn' && (
                     <div className="linkedin-mockup">
                       <div className="li-header">
                          <div className="li-avatar">👔</div>
                          <div className="li-user-info">
                            <span className="li-name">{entity === 'EADIC' ? 'EADIC School' : 'LAR University'}</span>
                            <span className="li-headline">Educación de Postgrados e Ingeniería • Ahora • 🌐</span>
                          </div>
                       </div>
                       <div className="li-content">
                         {finalPost.content.split('\n').map((para, i) => (
                            <p key={i} style={{marginBottom: '0.4rem'}}>{para}</p>
                         ))}
                       </div>
                       
                       {finalPost.visualPrompt && (
                         <div className="li-image-preview">
                           <div className="li-image-placeholder">
                             <span>🖼️ [Imagen Generada con IA]</span>
                             <p className="placeholder-prompt">"{finalPost.visualPrompt.substring(0, 80)}..."</p>
                           </div>
                         </div>
                       )}

                       <div className="li-mock-toolbar">
                          <div className="li-icons-left">
                             <span className="li-icon">📷</span>
                             <span className="li-icon">📅</span>
                             <span className="li-icon">⭐</span>
                             <span className="li-icon">➕</span>
                          </div>
                          <button className="li-publish-btn" onClick={() => copyToClipboard(finalPost.content)}>Publicar</button>
                       </div>
                     </div>
                   )}

                   {platform === 'Instagram' && (
                     <div className="instagram-mockup">
                       <div className="ig-header">
                          <div className="ig-avatar">📸</div>
                          <div className="ig-user-info">
                            <span className="ig-name">{entity === 'EADIC' ? 'eadic_school' : 'lar_university'}</span>
                            <span className="ig-location">Madrid, Spain</span>
                          </div>
                       </div>
                       
                       <div className="ig-image-area">
                         <div className="ig-image-placeholder">
                           <div className="ig-placeholder-icon">🎨</div>
                           <span className="ig-placeholder-title">Visual Layout por IA</span>
                           <p className="ig-placeholder-prompt">"{finalPost.visualPrompt || 'Concepto visual estratégico'}"</p>
                         </div>
                       </div>

                       <div className="ig-actions">
                          <div className="ig-left-actions">
                             <span className="ig-icon">❤️</span>
                             <span className="ig-icon">💬</span>
                             <span className="ig-icon">✈️</span>
                          </div>
                          <span className="ig-icon">🔖</span>
                       </div>

                       <div className="ig-caption-area">
                         <span className="ig-caption-user">{entity === 'EADIC' ? 'eadic_school' : 'lar_university'}</span>
                         <div className="ig-caption-text">
                           {finalPost.content.split('\n').map((para, i) => (
                              <p key={i} style={{marginBottom: '0.3rem'}}>{para}</p>
                           ))}
                         </div>
                       </div>
                       
                       <div className="ig-footer">
                         <button className="ig-copy-btn" onClick={() => copyToClipboard(finalPost.content)}>Copiar Leyenda e Imagen</button>
                       </div>
                     </div>
                   )}

                   {platform === 'Twitter' && (
                     <div className="twitter-mockup">
                       <div className="x-header">
                          <div className="x-avatar">🐦</div>
                          <div className="x-user-info">
                            <div className="x-user-row">
                              <span className="x-name">{entity === 'EADIC' ? 'EADIC School' : 'LAR University'}</span>
                              <span className="x-username">{entity === 'EADIC' ? '@EadicSchool' : '@LarUniversity'}</span>
                              <span className="x-dot">•</span>
                              <span className="x-time">1h</span>
                            </div>
                          </div>
                       </div>
                       <div className="x-content">
                         {finalPost.content.split('\n').map((para, i) => (
                            <p key={i} style={{marginBottom: '0.4rem'}}>{para}</p>
                         ))}
                       </div>

                       {finalPost.visualPrompt && (
                         <div className="x-card-preview">
                           <div className="x-card-placeholder">
                             <span>🖼️ [Multimodal Image Content]</span>
                             <p className="x-placeholder-prompt">"{finalPost.visualPrompt.substring(0, 100)}..."</p>
                           </div>
                         </div>
                       )}

                       <div className="x-actions">
                         <span className="x-icon">💬 12</span>
                         <span className="x-icon">🔁 45</span>
                         <span className="x-icon">❤️ 182</span>
                         <span className="x-icon">📊 4.2K</span>
                         <span className="x-icon">📤</span>
                       </div>
                       
                       <div className="x-footer">
                         <button className="x-publish-btn" onClick={() => copyToClipboard(finalPost.content)}>Copiar Tweet</button>
                       </div>
                     </div>
                   )}

                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HISTORY */}
      {history.length > 0 && (
        <div className="history-section">
          <h5>Recientes</h5>
          {history.slice(0, 3).map((h, i) => (
            <div key={i} className="history-item" onClick={() => { setFinalPost(h); setWizardStep('FINAL'); }}>
              {h.content.substring(0, 40)}...
            </div>
          ))}
        </div>
      )}

      {/* STYLES */}
      <style jsx>{`
        .date-display { text-transform: capitalize; color: var(--accent-color); font-weight: bold; margin-bottom: 1rem; }
        .event-list { margin-bottom: 1.5rem; }
        .event-item { font-size: 0.9rem; margin-bottom: 4px; color: var(--text-secondary); }
        .no-events-badge { 
          background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3);
          color: #93c5fd; padding: 10px 14px; border-radius: 8px; font-weight: 500; font-size: 0.85rem;
          margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: center;
        }
        
        .wizard-container { padding: 1.5rem; min-height: 300px; display: flex; flex-direction: column; justify-content: center; transition: all 0.3s; }
        .step-idle { text-align: center; }
        .wizard-icon { font-size: 3rem; margin-bottom: 1rem; }
        .step-idle h3 { margin-bottom: 10px; font-size: 1.1rem; }
        .step-idle p { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; }
        .helper-text { font-size: 0.75rem !important; color: #888 !important; line-height: 1.4; margin-top: 1rem !important; }

        .platform-selector-pills {
          display: flex; gap: 8px; justify-content: center; margin: 1rem 0;
          background: rgba(0, 0, 0, 0.2); padding: 5px; border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .pill-btn {
          background: transparent; border: none; color: #aaa; padding: 6px 12px;
          border-radius: 15px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;
          font-weight: 500;
        }
        .pill-btn.active {
          background: var(--accent-color); color: white; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
        }
        .pill-btn:hover:not(.active) {
          background: rgba(255,255,255,0.05); color: white;
        }

        /* DYNAMIC FORM STYLES */
        .blank-day-form {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
          text-align: left;
        }
        .form-group {
          margin-bottom: 12px;
        }
        .form-group:last-child {
          margin-bottom: 0;
        }
        .form-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .custom-topic-input {
          width: 100%;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .custom-topic-input:focus {
          border-color: var(--accent-color);
        }
        
        .entity-selector-pills {
          display: flex;
          gap: 8px;
        }
        .entity-pill {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #ccc;
          padding: 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 500;
          text-align: center;
        }
        .entity-pill.active {
          background: rgba(59, 130, 246, 0.15);
          border-color: var(--accent-color);
          color: white;
        }
        .entity-pill:hover:not(.active) {
          background: rgba(255, 255, 255, 0.08);
          color: white;
        }

        .image-option-container {
          margin: 12px 0;
          text-align: left;
          padding: 0 4px;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.78rem;
          color: #ccc;
          cursor: pointer;
        }
        .checkbox-label input {
          cursor: pointer;
        }

        .visual-prompt-card {
          background: rgba(16, 185, 129, 0.04); border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px; padding: 12px; margin: 12px 0; text-align: left;
        }
        .visual-prompt-card h5 { color: #34d399; font-size: 0.8rem; margin: 0 0 6px 0; font-weight: 600; }
        .visual-prompt-text { font-size: 0.75rem; color: #ccc; line-height: 1.4; font-style: italic; margin: 0 0 8px 0; }
        .copy-prompt-btn {
          background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399; padding: 4px 8px; border-radius: 4px; font-size: 0.65rem; cursor: pointer;
          font-weight: 500; transition: all 0.2s;
        }
        .copy-prompt-btn:hover { background: rgba(16, 185, 129, 0.2); }

        .step-loading { text-align: center; padding: 2rem 0; }
        .spinner { 
          width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent-color); 
          border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .step-title { font-size: 0.9rem; margin-bottom: 1rem; color: var(--text-secondary); text-align: center; }
        .angles-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 1rem; }
        .angle-card { 
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); 
          padding: 12px; border-radius: 8px; cursor: pointer; transition: 0.2s;
          text-align: left;
        }
        .angle-card:hover { border-color: var(--accent-color); background: rgba(59, 130, 246, 0.05); transform: translateX(5px); }
        .angle-header { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
        .angle-id { font-size: 0.7rem; font-weight: bold; color: var(--accent-color); opacity: 0.7; }
        .angle-label { font-weight: bold; font-size: 0.85rem; }
        .angle-desc { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.3; margin-bottom: 8px; }
        .angle-news { font-size: 0.65rem; color: var(--accent-color); font-style: italic; }

        .step-final { display: flex; flex-direction: column; }
        .final-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .post-editor { 
          width: 100%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); 
          color: white; padding: 12px; border-radius: 8px; font-size: 0.85rem; line-height: 1.5; outline: none;
          resize: vertical;
        }
        
        .primary-btn { background: var(--accent-color); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; transition: 0.3s; }
        .primary-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
        
        .secondary-btn { 
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); 
          color: white; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; 
          transition: 0.2s;
        }
        .secondary-btn:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); }

        .refine-chat { 
           display: flex; gap: 8px; margin-top: 15px; 
           background: #1a1a1a; padding: 6px; border-radius: 10px;
           border: 1px solid rgba(255,255,255,0.2);
           box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }
        .refine-chat input { 
           flex: 1; background: transparent; border: none; color: white; 
           outline: none; padding: 10px 14px; font-size: 0.9rem;
        }
        .refine-btn { 
           background: var(--accent-color); color: white; border: none; 
           width: 44px; border-radius: 8px; cursor: pointer; 
           font-weight: bold; transition: 0.2s;
        }
        .refine-btn:hover { transform: scale(1.05); filter: brightness(1.1); }
        .refine-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .text-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.75rem; align-self: center; }
        .icon-btn { 
          background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: white; 
          padding: 8px 14px; border-radius: 8px; cursor: pointer; margin-left: 5px; font-size: 0.85rem;
          display: flex; align-items: center; gap: 8px; font-weight: 500;
          transition: 0.2s;
        }
        .icon-btn:hover { background: rgba(255,255,255,0.18); border-color: var(--accent-color); transform: translateY(-1px); }

        .history-section { margin-top: 2rem; border-top: 1px solid rgba(255,255,255,0.1); paddingTop: 1rem; }
        .history-item { font-size: 0.7rem; color: var(--text-secondary); cursor: pointer; padding: 5px; border-radius: 4px; }
        .history-item:hover { background: rgba(255,255,255,0.05); color: white; }

        /* PREVIEW MODAL OVERLAYS */
        .preview-modal-overlay {
           position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
           background: rgba(0,0,0,0.65); z-index: 9999; display: flex; justify-content: center; align-items: center;
           backdrop-filter: blur(4px);
        }
        .preview-modal-content {
           width: 90%; max-width: 550px; position: relative; max-height: 90vh; overflow-y: auto;
           box-shadow: 0 10px 30px rgba(0,0,0,0.6); border: none; border-radius: 12px;
        }
        .li-close-btn { position: absolute; top: 14px; right: 14px; background: rgba(0,0,0,0.08); border: none; font-size: 1.1rem; cursor: pointer; color: #555; font-weight: bold; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; }
        .li-close-btn:hover { color: #000; background: rgba(0,0,0,0.15); }
        
        /* LINKEDIN MOCKUP */
        .linkedin-mockup { 
           background: #ffffff; color: #000000; border-radius: 12px; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
           text-align: left;
        }
        .li-header { display: flex; align-items: center; justify-content: flex-start; margin-bottom: 14px; gap: 10px; }
        .li-avatar { width: 46px; height: 46px; min-width: 46px; border-radius: 50%; background: #eef3f8; display: flex; justify-content: center; align-items: center; font-size: 1.4rem; }
        .li-user-info { display: flex; flex-direction: column; }
        .li-name { font-weight: 600; font-size: 0.9rem; color: #000000; line-height: 1.2; }
        .li-headline { font-size: 0.75rem; color: #666666; line-height: 1.2; }
        .li-content { font-size: 0.85rem; color: #191919; line-height: 1.5; margin-bottom: 16px; white-space: pre-wrap; word-break: break-word; }
        .li-image-preview { border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 16px; background: #f8f9fa; overflow: hidden; }
        .li-image-placeholder { padding: 40px 20px; text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; }
        .li-image-placeholder span { font-weight: 600; color: #0a66c2; font-size: 0.9rem; }
        .placeholder-prompt { font-size: 0.75rem; color: #666; font-style: italic; max-width: 80%; margin: 0; }
        .li-mock-toolbar { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ebebeb; padding-top: 14px; }
        .li-icons-left { display: flex; gap: 16px; }
        .li-icon { filter: grayscale(100%); opacity: 0.5; font-size: 1.2rem; cursor: pointer; }
        .li-publish-btn { background: #0a66c2; color: #ffffff; border: none; padding: 8px 20px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: 0.2s; }
        .li-publish-btn:hover { background: #004182; }

        /* INSTAGRAM MOCKUP */
        .instagram-mockup {
          background: #ffffff; color: #262626; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          text-align: left; display: flex; flex-direction: column; overflow: hidden;
        }
        .ig-header { display: flex; align-items: center; padding: 14px 16px; gap: 12px; border-bottom: 1px solid #efefef; }
        .ig-avatar { width: 34px; height: 34px; border-radius: 50%; background: #fafafa; display: flex; justify-content: center; align-items: center; font-size: 1.1rem; border: 1px solid #dbdbdb; }
        .ig-user-info { display: flex; flex-direction: column; }
        .ig-name { font-weight: 600; font-size: 0.85rem; color: #262626; }
        .ig-location { font-size: 0.7rem; color: #8e8e8e; }
        .ig-image-area { background: #fafafa; border-bottom: 1px solid #efefef; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; }
        .ig-image-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; gap: 8px; width: 100%; height: 100%; box-sizing: border-box; }
        .ig-placeholder-icon { font-size: 3rem; }
        .ig-placeholder-title { font-weight: bold; font-size: 1rem; color: #262626; }
        .ig-placeholder-prompt { font-size: 0.8rem; color: #8e8e8e; font-style: italic; max-width: 90%; margin: 0; line-height: 1.4; }
        .ig-actions { display: flex; justify-content: space-between; padding: 14px 16px; font-size: 1.4rem; }
        .ig-left-actions { display: flex; gap: 16px; }
        .ig-icon { cursor: pointer; }
        .ig-caption-area { padding: 0 16px 16px 16px; font-size: 0.85rem; max-height: 150px; overflow-y: auto; border-bottom: 1px solid #efefef; }
        .ig-caption-user { font-weight: bold; margin-right: 8px; }
        .ig-caption-text { display: inline; color: #262626; line-height: 1.4; }
        .ig-footer { padding: 12px 16px; display: flex; justify-content: center; background: #fafafa; }
        .ig-copy-btn { background: #0095f6; color: white; border: none; width: 100%; padding: 10px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: 0.2s; }
        .ig-copy-btn:hover { background: #1877f2; }

        /* TWITTER MOCKUP */
        .twitter-mockup {
          background: #15202b; color: #ffffff; border-radius: 12px; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          text-align: left;
        }
        .x-header { display: flex; gap: 12px; margin-bottom: 12px; }
        .x-avatar { width: 44px; height: 44px; border-radius: 50%; background: #192734; display: flex; justify-content: center; align-items: center; font-size: 1.3rem; }
        .x-user-info { display: flex; flex-direction: column; justify-content: center; }
        .x-user-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .x-name { font-weight: bold; font-size: 0.9rem; color: white; }
        .x-username { font-size: 0.8rem; color: #8899a6; }
        .x-dot { color: #8899a6; font-size: 0.8rem; }
        .x-time { color: #8899a6; font-size: 0.8rem; }
        .x-content { font-size: 0.95rem; color: #ffffff; line-height: 1.4; white-space: pre-wrap; word-break: break-word; margin-bottom: 14px; }
        .x-card-preview { border: 1px solid #38444d; border-radius: 12px; overflow: hidden; margin-bottom: 14px; background: #192734; }
        .x-card-placeholder { padding: 30px 16px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
        .x-card-placeholder span { color: #1d9bf0; font-weight: bold; font-size: 0.85rem; }
        .x-placeholder-prompt { font-size: 0.75rem; color: #8899a6; font-style: italic; margin: 0; }
        .x-actions { display: flex; justify-content: space-between; max-width: 420px; color: #8899a6; font-size: 0.8rem; border-top: 1px solid #38444d; padding-top: 12px; }
        .x-icon { cursor: pointer; transition: 0.2s; }
        .x-icon:hover { color: #1d9bf0; }
        .x-footer { margin-top: 16px; display: flex; justify-content: flex-end; }
        .x-publish-btn { background: #1d9bf0; color: white; border: none; padding: 8px 18px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; cursor: pointer; transition: 0.2s; }
        .x-publish-btn:hover { background: #1a8cd8; }
      `}</style>
    </div>
  );
}

export default EventSidebar;
