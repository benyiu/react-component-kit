// The seven overlays the account screen's rows open.
//
// ProfileBody.jsx converted the screen and noted that it has no inputs at all:
// every row opens one of these. They were markup in cdd-screening.html that
// the profile controller switched on with a class and read back by id, which
// left the account feature half-converted — React drew the rows, the classic
// shell owned every interaction a row started — and left ten `data-i18n`
// attributes on the page as the only thing translating their labels.
//
// **One root, at most one overlay.** Dialog.jsx has the same shape and for the
// same reason: the question is state, so the view renders whichever is being
// asked. They are mutually exclusive here because each is opened by a row of a
// panel it then covers.
//
// **No new CSS.** Every class these use — `set-overlay`, `set-panel`,
// `set-close`, `set-btns`, `pf-popup-title`, `pf-popup-title-icon`,
// `pf-radio-row` — already styles the markup this replaces, and the composed
// stylesheet is sitting on its ceiling (tests/smoke/private-class-ratchet).
// The two button styles were inline in the page and stay inline here.
//
// **The buttons call the controller; the rows still dispatch actions.** A
// row's `data-action` reaches the lazily-loaded profile chunk through the
// shell, which is what fetches it on first use; an overlay that imported the
// controller would defeat that. What leaves static-actions.js is the delegated
// entries for these overlays' *own* buttons — closes, saves, backdrops, the
// file picker — because those are inside the React tree now and an onClick is
// the shorter path to the same port.
//
// **The way out is the cross and the backdrop, as it was.** No Escape handler:
// the page offered none, and this is a conversion.
import { useEffect, useRef } from 'react';
import {
  PROFILE_LANGUAGES,
  PROFILE_OVERLAYS,
  ProfileOverlayStore,
  setProfileOverlayField,
} from '../../ui/profile-overlay-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

// The page wrote both of these inline on every button. They are the shell's
// two button shapes, not a new vocabulary, so they stay inline rather than
// becoming classes the stylesheet ratchet would have to pay for.
const GHOST_BUTTON = Object.freeze({
  padding: '8px 16px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--surface)',
  cursor: 'pointer',
});
const PRIMARY_BUTTON = Object.freeze({
  padding: '8px 16px',
  border: 'none',
  borderRadius: '4px',
  background: 'var(--primary)',
  color: '#fff',
  cursor: 'pointer',
});

// The frame all seven share: a backdrop that closes, a panel, a close cross,
// and a titled heading with its icon.
function Popup({
  id, title, icon, iconClassName, onClose, width = '380px',
  titleId, panelRole, describedBy, closeLabel, children,
}) {
  return (
    <div
      className="set-overlay active"
      id={id}
      // Clicking the backdrop closes; clicking the panel does not. The page
      // expressed this as a `data-action` on the overlay whose handler
      // compared event.target to it — the same rule, one indirection fewer.
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="set-panel"
        style={{ maxWidth: width }}
        // Only the Google-link dialog carried these. Six of the seven are
        // opened by a row the reader just pressed; that one arrives on its
        // own after an OAuth redirect, which is what makes it an alert.
        role={panelRole}
        aria-modal={panelRole ? 'true' : undefined}
        aria-labelledby={panelRole ? titleId : undefined}
        aria-describedby={panelRole ? describedBy : undefined}
      >
        <button
          type="button"
          className="set-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
        <h3 className="pf-popup-title" id={titleId}>
          <span className={`pf-popup-title-icon${iconClassName ? ` ${iconClassName}` : ''}`}>
            {icon}
          </span>
          <span>{title}</span>
        </h3>
        {children}
      </div>
    </div>
  );
}

function AvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
    </svg>
  );
}

