import { useState } from 'react';

function EventSidebar({ selectedDate, events }) {
  const [loading, setLoading] = useState(false);
  const [generations, setGenerations] = useState([]); // Array of generated posts
  const [activeNature, setActiveNature] = useState('RELAJADO');

  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = selectedDate.toLocaleDateString('es-ES', options);
  
  const hasEvents = events.holiday || events.regional || events.saint || events.worldDay;

  const generatePost = async () => {
    // Collect all event text
    const allEvents = [events.holiday, events.regional, events.worldDay, events.saint].filter(Boolean).join(', ');
    if (!allEvents) return;

    setLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/generate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventName: allEvents,
          nature: activeNature 
        })
      });
      const data = await response.json();
      setGenerations([data.post, ...generations]);
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
      <p style={{ textTransform: 'capitalize', color: 'var(--accent-color)', marginBottom: '1.5rem' }}>
        {formattedDate}
      </p>

      {hasEvents ? (
        <div style={{ marginBottom: '2rem' }}>
          {events.holiday && (
            <div className="event-category">
              <h3 style={{ color: 'var(--red-alert)' }}>🎉 Festividad Nacional</h3>
              <div className="event-item">{events.holiday}</div>
            </div>
          )}
          {events.regional && (
            <div className="event-category">
              <h3 style={{ color: 'var(--orange-regional)' }}>🏛️ Festividad Autonómica</h3>
              <div className="event-item">{events.regional}</div>
            </div>
          )}
          {events.worldDay && (
            <div className="event-category">
              <h3 style={{ color: 'var(--purple-special)' }}>🌍 Día Internacional / Mundial</h3>
              <div className="event-item">{events.worldDay}</div>
            </div>
          )}
          {events.saint && (
            <div className="event-category">
              <h3 style={{ color: 'var(--accent-color)' }}>⛪ Santo del Día</h3>
              <div className="event-item">{events.saint}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="no-events" style={{ marginBottom: '2rem' }}>
          No hay eventos destacados para este día.
        </div>
      )}

      {/* AI GENERATOR PANEL */}
      <div className="ai-panel glass-panel" style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <h3 style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ✨ Generador de Post (IA)
        </h3>
        
        <div className="nature-selector" style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
          <button 
            className={`tone-chip ${activeNature === 'RELAJADO' ? 'active' : ''}`}
            onClick={() => setActiveNature('RELAJADO')}
            style={{ 
              fontSize: '0.75rem', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              background: activeNature === 'RELAJADO' ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)',
              color: activeNature === 'RELAJADO' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Relajado
          </button>
          <button 
            className={`tone-chip ${activeNature === 'SERIO' ? 'active' : ''}`}
            onClick={() => setActiveNature('SERIO')}
            style={{ 
              fontSize: '0.75rem', 
              padding: '6px 12px', 
              borderRadius: '20px', 
              background: activeNature === 'SERIO' ? 'var(--red-alert)' : 'rgba(255,255,255,0.1)',
              color: activeNature === 'SERIO' ? 'white' : 'var(--text-secondary)'
            }}
          >
            Serio
          </button>
        </div>

        <button 
          onClick={generatePost}
          disabled={loading || !hasEvents}
          style={{ 
            width: '100%', 
            padding: '12px', 
            background: loading ? 'rgba(0,0,0,0.1)' : 'var(--accent-color)', 
            borderRadius: '10px',
            color: 'white',
            fontWeight: 'bold',
            opacity: !hasEvents ? 0.3 : 1,
            cursor: !hasEvents ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)'
          }}
        >
          {loading ? 'Redactando...' : 'Generar Propuesta LinkedIn'}
        </button>

        {generations.length > 0 && (
          <div className="generations-list" style={{ marginTop: '20px' }}>
            {generations.map((post, idx) => (
              <div key={idx} className="gen-item fade-in" style={{ 
                background: 'white', 
                padding: '15px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)',
                fontSize: '0.85rem',
                marginBottom: '10px',
                position: 'relative',
                lineHeight: '1.5'
              }}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{post}</div>
                <button 
                  onClick={() => copyToClipboard(post)}
                  style={{ 
                    marginTop: '10px', 
                    fontSize: '0.7rem', 
                    color: 'var(--accent-color)', 
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}
                >
                  📋 Copiar Texto
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telegram Link Phase */}
      <div className="telegram-card glass-panel" style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        border: '1px solid #0088cc44', 
        background: 'linear-gradient(135deg, rgba(0, 136, 204, 0.05), transparent)' 
      }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0088cc', fontSize: '0.9rem' }}>
          <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" width="16" alt="Telegram" />
          Avisos 08:50
        </h4>
        <a 
          href="https://t.me/CALENDARIO_ADEACBOT" 
          target="_blank" 
          rel="noreferrer"
          style={{
            display: 'block',
            textAlign: 'center',
            background: '#0088cc',
            color: '#fff',
            padding: '8px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '0.8rem',
            marginTop: '8px'
          }}
        >
          📩 Vincular Telegram
        </a>
      </div>
    </div>
  );
}

export default EventSidebar;
