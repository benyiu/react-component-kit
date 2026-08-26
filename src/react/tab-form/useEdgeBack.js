// @ts-check
// Swiping a form away from the left edge.
//
// The second behaviour found missing by measuring what the retired factory
// took with it, and the same story as the outer scroll lock: the classic
// factory gave every form it built a left-edge drag that follows the finger
// and closes the panel on release, and no ported form had one. On a phone
// that gesture is how a full-height form gets closed; the toolbar Back is a
// small target at the far top of it.
//
// The controller is untouched (src/ui/tab-form-edge-back.js) — it owns the
// edge width, the travel and velocity thresholds, and the transform. What
// this supplies is the callbacks, read through a ref so a controller built
// once, when the panel element first exists, always sees current state.
//
// **The release goes through the panel's own back rule, not around it.** The
// classic controller could run the unsaved-changes question itself, but the
// ported panels each own that decision and several add to it — a busy form
// refuses to close at all. So `isDirty` answers false and the question is
// left where it lives; what arrives here is the same call the toolbar Back
// makes. The one thing this must do afterwards is put the panel back square,
// whatever the answer was, or a form that refused to close would stay
// half-dragged and a reopened one would come back offset.
import { useEffect, useRef } from 'react';
import { createTabFormEdgeBackController } from '../../ui/tab-form-edge-back.js';

/**
 * @param {{
 *   panel: HTMLElement|null,
 *   open: boolean,
 *   panelStack: { isTopOrEmpty: (panel: HTMLElement) => boolean }|null,
 *   onRequestBack?: (source: string) => unknown,
 *   onClose?: () => unknown,
 * }} deps
 */
function useEdgeBack({ panel, open, panelStack, onRequestBack, onClose }) {
  const state = useRef(
    /** @type {{ open: boolean, onRequestBack?: (source: string) => unknown, onClose?: () => unknown }} */
    ({ open, onRequestBack, onClose }),
  );
  state.current = { open, onRequestBack, onClose };

  useEffect(() => {
    if (!panel || !panelStack) return undefined;
    const controller = createTabFormEdgeBackController(/** @type {any} */ ({
      panel,
      window: globalThis,
      // A form underneath another must not answer the gesture. The panel on
      // top owns it, which is what the stack is for.
      isEnabled: () => state.current.open && panelStack.isTopOrEmpty(panel),
      // Draft flushing is the panel's, on the same signal that would flush it
      // for a toolbar Back.
      flushDraft: () => {},
      // Owned by the panel — see above.
      isDirty: () => false,
      confirmDiscard: () => Promise.resolve(true),
      clearDirty: () => {},
      // The toolbar is rendered, not mutated.
      updateSaveButton: () => {},
      finishBack: () => {
        if (state.current.onClose) state.current.onClose();
      },
      requestBack: (source) => {
        const answer = state.current.onRequestBack
          ? state.current.onRequestBack(source)
          : state.current.onClose && state.current.onClose();
        Promise.resolve(answer).catch(() => {}).then(() => controller.reset());
      },
    }));
    return () => controller.reset();
  }, [panel, panelStack]);
}

export { useEdgeBack };
