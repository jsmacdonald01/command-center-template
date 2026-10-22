// Open-Meteo — no API key, no signup, no rate limit.
//
// There is no default place. Until a town is set in Settings the weather
// box says so, rather than quietly showing somewhere else's weather.

// WMO weather interpretation codes.
const CONDITIONS = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, heavy hail'
};

function describe(code) {
  return CONDITIONS[code] || 'Unknown';
}

/**
 * A typed place name ("Austin, TX", "Leeds") as coordinates, through
 * Open-Meteo's free geocoder. Returns the best match, or null.
 */
async function geocode(query) {
  const name = String(query || '').split(',')[0].trim();
  if (!name) return null;
  const url = 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const results = json.results || [];
  if (!results.length) return null;

  // "Springfield, IL" — prefer the match whose state or country mentions
  // what came after the comma.
  const hint = String(query).split(',').slice(1).join(',').trim().toLowerCase();
  const pick = (hint && results.find((r) => [r.admin1, r.admin1_code, r.country, r.country_code]
    .some((v) => v && String(v).toLowerCase().startsWith(hint)))) || results[0];

  const region = pick.admin1 && pick.admin1 !== pick.name ? `, ${pick.admin1}` : '';
  return { lat: pick.latitude, lon: pick.longitude, place: `${pick.name}${region}` };
}

async function get(options) {
  const lat = options && options.lat;
  const lon = options && options.lon;
  const place = (options && options.place) || '';
  if (!lat || !lon) return { ok: false, error: 'no_location' };

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=5';

  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `Weather service returned ${res.status}` };
    const json = await res.json();

    const daily = [];
    const d = json.daily || {};
    (d.time || []).forEach((iso, i) => {
      daily.push({
        date: iso,
        label: new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        high: Math.round(d.temperature_2m_max[i]),
        low: Math.round(d.temperature_2m_min[i]),
        code: d.weather_code[i],
        condition: describe(d.weather_code[i])
      });
    });

    const c = json.current || {};
    return {
      ok: true,
      place,
      current: {
        temperature: Math.round(c.temperature_2m),
        feelsLike: Math.round(c.apparent_temperature),
        humidity: Math.round(c.relative_humidity_2m),
        wind: Math.round(c.wind_speed_10m),
        code: c.weather_code,
        condition: describe(c.weather_code)
      },
      daily,
      fetchedAt: Date.now()
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { get, geocode, describe };
