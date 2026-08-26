// Signing in.
//
// The highest-stakes screen in the application: getting it wrong means nobody
// can get in. So the split is stricter here than anywhere else, and it is
// worth saying exactly where the line falls.
//
// **This component never sees a session.** It collects a username, a password
// and two checkboxes, and hands them to `authScreens.login(...)`. Everything
// that follows — `setSession`, the fresh-login marker, the full reload that
// clears stale company context — stays in `features/auth/screens.js`,
// untouched, because those are the semantics this migration's plan says to
// leave alone. What comes back is `{ kind, text }` and nothing else; on
// success nothing comes back at all, because the page reloads.
//
// **The password is never state that outlives the attempt.** It is an
// uncontrolled field read at submit, so a re-render cannot echo it and
// nothing holds it after the request.
//
// Two things ride along because they belong to this card and nowhere else:
// the terms checkbox, which the submit button is gated on, and the invitation
// notice, which appears when the visitor arrived from an invite link.
import { useEffect, useRef, useState } from 'react';
import { AuthCardStore } from '../../ui/auth-card-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

const CARD = 'login';

function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.251-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.795 2.716v2.258h2.909c1.702-1.567 2.682-3.875 2.682-6.615Z" />
      <path fill="#4285F4" d="M9 18c2.43 0 4.468-.805 5.957-2.18l-2.909-2.258c-.805.54-1.835.86-3.048.86-2.344 0-4.328-1.584-5.037-3.71H.956v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.712A5.41 5.41 0 0 1 3.681 9c0-.593.102-1.17.282-1.713V4.955H.956A9 9 0 0 0 0 9c0 1.453.348 2.828.956 4.045l3.007-2.333Z" />
      <path fill="#34A853" d="M9 3.578c1.321 0 2.508.454 3.442 1.345l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .956 4.955l3.007 2.332C4.672 5.162 6.656 3.578 9 3.578Z" />
    </svg>
  );
}

function LoginCard() {
  const t = useT();
  const { authScreens } = useDeps();
  const { card } = useStore(AuthCardStore);
  const username = useRef(null);
  const password = useRef(null);
  const remember = useRef(null);
  // Agreed once, remembered — the controller owns where that is kept.
  const [agreed, setAgreed] = useState(() => authScreens.termsAlreadyAgreed());
  // A Google sign-in that failed comes back by redirect, so its message is
  // waiting before this card exists.
  const [error, setError] = useState(() => authScreens.takePendingLoginError());
  const [busy, setBusy] = useState(false);
  const invited = card === CARD ? authScreens.hasPendingInvitation() : false;

  useEffect(() => {
    if (card !== CARD) return;
    setBusy(false);
    // Whatever the redirect left is shown once, on the visit it belongs to.
    setError(authScreens.takePendingLoginError());
  }, [card, authScreens]);

  if (card !== CARD) return null;

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    // Read at submit and never stored: a password in state is a password a
    // re-render can put back on screen.
    const answer = await authScreens.login({
      username: username.current ? username.current.value.trim() : '',
      password: password.current ? password.current.value : '',
      remember: !!(remember.current && remember.current.checked),
      agreedNow: agreed,
    });
    // A success reloads the page, so there is nothing to render and no busy
    // state to clear.
    if (answer && answer.kind === 'error') {
      setError(answer.text);
      setBusy(false);
    }
  };

  const onEnter = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="auth-card" id="authLoginCard">
      <div className="auth-icon">🔐</div>
      <h2>{t('auth.title')}</h2>
      <div className="auth-sub">{t('auth.sub')}</div>
      <div
        className={`auth-invite-notice${invited ? ' show' : ''}`}
        id="authInviteNotice"
      >
        {t('cm.loginToAccept')}
      </div>
      {error ? <div className="auth-error show" id="authError">{error}</div> : null}
      <form style={{ margin: 0, padding: 0 }} onSubmit={(event) => event.preventDefault()}>
        <div className="auth-field">
          <label htmlFor="authUsername">{t('auth.username')}</label>
          <input
            ref={username}
            id="authUsername"
            type="text"
            placeholder={t('ph.username')}
            autoComplete="username"
            onKeyDown={onEnter}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="authPassword">{t('auth.password')}</label>
          <input
            ref={password}
            id="authPassword"
            type="password"
            placeholder={t('ph.password')}
            autoComplete="current-password"
            onKeyDown={onEnter}
          />
        </div>
        <div className="auth-field auth-remember-field">
          <input ref={remember} id="authRemember" type="checkbox" />
          <label htmlFor="authRemember">{t('auth.remember')}</label>
        </div>
        <div className="auth-field auth-terms">
          {/* No class: the row's rule is `.auth-terms label`, anchored on the
              wrapper the way `.auth-remember-field label` beside it already
              was. `.auth-terms-label` was one class (0,1,0) against
              `.auth-field label` (0,1,1) in auth.css, so it lost `display` and
              `font-weight` on the element it was written for, and `auth-terms`
              itself was a name no stylesheet read. */}
          <label>
            <input
              id="authAgreeTerms"
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span>
              {t('terms.agree')}
              {' '}
              <a href="#" onClick={(event) => { event.preventDefault(); authScreens.showPrivacyPolicy(); }}>
                {t('terms.privacy')}
              </a>
              {' '}
              {t('terms.and')}
              {' '}
              <a href="#" onClick={(event) => { event.preventDefault(); authScreens.showTermsOfService(); }}>
                {t('terms.tos')}
              </a>
            </span>
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary auth-btn"
          id="authSubmit"
          // The terms gate the button rather than the request, which is what
          // the classic card did and what makes the requirement visible.
          disabled={!agreed || busy}
          onClick={submit}
        >
          {t('auth.submit')}
        </button>
        <div className="auth-oauth-divider">{t('auth.or')}</div>
        <button
          type="button"
          className="auth-google-btn"
          onClick={async () => {
            const answer = await authScreens.startGoogleLogin({
              remember: !!(remember.current && remember.current.checked),
              agreedNow: agreed,
            });
            if (answer && answer.kind === 'error') setError(answer.text);
          }}
        >
          <GoogleMark />
          <span>{t('auth.google')}</span>
        </button>
        <div className="auth-forgot">
          <a href="#" onClick={(event) => { event.preventDefault(); authScreens.showForgotPassword(); }}>
            {t('auth.forgotPwd')}
          </a>
        </div>
        <div className="auth-forgot">
          <span>{t('auth.noAccount')}</span>
          {' '}
          <a href="#" onClick={(event) => { event.preventDefault(); authScreens.showRegister(); }}>
            {t('auth.registerLink')}
          </a>
        </div>
      </form>
    </div>
  );
}

export { CARD, LoginCard };