// The avatar picker.
//
// The chosen image and the account's current one are one preview: whichever
// exists is what the reader is looking at. The page kept them apart — a
// `background-image` written on open and overwritten by the FileReader — and
// hid the save button with `display:none` until something was chosen. Here the
// button exists when there is something to save, which is the same rule said
// once.
function AvatarOverlay({ fields, busy }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  const file = useRef(null);
  const shown = fields.avatar || fields.avatarUrl || '';
  const initial = (fields.avatarName || '?')[0].toUpperCase();

  return (
    <Popup
      id="pfAvOverlay"
      title={t('profile.changeAvatar')}
      icon={<AvatarIcon />}
      onClose={profileOverlays.closeAvatar}
    >
      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
        <div className="pf-avatar-wrap" style={{ margin: '0 auto', cursor: 'default' }}>
          <div
            className="pf-avatar"
            id="pfAvPreview"
            style={shown ? { backgroundImage: `url(${shown})` } : undefined}
          >
            {shown ? '' : initial}
          </div>
        </div>
      </div>
      <input
        ref={file}
        id="pfAvatarInput"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        // The controller reads `event.target.files[0]`, sizes it and runs the
        // FileReader, exactly as it did when this was a delegated change
        // action — so the event is what crosses, not the file.
        onChange={(event) => profileOverlays.previewAvatar(event)}
      />
      <div className="set-btns" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          style={{
            ...GHOST_BUTTON,
            border: '1px solid var(--primary)',
            background: 'transparent',
            color: 'var(--primary)',
          }}
          onClick={() => file.current && file.current.click()}
        >
          {t('profile.chooseImage')}
        </button>
        {fields.avatar ? (
          <button
            type="button"
            id="pfAvSaveBtn"
            style={PRIMARY_BUTTON}
            disabled={busy}
            onClick={profileOverlays.saveAvatar}
          >
            {busy ? t('profile.saving') : t('profile.save')}
          </button>
        ) : null}
      </div>
    </Popup>
  );
}

// One text field, a cancel and a save — the shape four of the seven share.
// The field is the store's rather than the component's, because the
// controller's save port takes no arguments and reads what was typed.
function FieldRow({ id, name, value, type = 'text', placeholder, onEnter }) {
  return (
    <div className="form-group">
      <input
        id={id}
        className="form-input"
        type={type}
        style={{ width: '100%' }}
        placeholder={placeholder}
        value={value || ''}
        onChange={(event) => setProfileOverlayField(name, event.target.value)}
        onKeyDown={(event) => {
          // Enter saves, except while an IME is composing — that Enter is
          // committing a Chinese candidate, not submitting. The prompt dialog
          // states the same rule for the same reason.
          if (!onEnter || event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onEnter();
        }}
      />
    </div>
  );
}

function ErrorLine({ id, error }) {
  if (!error) return null;
  return (
    <div
      id={id}
      style={{ color: 'var(--risk-high-text)', fontSize: '13px', marginBottom: '12px' }}
    >
      {error}
    </div>
  );
}

// Cancel and save. The page wrote these two buttons out six times; they are
// the same two every time, so they are one component.
//
// `saveLabel` is a prop rather than `t('profile.save')` because two of the six
// do not say Save: the email overlay sends a verification, and the login-name
// overlay says so while its save is running. Only that one had a busy state on
// the page, which is why the flag is not read here.
function PopupActions({ onCancel, onSave, saveLabel, saveDisabled }) {
  const t = useT();
  return (
    <div className="set-btns">
      <button type="button" style={GHOST_BUTTON} onClick={onCancel}>
        {t('common.cancel')}
      </button>
      <button type="button" style={PRIMARY_BUTTON} disabled={saveDisabled} onClick={onSave}>
        {saveLabel}
      </button>
    </div>
  );
}

function DisplayNameOverlay({ fields }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  return (
    <Popup
      id="pfDispOverlay"
      title={t('profile.editDisplayName')}
      icon={<AvatarIcon />}
      onClose={profileOverlays.closeDisplayName}
    >
      <FieldRow
        id="pfDispInput"
        name="displayName"
        value={fields.displayName}
        placeholder={t('ph.displayName')}
        onEnter={profileOverlays.saveDisplayName}
      />
      <PopupActions
        saveLabel={t('profile.save')}
        onCancel={profileOverlays.closeDisplayName}
        onSave={profileOverlays.saveDisplayName}
      />
    </Popup>
  );
}

function UsernameOverlay({ fields, error, busy }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  return (
    <Popup
      id="pfUserOverlay"
      title={t('profile.editLoginName')}
      icon={(
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M6 16c.6-1.8 1.6-2.7 3-2.7s2.4.9 3 2.7M14 10h4M14 14h4" />
        </svg>
      )}
      onClose={profileOverlays.closeUsername}
    >
      <FieldRow
        id="pfUserInput"
        name="username"
        value={fields.username}
        placeholder={t('profile.enterLoginName')}
        onEnter={profileOverlays.saveUsername}
      />
      <ErrorLine id="pfUserError" error={error} />
      <PopupActions
        saveDisabled={busy}
        // The one save of the six the page gave a running state: it swapped
        // the button's own textContent and disabled flag, on four paths.
        saveLabel={busy ? t('profile.saving') : t('profile.save')}
        onCancel={profileOverlays.closeUsername}
        onSave={profileOverlays.saveUsername}
      />
    </Popup>
  );
}

// Binding an email address, and the state it can be left in.
//
// The status line is a **key** in the store rather than a resolved sentence.
// The page resolved it with t() when the overlay opened and never again, which
// is the shape the account body's four painted values had — they kept the
// language the screen was opened in while the labels beside them followed the
// switch. Resolving it here means it follows.
//
// The dev-mode verification link was `innerHTML` with the URL interpolated
// into the markup twice. It is an anchor now, so the URL is a value React
// escapes rather than a string spliced into HTML.
function EmailOverlay({ fields, error, notice, noticeSuffix, verifyUrl }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  return (
    <Popup
      id="pfEmailOverlay"
      title={t('profile.bindEmail')}
      iconClassName="pf-popup-email"
      icon={(
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      )}
      onClose={profileOverlays.closeEmail}
    >
      <FieldRow
        id="pfEmailInput"
        name="email"
        type="email"
        value={fields.email}
        // Not a key: an example address reads the same in both languages.
        placeholder="example@mail.com"
        onEnter={profileOverlays.saveEmail}
      />
      <div
        id="pfEmailMsg"
        style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}
      >
        {notice ? `${t(notice)}${noticeSuffix || ''}` : ''}
      </div>
      {verifyUrl ? (
        <div id="pfEmailVerifyLink" style={{ fontSize: '13px', marginBottom: '12px', wordBreak: 'break-all' }}>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--primary)', wordBreak: 'break-all' }}
          >
            {verifyUrl}
          </a>
        </div>
      ) : null}
      <ErrorLine id="pfEmailError" error={error} />
      <PopupActions
        saveLabel={t('profile.sendVerification')}
        onCancel={profileOverlays.closeEmail}
        onSave={profileOverlays.saveEmail}
      />
    </Popup>
  );
}

