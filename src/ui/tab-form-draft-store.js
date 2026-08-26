function requiredFunction(options, name) {
  const dependency = options && options[name];
  if (typeof dependency !== 'function') {
    throw new TypeError(`createTabFormDraftStore requires a ${name} function`);
  }
  return dependency;
}

function createTabFormDraftStore(options) {
  const formId = options && options.formId || 'tf';
  const serverDraft = !!(options && options.serverDraft === true);
  const getCurrentUser = requiredFunction(options, 'getCurrentUser');
  const getActiveCompanyId = requiredFunction(options, 'getActiveCompanyId');
  const getScope = requiredFunction(options, 'getScope');
  const getSessionStorage = requiredFunction(options, 'getSessionStorage');
  const getLocalStorage = requiredFunction(options, 'getLocalStorage');

  function key(scope) {
    const user = getCurrentUser();
    const companyId = getActiveCompanyId() || 'no-company';
    const resolvedScope = scope != null ? scope : getScope();
    return 'tf_draft_' + formId + '_' + (user && user.id ? user.id : 'anon') + '_' +
      encodeURIComponent(companyId) + '_' +
      encodeURIComponent(String(resolvedScope || 'root'));
  }

  function primaryStorage() {
    return serverDraft ? getSessionStorage() : getLocalStorage();
  }

  function save(value, scope) {
    try {
      primaryStorage().setItem(key(scope), JSON.stringify(value));
    } catch (error) {}
  }

  function load(scope) {
    try {
      const storageKey = key(scope);
      const storage = primaryStorage();
      let serialized = storage.getItem(storageKey);
      if (!serialized && serverDraft) {
        serialized = getLocalStorage().getItem(storageKey);
        if (serialized) {
          storage.setItem(storageKey, serialized);
          getLocalStorage().removeItem(storageKey);
        }
      }
      return serialized ? JSON.parse(serialized) : null;
    } catch (error) {
      return null;
    }
  }

  function clear(scope) {
    try {
      const storageKey = key(scope);
      primaryStorage().removeItem(storageKey);
      if (serverDraft) getLocalStorage().removeItem(storageKey);
    } catch (error) {}
  }

  return Object.freeze({ key, save, load, clear });
}

export { createTabFormDraftStore };
