// Shared Save-button contract for every createTabForm. Creation readiness
// is a property of the form mode, not of dirty state or whether a caller
// happened to pre-populate an identity field. Validation still runs when
// Save is pressed; this state only controls availability and appearance.
function tfSaveButtonState(mode, canSave, busy, saving, dirty, restoredDraft, serverDraftWorkflow, hasServerDraft) {
  var isCreate = mode === 'create';
  var createReady = isCreate && serverDraftWorkflow
    ? (!hasServerDraft || !!dirty || !!restoredDraft)
    : isCreate;
  return {
    visible: !busy && !!canSave && (createReady || (!isCreate && (!!dirty || !!restoredDraft))),
    disabled: !!(busy || saving),
    dirty: !!dirty
  };
}

function tfSubmitButtonState(mode, canSave, busy, saving, hasServerDraft) {
  return {
    visible: mode === 'create' && !busy && !!canSave && !!hasServerDraft,
    disabled: !!(busy || saving)
  };
}

// A caller may use `id` as a browser-local key while composing a new
// record. Never promote that key to the persisted identity until Save has
// succeeded. An explicit `_dbId` remains safe for an onSave handler to
// apply from the canonical server response before it returns.
function tfResolveWorkingDbId(mode, data, currentDbId) {
  if (mode === 'create') return (data && data._dbId) || null;
  return (data && (data._dbId || data.id)) || currentDbId || null;
}

function tfStripTabLabelDependencyFields(state, config) {
  if (state && typeof state === 'object' && config.tabLabelDeps) {
    var comparable = Array.isArray(state) ? state.slice() : Object.assign({}, state);
    var deps = Array.isArray(config.tabLabelDeps)
      ? config.tabLabelDeps
      : [config.tabLabelDeps];
    for (var di = 0; di < deps.length; di++) {
      var fields = deps[di] && (deps[di].fields || deps[di].mergeFields);
      if (!Array.isArray(fields)) continue;
      // The legacy classic script ignored a failed delete (for example an
      // array's non-configurable length). Reflect preserves that in strict ESM.
      for (var fi = 0; fi < fields.length; fi++) {
        Reflect.deleteProperty(comparable, fields[fi]);
      }
    }
    state = comparable;
  }
  return state;
}

// The projection a form compares against the state it opened with.
//
// `collectState` is a comparison-only view for forms whose live UI carries
// temporary controls; `collectData` is the save payload and stands in when
// there is no separate comparison view; `snapshotForm` reads the DOM for forms
// that declare neither. The data is always cloned first so comparing can never
// mutate the live copy.
function tfComparisonState(data, cfg, snapshotForm) {
  var state;
  if (cfg.collectState) {
    state = cfg.collectState(JSON.parse(JSON.stringify(data || {})));
  } else if (cfg.collectData) {
    state = cfg.collectData(JSON.parse(JSON.stringify(data || {})));
  } else {
    state = snapshotForm ? snapshotForm() : {};
  }
  // Some controls express an optional value both as an absent field and as an
  // empty input. A form may normalize those equivalent states so neither reads
  // as an edit.
  state = cfg.normalizeState ? cfg.normalizeState(state) : state;
  // tabLabelDeps.fields are server metadata — usually counters — that only
  // redraw labels. A concurrent count update must never make an untouched form
  // dirty, so they are stripped from the baseline and every comparison alike.
  return tfStripTabLabelDependencyFields(state, cfg);
}

// Whether a form has real unsaved work, given its current comparison state and
// the baseline captured when it opened.
//
// Two rules that are easy to get wrong. Returning to the opening state is not
// dirty — toggling a risk factor and back, or switching a company 法團→個人→法團,
// leaves the form identical to what was loaded. And merely opening a create
// form is not an edit: it is dirty only once the user has actually changed
// something, which `hasUserEdit` records.
function tfDirtyState(state, baseline, mode, hasUserEdit) {
  var changed = baseline
    ? JSON.stringify(state) !== JSON.stringify(baseline)
    : false;
  return {
    changed: changed,
    dirty: changed && (mode !== 'create' || hasUserEdit),
  };
}

