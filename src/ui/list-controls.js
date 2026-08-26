import { t } from '../core/i18n.js';
import { FormWidgets } from './form-widgets.js';
import { fEscAttr, fEscHtml } from './html-utils.js';

// Pure list-control renderers. The createListModule compatibility wrapper owns
// state and callback timing; these helpers only reproduce its existing HTML.
function fListSortHeaderHtml(options) {
  var cls = 'f-sortable';
  var arrow = ' <span class="f-sort-arrow">⇅</span>';
  if (options.sortKey === options.key) {
    cls += ' f-sort-active';
    arrow = options.sortDir === 'asc'
      ? ' <span class="f-sort-arrow">▲</span>'
      : ' <span class="f-sort-arrow">▼</span>';
  }
  // No data-i18n: the engine redraws its own headers on a language change
  // (createListModule subscribes to subscribeLanguageRefresh and calls
  // render(), which calls cfg.renderHeader() → sortTh() → here), so this t()
  // runs again with the new language. Leaving the attribute would ask the DOM
  // applier to redo, a microtask later, work that has already been done.
  return '<th class="' + cls + '"' + (options.style ? ' style="' + options.style + '"' : '') +
    ' data-action="list.sort" data-list-instance="' + fEscAttr(options.instanceName) +
    '" data-sort-key="' + fEscAttr(options.key) + '">' +
    '<span>' + t(options.i18nKey) + '</span>' + arrow + '</th>';
}

// Nothing here names an i18n key for the DOM applier. createListModule rebuilds
// this toolbar on a language change (_retranslateShell), carrying the typed
// query and the filter selections across, so every t() below runs again with
// the new language — a microtask earlier than the applier managed, and without
// the applier having to walk the document to find it.
function fListSearchToolbarHtml(options) {
  var newButton = options.newButton;
  var bar = '<div class="f-list-search-bar' + (newButton ? ' f-list-has-new' : '') + '" id="' + options.searchBarId + '">';
  if (options.searchInputId) {
    bar += '<div class="f-search-wrap" style="position:relative;">' +
      FormWidgets.inputControl({
        id: options.searchInputId,
        className: 'f-search-input',
        placeholder: options.searchPlaceholder || t(options.searchPhI18n || 'common.search'),
      }) +
      '</div>';
  }
  if (options.filters) {
    for (var fi = 0; fi < options.filters.length; fi++) {
      var f = options.filters[fi];
      var filterOptions = '';
      for (var oi = 0; oi < f.options.length; oi++) {
        var op = f.options[oi];
        filterOptions += '<option value="' + fEscAttr(op.value) + '">' +
          fEscHtml(op.label || t(op.i18n || '')) + '</option>';
      }
      bar += FormWidgets.selectControl({
        id: f.id,
        className: 'f-status-filter',
        attrs: ' data-action="' + fEscAttr(f.action || 'list.filter') +
          '" data-list-instance="' + fEscAttr(options.instanceName) + '"',
        options: filterOptions,
      });
    }
  }
  bar += '<span class="f-toolbar-spacer"></span>';
  if (newButton) {
    var newButtonAction = newButton.action
      ? ' data-action="' + fEscAttr(newButton.action) + '"'
      : '';
    if (newButton.data) {
      Object.keys(newButton.data).forEach(function(key) {
        var attrName = key.replace(/[A-Z]/g, function(letter) {
          return '-' + letter.toLowerCase();
        });
        newButtonAction += ' data-' + attrName + '="' + fEscAttr(newButton.data[key]) + '"';
      });
    }
    // Every configured new button supplies both a key and a hardcoded Chinese
    // literal, and the literal used to be what was painted: the tooltip read
    // 創建客戶 in English until the applier got round to it. Resolving the key
    // here makes the first paint correct in both languages and leaves `title`
    // as the fallback for a button configured without one.
    var newButtonTitle = newButton.i18nTitle ? t(newButton.i18nTitle) : newButton.title;
    bar += '<button class="f-new-btn"' + newButtonAction +
      (newButtonTitle ? ' title="' + fEscAttr(newButtonTitle) + '"' : '') +
      '>' + (newButton.iconHtml || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>') + '</button>';
  }
  if (options.refreshable) {
    bar += '<button class="f-refresh-btn f-list-refresh-btn" data-action="list.refresh"' +
      ' data-list-instance="' + fEscAttr(options.instanceName) + '" title="' +
      t('common.refreshList') + '" id="' +
      (options.refreshBtnId || (options.searchBarId + 'Refresh')) + '">↻</button>';
  }
  bar += '</div>';
  return bar;
}

export { fListSearchToolbarHtml, fListSortHeaderHtml };
