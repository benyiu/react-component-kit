// Makes a React form indistinguishable from a classic one to everything that
// holds forms.
//
// Two registries span both worlds for the whole migration and cannot be
// halved: DirtyTracker answers "is anything unsaved?" and routes a hardware
// back press to the top panel, and panel-stack decides which stacked form owns
// the edge-back gesture. A React form that skipped them would let Back leave
// the app with unsaved edits, or steal the gesture from the form above it.
//
// So a ported form registers a handle here on mount. The members are the ones
// the two registries actually reach for — id, panelId, isDirty, isOpen,
// setDirty, close, requestBack — plus whatever the form's own consumers call,
// which src/ui/tab-form-handle.js records per form.
import { useEffect, useMemo, useRef } from 'react';
import { useEdgeBack } from './useEdgeBack.js';

function useTabFormHandle({
  id, panelId, panel, open, dirty = false,
  onClose, onRequestBack, onSetDirty, extra,
  dirtyTracker, panelStack,
}) {
  // The registries keep the object they were given, so it has to stay the same
  // object across renders while still seeing current state — hence a ref for
  // the state and a memo for the handle.
  const state = useRef({ open, dirty, onClose, onRequestBack, onSetDirty });
  state.current = { open, dirty, onClose, onRequestBack, onSetDirty };

  // A form declares `extra` inline, so it is a new object every render. Were
  // the handle to depend on its identity it would be rebuilt every render, and
  // DirtyTracker — which only appends — would collect a copy each time. So the
  // handle depends on which members exist, and each one calls through to the
  // current closure.
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const extraKeys = Object.keys(extra || {}).sort().join(',');

  const handle = useMemo(() => {
    const members = {
      id,
      panelId,
      isOpen: () => state.current.open,
      isDirty: () => state.current.dirty,
      setDirty: (value) => state.current.onSetDirty && state.current.onSetDirty(value),
      close: () => state.current.onClose && state.current.onClose(),
      requestBack: (source) => (state.current.onRequestBack
        ? state.current.onRequestBack(source)
        : state.current.onClose && state.current.onClose()),
    };
    for (const key of extraKeys ? extraKeys.split(',') : []) {
      // Only methods are wrapped. Several contract members are plain values —
      // contentId and the other element ids — and wrapping one would hand the
      // consumer a function where it expected a string.
      members[key] = typeof extraRef.current[key] === 'function'
        ? (...args) => extraRef.current[key](...args)
        : extraRef.current[key];
    }
    return members;
  }, [id, panelId, extraKeys]);

  useEffect(() => {
    if (!dirtyTracker) return undefined;
    dirtyTracker.register(handle);
    // DirtyTracker has no unregister: a form lives for the page's lifetime, so
    // adding one now would be dead code with a wrong-looking name.
    return undefined;
  }, [dirtyTracker, handle]);

  // Wired here rather than in each panel: the gesture needs the panel
  // element, whether it is open, the stack and the back rule, and this is the
  // one place that already has all four.
  useEdgeBack({
    panel,
    open,
    panelStack,
    onRequestBack: (source) => (state.current.onRequestBack
      ? state.current.onRequestBack(source)
      : state.current.onClose && state.current.onClose()),
    onClose: () => state.current.onClose && state.current.onClose(),
  });

  // The stack decides which of several open forms owns the edge-back gesture,
  // so membership has to track open/closed rather than mount/unmount.
  useEffect(() => {
    if (!panelStack || !panel) return undefined;
    if (open) panelStack.push(panel);
    else panelStack.remove(panel);
    return () => panelStack.remove(panel);
  }, [panelStack, panel, open]);

  return handle;
}

export { useTabFormHandle };
