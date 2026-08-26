// Stateful list orchestration extracted from the legacy application. Browser
// services and shared render/query helpers are injected once at bootstrap so
// existing classic-script call sites can keep calling createListModule(cfg)
// without reaching back into undeclared globals.
// Writes to caller-owned and DOM objects use Reflect.set: the original factory
// ran in sloppy mode, where a rejected property write is silent rather than a
// strict-module TypeError.
// Encapsulates shared list infrastructure: state management, AbortController,
// offset-based pagination with dedup merge, search debounce, sort toggle,
// count/empty/load-more rendering. List-specific rendering via callbacks.
// The data array stays EXTERNAL (via dataGetter/dataSetter) so existing code
// that reads/writes the array directly does not need to change.
//
// Config:
//   instanceName    — stable key for scroll restoration and sync bookkeeping
//   containerId     — DOM element to render list content into
//   dataGetter      — function() → array (returns external data array)
//   dataSetter      — function(array) → void (replaces external data array)
//   fetchData       — function(params, signal) → Promise<{items, hasMore, total}>
//   getItemId       — function(item) → unique string id for dedup
//   renderRow       — function(item) → HTML string (<tr> or <div>)
//   renderContent   — function(state) → void. When present the engine renders
//                     no content of its own and never writes containerId; the
//                     caller owns that element. Used by React lists, whose
//                     root innerHTML would otherwise destroy.
//   renderCount     — function(items, searchVal, filters) → HTML string
//   renderEmpty     — function(searchVal, filters) → HTML string
//   listMeta        — declarative fallback for shared count + empty state:
//                     { countI18n, icon, emptyI18n, noMatchI18n,
//                       searchMatchI18n }
//
// Optional:
//   renderHeader    — function() → HTML string for <thead><tr>...</tr>.
//                     If omitted, rows are rendered without a table wrapper.
//   searchInputId   — search input element id (null = no search)
//   searchDebounce  — ms (default 300)
//   paginated       — true = offset/limit, false = load all (default true)
//   limit           — page size (default 50)
//   sortKey         — initial sort key (default '')
//   sortDir         — initial sort dir 'asc'|'desc' (default 'asc')
//   serverSort      — true = sort sent to server, false = client-side (default true)
//   filterDrafts    — function(items) → filtered items (default: truthy getItemId)
//   getExtraFilters — function() → object of extra filter params
//   renderHeaderExtra — function() → HTML before count (e.g. filter header)
//   onLoaded        — function(result, allData) → void
//   onError         — optional error side-effect hook; rendering remains uniform
//   afterRender     — function() → void
//   useServerTotal  — render result.total instead of the loaded-page length
//   syncFilter      — function(record, ctx) → true/false/null for ListSync
//                     membership; null marks the server query stale
//   syncMayInsert   — function(record, ctx) → false when an unloaded update
//                     must mark the query stale rather than double-count it
//   refreshBtnId    — button id for spinning animation on refresh (desktop only)
//   tableStyle      — inline style for <table>
//   scrollMoreText  — HTML for "scroll to load more" indicator
//   loadingText     — HTML for loading indicator
//   allShownText    — HTML for "all shown" indicator
//   useAbort        — boolean, use AbortController (default true, follows paginated)
function createListModuleFactory(dependencies) {
  dependencies = dependencies || {};
  var document = dependencies.document;
  var window = dependencies.window;
  var navigator = dependencies.navigator;
  var AbortController = dependencies.AbortController;
  var setTimeout = dependencies.setTimeout;
  var clearTimeout = dependencies.clearTimeout;
  var Date = dependencies.Date;
  var Promise = dependencies.Promise;
  var ListSync = dependencies.ListSync;
  var t = dependencies.t;
  var fListSortHeaderHtml = dependencies.fListSortHeaderHtml;
  var fBuildListFilterParams = dependencies.fBuildListFilterParams;
  var fNormalizeListRequestParams = dependencies.fNormalizeListRequestParams;
  var fResolveListItems = dependencies.fResolveListItems;
  var fResolveListCountHtml = dependencies.fResolveListCountHtml;
  var fListLoadingHtml = dependencies.fListLoadingHtml;
  var fListErrorHtml = dependencies.fListErrorHtml;
  var fResolveListEmptyHtml = dependencies.fResolveListEmptyHtml;
  var fListPaginationStatusHtml = dependencies.fListPaginationStatusHtml;
  var subscribeLanguageRefresh = dependencies.subscribeLanguageRefresh;
  var fNextListSortState = dependencies.fNextListSortState;
  var fListSearchToolbarHtml = dependencies.fListSearchToolbarHtml;
  var fListPullIndicatorHtml = dependencies.fListPullIndicatorHtml;
  var fListShellHtml = dependencies.fListShellHtml;
  var fSetPullIndicatorOffset = dependencies.fSetPullIndicatorOffset;
  var fSetPullIndicatorRefreshing = dependencies.fSetPullIndicatorRefreshing;

  function createListModule(cfg) {
      var _offset = 0;
      var _hasMore = false;
      var _loading = false;
      var _loadPromise = null;
      var _loadError = null;
      var _abort = null;
      var _requestVersion = 0;
      var _sortKey = cfg.sortKey || '';
      var _sortDir = cfg.sortDir || 'asc';
      var _searchTimer = null;
      var _isPaginated = cfg.paginated !== false;  // default true
      var _useAbort = cfg.useAbort !== undefined ? cfg.useAbort : _isPaginated;  // default = paginated
      var _serverSort = cfg.serverSort !== false;  // default true
      var _limit = cfg.limit || 50;
      var _debounce = cfg.searchDebounce || 300;
      var _dirty = true;  // starts dirty → first ensureLoaded() will fetch
      var _dataType = cfg.dataType || '';          // ListSync key (empty = not registered)
      var _ownsRecord = cfg.ownsRecord || null;    // scope guard for multi-context lists
      var _listMeta = cfg.listMeta || null;
      var _serverTotal = null;                     // authoritative filtered total, when supplied

      // ── Uniform shell config (Task #874) ──
      // When cfg.mountId is present the factory builds the FULL list shell into
      // that element: a .f-list-search-bar (search input + optional filters +
      // new button + refresh button) followed by a .f-list-scroll container
      // (rows render into cfg.containerId). This makes every list visually
      // uniform and self-contained (own scroll + pull-to-refresh + infinite scroll).
      var _mountId = cfg.mountId || null;
      var _scrollElId = cfg.scrollId || (cfg.containerId + 'Scroll');
      // Frame ownership is explicit. This prevents page-specific selectors
      // from deciding whether a list has its own rounded frame.
      // standalone: list owns all four edges; embedded: the enclosing form
      // panel owns the frame.
      var _shellMode = cfg.shellMode || 'embedded';
      if (_shellMode !== 'standalone' && _shellMode !== 'embedded') _shellMode = 'embedded';
      var _searchPhI18n = cfg.searchPhI18n || '';
      var _searchPlaceholder = cfg.searchPlaceholder || '';
      var _filters = cfg.filters || null;
      var _newButton = cfg.newButton || null;
      var _refreshable = cfg.refreshable !== false;
      var _searchBarId = cfg.searchBarId || (cfg.containerId + 'Bar');
      // Lists use a visible refresh button on desktop and pull-to-refresh on
      // phones.  Keep cfg.pullToRefresh as an opt-out for an exceptional list.
      var _pullToRefresh = cfg.pullToRefresh !== false;
      var _infiniteScroll = cfg.infiniteScroll !== false;
      var _appendScrollHtml = cfg.appendScrollHtml || '';

      // Let a parent createTabForm recognise this list. Its own pull gesture
      // must yield to the list's pull-to-refresh when this module is shown in
      // a tab, otherwise both handlers can react to the same swipe.
      function _markListModuleElements() {
          var marker = cfg.instanceName || cfg.containerId || 'true';
          var mount = _mountId && document.getElementById(_mountId);
          var content = document.getElementById(cfg.containerId);
          if (mount) mount.setAttribute('data-list-module', marker);
          if (content) content.setAttribute('data-list-module', marker);
      }

      // Sortable header helper — generates <th> with onclick
      function sortTh(key, i18nKey, style) {
          return fListSortHeaderHtml({
              key: key,
              i18nKey: i18nKey,
              style: style,
              sortKey: _sortKey,
              sortDir: _sortDir,
              instanceName: cfg.instanceName
          });
      }

      function _getSearchVal() {
          if (!cfg.searchInputId) return '';
          var el = document.getElementById(cfg.searchInputId);
          return el ? el.value.trim() : '';
      }

      function _getFilters() {
          return cfg.getExtraFilters ? cfg.getExtraFilters() : {};
      }

      function _buildParams(opts) {
          return fBuildListFilterParams({
              params: opts,
              readSearchValue: _getSearchVal,
              readFilters: _getFilters,
              isPaginated: _isPaginated,
              serverSort: _serverSort,
              sortKey: _sortKey,
              sortDir: _sortDir
          });
      }

      // Core load function
      function load(params) {
          var isReset = params && params.reset;
          var requestVersion = ++_requestVersion;
          if (_useAbort) {
              if (_abort) _abort.abort();
              _abort = new AbortController();
          }
          if (isReset) _offset = 0;

          var qp = fNormalizeListRequestParams({
              params: params,
              isPaginated: _isPaginated,
              offset: _offset,
              limit: _limit,
              searchEnabled: cfg.searchInputId,
              readSearchValue: _getSearchVal,
              serverSort: _serverSort,
              sortKey: _sortKey,
              sortDir: _sortDir
          });

          _loadError = null;
          _loading = true;
          // Render immediately so a first load from an empty cache shows a
          // spinner rather than the normal empty-list message.
          render();
          var signal = _abort ? _abort.signal : undefined;
          var loadPromise = cfg.fetchData(qp, signal).then(function(result) {
              // A newer refresh/search/sort started while this request was
              // pending. Its result and cleanup must not alter the active
              // list state (AbortController alone does not prevent that race).
              if (requestVersion !== _requestVersion) return;
              var items = result.items || [];
              var data = cfg.dataGetter();
              if (isReset || !_isPaginated) {
                  cfg.dataSetter(items);
              } else {
                  // Dedup merge by item id (mutate in place)
                  var seen = {};
                  data.forEach(function(item) { seen[cfg.getItemId(item)] = true; });
                  items.forEach(function(item) {
                      if (!seen[cfg.getItemId(item)]) data.push(item);
                  });
              }
              if (_isPaginated) {
                  _offset += items.length;
                  _hasMore = result.hasMore || false;
              }
              if (cfg.useServerTotal && Number.isFinite(Number(result.total))) {
                  _serverTotal = Math.max(0, Number(result.total));
              }
              if (cfg.onLoaded) cfg.onLoaded(result, cfg.dataGetter());
              _dirty = false;
              // Render the settled pagination state. Rendering while _loading
              // is still true omits the "all shown" marker after Refresh.
              _loading = false;
              render();
          }).catch(function(err) {
              if (requestVersion !== _requestVersion) return;
              if (err && err.name === 'AbortError') return;
              // Keep the last known-good cache. A refresh may be a best-effort
              // reconciliation after a successful local mutation (for example,
              // deleting a transaction); clearing it here would make that
              // confirmed mutation look like every record disappeared.
              if (_isPaginated) _hasMore = false;
              _loading = false;
              _loadError = err;
              if (cfg.onError) {
                  var cachedItems = fResolveListItems(cfg, function() {
                      return cfg.dataGetter();
                  });
                  cfg.onError(err, { hasCachedItems: cachedItems.length > 0 });
              }
              render();
          }).finally(function() {
              if (requestVersion === _requestVersion) _loading = false;
              if (_loadPromise === loadPromise) _loadPromise = null;
          });
          _loadPromise = loadPromise;
          return loadPromise;
      }

      // Filter: reset + reload with current search/sort/filters
      function filter() {
          return load(_buildParams({ reset: true }));
      }

      // Refresh: same as filter with optional button spin
      function refresh() {
          var btn = cfg.refreshBtnId ? document.getElementById(cfg.refreshBtnId) : null;
          if (btn) { btn.classList.add('spinning'); setTimeout(function() { btn.classList.remove('spinning'); }, 600); }
          return filter();
      }

      // Sort toggle
      function setSort(key) {
          var nextSort = fNextListSortState({
              sortKey: _sortKey,
              sortDir: _sortDir,
              requestedKey: key
          });
          _sortKey = nextSort.sortKey;
          _sortDir = nextSort.sortDir;
          if (_serverSort) {
              filter();
          } else {
              render();
          }
      }

      // Load more (for infinite scroll — appends without reset)
      function loadMore() {
          if (!_hasMore || _loading) return Promise.resolve();
          return load(_buildParams({}));
      }

      // Render the list content into containerId
      function render() {
          _markListModuleElements();
          var el = document.getElementById(cfg.containerId);
          if (!el) return;

          var searchVal = _getSearchVal();
          var data = cfg.dataGetter();
          var items = fResolveListItems(cfg, function() { return data; });

          // A caller that renders its own content owns the container: the
          // engine keeps search, scrolling, pagination and fetching, and never
          // writes containerId. This is what lets a React root live there —
          // innerHTML would destroy it on the next render.
          if (cfg.renderContent) {
              cfg.renderContent({
                  items: items,
                  data: data,
                  searchVal: searchVal,
                  filters: _getFilters(),
                  loading: _loading,
                  loadError: _loadError,
                  hasMore: _hasMore,
                  isPaginated: _isPaginated,
                  listMeta: _listMeta,
                  serverTotal: _serverTotal,
                  // A caller rendering its own header needs the sort state the
                  // engine's sortTh() would have baked into the markup.
                  sortKey: _sortKey,
                  sortDir: _sortDir
              });
              if (cfg.afterRender) cfg.afterRender();
              return;
          }

          var html = '';
          if (cfg.renderHeaderExtra) html += cfg.renderHeaderExtra();
          var filters = _getFilters();
          html += fResolveListCountHtml({
              items: items,
              searchVal: searchVal,
              filters: filters,
              renderCount: cfg.renderCount,
              renderContext: cfg,
              listMeta: _listMeta,
              useServerTotal: cfg.useServerTotal,
              serverTotal: _serverTotal
          });
          if (items.length === 0) {
              html += _loading ? fListLoadingHtml() : (_loadError ? fListErrorHtml() : fResolveListEmptyHtml({
                  searchVal: searchVal,
                  filters: filters,
                  renderEmpty: cfg.renderEmpty,
                  renderContext: cfg,
                  listMeta: _listMeta
              }));
          } else if (cfg.renderHeader) {
              html += '<table class="f-list-table' + (cfg.tableClass ? ' ' + cfg.tableClass : '') + '"' + (cfg.tableStyle ? ' style="' + cfg.tableStyle + '"' : '') + '><thead><tr>';
              html += cfg.renderHeader();
              html += '</tr></thead><tbody>';
              for (var i = 0; i < items.length; i++) {
                  html += cfg.renderRow(items[i]);
              }
              html += '</tbody></table>';
          } else {
              for (var j = 0; j < items.length; j++) {
                  html += cfg.renderRow(items[j]);
              }
          }

          html += fListPaginationStatusHtml({
              isPaginated: _isPaginated,
              itemCount: items.length,
              dataCount: data.length,
              hasMore: _hasMore,
              loading: _loading,
              loadingText: cfg.loadingText,
              scrollMoreText: cfg.scrollMoreText,
              allShownText: cfg.allShownText
          });

          Reflect.set(el, 'innerHTML', html);

          if (cfg.afterRender) cfg.afterRender();
      }

      // Bind search input debounce + Enter key
      function bindSearch() {
          if (!cfg.searchInputId) return;
          var input = document.getElementById(cfg.searchInputId);
          if (!input) return;
          // Avoid double-binding
          if (input._listModBound) return;
          Reflect.set(input, '_listModBound', true);
          input.addEventListener('input', function() {
              if (_searchTimer) clearTimeout(_searchTimer);
              _searchTimer = setTimeout(function() {
                  filter();
              }, _debounce);
          });
          input.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' && !e.isComposing) {
                  e.preventDefault();
                  if (_searchTimer) clearTimeout(_searchTimer);
                  filter();
                  // Dismiss mobile virtual keyboards once the submitted
                  // search is running, while retaining the entered query.
                  input.blur();
              }
          });
      }

      // Cache-first: ensureLoaded() only fetches when cache is empty (first render).
      // All local mutations (save/delete) update the cache arrays directly, so
      // subsequent renders always show fresh data without re-fetching from server.
      // Context switches use clearData() to empty the cache, forcing a fetch.
      // ── Uniform list shell builder (Task #874) ──────────────────────────
      var _searchBarHtml = '';
      function _buildSearchBar() {
          // A list can decide at render time whether its create action is
          // available (for example, a read-only company administrator view).
          // Existing object configs remain fully backward compatible.
          var newButton = typeof _newButton === 'function' ? _newButton() : _newButton;
          _searchBarHtml = fListSearchToolbarHtml({
              searchBarId: _searchBarId,
              searchInputId: cfg.searchInputId,
              searchPlaceholder: _searchPlaceholder,
              searchPhI18n: _searchPhI18n,
              filters: _filters,
              newButton: newButton,
              refreshable: _refreshable,
              refreshBtnId: cfg.refreshBtnId,
              instanceName: cfg.instanceName
          });
      }
      // Swap the search bar for a freshly built one.
      //
      // Assigning outerHTML discards the old subtree, so the <input> that
      // bindSearch() attached its debounce and Enter handling to is gone and
      // the replacement is unbound. bindSearch() guards itself with
      // _listModBound on the element, so re-binding here is idempotent and the
      // six shell callers that already call it by hand stay correct.
      function _replaceSearchBar() {
          _buildSearchBar();
          var existingBar = document.getElementById(_searchBarId);
          if (!existingBar) return;
          Reflect.set(existingBar, 'outerHTML', _searchBarHtml);
          bindSearch();
          // The freshly built bar has none of the layout state the resize
          // watcher put on the previous one.
          _watchPullToRefreshAvailability();
      }

      // What the toolbar controls hold that the toolbar renderer cannot
      // express. fListSearchToolbarHtml has no `value` for the search input and
      // no `selected` for a filter option, so the query someone typed and the
      // filter they picked exist only in the live elements. Anything that
      // rebuilds the bar has to carry them across.
      function _readToolbarState() {
          var input = cfg.searchInputId ? document.getElementById(cfg.searchInputId) : null;
          var state = { search: input ? input.value : null, filters: [] };
          for (var i = 0; _filters && i < _filters.length; i++) {
              var select = _filters[i].id ? document.getElementById(_filters[i].id) : null;
              state.filters.push(select ? select.value : null);
          }
          return state;
      }

      function _restoreToolbarState(state) {
          var input = cfg.searchInputId ? document.getElementById(cfg.searchInputId) : null;
          if (input && state.search !== null) input.value = state.search;
          for (var i = 0; i < state.filters.length; i++) {
              if (state.filters[i] === null) continue;
              var select = _filters[i].id ? document.getElementById(_filters[i].id) : null;
              if (select) select.value = state.filters[i];
          }
      }

      // buildShell() runs once, so the search toolbar is the one part of a list
      // that a language change did not reach — which is what its [data-i18n-ph],
      // [data-i18n] and [data-i18n-title] attributes were for. Rebuilding it
      // resolves every one of those keys through t() instead, on the same event
      // that redraws the rows.
      //
      // Unlike a re-mount, this must not disturb anyone: a language change is
      // not a reason to lose a half-typed query or reset a filter.
      function _retranslateShell() {
          if (!_mountId) return;
          var mount = document.getElementById(_mountId);
          if (!mount || !mount._listShellBuilt) return;
          var state = _readToolbarState();
          _replaceSearchBar();
          _restoreToolbarState(state);
          _retranslatePullIndicator();
      }

      // The pull-to-refresh hint is the other thing buildShell() writes once,
      // and unlike the toolbar it never named a key at all — so nothing
      // retranslated it, and a phone that changed language kept the previous
      // wording under its thumb until something else rebuilt the shell.
      //
      // Replacing the element is safe because nothing holds it: every consumer,
      // including the touch dispatcher's getIndicator, calls
      // _getListPullIndicator at the moment it needs it. A gesture in flight
      // would lose its inline offset, which needs the language to change
      // mid-pull — the switcher is on a different screen.
      function _retranslatePullIndicator() {
          var indicator = _getListPullIndicator();
          if (!indicator) return;
          Reflect.set(indicator, 'outerHTML', fListPullIndicatorHtml(t('common.pullRefresh')));
      }

      function buildShell() {
          if (!_mountId) return;
          var mount = document.getElementById(_mountId);
          if (!mount) return;
          _markListModuleElements();
          if (mount._listShellBuilt) {
              // Re-render only the search bar (e.g. tab re-mounted) — keep rows container
              _replaceSearchBar();
              return;
          }
          _buildSearchBar();
          var appendScrollHtml = typeof _appendScrollHtml === 'function' ? _appendScrollHtml() : _appendScrollHtml;
          // Every list owns its indicator, including lists embedded in a
          // TabForm. The enclosing tab panel remains the vertical scroll
          // owner, but placing the indicator inside the list shell keeps it
          // within that panel's inset and avoids an outer shared slot.
          var pullIndicator = !_pullToRefresh ? '' :
              fListPullIndicatorHtml(t('common.pullRefresh'));
          var scroll = fListShellHtml({
              shellMode: _shellMode,
              scrollElId: _scrollElId,
              pullIndicatorHtml: pullIndicator,
              searchBarHtml: _searchBarHtml,
              appendScrollHtml: appendScrollHtml
          }, function() {
              return cfg.containerId;
          });
          Reflect.set(mount, 'innerHTML', scroll);
          Reflect.set(mount, '_listShellBuilt', true);
          bindSearch();
          _watchPullToRefreshAvailability();
          // Attach self scroll-handlers now that the scroll container exists.
          // (Idempotent via _ptBound / _infBound, so safe to call from both the
          // initial factory wiring and later buildShell calls on tab activation.)
          initPullToRefresh();
          initInfiniteScroll();
          initScrollToTop();
      }

      // ── Self pull-to-refresh (Task #874) ────────────────────────────────
      // Scoped touch handler on this list's own scroll container; triggers
      // this.refresh() when pulled down past the threshold at scrollTop === 0.
      // The handler stays bound across viewport changes, but is active only
      // on the phone layout so desktop browsers do not pull-to-refresh lists.
      var _ptState = { startX: 0, startY: 0, dist: 0, refreshing: false, threshold: 50, horizontalGesture: false };
      var _pullAvailabilityBound = false;
      function _getListScrollEl() {
          var listScroll = document.getElementById(_scrollElId);
          if (!listScroll) return null;
          // A persistent TabForm track gives each tab panel its own vertical
          // scroller. Embedded lists delegate to that panel, not the shared
          // horizontal-track viewport.
          return listScroll.closest('.c-tabpanel') || listScroll;
      }
      function _isListVisible() {
          var mount = _mountId && document.getElementById(_mountId);
          return !mount || !!(mount.getClientRects && mount.getClientRects().length);
      }
      function _isListOnScreen() {
          var scrollEl = _getListScrollEl();
          if (!scrollEl || !_isListVisible()) return false;
          var rect = scrollEl.getBoundingClientRect();
          var width = window.innerWidth || document.documentElement.clientWidth || 0;
          var height = window.innerHeight || document.documentElement.clientHeight || 0;
          return rect.right > 0 && rect.left < width && rect.bottom > 0 && rect.top < height;
      }
      function _scrollListToTop() {
          var scrollEl = _getListScrollEl();
          if (!_isListOnScreen() || !scrollEl || scrollEl.scrollTop <= 0) return;
          try { scrollEl.scrollTo({ top: 0, behavior: 'smooth' }); }
          catch (e) { Reflect.set(scrollEl, 'scrollTop', 0); }
      }
      // iOS only applies a status-bar tap's native scroll-to-top behavior to
      // the document. Lists intentionally use nested scroll surfaces, so
      // forward a tap on the app header (and any exposed top-edge tap) to
      // the single list that is actually visible.
      function initScrollToTop() {
          var scrollEl = _getListScrollEl();
          if (!scrollEl || scrollEl._listScrollToTopBound) return;
          Reflect.set(scrollEl, '_listScrollToTopBound', true);
          var lastTouchTop = 0;
          function isTouchPhone() {
              return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) &&
                  (!window.matchMedia || window.matchMedia('(max-width: 768px)').matches);
          }
          function canHandle() { return isTouchPhone() && _isListOnScreen(); }
          var mainHeader = document.querySelector('body > .header');
          if (mainHeader) {
              mainHeader.addEventListener('touchend', function(e) {
                  if (!canHandle() || e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
                  lastTouchTop = Date.now();
                  _scrollListToTop();
              }, { passive: true });
              mainHeader.addEventListener('click', function(e) {
                  if (Date.now() - lastTouchTop < 500) return;
                  if (!canHandle() || e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
                  _scrollListToTop();
              });
          }
          document.addEventListener('touchend', function(e) {
              if (!canHandle() || !e.changedTouches || !e.changedTouches.length) return;
              // Safari does not always expose a status-bar tap to the DOM,
              // but this covers versions that report it in the safe-area band.
              if (e.changedTouches[0].clientY <= 32) _scrollListToTop();
          }, { passive: true, capture: true });
      }
      function _getListPullIndicator() {
          var mount = _mountId && document.getElementById(_mountId);
          if (!mount || !_pullToRefresh) return null;
          var shell = mount.querySelector(':scope > .f-list-scroll');
          if (!shell) return null;
          var own = shell.querySelector(':scope > .f-pull-indicator');
          if (!own) {
              shell.insertAdjacentHTML('afterbegin',
                  fListPullIndicatorHtml(t('common.pullRefresh')));
              own = shell.querySelector(':scope > .f-pull-indicator');
          }
          return own;
      }
      function _canUsePullToRefresh() {
          var isTouchDevice = ('ontouchstart' in window) ||
              ((typeof navigator !== 'undefined' && navigator.maxTouchPoints) > 0);
          return _pullToRefresh && isTouchDevice &&
              (!window.matchMedia || window.matchMedia('(max-width: 768px)').matches);
      }
      function _syncPullToRefreshAvailability() {
          var bar = document.getElementById(_searchBarId);
          if (bar) bar.classList.toggle('f-list-no-pull', !_canUsePullToRefresh());
      }
      function _watchPullToRefreshAvailability() {
          _syncPullToRefreshAvailability();
          if (_pullAvailabilityBound) return;
          _pullAvailabilityBound = true;
          window.addEventListener('resize', _syncPullToRefreshAvailability, { passive: true });
      }
      function _isPullToRefreshEnabled() {
          return _canUsePullToRefresh() && _isListVisible();
      }
      function initPullToRefresh() {
          if (!_pullToRefresh || !_scrollElId) return;
          _markListModuleElements();
          var scrollEl = _getListScrollEl();
          if (!scrollEl) return;
          _getListPullIndicator();
          // A form body can host several list tabs. Register each module with
          // one dispatcher on that shared scroll surface, rather than adding a
          // separate touch lifecycle per list. Otherwise a list visited earlier
          // can still compete with the active list's pull gesture.
          function bindPull(el) {
              if (!el) return;
              var moduleKey = cfg.instanceName || _scrollElId;
              var modulesKey = '_listPullModules';
              if (!el[modulesKey]) Reflect.set(el, modulesKey, {});
              Reflect.set(el[modulesKey], moduleKey, {
                  isEnabled: _isPullToRefreshEnabled,
                  getIndicator: _getListPullIndicator,
                  refresh: refresh
              });
              if (el._listPullDispatcherBound) return;
              Reflect.set(el, '_listPullDispatcherBound', true);
              var state = { startX: 0, startY: 0, dist: 0, refreshing: false, threshold: 50, module: null, horizontalGesture: false };
              function getModule(e) {
                  var target = e.target && e.target.closest && e.target.closest('[data-list-module]');
                  var key = target && target.getAttribute('data-list-module');
                  return key && el[modulesKey][key] ? el[modulesKey][key] : null;
              }
              el.addEventListener('touchstart', function(e) {
                  var mod = getModule(e);
                  if (!mod || !mod.isEnabled() || state.refreshing) return;
                  if (e.touches.length !== 1) return;
                  if (el.scrollTop > 0) return;
                  state.module = mod;
                  state.startX = e.touches[0].clientX;
                  state.startY = e.touches[0].clientY;
                  state.dist = 0;
                  state.horizontalGesture = false;
              }, { passive: true });
              el.addEventListener('touchmove', function(e) {
                  var mod = state.module;
                  if (!mod || !mod.isEnabled() || state.refreshing) return;
                  var dx = e.touches[0].clientX - state.startX;
                  var dy = e.touches[0].clientY - state.startY;
                  // iOS/Android history navigation begins with a horizontal
                  // edge swipe. It shares this scroll surface with embedded
                  // lists, so never reinterpret it as a pull-to-refresh.
                  if (Math.abs(dx) > Math.abs(dy)) {
                      state.horizontalGesture = true;
                      var horizontalInd = mod.getIndicator();
                      if (horizontalInd) {
                          fSetPullIndicatorOffset(horizontalInd, 0);
                      }
                      return;
                  }
                  if (state.horizontalGesture) return;
                  if (dy <= 0 || el.scrollTop > 0) return;
                  state.dist = dy;
                  var ind = mod.getIndicator();
                  if (!ind) return;
                  fSetPullIndicatorOffset(ind, dy);
                  ind.classList.toggle('f-flip', dy > state.threshold);
              }, { passive: true });
              el.addEventListener('touchend', function() {
                  var mod = state.module;
                  var ind = mod && mod.getIndicator();
                  if (mod && !state.horizontalGesture && mod.isEnabled() && state.dist > state.threshold) {
                      state.refreshing = true;
                      fSetPullIndicatorRefreshing(ind, true);
                      var result = mod.refresh();
                      function done() {
                          state.refreshing = false;
                          fSetPullIndicatorRefreshing(ind, false);
                      }
                      if (result && typeof result.then === 'function') result.then(done).catch(done);
                      else setTimeout(done, 800);
                  } else {
                      fSetPullIndicatorOffset(ind, 0);
                  }
                  state.dist = 0;
                  state.horizontalGesture = false;
                  state.module = null;
              });
              el.addEventListener('touchcancel', function() {
                  var ind = state.module && state.module.getIndicator();
                  if (!state.refreshing && ind) {
                      ind.classList.remove('f-flip');
                      fSetPullIndicatorOffset(ind, 0);
                  }
                  state.dist = 0;
                  state.horizontalGesture = false;
                  state.module = null;
              }, { passive: true });
          }
          bindPull(scrollEl);
          var searchBar = document.getElementById(_searchBarId);
          if (searchBar && !scrollEl.contains(searchBar)) bindPull(searchBar);
      }

      // ── Self infinite scroll (Task #874) ────────────────────────────────
      function initInfiniteScroll() {
          if (!_infiniteScroll || !_scrollElId) return;
          var scrollEl = _getListScrollEl();
          var boundKey = '_infBound_' + (cfg.instanceName || _scrollElId);
          if (!scrollEl || scrollEl[boundKey]) return;
          Reflect.set(scrollEl, boundKey, true);
          scrollEl.addEventListener('scroll', function() {
              if (!_isListVisible() || !_hasMore || _loading) return;
              var bottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 400;
              if (bottom) loadMore();
          }, { passive: true });
      }

      // Show list: fetch only when the cache is not known-good, otherwise
      // render from it. `_dirty` is the single source of truth for that —
      // it starts true, is cleared only by a completed load, and is set
      // again by clearData().
      //
      // Emptiness deliberately does NOT force a fetch: a list whose server
      // result is genuinely empty stays empty, and treating that as "not
      // loaded yet" re-requested it on every single visit. A load failure
      // leaves _dirty true, so a failed list still retries on the next
      // visit rather than caching the failure.
      function ensureLoaded() {
          // Multiple app/bootstrap paths can reveal the same list during one
          // tick. Share its first request instead of aborting and restarting
          // it, so callers can reliably wait until the visible list settles.
          if (_loading && _loadPromise) return _loadPromise;
          if (_dirty) {
              return filter();
          }
          render();
          return Promise.resolve();
      }

      // --- ListSync integration -------------------------------------------
      // Replace an existing record in place (preserve position) or, when the
      // record is new (no matching id in the cache), unshift it to the TOP.
      function _syncRecord(record, ctx) {
          var data = cfg.dataGetter();
          if (!data) return;
          var id = cfg.getItemId(record);
          var existingIndex = -1;
          if (id != null && id !== '') {
              for (var ei = 0; ei < data.length; ei++) {
                  if (String(cfg.getItemId(data[ei])) === String(id)) { existingIndex = ei; break; }
              }
          }
          if (typeof cfg.syncFilter === 'function') {
              var syncDecision = cfg.syncFilter(record, ctx);
              // `null` means the active server query cannot be evaluated
              // safely from this mutation. Preserve an existing row, never
              // insert a possible false match, and force the next activation
              // or explicit refresh to reconcile with the server.
              if (syncDecision == null) {
                  _dirty = true;
                  if (existingIndex >= 0) Reflect.set(data, existingIndex, record);
                  render();
                  return;
              }
              if (syncDecision === false) {
                  if (existingIndex >= 0) {
                      data.splice(existingIndex, 1);
                      if (cfg.useServerTotal && Number.isFinite(_serverTotal)) _serverTotal = Math.max(0, _serverTotal - 1);
                  } else {
                      // The updated row may have matched this server query on
                      // an unloaded page before it changed. Without its prior
                      // value we cannot safely adjust the total, so reconcile
                      // on the list's next activation/refresh.
                      _dirty = true;
                  }
                  render();
                  return;
              }
          }
          if (!id) {                      // no id → brand-new record ⇒ top
              data.unshift(record);
              if (cfg.useServerTotal && Number.isFinite(_serverTotal)) _serverTotal++;
              render();
              return;
          }
          if (existingIndex >= 0) {
              Reflect.set(data, existingIndex, record); // existing → replace in place
              render();
              return;
          }
          if (typeof cfg.syncMayInsert === 'function' && cfg.syncMayInsert(record, ctx) === false) {
              // This is an update for a row outside the loaded page (or a
              // row newly entering an active filter), not a newly created
              // server record. Inserting it and incrementing a previously
              // authoritative total would double-count it. Mark the query
              // stale and let its next activation/refresh reconcile it.
              _dirty = true;
              render();
              return;
          }
          data.unshift(record);           // not found → new ⇒ top
          if (cfg.useServerTotal && Number.isFinite(_serverTotal)) _serverTotal++;
          render();
      }

      // Merge a server-authoritative partial update into a record that is
      // already present in this list's cache. Parent counters are commonly
      // returned as patches; inserting one without the rest of its row data
      // would create a blank/phantom row, so a cache miss is intentionally a
      // no-op. A later normal refresh will load the full record if needed.
      function _syncPatch(patch, ctx, explicitId) {
          var data = cfg.dataGetter();
          if (!data) return false;
          var id = explicitId != null ? explicitId : cfg.getItemId(patch || {});
          if (id == null || id === '') return false;
          for (var i = 0; i < data.length; i++) {
              if (String(cfg.getItemId(data[i])) === String(id)) {
                  Reflect.set(data, i, Object.assign({}, data[i], patch || {}));
                  render();
                  return true;
              }
          }
          return false;
      }

      // Remove a record from the cache by id.
      function _syncRemove(record) {
          var data = cfg.dataGetter();
          if (!data) return false;
          var id = cfg.getItemId(record);
          if (id == null || id === '') return false;
          for (var i = 0; i < data.length; i++) {
              if (String(cfg.getItemId(data[i])) === String(id)) {
                  data.splice(i, 1);
                  if (cfg.useServerTotal && Number.isFinite(_serverTotal)) _serverTotal = Math.max(0, _serverTotal - 1);
                  render();
                  return true;
              }
          }
          return false;
      }

      var _instance = {
          load: load,
          filter: filter,
          refresh: refresh,
          ensureLoaded: ensureLoaded,
          isDirty: function() { return _dirty; },
          setSort: setSort,
          render: render,
          loadMore: loadMore,
          bindSearch: bindSearch,
          buildShell: buildShell,
          initPullToRefresh: initPullToRefresh,
          initInfiniteScroll: initInfiniteScroll,
          initScrollToTop: initScrollToTop,
          sortTh: sortTh,
          getData: cfg.dataGetter,
          setData: cfg.dataSetter,
          // Callers use this on a context switch (a different company,
          // review, client…) to force the next ensureLoaded() to refetch.
          // Marking dirty is what actually carries that intent now that
          // ensureLoaded() no longer infers "not loaded" from an empty cache.
          clearData: function() {
              // Context switches must invalidate an older scoped request as
              // well as its cached rows. Otherwise ensureLoaded() can reuse
              // the old in-flight promise and paint record A's history into
              // record B's newly opened list.
              _requestVersion++;
              if (_abort) { _abort.abort(); _abort = null; }
              _loading = false;
              _loadPromise = null;
              cfg.dataSetter([]);
              _offset = 0;
              _hasMore = false;
              _serverTotal = null;
              _dirty = true;
          },
          markDirty: function() { _dirty = true; },
          getServerTotal: function() { return Number.isFinite(_serverTotal) ? _serverTotal : null; },
          setOffset: function(v) { _offset = v; },
          isLoading: function() { return _loading; },
          hasMore: function() { return _hasMore; },
          getSortKey: function() { return _sortKey; },
          getSortDir: function() { return _sortDir; },
          getOffset: function() { return _offset; },
          // ListSync hooks (exposed for the registry)
          _dataType: _dataType,
          _instanceName: cfg.instanceName,
          ownsRecord: _ownsRecord,
          _syncRecord: _syncRecord,
          _syncPatch: _syncPatch,
          _syncRemove: _syncRemove
      };
      // Delegated list actions resolve their data-list-instance identity at
      // event time. Publishing every named instance keeps that boundary
      // uniform for top-level lists and lists created inside feature factories.
      if (cfg.instanceName && typeof window !== 'undefined') {
          // This code moved from a sloppy classic script into a strict ES module.
          // Reflect.set preserves the old assignment's silent failure for a
          // non-writable compatibility property while still invoking setters.
          Reflect.set(window, cfg.instanceName, _instance);
      }

      // Build shell + wire self pull-to-refresh / infinite scroll (Task #874)
      if (_mountId) buildShell();
      initPullToRefresh();
      initInfiniteScroll();
      initScrollToTop();

      if (_dataType) ListSync.register(_instance);

      // A list retranslates by rendering again: its rows hold no user input, so
      // rebuilding them costs nothing a person can notice, and it lets a row
      // renderer call t() at build time instead of leaving a [data-i18n-label]
      // for the DOM applier to resolve a microtask later.
      //
      // render() covers the rows, the count, the empty/loading/error line, the
      // pagination status and — through cfg.renderHeader — the sortable column
      // headers. It does not cover the shell chrome, which buildShell() writes
      // once; _retranslateShell() is that half, and the two together are why no
      // part of a list names an i18n key for the applier any more.
      //
      // This is the list's own business rather than a central function reaching
      // into a hand-maintained set of modules. That set existed, in
      // refreshLocalizedNameViews, and it was incomplete — every list missing
      // from it kept the previous language until something else redrew it.
      //
      // render() already no-ops without a container, so an off-screen list
      // costs nothing, and a renderContent list delegates rather than writing
      // innerHTML, so a React root in the container is untouched.
      //
      // The subscription is never released: every list module is built once, at
      // controller construction, and lives as long as the application. A list
      // that ever becomes per-open needs a destroy() before that stops holding.
      if (typeof subscribeLanguageRefresh === 'function') {
          subscribeLanguageRefresh(function() { _retranslateShell(); render(); });
      }
      return _instance;
  }

  return createListModule;
}

export { createListModuleFactory };