// Which language to read the app in.
//
// The two names are shown in their own language on purpose, exactly as the
// account row that opens this is labelled bilingually: somebody looking for
// the language switch has to recognise the one they can read. The keys resolve
// to the same string in both dictionaries, and naming them keeps one place
// that decides what a language is called.
//
// Nothing is selected when the account's stored preference is neither of the
// two, which is what a radio group whose values none matched did.
function LanguageOverlay({ fields }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  const NAMES = { zh: 'profile.languageZh', en: 'profile.languageEn' };
  return (
    <Popup
      id="pfLangOverlay"
      title={t('profile.language')}
      iconClassName="pf-popup-language"
      icon={(
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" />
        </svg>
      )}
      onClose={profileOverlays.closeLanguage}
    >
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px',
      }}
      >
        {PROFILE_LANGUAGES.map((code) => (
          <label className="pf-radio-row" key={code}>
            <input
              type="radio"
              name="pfLangRad"
              value={code}
              style={{ marginRight: '10px' }}
              checked={fields.language === code}
              onChange={() => setProfileOverlayField('language', code)}
            />
            {t(NAMES[code])}
          </label>
        ))}
      </div>
      <PopupActions
        saveLabel={t('profile.save')}
        onCancel={profileOverlays.closeLanguage}
        onSave={profileOverlays.saveLanguage}
      />
    </Popup>
  );
}

