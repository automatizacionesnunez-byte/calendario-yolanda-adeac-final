import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../apiConfig';

function EventSidebar({ selectedDate, events }) {
  // WIZARD STATES: 'IDLE', 'PLANNING', 'CHOOSING', 'GENERATING', 'FINAL'
  const [wizardStep, setWizardStep] = useState('IDLE');
  const [loading, setLoading] = useState(false);
  const [planData, setPlanData] = useState(null); // { angles: [], newsUsed: [] }
  const [chosenAngle, setChosenAngle] = useState(null);
  const [finalPost, setFinalPost] = useState(null); // { postTitle, content }
  const [refineText, setRefineText] = useState('');
  const [history, setHistory] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);

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
  }, [selectedDate]);

  // STEP 1: START PLANNING
  const startPlanning = async () => {
    if (!allEventsString) return;
    setWizardStep('PLANNING');
    setLoading(true);
    try {
      const resp = await fetch(API_ENDPOINTS.PLAN_POST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName: allEventsString })
      });
      const data = await resp.json();
      setPlanData(data);
      setWizardStep('CHOOSING');
    } catch (err) {
      console.error(err);
      alert('Error en la redacción. Revisa que el servidor y Ollama/Groq estén activos.');
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
          eventName: allEventsString,
          chosenAngle: angle,
          newsContext
        })
      });
      const data = await resp.json();
      setFinalPost(data);
      setWizardStep('FINAL');
    } catch (err) {
      console.error(err);
      alert('Error al generar el post final.');
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
      setFinalPost({ ...finalPost, content: data.content });
      setRefineText('');
    } catch (err) {
      console.error(err);
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
        <p className="no-events">Sin eventos destacados.</p>
      )}

      {/* WIZARD CONTAINER */}
      <div className="wizard-container glass-panel">
        
        {/* IDLE STATE */}
        {wizardStep === 'IDLE' && (
          <div className="step-idle">
             <div className="wizard-icon">✍️</div>
             <h3>Asistente de Redacción</h3>
             <p>Analizaremos el contexto actual para redactar el mejor post para hoy.</p>
             <button 
               onClick={startPlanning} 
               disabled={!hasEvents}
               className="primary-btn"
             >
               🚀 Preparar noticia
             </button>
          </div>
        )}

        {/* PLANNING STATE */}
        {wizardStep === 'PLANNING' && (
          <div className="step-loading">
            <div className="spinner"></div>
            <p>Buscando contexto y preparando borradores...</p>
          </div>
        )}

        {/* CHOOSING STATE */}
        {wizardStep === 'CHOOSING' && planData && (
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
                  <div className="angle-news">📰 Ref: {angle.newsRef || "N/A"}</div>
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
            <p>Redactando post institucional con enfoque: <b>{chosenAngle?.title}</b>...</p>
          </div>
        )}

        {wizardStep === 'FINAL' && finalPost && (
          <div className="step-final fade-in">
            <div className="final-header">
                <h4>✨ Post Generado</h4>
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
              rows={12}
            />
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
            
            <button className="secondary-btn" style={{marginTop: '1.5rem', width: '100%'}} onClick={() => { setWizardStep('CHOOSING'); setPreviewMode(false); }}>
              🔄 Probar otro ángulo
            </button>

            {/* MODAL MOCKUP LINKEDIN */}
            {previewMode && (
              <div className="preview-modal-overlay fade-in" onClick={() => setPreviewMode(false)}>
                <div className="preview-modal-content linkedin-mockup" onClick={(e) => e.stopPropagation()}>
                   <button className="li-close-btn" onClick={() => setPreviewMode(false)}>✕</button>
                   <div className="li-header">
                      <div className="li-avatar">🗓️</div>
                      <div className="li-user-info">
                        <span className="li-name">Yolanda ADEAC</span>
                        <span className="li-headline">Administración Pública • Ahora • 🌍</span>
                      </div>
                   </div>
                   <div className="li-content">
                     {finalPost.content.split('\n').map((para, i) => (
                        <p key={i}>{para}</p>
                     ))}
                   </div>
                   <div className="li-mock-toolbar">
                      <div className="li-icons-left">
                         <span className="li-icon">📷</span>
                         <span className="li-icon">📅</span>
                         <span className="li-icon">⭐</span>
                         <span className="li-icon">➕</span>
                      </div>
                      <button className="li-publish-btn" onClick={() => copyToClipboard(finalPost.content)}>Copiar y Publicar</button>
                   </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HISTORY (Optional) */}
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
        
        .wizard-container { padding: 1.5rem; min-height: 300px; display: flex; flex-direction: column; justify-content: center; transition: all 0.3s; }
        .step-idle { text-align: center; }
        .wizard-icon { font-size: 3rem; margin-bottom: 1rem; }
        .step-idle h3 { margin-bottom: 10px; font-size: 1.1rem; }
        .step-idle p { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.5rem; }

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
        .refine-chat { display: flex; gap: 8px; margin-top: 10px; background: rgba(255,255,255,0.05); padding: 5px; border-radius: 8px; }
        .refine-chat input { flex: 1; background: transparent; border: none; color: white; outline: none; padding: 8px; font-size: 0.8rem; }
        .refine-chat button { background: var(--accent-color); color: white; border: none; width: 35px; border-radius: 6px; cursor: pointer; }
        
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

        /* LINKEDIN MOCKUP MODAL */
        .preview-modal-overlay {
           position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
           background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center;
           backdrop-filter: blur(4px);
        }
        .preview-modal-content {
           width: 90%; max-width: 550px; position: relative; max-height: 90vh; overflow-y: auto;
           box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: none;
        }
        .li-close-btn { position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #666; font-weight: bold; }
        .li-close-btn:hover { color: #000; }
        
        .linkedin-mockup { 
           background: #ffffff; color: #000000; border-radius: 8px; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
           text-align: left;
        }
        .li-header { display: flex; align-items: center; justify-content: flex-start; margin-bottom: 12px; gap: 10px; }
        .li-avatar { width: 48px; height: 48px; min-width: 48px; border-radius: 50%; background: #eef3f8; display: flex; justify-content: center; align-items: center; font-size: 1.5rem; }
        .li-user-info { display: flex; flex-direction: column; }
        .li-name { font-weight: 600; font-size: 0.9rem; color: #000000; line-height: 1.2; }
        .li-headline { font-size: 0.75rem; color: #666666; line-height: 1.2; }
        .li-content { font-size: 0.85rem; color: #000000; line-height: 1.5; margin-bottom: 24px; white-space: pre-wrap; word-break: break-word; }
        .li-content p { margin-bottom: 0.5rem; }
        .li-mock-toolbar { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ebebeb; padding-top: 12px; }
        .li-icons-left { display: flex; gap: 16px; }
        .li-icon { filter: grayscale(100%); opacity: 0.5; font-size: 1.2rem; cursor: pointer; }
        .li-publish-btn { background: #0a66c2; color: #ffffff; border: none; padding: 6px 16px; border-radius: 16px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: 0.2s; }
        .li-publish-btn:hover { background: #004182; }
      `}</style>
    </div>
  );
}

export default EventSidebar;


