import { t } from '../core/i18n.js';
import { fEscAttr, fEscHtml } from './html-utils.js';

// Shared initial-loading state for lists. Keep it separate from the normal
// empty state: an empty cache while the request is pending does not mean that
// there are no records.
function fListLoadingHtml() {
  return '<div class="f-list-empty f-list-loading" role="status" aria-live="polite">' +
    '<span class="f-spinner" aria-hidden="true"></span>' +
    '<span>' + fEscHtml(t('common.loading')) + '</span></div>';
}

function fListErrorHtml() {
  return '<div class="f-list-empty f-list-error" role="alert">' +
    '<div class="f-empty-icon" aria-hidden="true">⚠️</div>' +
    '<span>' + fEscHtml(t('common.loadFail')) + '</span></div>';
}

// Keeping search interpolation here makes a query safe wherever it appears
// and gives every data list the same count row / empty-state structure.
function fListSearchMatchHtml(searchVal, i18nKey) {
  if (!searchVal) return '';
  var marker = '__CDD_SEARCH_QUERY__';
  var template = t(i18nKey || 'common.list.searchMatch', { q: marker });
  return fEscHtml(template).replace(marker, fEscHtml(searchVal));
}

function fListStatsHtml(count, countI18n, searchVal, options) {
  options = options || {};
  var safeCount = Number(count);
  if (!isFinite(safeCount) || safeCount < 0) safeCount = 0;
  safeCount = Math.floor(safeCount);
  var vars = Object.assign({ count: safeCount, n: safeCount }, options.countVars || {});
  var countText = options.countText != null ? options.countText : t(countI18n, vars);
  var html = '<div class="f-list-count' + (options.className ? ' ' + fEscAttr(options.className) : '') + '">';
  html += fEscHtml(countText);
  html += fListSearchMatchHtml(searchVal, options.searchMatchI18n || 'common.list.searchMatch');
  if (options.suffixHtml) html += options.suffixHtml;
  return html + '</div>';
}

function fListEmptyHtml(icon, message, options) {
  options = options || {};
  var className = 'f-list-empty' + (options.className ? ' ' + options.className : '');
  return '<div class="' + fEscAttr(className) + '"' + (options.role ? ' role="' + fEscAttr(options.role) + '"' : '') + '>' +
    '<div class="f-empty-icon" aria-hidden="true">' + fEscHtml(icon || '📭') + '</div>' +
    '<span>' + fEscHtml(message || '') + '</span></div>';
}

function fListHasActiveFilters(filters) {
  var source = filters || {};
  var keys = Object.keys(source);
  for (var i = 0; i < keys.length; i++) {
    var value = source[keys[i]];
    if (value !== undefined && value !== null && value !== '' && value !== false) return true;
  }
  return false;
}

// Resolve the records that represent persisted/renderable list rows. Accepting
// a reader keeps createListModule's normal-render and error-cache evaluation
// order intact while sharing the filter contract itself.
function fResolveListItems(config, readData) {
  return config.filterDrafts
    ? config.filterDrafts(readData().slice())
    : readData().filter(function(item) { return config.getItemId(item); });
}

function fListPullIndicatorHtml(text) {
  return '<div class="f-pull-indicator"><span class="f-pull-spin"></span>' +
    '<span class="f-pull-arrow">↓</span> ' + text + '</div>';
}

// The shell carried three class names and one of them was a name nothing read.
//
// `f-list-shell` looked like the BEM base of `f-list-shell--standalone` and
// `f-list-shell--embedded`, which is exactly why it survived: both modifiers
// have rules, so `grep '\.f-list-shell'` answers "styled" and the base is the
// one member of the family with nothing behind it. Three people read it that
// way, the coordinator included.
//
// It has no rule, no querySelector and no classList test — checked across
// src/, the page markup and the composed stylesheet. And the base role it
// looked like it was filling was already taken: `f-list-scroll` is on the same
// element from the same template, carries the shared behaviour
// (`overflow-y:auto`, `overscroll-behavior:contain`) and is what four call
// sites query — tab-form-scroll-lock.js:57, create-list-module.js:619 and
// legacy/app.js:6709,6719. So the base did not want a rule; there was nothing
// left for one to say, and writing one to satisfy the scan would have been a
// declaration invented for a test. The name goes instead.
function fListShellHtml(options, readContainerId) {
  return '<div class="f-list-scroll f-list-shell--' + options.shellMode +
    '" id="' + options.scrollElId + '">' + options.pullIndicatorHtml +
    options.searchBarHtml + '<div id="' + readContainerId() + '"></div>' +
    options.appendScrollHtml + '</div>';
}

function fResolveListCountHtml(options) {
  options = options || {};
  if (options.renderCount) {
    return options.renderCount.call(
      options.renderContext,
      options.items,
      options.searchVal,
      options.filters,
    );
  }
  var listMeta = options.listMeta;
  if (listMeta && listMeta.countI18n) {
    var count = options.useServerTotal && Number.isFinite(options.serverTotal)
      ? options.serverTotal
      : options.items.length;
    return fListStatsHtml(count, listMeta.countI18n, options.searchVal, {
      searchMatchI18n: listMeta.searchMatchI18n,
    });
  }
  return '';
}

function fResolveListEmptyHtml(options) {
  options = options || {};
  if (options.renderEmpty) {
    return options.renderEmpty.call(
      options.renderContext,
      options.searchVal,
      options.filters,
    );
  }
  var listMeta = options.listMeta;
  if (listMeta) {
    var filtered = !!options.searchVal || fListHasActiveFilters(options.filters);
    var messageKey = filtered && listMeta.noMatchI18n
      ? listMeta.noMatchI18n
      : (listMeta.emptyI18n || listMeta.noMatchI18n || 'admin.noResults');
    return fListEmptyHtml(listMeta.icon || '📭', t(messageKey));
  }
  return fListEmptyHtml('📭', t('admin.noResults'));
}

function fListPaginationStatusHtml(options) {
  options = options || {};
  if (!options.isPaginated || !(options.itemCount > 0)) return '';
  if (options.hasMore) {
    var html = '<div class="f-load-more">';
    if (options.loading) {
      html += '<span class="f-spinner"></span> ' +
        (options.loadingText || t('common.loading'));
    } else {
      html += options.scrollMoreText || t('common.scrollMore');
    }
    return html + '</div>';
  }
  if (options.dataCount > 0 && !options.loading) {
    return '<div class="f-load-more f-load-end">' +
      (options.allShownText || t('common.allShown')) + '</div>';
  }
  return '';
}

export {
  fListEmptyHtml,
  fListErrorHtml,
  fListHasActiveFilters,
  fListLoadingHtml,
  fListPaginationStatusHtml,
  fListPullIndicatorHtml,
  fListSearchMatchHtml,
  fListShellHtml,
  fListStatsHtml,
  fResolveListCountHtml,
  fResolveListEmptyHtml,
  fResolveListItems,
};
