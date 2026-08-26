// The account screen's body: the avatar, the rows, and the one overlay that
// belongs to the panel rather than to the page.
//
// This was `<template id="profileTabTemplate">` until now, cloned by the
// controller and committed through `dangerouslySetInnerHTML`. That arrangement
// held twenty-five of the page's fifty-seven `data-i18n` attributes, and it is
// why the DOM applier could not retire: React never saw those labels as
// elements, so the only thing translating them was the applier's sweep over the
// nodes the panel had already committed. Here they are `t()` calls, and a
// language change re-renders them the way it re-renders every other converted
// body.
//
// **None of the shared primitives in fields.jsx fit.** They draw the form-field
// grid — `f-field`, `f-field-row`, `f-section` — and legacy.css styles this
// screen off `pf-`. `Section` is the closest and is still the wrong element:
// its title is a `div.f-section-title`, and a `pf-section` headed by an
// `<h2 class="pf-section-title">` is not that component with a class prop, it
// is a different component. There are also no inputs here at all — every row
// opens a page-level overlay that stays classic — so `Input`, `RadioGroup`,
// `CountryInput` and the rest have nothing to draw.
//
// **The values are rendered, not painted.** `paintProfile` used to resolve
// eight ids inside this body and write into them, and four of those writes went
// through `t()`: the email's unverified suffix, the password placeholder, the
// language name and the Google row. Nothing re-ran them on a language change —
// the paint effect keys on the account, not the language — so those four stayed
// in whichever language the panel was opened in while the labels beside them
// followed the switch. Rendering them from the record fixes that by
// construction, and the ids they were painted through are gone with the writes.
//
// **`pfChangeRequestsBadge` is React's now, registry entry included.** Its
// count comes from the pending-changes store, which carries the house
// subscribe/getSnapshot shape, so the badge renders from the snapshot and
// re-renders when the store notifies — the count, the tooltip and the
// `has-items` class were the last writes a controller made into this body by
// id. The permission half of `has-items` is the row's own `hidden` gate: the
// `changeRequests` capability is the change-requests controller's canOpen,
// the same predicate the old writer consulted, and a row this account may not
// open is not in the document at all.
import { useDeps, useLanguage, useT } from '../deps.jsx';
import { useStore } from '../store.js';

