import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The synced-external-sources layer: calendar, email, weather, news.
 * Each source fails independently — one being down never blanks the others.
 *
 * Refresh happens on three triggers: app start, window focus, and a slow
 * background poll. Deliberately not on every data change — an unrelated
 * edit should never cause a network fetch.
 */
const POLL_FAST_MS = 5 * 60 * 1000;   // calendar + email
const POLL_SLOW_MS = 30 * 60 * 1000;  // weather + news

export default function useLiveData(data) {
  const [calendar, setCalendar] = useState([]);
  const [email, setEmail] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [weather, setWeather] = useState(null);
  const [news, setNews] = useState(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [calendarExpired, setCalendarExpired] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Only the fields the fetches actually need, so unrelated edits to the
  // data tree don't retrigger network calls.
  const lat = data ? data.weatherLat : '';
  const lon = data ? data.weatherLon : '';
  const place = data ? data.weatherPlace : '';

  const stamp = () => new Date().toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  // Three days, so the To Do panel and the AI context both see what is
  // actually coming rather than only today.
  const refreshCalendar = useCallback(async () => {
    if (!window.cc) return;
    const status = await window.cc.calendar.status();
    if (!status || !status.connected) {
      setCalendar([]);
      return;
    }
    const res = await window.cc.calendar.upcoming(3);
    // A rejected sign-in returns an empty list, and an empty list is also
    // what a free day looks like. Only the error tells them apart —
    // without this the panel read "Nothing scheduled" for three days while
    // the status bar stamped a fresh sync over one that never happened.
    if (res && res.error === 'auth_expired') {
      setCalendarExpired(true);
      setCalendar([]);
      return;
    }

    if (res && res.events) {
      setCalendarExpired(false);
      setCalendar(res.events);
      setSyncedAt(stamp());
    }
  }, []);

  const refreshEmail = useCallback(async () => {
    if (!window.cc) return;
    const status = await window.cc.gmail.status();
    setGmailConnected(!!(status && status.connected));
    if (!status || !status.connected) {
      setEmail([]);
      return;
    }
    const res = await window.cc.gmail.recent();
    if (res && res.emails) setEmail(res.emails);
    if (res && typeof res.unreadCount === 'number') setUnreadCount(res.unreadCount);
    if (res && res.error === 'auth_expired') setGmailConnected(false);
  }, []);

  const refreshWeather = useCallback(async () => {
    if (!window.cc) return;
    const opts = lat && lon ? { lat: Number(lat), lon: Number(lon), place } : undefined;
    try { setWeather(await window.cc.weather.get(opts)); } catch (e) { /* keep last good */ }
  }, [lat, lon, place]);

  const refreshNews = useCallback(async () => {
    if (!window.cc) return;
    // Feeds chosen in Settings, one address per line; the service's own
    // defaults when none are set.
    const feeds = String((data && data.newsFeeds) || '').split(/\s+/).filter(Boolean)
      .map((url) => {
        let source = url;
        try { source = new URL(url).hostname.replace(/^(www|feeds)\./, '').split('.')[0].toUpperCase(); } catch (e) { /* keep url */ }
        return { source, url };
      });
    try { setNews(await window.cc.news.get(feeds.length ? feeds : undefined)); } catch (e) { /* keep last good */ }
  }, [data && data.newsFeeds]);

  /** Everything at once — the manual "sync now" path. */
  const refreshAll = useCallback(async () => {
    setSyncing(true);
    await Promise.allSettled([refreshCalendar(), refreshEmail(), refreshWeather(), refreshNews()]);
    setSyncedAt(stamp());
    setSyncing(false);
  }, [refreshCalendar, refreshEmail, refreshWeather, refreshNews]);

  useEffect(() => { refreshCalendar(); }, [refreshCalendar]);
  useEffect(() => { refreshEmail(); }, [refreshEmail]);
  useEffect(() => { refreshWeather(); }, [refreshWeather]);
  useEffect(() => { refreshNews(); }, [refreshNews]);

  // Background poll. Refs keep the timers from resetting on every render.
  const fastRef = useRef(null);
  const slowRef = useRef(null);
  fastRef.current = () => { refreshCalendar(); refreshEmail(); };
  slowRef.current = () => { refreshWeather(); refreshNews(); };

  useEffect(() => {
    const fast = setInterval(() => fastRef.current(), POLL_FAST_MS);
    const slow = setInterval(() => slowRef.current(), POLL_SLOW_MS);
    return () => { clearInterval(fast); clearInterval(slow); };
  }, []);

  // Coming back to the window is the strongest signal that something may
  // have changed elsewhere — in Google Calendar, in Gmail, or via MCP.
  useEffect(() => {
    const onFocus = () => fastRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return {
    calendar,
    email,
    unreadCount,
    weather,
    news,
    gmailConnected,
    calendarExpired,
    syncedAt,
    syncing,
    refreshCalendar,
    refreshEmail,
    refreshAll
  };
}
