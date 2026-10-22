// The only bridge between the screen and the rest of the app. Everything
// the screen can do is listed here, and each one is a named channel in
// ipc.js — nothing else in the main process is reachable from a page.

const { contextBridge, ipcRenderer } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('cc', {
  data: {
    load: call('data:load'),
    setting: call('data:setting'),
    add: call('data:add'),
    update: call('data:update'),
    remove: call('data:delete'),
    reorder: call('data:reorder'),
    events: call('data:events'),
    log: call('data:log')
  },
  calendar: {
    month: call('calendar:month'),
    upcoming: call('calendar:upcoming'),
    status: call('calendar:status'),
    connect: call('calendar:connect'),
    disconnect: call('calendar:disconnect')
  },
  gmail: {
    status: call('gmail:status'),
    connect: call('gmail:connect'),
    disconnect: call('gmail:disconnect'),
    recent: call('gmail:recent')
  },
  weather: { get: call('weather:get'), setPlace: call('weather:setPlace') },
  markets: { get: call('markets:get') },
  news: { get: call('news:get') },
  ai: {
    hasKey: call('ai:hasKey'),
    setKey: call('ai:setKey'),
    clearKey: call('ai:clearKey'),
    history: call('ai:history'),
    clearHistory: call('ai:clearHistory')
  },
  atlas: {
    ask: call('atlas:ask'),
    proposals: call('atlas:proposals'),
    approve: call('atlas:approve'),
    reject: call('atlas:reject'),
    spend: call('atlas:spend'),
    memories: call('atlas:memories'),
    memoryUpdate: call('atlas:memoryUpdate'),
    memoryDelete: call('atlas:memoryDelete')
  },
  files: {
    pick: call('files:pick'),
    chooseImage: call('files:chooseImage'),
    image: call('files:image'),
    open: call('files:open'),
    reveal: call('files:reveal')
  },
  remoteMcp: {
    status: call('remoteMcp:status'),
    key: call('remoteMcp:key'),
    connectorUrl: call('remoteMcp:connectorUrl'),
    headerValue: call('remoteMcp:headerValue'),
    setEnabled: call('remoteMcp:setEnabled'),
    setAddressCheck: call('remoteMcp:setAddressCheck'),
    setPublicUrl: call('remoteMcp:setPublicUrl')
  },
  library: {
    list: call('library:list'),
    summary: call('library:summary'),
    search: call('library:search'),
    addFiles: call('library:addFiles'),
    addFolder: call('library:addFolder'),
    reread: call('library:reread')
  },
  vault: {
    status: call('vault:status'),
    choose: call('vault:choose'),
    tree: call('vault:tree'),
    read: call('vault:read'),
    open: call('vault:open')
  },
  telegram: {
    status: call('telegram:status'),
    setToken: call('telegram:setToken'),
    clearToken: call('telegram:clearToken'),
    pair: call('telegram:pair'),
    unpair: call('telegram:unpair')
  },
  school: {
    status: call('school:status'),
    setSource: call('school:setSource'),
    clearSource: call('school:clearSource'),
    upcoming: call('school:upcoming')
  },
  backup: {
    status: call('backup:status'),
    setOnedrive: call('backup:setOnedrive')
  },
  links: {
    favicon: call('links:favicon')
  },
  shell: {
    openExternal: call('shell:openExternal'),
    openClaudeDesktop: call('shell:openClaudeDesktop')
  },
  app: {
    version: call('app:version')
  },
  // Asked once, as the screen starts, so the pages are known before the
  // first draw. The built-in pages merged with the owner's my-pages.json.
  layout: () => ipcRenderer.sendSync('layout:get'),
  updates: {
    status: call('updates:status'),
    check: call('updates:check'),
    install: call('updates:install'),
    onChange: (fn) => {
      const listener = (_event, status) => fn(status);
      ipcRenderer.on('updates:changed', listener);
      return () => ipcRenderer.removeListener('updates:changed', listener);
    }
  }
});