// The chevron every row ends with.
function RowArrow() {
  return (
    <svg className="pf-row-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// One tappable row.
//
// Two slots, because the markup has two and they are not interchangeable:
// `value` is the second line of the row's copy — the account's own answer, or
// the billing row's hint, or the app version — and `children` sits between the
// copy and the arrow, which is where the pending-changes badge goes.
function ProfileRow({
  action, icon, iconClassName, iconStyle, label, value, wide, danger, hidden, children,
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      className={`pf-row${wide ? ' pf-row--wide' : ''}${danger ? ' pf-row--danger' : ''}`}
      data-action={action}
    >
      <span className={`pf-row-icon${iconClassName ? ` ${iconClassName}` : ''}`} style={iconStyle}>
        {icon}
      </span>
      <span className="pf-row-copy">
        <span className="pf-row-label">{label}</span>
        {value}
      </span>
      {children}
      <RowArrow />
    </button>
  );
}

function ProfileSection({ title, hidden, children }) {
  if (hidden) return null;
  return (
    <section className="pf-section">
      {title ? <h2 className="pf-section-title">{title}</h2> : null}
      <div className="pf-grid">{children}</div>
    </section>
  );
}

function ProfileBody({
  user, changeRequests, billing, logoutPrompt, onLogoutConfirm, onLogoutCancel,
}) {
  const t = useT();
  const language = useLanguage();
  const { pendingChangeRequests } = useDeps();
  // The pending-changes count, followed live: the store notifies on a real
  // change and this body re-renders the badge from the new snapshot.
  const pendingTotal = useStore(pendingChangeRequests).total;
  const pendingTitle = t('changeRequest.pendingCount', { count: pendingTotal });
  const initial = (user.display_name || user.username || '?')[0].toUpperCase();
  // The rules paintProfile applied, unchanged except for where they run.
  const email = user.email
    ? user.email + (user.emailVerified ? '' : t('profile.emailUnverified'))
    : t('profile.emailUnbound');
  const passwordStatus = user.hasPassword === false ? t('profile.passwordUnset') : '********';
  const googleIdentity = (user.googleIdentity && user.googleIdentity.email)
    || t('profile.googleLink');
  const languageName = (user.language || language) === 'en'
    ? t('profile.languageEn')
    : t('profile.languageZh');
  const rowValue = (text) => <span className="pf-row-value">{text}</span>;

  return (
    <>
      <div className="profile-tab-content">
        <section className="pf-hero">
          <button
            type="button"
            className="pf-avatar-wrap"
            data-action="profile.avatar.open"
            title={t('profile.changeAvatar')}
          >
            <div
              className="pf-avatar"
              style={user.avatar ? { backgroundImage: `url(${user.avatar})` } : undefined}
            >
              {user.avatar ? '' : initial}
            </div>
            <div className="pf-avatar-hover">{t('profile.changeAvatar')}</div>
            <span className="pf-avatar-edit-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="14" r="3.5" />
              </svg>
            </span>
          </button>
        </section>

        <ProfileSection title={t('profile.sectionAccount')}>
          <ProfileRow
            action="profile.display-name.edit"
            label={t('profile.displayName')}
            value={rowValue(user.display_name || user.username || '')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M4.5 20c.8-4 3.3-6 7.5-6s6.7 2 7.5 6" />
              </svg>
            )}
          />
          <ProfileRow
            action="profile.username.edit"
            label={t('profile.username')}
            value={rowValue(user.username || '')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M6 16c.6-1.8 1.6-2.7 3-2.7s2.4.9 3 2.7M14 10h4M14 14h4" />
              </svg>
            )}
          />
          <ProfileRow
            action="profile.password.edit"
            iconClassName="pf-icon-security"
            label={t('profile.password')}
            value={(
              <span className="pf-row-value" aria-label="Password status">{passwordStatus}</span>
            )}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <rect x="5" y="10" width="14" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" />
              </svg>
            )}
          />
          <ProfileRow
            action="profile.email.edit"
            iconClassName="pf-icon-email"
            label={t('profile.email')}
            value={rowValue(email)}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m4 7 8 6 8-6" />
              </svg>
            )}
          />
          <ProfileRow
            action="profile.google.link"
            iconStyle={{ color: '#4285f4' }}
            label={t('profile.google')}
            value={rowValue(googleIdentity)}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.4 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.7a4 4 0 0 1-1.7 2.6v2.3h2.8c1.7-1.6 2.6-3.8 2.6-6.6Z" />
                <path d="M12 21c2.4 0 4.4-.8 5.9-2.2l-2.8-2.3c-.8.5-1.8.9-3.1.9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21Z" />
                <path d="M7 13.7A5.5 5.5 0 0 1 6.7 12c0-.6.1-1.2.3-1.7V8H4A9 9 0 0 0 4 16l3-2.3Z" />
                <path d="M12 6.6c1.3 0 2.5.4 3.4 1.3L18 5.3C16.5 3.9 14.4 3 12 3A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7Z" />
              </svg>
            )}
          />
          {/* Bilingual on purpose, and the one label in this body that names no
              key: somebody looking for the language switch has to be able to
              find it in the language they cannot currently read. */}
          <ProfileRow
            action="profile.language.edit"
            iconClassName="pf-icon-language"
            label="語言偏好 Language"
            value={rowValue(languageName)}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" />
              </svg>
            )}
          />
        </ProfileSection>

        <ProfileSection title={t('profile.sectionWorkspace')}>
          <ProfileRow
            wide
            action="profile.company.open"
            iconClassName="pf-icon-company"
            label={t('profile.myCompanies')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 21V5l8-3v19M4 10h8M8 14h.01M8 17h.01M16 21V9h4v12M16 13h.01M16 17h.01" />
              </svg>
            )}
          />
          <ProfileRow
            wide
            hidden={!changeRequests}
            action="profile.change-requests.open"
            iconClassName="pf-icon-company"
            label={t('changeRequest.title')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M6 3h12v18H6zM9 7h6M9 11h6" />
                <path d="m9 16 2 2 4-4" />
              </svg>
            )}
          >
            {/* The count above zero is what makes the pill visible: the
                stylesheet shows .pf-change-request-count only with has-items.
                The permission half of the legacy writer's `count > 0 &&
                canOpen()` is this row's hidden gate — no permission, no row,
                no badge element. */}
            <span
              className={`pf-change-request-count${pendingTotal > 0 ? ' has-items' : ''}`}
              id="pfChangeRequestsBadge"
              aria-live="polite"
              title={pendingTitle}
              aria-label={pendingTitle}
            >
              {pendingTotal}
            </span>
          </ProfileRow>
          <ProfileRow
            wide
            hidden={!billing}
            action="billing.open"
            iconStyle={{ color: '#805400', background: '#fff4cf' }}
            label={t('billing.title')}
            value={rowValue(t('billing.profileHint'))}
            icon="💳"
          />
        </ProfileSection>

        <ProfileSection hidden={!user.isPlatformAdmin} title={t('profile.sectionAdmin')}>
          <ProfileRow
            action="admin.companies.open"
            iconClassName="pf-icon-admin"
            label={t('profile.adminCompanies')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 21V5l8-3v19M4 10h8M8 14h.01M8 17h.01M16 21V9h4v12M16 13h.01M16 17h.01" />
              </svg>
            )}
          />
          <ProfileRow
            action="admin.users.open"
            iconClassName="pf-icon-admin"
            label={t('profile.adminUsers')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="9" cy="8" r="3" />
                <circle cx="17" cy="10" r="2" />
                <path d="M3 20c.7-3.8 2.7-5.7 6-5.7s5.3 1.9 6 5.7M15 15c3 0 4.9 1.5 5.6 4.5" />
              </svg>
            )}
          />
          <ProfileRow
            action="admin.audit.open"
            iconClassName="pf-icon-admin"
            label={t('profile.adminAudit')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" />
                <path d="m15.5 17.5 1.4 1.4 2.6-3" />
              </svg>
            )}
          />
          <ProfileRow
            wide
            action="admin.settings.open"
            iconClassName="pf-icon-admin"
            label={t('profile.settings')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="8" cy="17" r="2" />
              </svg>
            )}
          />
          <ProfileRow
            wide
            action="admin.billing.open"
            iconClassName="pf-icon-admin"
            label={t('billing.adminTitle')}
            icon="💰"
          />
        </ProfileSection>

        <ProfileSection title={t('profile.sectionAbout')}>
          <ProfileRow
            wide
            action="profile.about.open"
            iconClassName="pf-icon-about"
            label={t('profile.aboutApp')}
            // The page carried `v__CDD_APP_VERSION__` and the build rewrote the
            // token in the HTML. From a component it comes from the same
            // package version through the shared define, which is what
            // AboutForm already reads.
            value={<span className="pf-about-row-caption">{`v${__CDD_APP_VERSION__}`}</span>}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7h.01" />
              </svg>
            )}
          />
        </ProfileSection>

        <ProfileSection>
          <ProfileRow
            wide
            danger
            action="profile.logout"
            iconClassName="pf-icon-danger"
            label={t('profile.logout')}
            icon={(
              <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M10 17l5-5-5-5M15 12H3M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
              </svg>
            )}
          />
        </ProfileSection>
      </div>

      {/* Asked after a password change, and the only overlay of Profile's that
          lives inside the panel rather than on the page. The controller used to
          unhide it and rebind both buttons; now it asks the panel to show it and
          hands over what "yes" means. */}
      {logoutPrompt ? (
        <div
          className="set-overlay"
          id="pfLogoutConfirm"
          style={{
            position: 'absolute', zIndex: 10003, display: 'flex', background: 'rgba(0,0,0,.3)',
          }}
        >
          <div className="set-panel" style={{ maxWidth: '360px', textAlign: 'center' }}>
            <h3 className="pf-popup-title" style={{ justifyContent: 'center' }}>
              <span className="pf-popup-title-icon pf-popup-danger">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M10 17l5-5-5-5M15 12H3M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
                </svg>
              </span>
              <span>{t('profile.logoutConfirmTitle')}</span>
            </h3>
            <p style={{ fontSize: '15px', margin: '0 0 20px 0', color: 'var(--text)' }}>
              {t('profile.logoutPwdMsg')}
            </p>
            <div className="set-btns" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                id="pfLogoutConfirmNo"
                onClick={onLogoutCancel}
                style={{
                  padding: '8px 20px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                id="pfLogoutConfirmYes"
                onClick={onLogoutConfirm}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  background: 'var(--primary)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {t('common.ok')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export { ProfileBody };
