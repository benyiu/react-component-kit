// Pull-to-refresh for a React form panel.
//
// The gesture itself is not reimplemented here: `ui/tab-form-pull-refresh.js`
// owns the thresholds, the horizontal-swipe rejection, the indicator states and
// the rule that a panel containing a list module leaves the gesture to that
// list. This hook is the wiring that lets it drive a React panel, which turns
// out to be almost nothing — FormShell renders the same
// `.f-form-container > .f-form-inner` shape the classic panel had.
//
// One difference is deliberate. The classic controller creates an indicator for
// every `.c-tabpanel` when it initializes; a React form has one body and no
// such wrappers, so the indicator is created on the first pull instead. The
// user sees the same thing either way, and nothing is inserted into a panel
// nobody ever pulls.
import { useEffect, useRef } from 'react';
import { createTabFormPullRefreshController } from '../../ui/tab-form-pull-refresh.js';
import { fSetPullIndicatorOffset, fSetPullIndicatorRefreshing } from '../../ui/pull-indicator.js';
import { useDeps } from '../deps.jsx';

function usePullRefresh({
  ids, open, mode, busy = false, onRefresh,
}) {
  const { t } = useDeps();
  // The controller reads these at gesture time, so a ref keeps it looking at
  // the current render rather than the one that installed it.
  const state = useRef({});
  state.current = { mode, busy, onRefresh };

  useEffect(() => {
    if (!open || !onRefresh) return;
    const container = document.getElementById(ids.containerId);
    if (!container) return;
    const controller = createTabFormPullRefreshController({
      config: {
        pullToRefresh: true,
        // Called by the gesture; goes through the ref so a re-render's
        // handler is the one that runs.
        onPullRefresh: (...args) => state.current.onRefresh(...args),
      },
      document,
      containerId: ids.containerId,
      contentId: ids.contentId,
      // A create has no saved record to reload, which the controller checks.
      getMode: () => state.current.mode,
      getBusy: () => state.current.busy,
      getActiveTab: () => null,
      // One body, so the panel it decorates and the element it measures are
      // the same two elements every time.
      getPanel: () => document.getElementById(ids.contentId),
      getActiveScrollElement: () => document.getElementById(ids.contentId) || container,
      t,
      setIndicatorOffset: fSetPullIndicatorOffset,
      setIndicatorRefreshing: fSetPullIndicatorRefreshing,
      setTimeout: (...args) => setTimeout(...args),
    });
    controller.init();
    // The controller binds once per container and marks it; nothing to undo
    // while the panel lives, which it does for the page's lifetime.
  }, [open, onRefresh, ids.containerId, ids.contentId, t]);
}

export { usePullRefresh };
