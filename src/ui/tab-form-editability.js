// Making a tab read-only, and putting it back.
//
// A record the viewer may not edit still has to be readable, so its controls
// stay visible and are disabled rather than removed. Three details carry real
// intent and are easy to lose in a re-implementation:
//
//   - A mutation *button* is hidden, not disabled. A disabled button occupies
//     a slot that says "you could do this, but not now", which is the wrong
//     thing to tell someone who will never be allowed to.
//   - A control that was already disabled by its renderer is left alone, so
//     restoring does not enable something that was never meant to be on.
//   - Click-to-edit fields have their handler *moved aside* rather than
//     removed, because restoring has to put back exactly what was there.
//
// One caller: react/tab-form/useTabEditability.js. This used to say "both
// worlds apply the same rules: the classic renderer through tab-form-render.js,
// React through useTabEditability" — tab-form-render.js was one of the form
// factory's five collaborators and retired with it, and
// tests/smoke/frontend-shell-split.test.mjs:836 asserts the entry no longer
// imports it. Nothing here is shared with a second world any more.

const DISABLED_MARK = 'data-tf-readonly-disabled';
const DISPLAY_MARK = 'data-tf-readonly-display';
const ONCLICK_MARK = 'data-tf-readonly-onclick';
const ACTION_MARK = 'data-tf-readonly-action';
const LOCKED_CLASS = 'f-ss-locked';
const CLICK_FIELDS = '.f-ss-display[onclick], .f-ss-display[data-action]';

// `canEditControl` is the per-control exception — the one region of an
// otherwise locked record that a particular viewer may still operate.
function applyReadonly(root, { canEditControl } = {}) {
  if (!root) return;
  const exempt = (element) => !!(canEditControl && canEditControl(element) === true);

  const controls = root.querySelectorAll('input, select, textarea, button');
  for (const control of controls) {
    if (exempt(control)) continue;
    if (control.tagName === 'BUTTON' && !control.hasAttribute(DISPLAY_MARK)) {
      control.setAttribute(DISPLAY_MARK, control.style.display || '');
      control.style.display = 'none';
    }
    if (control.disabled) continue;
    control.disabled = true;
    control.setAttribute(DISABLED_MARK, '1');
  }

  for (const field of root.querySelectorAll(CLICK_FIELDS)) {
    if (exempt(field)) continue;
    if (field.hasAttribute('onclick')) {
      field.setAttribute(ONCLICK_MARK, field.getAttribute('onclick'));
      field.removeAttribute('onclick');
    }
    if (field.hasAttribute('data-action')) {
      field.setAttribute(ACTION_MARK, field.getAttribute('data-action'));
      field.removeAttribute('data-action');
    }
    field.classList.add(LOCKED_CLASS);
  }
}

// Only what this module locked is unlocked: a control disabled by its own
// renderer carries no marker and stays disabled.
function restoreEditable(root) {
  if (!root) return;
  for (const control of root.querySelectorAll(`[${DISABLED_MARK}]`)) {
    control.disabled = false;
    control.removeAttribute(DISABLED_MARK);
    if (control.hasAttribute(DISPLAY_MARK)) {
      control.style.display = control.getAttribute(DISPLAY_MARK);
      control.removeAttribute(DISPLAY_MARK);
    }
  }
  // A hidden button that was already disabled has a display marker but no
  // disabled marker, so it is restored separately or it would stay hidden.
  for (const control of root.querySelectorAll(`[${DISPLAY_MARK}]`)) {
    control.style.display = control.getAttribute(DISPLAY_MARK);
    control.removeAttribute(DISPLAY_MARK);
  }
  for (const field of root.querySelectorAll(`[${ONCLICK_MARK}]`)) {
    field.setAttribute('onclick', field.getAttribute(ONCLICK_MARK));
    field.removeAttribute(ONCLICK_MARK);
    field.classList.remove(LOCKED_CLASS);
  }
  for (const field of root.querySelectorAll(`[${ACTION_MARK}]`)) {
    field.setAttribute('data-action', field.getAttribute(ACTION_MARK));
    field.removeAttribute(ACTION_MARK);
    field.classList.remove(LOCKED_CLASS);
  }
}

// The marker that says a region has been swept. Nothing paints it.
//
// This used to say "the class the stylesheet uses to grey a locked tab", and
// both halves were false. An exact class-boundary scan of all 25 composed
// stylesheets, using the repo's own selector reader
// (tests/helper/markup-class-use.mjs), finds zero rules for it. And it is not
// on a tab: `setTabReadonly` puts it on `root`, and the one caller hands over
// the form's *content* element — the div holding the body markup — not the
// `.c-tab` in the strip, which FormShell owns and which never sees this class.
//
// So there is no element a "grey a locked tab" rule could reach, and the rule
// that would reach the element this class is actually on would mute the whole
// record — the opposite of what the header three paragraphs up commits to
// ("a record the viewer may not edit still has to be readable"), and the
// reason applyReadonly disables rather than removes. Writing a rule to make a
// comment true, against the module's own stated intent, is the failure
// tests/smoke/unstyled-markup-classes.test.mjs names in its own words:
// "inventing one to satisfy this scan is the failure mode this scan exists to
// prevent". So the comment was corrected and no rule was written.
//
// What it IS for: the sweep's one externally visible statement that a region
// was swept. The per-control markers below say what was done to each control;
// only this says a pass happened at all. Six readers depend on that —
// tests/smoke/tab-form-editability.test.mjs:87,91 for the round trip, the
// ClientForm/TransactionForm/ReviewForm sweep suites counting `.tf-readonly-tab`
// as their positive control, and tests/react/SystemSettingsFormPermission.test.jsx:50,
// which asks `closest('.tf-readonly-tab')` whether a control sits inside a
// swept region and therefore needs it on the container, which is where it is.
//
// WHAT TELLS A USER A RECORD IS LOCKED, and it is not enough. Inside the
// region: controls carry the browser's own disabled chrome, mutation buttons
// are hidden, and FormShell does not render Save (tfSaveButtonState.visible
// requires canSave). Three of those four are absences. The one case that says
// so in words is a pending change request, which raises the fully styled
// `.tf-pending-approval-banner` (styles/profile.css:11) — but that is only one
// of the reasons a record locks. A viewer without `records.edit_any`, a decided
// review and an approved risk assessment all reach 'readonly' through
// legacy/app.js:85-131 with nothing but disabled chrome to show for it. What
// closes that is a banner that says *why*, the shape the billing lock banner
// settled on; it is not this class, which is on the wrong element for it.
//
// And if a locked tab really is wanted in the strip, the route exists and
// naming it is more use than the old comment was: FormShell puts `tab.className`
// on the `.c-tab` it draws (react/tab-form/FormShell.jsx:158), so a panel would
// compute that class per tab and a stylesheet would read it there. That is four
// panels, a decision about which tabs count as locked, and a rule against a
// stylesheet already sitting exactly on its ratchet ceiling — a design change,
// not a comment fix, which is why it is written down here rather than made.
const READONLY_TAB_CLASS = 'tf-readonly-tab';

function setTabReadonly(root, readonly, options) {
  if (!root) return;
  root.classList.toggle(READONLY_TAB_CLASS, !!readonly);
  if (readonly) applyReadonly(root, options);
  else restoreEditable(root);
}

export { READONLY_TAB_CLASS, applyReadonly, restoreEditable, setTabReadonly };