// Whether a browser recovery draft should be written for the form as it
// stands.
//
// Three rules, and the middle one is the one that surprises: only a create
// form keeps a browser draft. An edit already exists on the server, so a
// half-typed change to it is not something to resurrect days later.
//
// The third rule is why merely opening a create form writes nothing — its
// defaults are not the user's work. A restored draft counts even before the
// user touches it, because it is already their work from last time.
function tfShouldWriteDraft({
  useFactoryDraft, mode, hasData, dirty, restoredDraft,
} = {}) {
  if (!useFactoryDraft) return false;
  if (mode !== 'create' || !hasData) return false;
  return !!(dirty || restoredDraft);
}

// What actually gets stored. Underscore-prefixed keys are the form's own
// bookkeeping — ids, versions, record state — and restoring them would revive
// a stale identity alongside the user's text.
function tfDraftPayload(data, cloneValue) {
  const payload = cloneValue ? cloneValue(data || {}) : { ...(data || {}) };
  const record = payload && typeof payload === 'object' ? payload : {};
  Object.keys(record).forEach((key) => {
    if (key.charAt(0) === '_') delete record[key];
  });
  return record;
}

// A server draft is only ever part of composing a new record. Editing an
// existing one saves directly; there is nothing to stage.
function tfIsServerDraftWorkflow(cfg, mode) {
  return !!(cfg && cfg.serverDraft === true) && mode === 'create';
}

// And there is only a draft to submit once the server has actually issued one.
function tfHasServerDraft(cfg, mode, data) {
  return !!(
    tfIsServerDraftWorkflow(cfg, mode)
    && data
    && data._recordState === 'DRAFT'
    && data._draftId
  );
}

// The record a form holds after the server has stored its draft.
//
// The deletions are the load-bearing part. A draft is not the persisted
// record, so carrying _dbId or _version forward would leave the form believing
// it is editing something that exists — and the next save would target a row
// that was never created.
//
// The version fallback chain is wide because the draft envelope has been
// spelled three ways across the API's history, and a missed spelling means
// every subsequent draft save reports a version conflict.
function tfServerDraftRecord(current, result) {
  const saved = { ...(current || {}), ...((result && result.savedData) || {}) };
  const draft = (result && result.recordDraft) || {};
  saved._recordState = 'DRAFT';
  saved._draftId = draft._draftId || draft.id || saved._draftId;
  saved._draftVersion = Number(
    draft._draftVersion || draft._version || draft.version || saved._draftVersion || 0,
  );
  delete saved._dbId;
  delete saved._version;
  return saved;
}

// What the pending-approval banner says, or null when there is nothing
// pending.
//
// A delete awaiting approval reads differently from an edit: there is no
// "since" to offer because the record is not changing, it is going away. And
// an approval whose request carries no id gets no "view" button, because
// there would be nothing to open.
function tfPendingApprovalBanner(pending, { translate, formatDate } = {}) {
  if (!pending) return null;
  const isDelete = String(pending.operation || '').toUpperCase() === 'DELETE';
  let note;
  if (isDelete) {
    note = translate('changeRequest.pendingDeleteNote');
  } else if (pending.createdAt) {
    note = translate('changeRequest.pendingSince', { time: formatDate(pending.createdAt) });
  } else {
    note = translate('changeRequest.pendingNote');
  }
  return {
    icon: '◷',
    title: translate(isDelete ? 'changeRequest.pendingDeleteTitle' : 'changeRequest.pendingTitle'),
    note,
    requestId: pending.id || null,
  };
}

// And what the server-draft banner says while one is staged.
function tfServerDraftBanner(hasServerDraft, { translate } = {}) {
  if (!hasServerDraft) return null;
  return {
    icon: '✎',
    title: translate('common.serverDraftTitle'),
    note: translate('common.serverDraftNote'),
    requestId: null,
  };
}

