import React from 'react';
import holidaysData from '../data/holidays.json';
import saintsData from '../data/saints.json';
import worldDaysData from '../data/worldDays.json';
import regionalHolidaysData from '../data/regional.json';

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function Calendar({ currentDate, selectedDate, onSelectDate }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const blanks = Array(firstDay).fill(null);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const formatKey = (d) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${mm}-${dd}`;
  };

  return (
    <div className="calendar-grid fade-in">
      {DAYS_OF_WEEK.map((day, idx) => (
        <div key={idx} className="weekday-header">{day}</div>
      ))}
      
      {blanks.map((_, idx) => (
        <div key={`blank-${idx}`} className="calendar-day empty"></div>
      ))}

      {days.map((day) => {
        const dateKey = formatKey(day);
        const holiday = holidaysData[dateKey];
        const regional = regionalHolidaysData[dateKey];
        const saint = saintsData[dateKey];
        const worldDay = worldDaysData[dateKey];

        const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

        return (
          <div 
            key={day} 
            className={`calendar-day ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectDate(new Date(year, month, day))}
          >
            <span className="day-number">{day}</span>
            
            <div className="day-events-list">
              {holiday && <div className="event-label label-national">{holiday}</div>}
              {regional && <div className="event-label label-regional">{regional}</div>}
              {worldDay && <div className="event-label label-world">{worldDay}</div>}
              {saint && <div className="event-label label-saint">{saint}</div>}
            </div>

            <div className="day-indicators">
              {holiday && <div className="indicator holiday-indicator"></div>}
              {regional && <div className="indicator regional-indicator"></div>}
              {worldDay && <div className="indicator world-day-indicator"></div>}
              {saint && <div className="indicator saint-indicator"></div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Calendar;
