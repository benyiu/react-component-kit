// DOM-free query and sort state helpers for createListModule. Reader callbacks
// are injected so the legacy factory retains its exact lazy-read ordering
// without making this module depend on document or list-instance globals.

function fBuildListFilterParams(options) {
  options = options || {};
  var params = options.params || {};
  var readSearchValue = options.readSearchValue;
  var search = readSearchValue();
  if (search) params.search = search;
  if (options.isPaginated || options.serverSort) {
    params.sort = options.sortKey;
    params.order = options.sortDir;
  }
  var readFilters = options.readFilters;
  var filters = readFilters();
  Object.keys(filters).forEach(function(key) {
    if (filters[key]) params[key] = filters[key];
  });
  return params;
}

function fNormalizeListRequestParams(options) {
  options = options || {};
  var params = options.params ? Object.assign({}, options.params) : {};
  if (options.isPaginated) {
    params.offset = options.offset;
    params.limit = options.limit;
  }
  if (!params.search && options.searchEnabled) {
    var readSearchValue = options.readSearchValue;
    var search = readSearchValue();
    if (search) params.search = search;
  }
  if (options.isPaginated || options.serverSort) {
    if (!params.sort) params.sort = options.sortKey;
    if (!params.order) params.order = options.sortDir;
  }
  return params;
}

function fNextListSortState(options) {
  options = options || {};
  var sortKey = options.sortKey;
  var sortDir = options.sortDir;
  if (sortKey === options.requestedKey) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = options.requestedKey;
    sortDir = 'asc';
  }
  return { sortKey: sortKey, sortDir: sortDir };
}

export {
  fBuildListFilterParams,
  fNextListSortState,
  fNormalizeListRequestParams,
};
