// @ts-check
// Keeps the page behind a full-screen form from scrolling.
//
// This is a behaviour the migration dropped without anyone noticing. The
// classic factory locked outer scroll every time a panel opened — on touch
// devices at phone width, where a fixed overlay is not enough on its own —
// and unlocked it on close, restoring both the scroll offset and focus on the
// list row the form was opened from. Nothing in React did any of that, so
// each ported form quietly lost it, and by the last port the lock manager had
// no callers at all.
//
// The manager itself is unchanged (src/ui/tab-form-scroll-lock.js): it is
// reference-counted, because one form can be opened on top of another, and
// that count only works if every panel shares one instance — which is why it
// arrives through deps rather than being built here.
import { useEffect, useRef } from 'react';
import { useDeps } from '../deps.jsx';

function useOuterScrollLock(open, enabled = true) {
  const { scrollLock } = useDeps();
  // What this panel did, not what the manager was asked overall: an unlock
  // must happen exactly once per lock or the reference count never returns
  // to zero and the page stays frozen for the rest of the session.
  const locked = useRef(false);

  useEffect(() => {
    if (!scrollLock) return undefined;

    const release = () => {
      if (!locked.current) return;
      locked.current = false;
      scrollLock.tfUnlockOuterPageScroll();
      // Belt and braces for a form closed two ways at once — a back gesture
      // racing a toolbar Back. It only acts once no panel remains.
      scrollLock.tfEnsureOuterPageScrollUnlocked();
      // The row the form was opened from keeps its selected state while the
      // panel is up, but not its focus.
      scrollLock.tfRestoreActiveListFocus();
    };

    if (!open || !enabled) {
      release();
      return undefined;
    }
    // The manager owns the rule for whether a lock is warranted here at all.
    if (!scrollLock.tfNeedsOuterPageScrollLock()) return undefined;
    locked.current = true;
    scrollLock.tfLockOuterPageScroll();
    // Unmounting while open — a hot reload, a root torn down — must not leave
    // the body fixed with no panel on top of it.
    return release;
  }, [scrollLock, open, enabled]);
}

export { useOuterScrollLock };
