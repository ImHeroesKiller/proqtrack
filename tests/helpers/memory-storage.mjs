export function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

export function installBrowserShim() {
  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.window = globalThis.window || {};
  globalThis.window.addEventListener = globalThis.window.addEventListener || (() => {});
  globalThis.window.dispatchEvent = globalThis.window.dispatchEvent || (() => true);
  globalThis.window.FT = {
    state: {
      loggedIn: false,
      account: null,
      route: '#/',
    },
  };
  return { localStorage, sessionStorage };
}

export function setSession(account) {
  globalThis.window.FT.state.loggedIn = !!account;
  globalThis.window.FT.state.account = account;
}

export function device(id, secret = `secret-for-${id}`) {
  return {
    id,
    secret,
    imei: String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-15).toUpperCase().padStart(15, '0'),
    label: `Test · ${id}`,
    userAgent: 'node-test',
  };
}
