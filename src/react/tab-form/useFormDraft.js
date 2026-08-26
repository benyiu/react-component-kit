// The browser recovery draft a React create form keeps while the user types.
//
// The store is the classic one (tab-form-draft-store.js) — same key shape, so
// a draft written by the classic form is found by the ported one and vice
// versa. That matters during the migration: a user who starts a record before
// a deploy and returns after it should still find their work.
//
// The rules about *when* to write come from tab-form-state.js, shared with the
// classic controller so the two cannot drift.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createTabFormDraftStore } from '../../ui/tab-form-draft-store.js';
import { tfDraftPayload, tfShouldWriteDraft } from '../../ui/tab-form-state.js';
import { useDeps } from '../deps.jsx';

// Long enough that typing a word is one write rather than six, short enough
// that a browser closed mid-sentence loses at most a moment. Matches the
// classic controller.
const DRAFT_DEBOUNCE_MS = 350;

function useFormDraft({
  formId,
  enabled = true,
  serverDraft = false,
  getScope = () => '',
  buildPayload,
}) {
  const {
    getCurrentUser, getActiveCompanyId, recordConflict,
    sessionStorage: injectedSession, localStorage: injectedLocal,
  } = useDeps();
  const timer = useRef(null);
  const scopeRef = useRef(getScope);
  scopeRef.current = getScope;
  const payloadRef = useRef(buildPayload);
  payloadRef.current = buildPayload;

  const store = useMemo(() => createTabFormDraftStore({
    formId,
    serverDraft,
    getCurrentUser,
    getActiveCompanyId,
    getScope: () => scopeRef.current(),
    // Injected rather than reached for. The classic draft store is still
    // synchronous, so this is not yet the async storage port — but the
    // platform is no longer named here, which is what makes swapping it a
    // change of one wiring line instead of a change of shape.
    getSessionStorage: () => injectedSession,
    getLocalStorage: () => injectedLocal,
  }), [formId, serverDraft, getCurrentUser, getActiveCompanyId, injectedSession, injectedLocal]);

  const cancelPending = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const serialize = useCallback((data) => {
    const clone = recordConflict ? recordConflict.cloneValue : undefined;
    return payloadRef.current
      ? tfDraftPayload(payloadRef.current(data), (value) => value)
      : tfDraftPayload(data, clone);
  }, [recordConflict]);

  // Every write path asks the same question of the same form state.
  const wants = useCallback((state) => tfShouldWriteDraft({
    useFactoryDraft: enabled,
    mode: state.mode,
    hasData: !!state.data,
    dirty: state.dirty,
    restoredDraft: state.restoredDraft,
  }), [enabled]);

  const write = useCallback((state) => {
    if (!wants(state)) return false;
    store.save(serialize(state.data));
    return true;
  }, [store, serialize, wants]);

  return useMemo(() => ({
    // Immediate, for leaving the form: whatever is typed must survive.
    flush(state) {
      cancelPending();
      return write(state);
    },
    // Debounced, for typing. A save in flight is skipped: a keystroke timer
    // landing mid-save would write a draft for a record already being
    // persisted.
    schedule(getState) {
      cancelPending();
      timer.current = setTimeout(() => {
        timer.current = null;
        const state = getState();
        if (state.saving) return;
        write(state);
      }, DRAFT_DEBOUNCE_MS);
    },
    load(scope) {
      return enabled ? store.load(scope) : null;
    },
    clear(scope) {
      cancelPending();
      store.clear(scope);
    },
    cancelPending,
    key: store.key,
  }), [store, write, cancelPending, enabled]);
}

// A form's draft must not outlive its component. Callers pass the handle this
// hook returns; unmounting cancels a pending write rather than letting it land
// against a form that is gone.
function useDraftCleanup(draft) {
  useEffect(() => () => draft.cancelPending(), [draft]);
}

export { DRAFT_DEBOUNCE_MS, useDraftCleanup, useFormDraft };
