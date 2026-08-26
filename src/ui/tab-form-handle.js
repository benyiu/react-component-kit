// What a tab form is, to everyone who holds one.
//
// createTabForm returns a 52-member object, and fifteen instances plus a
// dozen feature modules reach into it. Phase 3 of the React migration
// replaces that factory form by form, so the surface a replacement must
// provide has to be written down before the first one moves — otherwise
// "does this still work?" has no answer short of running the whole app.
//
// The three groups below are measured, not guessed: each name was counted
// against every holder of a form instance across src/.

// Element ids the panel owns. Consumers read these to find DOM the form
// rendered; a React form provides the same ids so those readers keep working
// until they convert too.
const TAB_FORM_ELEMENT_IDS = Object.freeze([
  'id', 'panelId', 'contentId', 'titleId',
  'saveBtnId', 'submitBtnId', 'menuBtnId', 'menuId',
]);

// Methods consumers actually call. This is the contract a React form must
// honour on day one.
const TAB_FORM_METHODS = Object.freeze([
  // Lifecycle
  'open', 'close', 'requestBack', 'deleteRecord',
  // State the caller asks about
  'isOpen', 'isCreate', 'isDirty', 'isBusy', 'hasRestoredDraft',
  'getData', 'getDbId', 'getSaveMode', 'getDeleteMode',
  'getActiveTab', 'isTabActive', 'getTabPanel', 'isActiveTabEditable',
  // State the caller sets
  'setData', 'setDirty', 'setBusy', 'setTitle', 'setPendingApproval',
  'transitionHiddenFields',
  // Saving
  'save', 'cancelServerDraft', 'saveDraft', 'loadDraft', 'clearDraft',
  // Redrawing
  'switchTab', 'refresh', 'refreshTab', 'refreshActiveTab', 'refreshTabBar',
  'refreshSaveButton', 'applyEditability',
]);

// Members nothing references. Eight were removed when this contract was first
// measured; the list stays so a new one cannot be added unnoticed — the guard
// fails if anything here gains a caller, or if the factory returns a member
// the contract does not name.
//
// `syncActiveTabLayout` was the ninth, removed once its two callers went. It
// bundled four of the retired factory's passes, and a React panel owes none of
// them: `tf-list-tab-active` was toggled on `.c-tabpanel` wrappers a React body
// does not have, the editability pass and the busy lock are hooks that re-run
// on the redraw, and the pull-indicator reconciliation is the KNOWN GAP in
// docs/react-migration-plan.md, which belongs to the hook that owns the
// gesture. No panel ever published it, so both callers were reaching for a
// member that did not exist.
const TAB_FORM_UNUSED = Object.freeze([]);

const TAB_FORM_HANDLE = Object.freeze([
  ...TAB_FORM_ELEMENT_IDS,
  ...TAB_FORM_METHODS,
  ...TAB_FORM_UNUSED,
]);

export {
  TAB_FORM_ELEMENT_IDS,
  TAB_FORM_HANDLE,
  TAB_FORM_METHODS,
  TAB_FORM_UNUSED,
};
