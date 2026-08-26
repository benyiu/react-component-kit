// A small observable state container.
//
// State the application shares across screens has lived in the classic shell's
// closure, reached from modules through injected getter/setter pairs. That
// works but leaves no single owner and nothing to observe: a module that wants
// to react to a change has to be told about it by whoever made the change.
//
// A store owns its keys and notifies on write. Each key is a real property, so
// moving state here is a rename at the call site rather than a rewrite:
// `cCurrentClientId` becomes `ClientStore.currentClientId` and reads and writes
// both keep working.
//
// The subscribe/getSnapshot pair is deliberately the shape React's
// useSyncExternalStore expects — snapshot identity only changes when a value
// does, so a component re-renders on real changes and not on every write.

function createStore(initialState) {
  if (!initialState || typeof initialState !== 'object') {
    throw new TypeError('A store requires an initial state object');
  }

  // Containers are copied on the way in and again on reset. Without this, an
  // initial `[]` or `{}` is the very object the store hands out, so the first
  // in-place push leaves reset() restoring the mutated container to itself.
  // Anything that is not a plain array or object — a timer handle, a File, a
  // frozen constant — is kept by reference, because copying it would be wrong.
  const isPlain = (v) => Array.isArray(v)
    || (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype);
  const freshInitial = (key) => {
    const value = initialState[key];
    if (Array.isArray(value)) return [...value];
    if (isPlain(value)) return { ...value };
    return value;
  };

  const state = {};
  for (const key of Object.keys(initialState)) state[key] = freshInitial(key);

  const listeners = new Set();
  let snapshot = Object.freeze({ ...state });

  function notify() {
    snapshot = Object.freeze({ ...state });
    // Copy first: a listener that unsubscribes itself must not perturb the
    // iteration. That is ALL the copy buys — a listener that throws aborts
    // this loop and silences every listener after it, because there is no
    // per-listener catch, and this comment used to claim otherwise.
    //
    // Do not "fix" that by swallowing throws. The pending-change-request
    // store relies on a subscriber's throw propagating into its prime()
    // promise chain — the catch there clears loadedAt and resolves [] — and
    // tests/smoke/core-pending-change-request-store.test.mjs pins that
    // contract. Isolating listeners here would flip a pinned behavior; if
    // ordering under multiple listeners ever matters, that is a design
    // change to argue at the pin, not a comment to make true.
    for (const listener of [...listeners]) listener(snapshot);
  }

  const store = {
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('A store subscriber must be a function');
      }
      listeners.add(listener);
      return function unsubscribe() { listeners.delete(listener); };
    },

    getSnapshot() { return snapshot; },

    // Apply several changes as one notification. Without this, a screen that
    // sets four fields in a row would tell its observers four times and render
    // three intermediate states that never existed as a whole.
    update(changes) {
      if (!changes || typeof changes !== 'object') {
        throw new TypeError('A store update requires an object of changes');
      }
      let changed = false;
      for (const [key, value] of Object.entries(changes)) {
        if (!(key in state)) {
          throw new TypeError(`Unknown store key: ${key}`);
        }
        if (!Object.is(state[key], value)) { state[key] = value; changed = true; }
      }
      if (changed) notify();
    },

    // Announce a change the store cannot see. Values held here are sometimes
    // mutated in place — an array pushed to, an object keyed into — because
    // that is how the classic code already treats them. Replacing the value is
    // preferable; where it is not practical, this keeps observers honest.
    touch() { notify(); },

    reset() {
      let changed = false;
      for (const key of Object.keys(initialState)) {
        const value = freshInitial(key);
        if (!Object.is(state[key], value)) { state[key] = value; changed = true; }
      }
      if (changed) notify();
    },
  };

  for (const key of Object.keys(initialState)) {
    Object.defineProperty(store, key, {
      enumerable: true,
      get() { return state[key]; },
      set(value) {
        if (Object.is(state[key], value)) return;
        state[key] = value;
        notify();
      },
    });
  }

  return Object.seal(store);
}

export { createStore };
