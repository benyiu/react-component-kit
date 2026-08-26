// Tier-4 smoke: the list engine, composed exactly as the source application
// composes it (main.js:372) — the real presentation, query and controls
// helpers, the real ListSync/RecordSync registry — and driven standalone:
// buildShell into a bare mount, a search narrowing the fetch, sort, paging,
// and sync mutations landing in rendered rows.
//
// The factory's `t` is the marking translator; the presentation module's own
// fallback texts resolve through the kit's sliced dictionary, so structural
// assertions use classes and injected texts use the «key» form.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createListModuleFactory } from '../src/ui/create-list-module.js';
import {
  fListLoadingHtml, fListPaginationStatusHtml, fListPullIndicatorHtml,
  fListShellHtml, fResolveListCountHtml, fListErrorHtml,
  fResolveListEmptyHtml, fResolveListItems,
} from '../src/ui/list-presentation.js';
import {
  fBuildListFilterParams, fNextListSortState, fNormalizeListRequestParams,
} from '../src/ui/list-query.js';
import { fListSearchToolbarHtml, fListSortHeaderHtml } from '../src/ui/list-controls.js';
import {
  fSetPullIndicatorOffset, fSetPullIndicatorRefreshing,
} from '../src/ui/pull-indicator.js';
import { ListSync } from '../src/core/record-sync.js';
import { subscribeLanguageRefresh } from '../src/core/i18n.js';

const t = (key, vars) => `«${key}${vars ? ':' + JSON.stringify(vars) : ''}»`;

const createListModule = createListModuleFactory({
  document,
  window: globalThis,
  navigator: globalThis.navigator,
  AbortController,
  setTimeout: (...a) => setTimeout(...a),
  clearTimeout: (...a) => clearTimeout(...a),
  Date,
  Promise,
  ListSync,
  t,
  subscribeLanguageRefresh,
  fListSortHeaderHtml,
  fBuildListFilterParams,
  fNormalizeListRequestParams,
  fResolveListItems,
  fResolveListCountHtml,
  fListLoadingHtml,
  fListErrorHtml,
  fResolveListEmptyHtml,
  fListPaginationStatusHtml,
  fNextListSortState,
  fListSearchToolbarHtml,
  fListPullIndicatorHtml,
  fListShellHtml,
  fSetPullIndicatorOffset,
  fSetPullIndicatorRefreshing,
});

let counter = 0;
function makeList(overrides = {}) {
  counter += 1;
  const name = `kitList${counter}`;
  document.body.innerHTML += `<div id="${name}Mount"></div>`;
  let data = [];
  const fetchData = overrides.fetchData || vi.fn(async () => ({
    items: [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ],
    hasMore: false,
    total: 2,
  }));
  const list = createListModule({
    instanceName: name,
    mountId: `${name}Mount`,
    containerId: `${name}Rows`,
    searchInputId: `${name}Search`,
    shellMode: 'standalone',
    searchPlaceholder: 'search-ph',
    dataGetter: () => data,
    dataSetter: (next) => { data = next; },
    fetchData,
    getItemId: (item) => item.id,
    renderRow: (item) => `<div class="kit-row" data-row-id="${item.id}">${item.name}</div>`,
    // The count and empty keys belong to the CONSUMER's dictionary, not the
    // kit's slice — a real integration adds its own keys. The count here uses
    // the custom renderer path; the empty state exercises the listMeta path,
    // whose unknown key falls back to itself (t returns the key).
    renderCount: (items) => `<div class="f-list-count">${items.length}</div>`,
    listMeta: { icon: '📭', emptyI18n: 'kit.consumer.empty' },
    searchDebounce: 10,
    ...overrides.cfg,
  });
  return { list, fetchData, name, getData: () => data };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the shell', () => {
  it('buildShell writes the full uniform shell and marks its elements for the enclosing form', () => {
    const { name } = makeList();
    const mount = document.getElementById(`${name}Mount`);
    const scroll = mount.querySelector('.f-list-scroll');
    expect(scroll).not.toBeNull();
    expect(scroll.className).toContain('f-list-shell--standalone');
    // the deleted unstyled base name must not resurface (lane V, 9944a7f).
    expect(scroll.className).not.toMatch(/f-list-shell(?!--)/);
    expect(mount.querySelector(`#${name}Search`)).not.toBeNull();
    expect(mount.querySelector(`#${name}Rows`)).not.toBeNull();
    // the pull hint is written through the factory's own t.
    expect(mount.querySelector('.f-pull-indicator').textContent).toContain('«common.pullRefresh»');
    // the enclosing tab form recognises the list by this marker and yields
    // its own pull gesture.
    expect(mount.getAttribute('data-list-module')).toBe(name);
  });
});

