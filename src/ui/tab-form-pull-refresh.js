// Own the detail-panel pull-to-refresh gesture for one TabForm instance.
// List and file-browser panels keep their independent controllers; this
// controller only supplies an indicator to ordinary detail panels.
function createTabFormPullRefreshController(options) {
  var config = options.config;
  var documentRef = options.document;
  var containerId = options.containerId;
  var contentId = options.contentId;
  var getMode = options.getMode;
  var getBusy = options.getBusy;
  var getActiveTab = options.getActiveTab;
  var getPanel = options.getPanel;
  var getActiveScrollElement = options.getActiveScrollElement;
  var translate = options.t;
  var setIndicatorOffset = options.setIndicatorOffset;
  var setIndicatorRefreshing = options.setIndicatorRefreshing;
  var schedule = options.setTimeout;

  var state = {
    startX: 0,
    startY: 0,
    dist: 0,
    refreshing: false,
    threshold: 50,
    horizontalGesture: false,
    indicator: null,
  };

  function panelOwnsPullToRefresh(panelElement) {
    return !!(panelElement && panelElement.querySelector(
      '[data-list-module], [data-file-browser-pull], [data-related-file-browser]',
    ));
  }

  function hasActiveListModule() {
    var activePanel = getPanel(getActiveTab());
    return !!(activePanel && activePanel.querySelector('[data-list-module]'));
  }

  function ensureDetailPullIndicator(panelElement) {
    if (
      !panelElement ||
      config.pullToRefresh === false ||
      typeof config.onPullRefresh !== 'function'
    ) return null;
    var direct = panelElement.querySelector(':scope > .f-pull-indicator');
    if (panelOwnsPullToRefresh(panelElement)) {
      if (direct) direct.remove();
      return null;
    }
    if (!direct) {
      direct = documentRef.createElement('div');
      direct.className = 'f-pull-indicator';
      direct.innerHTML = '<span class="f-pull-spin"></span>' +
        '<span class="f-pull-arrow">↓</span> ' + translate('common.pullRefresh');
      panelElement.insertBefore(direct, panelElement.firstChild);
    }
    return direct;
  }

  function syncIndicators() {
    var container = containerId && documentRef.getElementById(containerId);
    var legacyOuter = container && container.querySelector(':scope > .f-pull-indicator');
    if (legacyOuter) legacyOuter.remove();
    var content = documentRef.getElementById(contentId);
    if (!content) return;
    var panels = content.querySelectorAll('.c-tabpanel');
    for (var i = 0; i < panels.length; i++) ensureDetailPullIndicator(panels[i]);
  }

  function getActiveDetailPullIndicator() {
    return ensureDetailPullIndicator(getPanel(getActiveTab()));
  }

  function isEnabled() {
    // Create forms have no canonical record to reload. Modules that own their
    // own list/file gesture also remain outside this detail controller.
    if (
      getMode() === 'create' ||
      getBusy() ||
      typeof config.onPullRefresh !== 'function'
    ) return false;
    return config.pullToRefresh !== false &&
      !panelOwnsPullToRefresh(getPanel(getActiveTab()));
  }

  function init() {
    if (
      config.pullToRefresh === false ||
      typeof config.onPullRefresh !== 'function' ||
      !containerId
    ) return;
    var container = documentRef.getElementById(containerId);
    if (!container || container._ptBound) return;
    container._ptBound = true;
    syncIndicators();
    var scrollElement = container.querySelector('.f-form-inner') || container;

    function isListGesture(event) {
      // File browsers have their own pull controller. Their events may still
      // bubble to the horizontal tab pager, but must not start a second pull.
      return !!(event.target && event.target.closest && event.target.closest(
        '[data-list-module], [data-file-browser-pull]',
      ));
    }

    scrollElement.addEventListener('touchstart', function(event) {
      if (isListGesture(event)) return;
      if (!isEnabled() || state.refreshing) return;
      if (event.touches.length !== 1) return;
      if (getActiveScrollElement().scrollTop > 0) return;
      var indicator = getActiveDetailPullIndicator();
      if (!indicator) return;
      state.startX = event.touches[0].clientX;
      state.startY = event.touches[0].clientY;
      state.dist = 0;
      state.horizontalGesture = false;
      state.indicator = indicator;
    }, { passive: true });

    scrollElement.addEventListener('touchmove', function(event) {
      if (isListGesture(event)) return;
      if (!state.indicator || !isEnabled() || state.refreshing) return;
      var dx = event.touches[0].clientX - state.startX;
      var dy = event.touches[0].clientY - state.startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        state.horizontalGesture = true;
        setIndicatorOffset(state.indicator, 0);
        return;
      }
      if (state.horizontalGesture) return;
      if (dy <= 0 || getActiveScrollElement().scrollTop > 0) return;
      state.dist = dy;
      var indicator = state.indicator;
      setIndicatorOffset(indicator, dy);
      indicator.classList.toggle('f-flip', dy > state.threshold);
    }, { passive: true });

    scrollElement.addEventListener('touchend', function() {
      var indicator = state.indicator;
      if (!indicator) return;
      if (
        !state.horizontalGesture &&
        isEnabled() &&
        state.dist > state.threshold
      ) {
        state.refreshing = true;
        setIndicatorRefreshing(indicator, true);
        function done() {
          state.refreshing = false;
          setIndicatorRefreshing(indicator, false);
          state.indicator = null;
        }
        var result;
        try { result = config.onPullRefresh(); }
        catch (error) { done(); result = null; }
        if (state.refreshing) {
          if (result && typeof result.then === 'function') {
            result.then(done).catch(done);
          } else {
            schedule(done, 800);
          }
        }
      } else {
        setIndicatorOffset(indicator, 0);
        state.indicator = null;
      }
      state.startX = 0;
      state.startY = 0;
      state.dist = 0;
      state.horizontalGesture = false;
    });

    scrollElement.addEventListener('touchcancel', function() {
      if (state.indicator && !state.refreshing) {
        setIndicatorOffset(state.indicator, 0);
      }
      state.startX = 0;
      state.startY = 0;
      state.dist = 0;
      state.horizontalGesture = false;
      if (!state.refreshing) state.indicator = null;
    }, { passive: true });
  }

  return Object.freeze({
    init: init,
    syncIndicators: syncIndicators,
    hasActiveListModule: hasActiveListModule,
  });
}

export { createTabFormPullRefreshController };
