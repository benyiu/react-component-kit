// Applies a tab's read-only state to the controls inside it.
//
// A ported form renders its body as markup, so the controls do not exist until
// after the render — and they are replaced on every redraw. That makes this an
// effect keyed on the same signal the body is: whenever the markup changes, or
// whether the viewer may edit changes, the rules are applied again.
//
// The rules themselves are shared with the classic renderer
// (src/ui/tab-form-editability.js), so a locked record looks the same in both
// worlds and restoring puts back exactly what was taken.
import { useEffect } from 'react';
import { setTabReadonly } from '../../ui/tab-form-editability.js';

function useTabEditability({ root, editable, canEditControl, revision, open }) {
  useEffect(() => {
    if (!open || !root) return;
    setTabReadonly(root, !editable, { canEditControl });
    // `revision` is the redraw counter: a redraw replaces every control, so
    // the rules have to be re-applied to the new ones.
  }, [root, editable, canEditControl, revision, open]);
}

export { useTabEditability };
