import { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY_CONTENT = Object.freeze({
  items: [],
  loading: false,
  loadError: null,
  hasMore: false,
  serverTotal: null,
  pagesLoaded: 0,
  loaded: false,
});

// A small React-owned paging boundary for list-shaped panels.  The transport
// receives an offset/page, limit and AbortSignal; the hook owns cancellation,
// stale-response fencing, append de-duplication and the visible state.  This
// is intentionally independent from createListModule so a panel can own its
// toolbar and scroll frame without importing the legacy DOM engine.
function usePagedList({
  fetchPage, pageSize = 50, getItemId, enabled = true, acceptItems = null,
}) {
  const [content, setContent] = useState(EMPTY_CONTENT);
  const contentRef = useRef(content);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  contentRef.current = content;

  const load = useCallback((mode) => {
    if (!enabled || typeof fetchPage !== 'function') return Promise.resolve(false);
    const current = contentRef.current;
    const replacingItems = mode !== 'more';
    const clearsVisibleItems = mode === 'filter';
    if (!replacingItems && (current.loading || !current.hasMore)) return Promise.resolve(false);

    const token = ++requestRef.current;
    if (abortRef.current) abortRef.current.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    // The server cursor is page-based even when a test double (or a filtered
    // response) returns fewer than `pageSize` rows. Use pages loaded rather
    // than the rendered item count so the next request cannot repeat page 0.
    const page = replacingItems ? 0 : current.pagesLoaded;
    const offset = page * pageSize;
    setContent((previous) => ({
      ...previous,
      // A changed query/sort must clear the old result set immediately. A
      // refresh, on the other hand, keeps the rendered rows in place until
      // the replacement page wins, so pull-to-refresh never reconstructs the
      // list frame just to show its loading state.
      items: clearsVisibleItems ? [] : previous.items,
      loading: true,
      loadError: null,
      loaded: clearsVisibleItems ? false : previous.loaded,
    }));

    let request;
    try {
      request = fetchPage({
        offset,
        page,
        limit: pageSize,
        signal: abortController.signal,
      });
    } catch (error) {
      request = Promise.reject(error);
    }
    return Promise.resolve(request).then((result) => {
      if (!mountedRef.current || token !== requestRef.current) return false;
      const incoming = Array.isArray(result && result.items) ? result.items : [];
      const existing = replacingItems ? [] : contentRef.current.items;
      const seen = new Set(existing.map((item, index) => (
        getItemId ? String(getItemId(item, index)) : item
      )));
      const additions = incoming.filter((item, index) => {
        const id = getItemId ? String(getItemId(item, index)) : item;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      const items = existing.concat(additions);
      const total = result && Number.isFinite(Number(result.total))
        ? Math.max(0, Number(result.total))
        : null;
      const hasMore = result && typeof result.hasMore === 'boolean'
        ? result.hasMore
        : (total != null && items.length < total);
      // A domain cache may need the exact accepted array, but it must not see a
      // response until this hook has won both the mounted and request-token
      // fences. Keep the callback synchronous so a compatibility refresh
      // promise settles only after its cache publication is complete.
      if (typeof acceptItems === 'function') acceptItems(items, result);
      setContent({
        items,
        loading: false,
        loadError: null,
        hasMore: !!hasMore,
        serverTotal: total,
        pagesLoaded: (replacingItems ? 0 : contentRef.current.pagesLoaded) + 1,
        loaded: true,
      });
      abortRef.current = null;
      return true;
    }).catch((error) => {
      if (!mountedRef.current || token !== requestRef.current ||
          (error && error.name === 'AbortError')) return false;
      setContent((previous) => ({ ...previous, loading: false, loadError: error }));
      abortRef.current = null;
      return false;
    });
  }, [acceptItems, enabled, fetchPage, getItemId, pageSize]);

  // `filter()` is intentionally the destructive reset used after a changed
  // query or sort. `refresh()` starts from page zero too, but keeps the
  // current result set mounted until the new response is ready.
  const filter = useCallback(() => load('filter'), [load]);
  const refresh = useCallback(() => load('refresh'), [load]);
  const loadMore = useCallback(() => load('more'), [load]);

  // Compatibility caches sometimes receive an authoritative local mutation
  // (for example setData() after a lazy controller opens, or removal after a
  // successful delete). React still owns the visible paging state: the
  // bridge hands that mutation to this hook instead of publishing a parallel
  // controlled ListContent projection. Callers choose whether the mutation also
  // fences an in-flight request and whether paging metadata is preserved.
  const replaceItems = useCallback((value, options = {}) => {
    const items = Array.isArray(value) ? value : [];
    const preserveRequest = options.preserveRequest === true;
    const preservePaging = options.preservePaging === true;
    if (!preserveRequest) {
      requestRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = null;
    }
    setContent((previous) => {
      const hasServerTotal = Object.prototype.hasOwnProperty.call(options, 'serverTotal');
      const requestedTotal = hasServerTotal ? options.serverTotal : null;
      const serverTotal = hasServerTotal
        ? (requestedTotal != null && Number.isFinite(Number(requestedTotal))
          ? Math.max(0, Number(requestedTotal))
          : null)
        : (preservePaging ? previous.serverTotal : null);
      const hasMore = Object.prototype.hasOwnProperty.call(options, 'hasMore')
        ? !!options.hasMore
        : (preservePaging ? previous.hasMore : false);
      const pagesLoaded = Object.prototype.hasOwnProperty.call(options, 'pagesLoaded')
        ? Math.max(0, Number(options.pagesLoaded) || 0)
        : (preservePaging
          ? previous.pagesLoaded
          : (items.length ? Math.max(1, Math.ceil(items.length / pageSize)) : 0));
      return {
        items,
        loading: preserveRequest ? previous.loading : false,
        loadError: preserveRequest ? previous.loadError : null,
        hasMore,
        serverTotal,
        pagesLoaded,
        loaded: Object.prototype.hasOwnProperty.call(options, 'loaded')
          ? !!options.loaded
          : true,
      };
    });
    return true;
  }, [pageSize]);

  useEffect(() => {
    // StrictMode replays effect setup/cleanup without recreating hook state.
    // Mark the second setup live again so the replayed request may publish.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { content, filter, refresh, loadMore, replaceItems };
}

export { EMPTY_CONTENT, usePagedList };
