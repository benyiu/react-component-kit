function createDirtyTracker() {
  const registeredForms = [];

  const tracker = {
    register(form) {
      registeredForms.push(form);
      return form;
    },

    anyDirty(skipId) {
      for (let i = 0; i < registeredForms.length; i += 1) {
        const form = registeredForms[i];
        if (skipId && form.id === skipId) continue;
        if (form.isDirty()) return true;
      }
      return false;
    },

    discardAll() {
      for (let i = 0; i < registeredForms.length; i += 1) {
        const form = registeredForms[i];
        form.setDirty(false);
        if (form.isOpen()) form.close();
      }
    },

    requestBackForPanel(panelId, source) {
      for (let i = registeredForms.length - 1; i >= 0; i -= 1) {
        const form = registeredForms[i];
        if (
          form &&
          form.panelId === panelId &&
          form.isOpen &&
          form.isOpen() &&
          typeof form.requestBack === 'function'
        ) {
          form.requestBack(source);
          return true;
        }
      }
      return false;
    },
  };

  return Object.freeze(tracker);
}

const DirtyTracker = createDirtyTracker();

export { createDirtyTracker, DirtyTracker };