describe('loading and rendering', () => {
  it('the first ensureLoaded fetches, renders the rows and the count, and a second render comes from cache', async () => {
    const { list, fetchData, name } = makeList();
    await list.ensureLoaded();
    expect(fetchData).toHaveBeenCalledTimes(1);
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelectorAll('.kit-row')).toHaveLength(2);
    expect(rows.querySelector('[data-row-id="a"]').textContent).toBe('Alpha');
    // the count line resolves through the kit's sliced dictionary.
    expect(rows.querySelector('.f-list-count').textContent).toContain('2');

    await list.ensureLoaded();
    expect(fetchData).toHaveBeenCalledTimes(1);

    list.clearData();
    await list.ensureLoaded();
    expect(fetchData).toHaveBeenCalledTimes(2);
  });

  it('an empty result renders the declared empty state and stays empty without refetching', async () => {
    const { list, fetchData, name } = makeList({
      fetchData: vi.fn(async () => ({ items: [], hasMore: false, total: 0 })),
    });
    await list.ensureLoaded();
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelector('.f-list-empty')).not.toBeNull();
    await list.ensureLoaded();
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it('a failed load renders the error state and retries on the next visit', async () => {
    const fetchData = vi.fn(async () => { throw new Error('list-load-fail'); });
    const { list, name } = makeList({ fetchData });
    await list.ensureLoaded();
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelector('.f-list-error')).not.toBeNull();
    expect(list.isDirty()).toBe(true);
    await list.ensureLoaded();
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
});

describe('search and sort', () => {
  it('typing debounces into one narrowed fetch; Enter searches immediately', async () => {
    vi.useFakeTimers();
    try {
      const { list, fetchData, name } = makeList();
      await list.ensureLoaded();
      const input = document.getElementById(`${name}Search`);

      input.value = 'alp';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = 'alpha';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(50);
      expect(fetchData).toHaveBeenCalledTimes(2);
      expect(fetchData.mock.calls[1][0].search).toBe('alpha');

      input.value = 'beta';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchData).toHaveBeenCalledTimes(3);
      expect(fetchData.mock.calls[2][0].search).toBe('beta');
    } finally {
      vi.useRealTimers();
    }
  });

  // The test above proves the search term reaches the SERVER. Nothing proved it
  // reaches the RENDERERS, and those are two different consumers of the same
  // value: `renderContent` is handed { items, searchVal, filters, ... } so a
  // consumer can say "no results for X" or highlight matches. A kit whose
  // renderers silently receive an empty search term draws a list that has been
  // narrowed with no indication of what narrowed it.
  //
  // Found by this kit's own mutation harness: replacing `var searchVal =
  // _getSearchVal()` with '' left every suite green.
  it('the search term reaches the content renderer, not only the fetch', async () => {
    vi.useFakeTimers();
    try {
      const renderContent = vi.fn();
      const { list, name } = makeList({ cfg: { renderContent } });
      await list.ensureLoaded();
      const input = document.getElementById(`${name}Search`);

      input.value = 'alpha';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);

      const last = renderContent.mock.calls[renderContent.mock.calls.length - 1][0];
      expect(last.searchVal).toBe('alpha');
      // Asserted alongside so a renderer that receives the term but no rows is
      // not mistaken for a pass — both halves travel together or the consumer
      // cannot draw either state.
      expect(Array.isArray(last.items)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setSort sends the toggled sort to the server and flips direction on repeat', async () => {
    const { list, fetchData } = makeList();
    await list.ensureLoaded();
    list.setSort('name');
    await Promise.resolve();
    expect(fetchData.mock.calls[1][0].sort).toBe('name');
    expect(fetchData.mock.calls[1][0].order).toBe('asc');
    list.setSort('name');
    await Promise.resolve();
    expect(fetchData.mock.calls[2][0].order).toBe('desc');
  });
});

describe('pagination', () => {
  it('loadMore appends the next page, dedups by id, and the status line follows', async () => {
    const pages = [
      { items: [{ id: 'a', name: 'Alpha' }], hasMore: true, total: 2 },
      { items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], hasMore: false, total: 2 },
    ];
    const fetchData = vi.fn(async (qp) => pages[qp.offset > 0 ? 1 : 0]);
    const { list, name, getData } = makeList({ fetchData });
    await list.ensureLoaded();
    expect(list.hasMore()).toBe(true);
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelector('.f-load-more')).not.toBeNull();

    await list.loadMore();
    // 'a' arrived on both pages and exists once.
    expect(getData().map((i) => i.id)).toEqual(['a', 'b']);
    expect(list.hasMore()).toBe(false);
    expect(rows.querySelector('.f-load-end')).not.toBeNull();
  });
});

