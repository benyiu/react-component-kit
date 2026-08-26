// The bridge between the observable stores and React.
//
// createStore (src/core/store.js) was written for this: getSnapshot returns a
// frozen object whose identity changes only on a real change, which is exactly
// the stability useSyncExternalStore requires to avoid an infinite render loop.
import { useCallback, useSyncExternalStore } from 'react';

function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

// Selecting has to be memoised by the caller: a selector that builds a new
// object every call re-renders forever, because React compares snapshots by
// identity. Pass a stable selector and derive scalars, or accept the whole
// snapshot via useStore.
function useStoreSelector(store, selector) {
  const select = useCallback(() => selector(store.getSnapshot()), [store, selector]);
  return useSyncExternalStore(store.subscribe, select, select);
}

export { useStore, useStoreSelector };
