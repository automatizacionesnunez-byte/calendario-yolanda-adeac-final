import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../apiConfig';

function SidebarLeft() {
  const [status, setStatus] = useState({ linked: false, count: 0 });
  const [linkData, setLinkData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const resp = await fetch(API_ENDPOINTS.TELEGRAM_STATUS);
      const data = await resp.json();
      setStatus(data);
    } catch (e) {
      console.error("Error checking status", e);
    }
  };

  const generateCode = async () => {
    setLoading(true);
    try {
      const resp = await fetch(API_ENDPOINTS.TELEGRAM_GEN_CODE, { method: 'POST' });
      const data = await resp.json();
      setLinkData(data);
    } catch (e) {
      alert("Error al generar código");
    } finally {
      setLoading(false);
    }
  };

  const setupWebhook = async () => {
    try {
      const resp = await fetch(API_ENDPOINTS.TELEGRAM_SETUP_WEBHOOK);
      const data = await resp.json();
      if(data.success) {
        alert("✅ Conexión del servidor sincronizada en la nube correctamente.");
      } else {
        alert("❌ Hubo un error al sincronizar: " + JSON.stringify(data));
      }
    } catch (e) {
      alert("Error de conexión con el servidor: " + e.message);
    }
  };


  return (
    <div className="sidebar-left glass-panel">
      <div className="sidebar-header">
        <div className="telegram-icon">✈️</div>
        <h3>Telegram Bot</h3>
      </div>

      <div className={`status-badge ${status.linked ? 'connected' : 'disconnected'}`}>
        {status.linked ? `Conectado (${status.count})` : 'Sin Vincular'}
      </div>

      <div className="linking-section">
        {!linkData ? (
          <button onClick={generateCode} disabled={loading} className="link-btn">
            {loading ? 'Generando...' : '🔗 Vincular Cuenta'}
          </button>
        ) : (
          <div className="code-display fade-in">
            <p>Envía este código al bot:</p>
            <div className="numeric-code">{linkData.code}</div>
            <a 
              href={`https://t.me/${linkData.botUsername}?start=${linkData.code}`} 
              target="_blank" 
              className="telegram-link-btn"
            >
              Abrir en Telegram
            </a>
            <button className="text-btn" onClick={() => setLinkData(null)}>Cancelar</button>
          </div>
        )}
      </div>

      <div className="bot-info">
        <p>Avisos programados:</p>
        <ul>
          <li>8:50 AM (Hoy)</li>
          <li>8:50 AM (Mañana)</li>
        </ul>
        <button className="sync-server-btn" onClick={setupWebhook}>
          ☁️ Sync Servidor Vercel
        </button>
      </div>

      <style jsx>{`
        .sidebar-left { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; height: 100%; }
        .sidebar-header { display: flex; align-items: center; gap: 10px; }
        .telegram-icon { font-size: 1.5rem; }
        .status-badge { 
          padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; text-align: center;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        }
        .status-badge.connected { color: #10b981; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); }
        .status-badge.disconnected { color: #ef4444; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); }

        .link-btn { 
          width: 100%; padding: 10px; border-radius: 8px; border: none; background: var(--accent-color); 
          color: white; font-weight: bold; cursor: pointer; transition: 0.3s;
        }
        .code-display { text-align: center; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.2); }
        .code-display p { font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 8px; }
        .numeric-code { font-size: 1.8rem; font-weight: 800; letter-spacing: 4px; color: var(--accent-color); margin-bottom: 12px; }
        
        .telegram-link-btn {
          display: block; width: 100%; padding: 10px; background: #0088cc; color: white; text-decoration: none;
          border-radius: 8px; font-size: 0.8rem; font-weight: bold; margin-bottom: 8px;
        }
        
        .bot-info { font-size: 0.75rem; color: var(--text-secondary); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem; }
        .bot-info ul { margin-top: 5px; padding-left: 15px; margin-bottom: 12px; }
        
        .sync-server-btn {
          width: 100%; background: transparent; border: 1px solid rgba(255,255,255,0.2); 
          color: white; padding: 6px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: 0.2s;
        }
        .sync-server-btn:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.4); }

        .text-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.7rem; }
      `}</style>
    </div>
  );
}

export default SidebarLeft;