// Changing the password.
//
// Three fields, and on success the panel asks whether to log out and back in
// — that confirmation is inside the account panel's own body (ProfileBody),
// not here, because it belongs to the screen this covers rather than to this
// overlay. What happens here is the three fields and the reason a save was
// refused.
function PasswordOverlay({ fields, error }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  const field = (id, name, placeholder) => (
    <FieldRow
      id={id}
      name={name}
      type="password"
      value={fields[name]}
      placeholder={t(placeholder)}
      onEnter={profileOverlays.savePassword}
    />
  );
  return (
    <Popup
      id="pfPwdOverlay"
      title={t('profile.changePassword')}
      iconClassName="pf-popup-security"
      icon={(
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
        </svg>
      )}
      onClose={profileOverlays.closePassword}
    >
      {field('pfCurPwd', 'currentPassword', 'ph.currentPassword')}
      {field('pfNewPwd', 'newPassword', 'ph.newPasswordMin6')}
      {field('pfNewPwd2', 'repeatPassword', 'ph.confirmPassword')}
      <ErrorLine id="pfPwdError" error={error} />
      <PopupActions
        saveLabel={t('profile.save')}
        onCancel={profileOverlays.closePassword}
        onSave={profileOverlays.savePassword}
      />
    </Popup>
  );
}

// Why a Google account could not be linked.
//
// This one is not opened by a row: the OAuth redirect brings the reader back
// to the app with a failure code, so the controller opens Profile and then
// raises this over it. That is why the page kept it outside the panel, and
// why what is stored is the **code** rather than the sentence. The page
// resolved the sentence once, when it opened the dialog, so it never followed
// a language change; resolving it here means it does.
//
// It is the only one of the seven with a role, and it keeps it: an
// alertdialog that names its own heading and body, with the button focused so
// a keyboard reader lands on the way out. The focus runs from an effect, not
// beside the state change that causes it — a body set in React state is not
// in the document when the code that set it runs, which is the same reason
// the page needed a `setTimeout(..., 0)` here.
function GoogleErrorOverlay({ fields }) {
  const t = useT();
  const { profileOverlays } = useDeps();
  const action = useRef(null);
  useEffect(() => {
    if (action.current) action.current.focus();
  }, []);
  return (
    <Popup
      id="pfGoogleLinkErrorOverlay"
      width="420px"
      title={t('profile.googleLinkConflictTitle')}
      iconClassName="pf-popup-google"
      icon={(
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8.5 12.1 10.8 14.4 15.8 9.5" />
        </svg>
      )}
      titleId="pfGoogleLinkErrorTitle"
      panelRole="alertdialog"
      describedBy="pfGoogleLinkErrorMessage"
      closeLabel="Close"
      onClose={profileOverlays.closeGoogleLinkError}
    >
      <p
        id="pfGoogleLinkErrorMessage"
        style={{
          margin: 0, color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6,
        }}
      >
        {fields.googleErrorCode
          ? profileOverlays.googleErrorMessage(fields.googleErrorCode)
          : ''}
      </p>
      <div className="set-btns">
        <button
          ref={action}
          type="button"
          style={PRIMARY_BUTTON}
          onClick={profileOverlays.closeGoogleLinkError}
        >
          {t('common.ok')}
        </button>
      </div>
    </Popup>
  );
}

function ProfileOverlays() {
  const {
    overlay, fields, error, notice, noticeSuffix, verifyUrl, busy,
  } = useStore(ProfileOverlayStore);
  const shared = { fields, error, notice, noticeSuffix, verifyUrl, busy };
  switch (overlay) {
    case PROFILE_OVERLAYS.AVATAR:
      return <AvatarOverlay {...shared} />;
    case PROFILE_OVERLAYS.DISPLAY_NAME:
      return <DisplayNameOverlay {...shared} />;
    case PROFILE_OVERLAYS.USERNAME:
      return <UsernameOverlay {...shared} />;
    case PROFILE_OVERLAYS.EMAIL:
      return <EmailOverlay {...shared} />;
    case PROFILE_OVERLAYS.LANGUAGE:
      return <LanguageOverlay {...shared} />;
    case PROFILE_OVERLAYS.PASSWORD:
      return <PasswordOverlay {...shared} />;
    case PROFILE_OVERLAYS.GOOGLE_ERROR:
      return <GoogleErrorOverlay {...shared} />;
    default:
      return null;
  }
}

// One export, because there is one thing to mount and one thing to test. The
// seven are reached by opening them, which is what a reader does — exporting
// each so a test could render it directly would be a second way in that
// production never uses.
export { ProfileOverlays };
