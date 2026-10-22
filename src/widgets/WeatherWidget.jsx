import Panel, { PanelLabel } from '../components/Panel.jsx';

/** Current conditions and the five-day outlook, always both. */
export default function WeatherWidget({ weather, title }) {
  if (!weather || !weather.ok) {
    return (
      <Panel className="cc-widget">
        <PanelLabel>{title || 'Weather'}</PanelLabel>
        <div className="cc-widget-empty">
          {weather && weather.error === 'no_location'
            ? 'Set your town in Settings to see the weather.'
            : 'Unavailable'}
        </div>
      </Panel>
    );
  }

  const { current, daily, place } = weather;

  return (
    <Panel className="cc-widget cc-weather">
      <div className="cc-widget-head">
        <PanelLabel>{title || 'Weather'}</PanelLabel>
        <span className="cc-field-note">{place}</span>
      </div>

      <div className="cc-weather-now">
        <div className="cc-stat cc-weather-temp">{current.temperature}°</div>
        <div className="cc-weather-conditions">
          <div>{current.condition}</div>
          <div className="cc-weather-sub">
            Feels {current.feelsLike}° · {current.wind} mph · {current.humidity}%
          </div>
        </div>
      </div>

      <div className="cc-weather-days">
        {daily.map((d) => (
          <div key={d.date} className="cc-weather-day">
            <div className="cc-weather-day-label">{d.label}</div>
            <div className="cc-weather-day-high">{d.high}°</div>
            <div className="cc-weather-day-low">{d.low}°</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
