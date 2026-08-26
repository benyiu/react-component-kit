// Which of the account screen's overlays is open, and what the reader has
// typed into it.
//
// Every row in the account panel opens one of seven overlays, and until now
// each one was markup in cdd-screening.html that the profile controller
// switched on with a class and read back through `getElementById`. That made
// the panel half-converted: React drew the screen, the classic shell owned
// every interaction it started, and ten of the page's `data-i18n` attributes
// were the labels on those overlays.
//
// The overlays are React now. What crosses the seam is this store — the same
// seam dialog-store.js and policy-store.js already use — and it carries state
// rather than functions, so a snapshot stays comparable by identity and
// useSyncExternalStore does not re-render forever.
//
// **The typed value lives here rather than in the component.** That is
// deliberate: each save used to resolve its own input by id and read `.value`
// off it, and every one of the controller's save ports is a no-argument
// function that the classic shell exposes and that
// tests/smoke/profile-modular-ui-contract.test.mjs pins by shape. Moving the
// value into the store rather than into a component's useState keeps those
// ports reading "the value the user typed" from somewhere they can reach,
// so the conversion changes where the field lives and not who saves it.
import { createStore } from '../core/store.js';

// The seven. Named rather than free strings so a typo in either world is a
// missing overlay at import time rather than one that silently never opens.
const PROFILE_OVERLAYS = Object.freeze({
  AVATAR: 'avatar',
  DISPLAY_NAME: 'displayName',
  USERNAME: 'username',
  EMAIL: 'email',
  LANGUAGE: 'language',
  PASSWORD: 'password',
  GOOGLE_ERROR: 'googleError',
});

// The two the account can choose between. Both the radios and the save read
// this, which is what preserves a behaviour the DOM version had by accident:
// an account whose stored preference is neither leaves no radio checked, and
// saving with nothing checked closes without storing anything.
const PROFILE_LANGUAGES = Object.freeze(['zh', 'en']);

const ProfileOverlayStore = createStore({
  // Which overlay is showing; null is none. One value rather than seven flags
  // because one is all that can be open: each is opened by a row of a panel
  // the overlay then covers.
  overlay: null,
  // What the reader has typed or chosen. Replaced whole on every write —
  // an in-place edit is a change no observer can see.
  fields: {},
  // The in-overlay error line. Three overlays have one; it is the same line
  // in each, so it is one key rather than three.
  error: '',
  // The email overlay's status line: verified, not verified, sent, or why
  // sending failed.
  //
  // A **key**, not a sentence, because that line is the one thing on this
  // screen that a previous conversion got wrong twice: `paintProfile`
  // resolved four values with t() on open and nothing re-ran them, so they
  // kept whichever language the panel was opened in while the labels beside
  // them followed the switch. Storing the key means the overlay resolves it
  // on every render and it follows by construction.
  notice: '',
  // What is appended after the resolved notice: an address, or a server's
  // own wording for why sending failed. Already text in the language it is
  // going to be read in, which is why it is not a key.
  noticeSuffix: '',
  // The dev-mode verification link, shown as an anchor beneath the notice.
  verifyUrl: '',
  // A save in flight. The button says so and cannot be pressed again.
  busy: false,
});

// Opening replaces everything, so an overlay never inherits the error, the
// notice or the busy flag left by the one before it — which is what
// `safeStyle(..., 'none')` was doing by hand at the top of each open.
function openProfileOverlay(overlay, fields = {}) {
  ProfileOverlayStore.update({
    overlay, fields, error: '', notice: '', noticeSuffix: '', verifyUrl: '', busy: false,
  });
}

function closeProfileOverlay() {
  ProfileOverlayStore.update({
    overlay: null, fields: {}, error: '', notice: '', noticeSuffix: '', verifyUrl: '', busy: false,
  });
}

// One field of the open overlay. This is what a controlled input calls as the
// reader types.
function setProfileOverlayField(name, value) {
  ProfileOverlayStore.fields = { ...ProfileOverlayStore.fields, [name]: value };
}

function profileOverlayField(name) {
  return ProfileOverlayStore.fields[name];
}

// For tests, which must not inherit an overlay from the case before.
function resetProfileOverlays() {
  ProfileOverlayStore.reset();
}

export {
  PROFILE_LANGUAGES,
  PROFILE_OVERLAYS,
  ProfileOverlayStore,
  closeProfileOverlay,
  openProfileOverlay,
  profileOverlayField,
  resetProfileOverlays,
  setProfileOverlayField,
};