describe('ListSync', () => {
  it('a saved record replaces its row in place; an unknown one lands on top', async () => {
    const { list, name, getData } = makeList({ cfg: { dataType: `kitsync${counter + 1}` } });
    await list.ensureLoaded();
    const type = list._dataType;

    ListSync.save(type, { id: 'b', name: 'Beta II' });
    expect(getData().map((i) => i.id)).toEqual(['a', 'b']);
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelector('[data-row-id="b"]').textContent).toBe('Beta II');

    ListSync.save(type, { id: 'c', name: 'Gamma' });
    expect(getData().map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(rows.querySelectorAll('.kit-row')).toHaveLength(3);
    expect(rows.querySelector('.kit-row').getAttribute('data-row-id')).toBe('c');
  });

  it('a patch merges into the cached row as a REPLACED element, and a cache miss is a no-op', async () => {
    const { list, name, getData } = makeList({ cfg: { dataType: `kitsync${counter + 1}` } });
    await list.ensureLoaded();
    const type = list._dataType;
    const before = getData()[0];

    ListSync.patch(type, 'a', { name: 'Alpha patched' });
    const after = getData()[0];
    expect(after.name).toBe('Alpha patched');
    expect(after.id).toBe('a');
    // the element was replaced, not mutated: a React consumer comparing by
    // identity sees the change (established upstream by lane T).
    expect(after).not.toBe(before);
    expect(before.name).toBe('Alpha');
    const rows = document.getElementById(`${name}Rows`);
    expect(rows.querySelector('[data-row-id="a"]').textContent).toBe('Alpha patched');

    // a phantom row must never appear from a patch.
    ListSync.patch(type, 'ghost', { name: 'Phantom' });
    expect(getData().map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('a removed record leaves the cache and the rendered list', async () => {
    const { list, name, getData } = makeList({ cfg: { dataType: `kitsync${counter + 1}` } });
    await list.ensureLoaded();
    ListSync.remove(list._dataType, { id: 'a' });
    expect(getData().map((i) => i.id)).toEqual(['b']);
    expect(document.getElementById(`${name}Rows`).querySelectorAll('.kit-row')).toHaveLength(1);
  });

  it('a syncFilter that cannot decide marks the query stale instead of guessing', async () => {
    const { list, getData } = makeList({
      cfg: {
        dataType: `kitsync${counter + 1}`,
        syncFilter: (record) => (record.id === 'b' ? null : true),
      },
    });
    await list.ensureLoaded();
    expect(list.isDirty()).toBe(false);
    ListSync.save(list._dataType, { id: 'b', name: 'Undecidable' });
    expect(list.isDirty()).toBe(true);
    // the existing row was still refreshed in place, never dropped.
    expect(getData().find((i) => i.id === 'b').name).toBe('Undecidable');
  });
});