// What a form's action menu offers, in order.
//
// The rule worth spelling out is the third one. A server draft has no
// canonical business record yet — only a temporary id — so record-level
// commands like change-request history, audit or PDF export must not appear
// while one is staged. Offering them would point them at an id that names
// nothing.
//
// Labels stay callable here rather than being resolved, because a form's own
// items compute theirs from the record.
function tfActionMenuItems({
  hasServerDraft, deleteMode, mode, dbId, extraMenuItems, data, api, translate,
} = {}) {
  const items = [];
  if (hasServerDraft) {
    items.push({ label: translate('common.cancelDraft'), cls: 'danger', action: 'cancelServerDraft' });
  }
  if (deleteMode && deleteMode !== 'readonly') {
    items.push({
      label: translate(deleteMode === 'request' ? 'changeRequest.requestDelete' : 'common.delete'),
      cls: 'danger',
      action: 'delete',
    });
  }
  const recordActionsAllowed = mode === 'edit' && !!dbId && !hasServerDraft;
  if (recordActionsAllowed && Array.isArray(extraMenuItems)) {
    for (const extra of extraMenuItems) {
      if (!extra) continue;
      if (typeof extra.visible === 'function' && extra.visible(data, mode, api) === false) continue;
      items.push(extra);
    }
  }
  return items;
}

// What a submit asks the server for.
//
// The draft's id and version travel with the request so the server can tell
// this submission from a retry of it — which is what keeps a lost response
// from becoming a duplicate record.
function tfSubmitRequest(data) {
  return {
    saveMode: 'direct',
    intent: 'submit',
    submissionAction: 'SUBMIT',
    draftId: data && data._draftId,
    draftVersion: Number((data && data._draftVersion) || 0),
  };
}

// The record a form holds once its draft has been submitted.
//
// The mirror of tfServerDraftRecord, and the deletions matter for the same
// reason in reverse: the draft identity has to go, or the form still looks
// like it is holding one and would offer to submit it again.
//
// A submitted record without a persisted id is not something to carry on
// with — the server said yes but named nothing — so that is reported rather
// than left for a later save to fail on confusingly.
function tfSubmittedRecord(current, savedData) {
  const record = { ...(current || {}), ...(savedData || {}) };
  delete record._draftId;
  delete record._draftVersion;
  delete record._submissionAction;
  record._recordState = 'SUBMITTED';
  const dbId = record._dbId || record.id || null;
  return { record, dbId };
}

function tfResolveSaveMode(cfg, data, mode, activeTab, api, pendingApproval) {
  if (mode === null || pendingApproval) return 'readonly';
  var resolvedMode = typeof cfg.getSaveMode === 'function'
    ? cfg.getSaveMode(data, mode, activeTab, api)
    : null;
  if (resolvedMode !== 'direct' && resolvedMode !== 'request' && resolvedMode !== 'readonly') {
    resolvedMode = (!cfg.canSave || cfg.canSave(data, mode, activeTab) !== false)
      ? 'direct'
      : 'readonly';
  }
  return resolvedMode;
}

function tfResolveDeleteMode(cfg, data, mode, dbId, api, pendingApproval) {
  if (mode === null || !dbId || pendingApproval || !cfg.onDelete) return 'readonly';
  var resolvedMode = typeof cfg.getDeleteMode === 'function'
    ? cfg.getDeleteMode(data, mode, api)
    : null;
  if (resolvedMode !== 'direct' && resolvedMode !== 'request' && resolvedMode !== 'readonly') {
    resolvedMode = (!cfg.canDelete || cfg.canDelete(data, mode, api) !== false)
      ? 'direct'
      : 'readonly';
  }
  return resolvedMode;
}

export {
  tfActionMenuItems,
  tfSubmitRequest,
  tfSubmittedRecord,
  tfPendingApprovalBanner,
  tfServerDraftBanner,
  tfComparisonState,
  tfDraftPayload,
  tfHasServerDraft,
  tfIsServerDraftWorkflow,
  tfServerDraftRecord,
  tfShouldWriteDraft,
  tfDirtyState,
  tfResolveDeleteMode,
  tfResolveSaveMode,
  tfResolveWorkingDbId,
  tfSaveButtonState,
  tfStripTabLabelDependencyFields,
  tfSubmitButtonState,
};
