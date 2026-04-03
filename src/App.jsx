import { useState, useEffect } from 'react';
import Calendar from './components/Calendar';
import EventSidebar from './components/EventSidebar';
import SidebarLeft from './components/SidebarLeft';
import holidaysData from './data/holidays.json';
import saintsData from './data/saints.json';
import worldDaysData from './data/worldDays.json';
import regionalHolidaysData from './data/regional.json';
import './App.css';

function App() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  
  // Format MM-DD to check against JSON keys
  const getFormattedDateKey = (date) => {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  };

  const dateKey = getFormattedDateKey(selectedDate);
  const selectedEvents = {
    holiday: holidaysData[dateKey],
    regional: regionalHolidaysData[dateKey],
    saint: saintsData[dateKey],
    worldDay: worldDaysData[dateKey]
  };

  return (
    <div className="app-container">
      <SidebarLeft />
      <section className="legend-section glass-panel">
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.2rem' }}>Leyenda</h2>
        <div className="calendar-legend">
          <div className="legend-item">
            <div className="dot holiday-indicator"></div> 
            <span>Nacional</span>
          </div>
          <div className="legend-item">
            <div className="dot regional-indicator"></div> 
            <span>Autonómico</span>
          </div>
          <div className="legend-item">
            <div className="dot world-day-indicator"></div> 
            <span>Día Mundial</span>
          </div>
          <div className="legend-item">
            <div className="dot saint-indicator"></div> 
            <span>Sanctorum</span>
          </div>
        </div>
      </section>

      <section className="calendar-section glass-panel">
        <div className="header">
          <h1>
            {currentDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
          </h1>
          <div className="nav-buttons">
            <button onClick={handlePrevMonth}>Mes Anterior</button>
            <button onClick={handleNextMonth}>Mes Siguiente</button>
          </div>
        </div>
        <Calendar 
          currentDate={currentDate} 
          selectedDate={selectedDate} 
          onSelectDate={setSelectedDate}
        />
      </section>

      <section className="sidebar-section glass-panel">
        <EventSidebar 
          selectedDate={selectedDate} 
          events={selectedEvents} 
        />
      </section>
    </div>
  );
}

export default App;
