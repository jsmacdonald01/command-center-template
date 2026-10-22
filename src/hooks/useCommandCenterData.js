import { useCallback, useEffect, useState } from 'react';

const bridge = typeof window !== 'undefined' ? window.cc : null;

/**
 * Owns the Command Center data tree.
 *
 * Mutations write through to SQLite immediately and patch local state in
 * place, so an edit appears instantly without refetching the whole tree.
 * Every write is logged by the main process, which is what feeds the
 * System Center history.
 */
export default function useCommandCenterData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!bridge) {
      setError('Command Center must run inside the desktop app.');
      return;
    }
    try {
      setData(await bridge.data.load());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Reading on focus keeps the app honest when an MCP session or another
  // window changed the database underneath it.
  useEffect(() => {
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const patchList = useCallback((listPath, fn) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      const parts = listPath.split('.');
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...cursor[parts[i]] };
        cursor = cursor[parts[i]];
      }
      const key = parts[parts.length - 1];
      cursor[key] = fn(cursor[key] || []);
      return next;
    });
  }, []);

  const update = useCallback(async (type, listPath, id, patch) => {
    patchList(listPath, (list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const saved = await bridge.data.update(type, id, patch);
    if (saved) patchList(listPath, (list) => list.map((r) => (r.id === id ? saved : r)));
    return saved;
  }, [patchList]);

  const add = useCallback(async (type, listPath, scope, fields) => {
    const created = await bridge.data.add(type, scope, fields);
    if (created) patchList(listPath, (list) => [...list, created]);
    return created;
  }, [patchList]);

  const remove = useCallback(async (type, listPath, id) => {
    patchList(listPath, (list) => list.filter((r) => r.id !== id));
    return bridge.data.remove(type, id);
  }, [patchList]);

  /** Persists a new order for a whole list and mirrors it locally. */
  const reorder = useCallback(async (type, listPath, orderedIds) => {
    patchList(listPath, (list) => {
      const byId = new Map(list.map((r) => [r.id, r]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    });
    return bridge.data.reorder(type, orderedIds);
  }, [patchList]);

  // A box's list may not exist yet in data.items (a brand-new box has no
  // rows), which patchList handles by starting from an empty array.
  const attach = useCallback(async (type, listPath, scope) => {
    const result = await bridge.files.pick(type, scope);
    if (result && result.ok && result.record) {
      patchList(listPath, (list) => [...list, result.record]);
    }
    return result;
  }, [patchList]);

  // localPath mirrors the write into local state so the edit shows
  // immediately. Without it the component re-renders from the old value
  // and whatever was typed appears to vanish.
  //
  //   "field"        → patches the root
  //   "group.field"  → patches a nested object
  //   "list.0"       → patches an array element, keeping it an array
  const setSetting = useCallback(async (key, value, localPath) => {
    if (localPath) {
      const parts = localPath.split('.');
      setData((prev) => {
        if (!prev) return prev;
        if (parts.length === 1) return { ...prev, [parts[0]]: value };
        const [group, field] = parts;
        const target = prev[group];
        if (Array.isArray(target)) {
          const copy = target.slice();
          copy[Number(field)] = value;
          return { ...prev, [group]: copy };
        }
        return { ...prev, [group]: { ...target, [field]: value } };
      });
    }
    return bridge.data.setting(key, value);
  }, []);

  /** A value in a facts or notes box: data.fields[box][key]. */
  const setField = useCallback(async (widgetId, key, value) => {
    setData((prev) => {
      if (!prev) return prev;
      const fields = { ...(prev.fields || {}) };
      fields[widgetId] = { ...(fields[widgetId] || {}), [key]: value };
      return { ...prev, fields };
    });
    return bridge.data.setting(`field:${widgetId}:${key}`, value);
  }, []);

  return { data, error, reload, add, update, remove, attach, reorder, setSetting, setField };
}
