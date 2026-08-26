// @ts-check
// A form that is working on something does not accept edits meanwhile.
//
// The sixth behaviour the retired factory took with it. `busy` is set while a
// screening run is in flight, and it meant three things: every control in the
// body is disabled, every click-to-edit field stops being clickable, and both
// are put back exactly as they were afterwards. React panels kept the busy
// *state* — the toolbar reads it — but nothing applied it to the body, so a
// user could click into a field an in-flight run was about to overwrite.
//
// This is imperative on purpose. The bodies are markup strings the controllers
// render; React does not own the controls inside them, so the lock does what
// the classic pass did — and, as it did, remembers what it changed so it can
// restore rather than guess. A control disabled by the form's own rules must
// still be disabled when the run finishes.
import { useCallback, useEffect } from 'react';

// A control may opt out — a Cancel button has to stay live while the thing it
// cancels is running.
const ALLOWED = 'data-tf-busy-allowed';

function useBusyLock({ root, busy }) {
  const apply = useCallback((locked) => {
    if (!root) return;
    for (const control of root.querySelectorAll('input, select, textarea, button')) {
      if (locked) {
        if (control.hasAttribute(ALLOWED) || control.disabled) continue;
        control.disabled = true;
        control.setAttribute('data-tf-busy-disabled', '1');
      } else if (control.hasAttribute('data-tf-busy-disabled')) {
        control.disabled = false;
        control.removeAttribute('data-tf-busy-disabled');
      }
    }
    // Click-to-edit fields are not controls: what makes them live is a
    // delegated action, so what suspends them is taking it away.
    for (const field of root.querySelectorAll('.f-ss-display')) {
      if (locked) {
        if (field.hasAttribute('data-action') && !field.hasAttribute('data-tf-busy-action')) {
          field.setAttribute('data-tf-busy-action', field.getAttribute('data-action'));
          field.removeAttribute('data-action');
        }
        field.classList.add('f-ss-locked');
      } else {
        if (field.hasAttribute('data-tf-busy-action')) {
          field.setAttribute('data-action', field.getAttribute('data-tf-busy-action'));
          field.removeAttribute('data-tf-busy-action');
        }
        field.classList.remove('f-ss-locked');
      }
    }
  }, [root]);

  // Every commit, because a body redrawn mid-run — a tab refreshed while a
  // screening run is in flight — arrives unlocked, and there is no second
  // event coming to lock it.
  useEffect(() => { apply(!!busy); });

  // Unmounting or going idle both have to release: a body left locked has no
  // second event coming to unlock it either.
  useEffect(() => (busy ? () => apply(false) : undefined), [apply, busy]);
}

export { useBusyLock };
