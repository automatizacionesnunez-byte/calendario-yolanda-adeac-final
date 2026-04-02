import { useState, useEffect } from 'react';

function EventSidebar({ selectedDate, events }) {
  const [loading, setLoading] = useState(false);
  const [searchingNews, setSearchingNews] = useState(false);
  const [generations, setGenerations] = useState([]); // Array of generated post groups
  const [activeNature, setActiveNature] = useState('RELAJADO');
  const [newsResults, setNewsResults] = useState([]);
  const [selectedNews, setSelectedNews] = useState(null);

  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = selectedDate.toLocaleDateString('es-ES', options);
  
  const hasEvents = events.holiday || events.regional || events.saint || events.worldDay;

  // Search news for the current day/event
  const searchNews = async () => {
    setSearchingNews(true);
    const query = [events.holiday, events.regional, events.worldDay].filter(Boolean).join(' ');
    try {
      const resp = await fetch(`http://localhost:3001/api/search-news?q=${encodeURIComponent(query)}`);
      const data = await resp.json();
      setNewsResults(data.results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingNews(false);
    }
  };

  const generatePost = async () => {
    const allEvents = [events.holiday, events.regional, events.worldDay, events.saint].filter(Boolean).join(', ');
    if (!allEvents) return;

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventName: allEvents,
          nature: activeNature,
          newsContext: selectedNews ? `${selectedNews.title}: ${selectedNews.snippet}` : ''
        })
      });
      const data = await response.json();
      // data.variants is the array of 3 posts
      setGenerations([data.variants, ...generations]);
    } catch (err) {
      console.error(err);
      alert('Error en la generación. Verifica que el servidor esté corriendo.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('¡Copiado con éxito!');
  };

  return (
    <div className="event-details fade-in">
      <h2>Día seleccionado</h2>
      <p style={{ textTransform: 'capitalize', color: 'var(--accent-color)', marginBottom: '1rem' }}>
        {formattedDate}
      </p>

      {hasEvents ? (
        <div style={{ marginBottom: '1.5rem' }}>
          {[events.holiday, events.regional, events.worldDay, events.saint].map((ev, i) => ev && (
            <div key={i} className="event-item" style={{ fontSize: '0.9rem', marginBottom: '4px' }}>
               • {ev}
            </div>
          ))}
        </div>
      ) : (
        <p className="no-events">Sin eventos destacados.</p>
      )}

      {/* NEWS PREVIEW SECTION */}
      <div className="news-section glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)' }}>
        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>📰 NOTICIAS DEL DÍA</h4>
        
        {newsResults.length === 0 ? (
          <button 
            onClick={searchNews} 
            disabled={searchingNews || !hasEvents}
            className="secondary-btn"
            style={{ width: '100%', padding: '8px', fontSize: '0.75rem' }}
          >
            {searchingNews ? 'Buscando...' : '🔍 Buscar Noticias de Hoy'}
          </button>
        ) : (
          <div className="news-results">
            {newsResults.map(n => (
              <div 
                key={n.id} 
                onClick={() => setSelectedNews(n)}
                className={`news-card ${selectedNews?.id === n.id ? 'selected' : ''}`}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: `1px solid ${selectedNews?.id === n.id ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)'}`,
                  background: selectedNews?.id === n.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  marginBottom: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '4px' }}>{n.title}</div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>{n.snippet}</p>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent-color)', marginTop: '4px' }}>Fuente: {n.source}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI GENERATOR PANEL */}
      <div className="ai-panel glass-panel" style={{ padding: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem' }}>✨ Generador (3 Variantes)</h3>
          <div className="nature-selector" style={{ display: 'flex', gap: '4px' }}>
            {['RELAJADO', 'SERIO'].map(n => (
              <button 
                key={n}
                className={`tone-chip ${activeNature === n ? 'active' : ''}`}
                onClick={() => setActiveNature(n)}
                style={{ 
                  fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px',
                  background: activeNature === n ? (n === 'RELAJADO' ? 'var(--accent-color)' : 'var(--red-alert)') : 'rgba(255,255,255,0.05)'
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={generatePost}
          disabled={loading || !hasEvents}
          className="primary-btn"
          style={{ width: '100%', padding: '12px', fontWeight: 'bold' }}
        >
          {loading ? 'Redactando 3 Variantes...' : '🚀 Generar Propuestas'}
        </button>

        {generations.length > 0 && (
          <div className="generations-container" style={{ marginTop: '1.5rem' }}>
            {generations.map((variantGroup, gIdx) => (
              <div key={gIdx} className="variant-group" style={{ marginBottom: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Generación #{generations.length - gIdx}</div>
                <div className="variant-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {variantGroup.map((v, vIdx) => (
                    <div key={vIdx} className="variant-card fade-in" style={{ 
                      background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--accent-color)', marginBottom: '8px' }}>
                        {v.title}
                      </div>
                      <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{v.content}</div>
                      <button onClick={() => copyToClipboard(v.content)} className="copy-link">📋 Copiar</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telegram Link */}
      <div className="telegram-footer">
        <a href="https://t.me/CALENDARIO_ADEACBOT" target="_blank" rel="noreferrer">📩 Vincular Telegram</a>
      </div>
      
      <style jsx>{`
        .news-card:hover { border-color: rgba(59, 130, 246, 0.5) !important; }
        .copy-link { 
          background: none; border: none; color: var(--accent-color); 
          font-size: 0.65rem; font-weight: bold; padding: 0; margin-top: 8px; cursor: pointer;
          text-transform: uppercase;
        }
        .variant-card:hover { background: rgba(59, 130, 246, 0.03) !important; }
        .secondary-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 6px; cursor: pointer; }
        .primary-btn { background: var(--accent-color); color: white; border: none; border-radius: 8px; cursor: pointer; }
        .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .telegram-footer { margin-top: 1.5rem; text-align: center; }
        .telegram-footer a { color: #0088cc; font-size: 0.8rem; text-decoration: none; font-weight: bold; }
      `}</style>
    </div>
  );
}

export default EventSidebar;

