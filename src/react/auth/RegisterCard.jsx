// Creating an account.
//
// The same line as the login card: this collects four fields and a checkbox,
// and every session decision — `setSession`, the new-registration flag the
// boot sequence reads, the full reload — stays in the controller. Its five
// validation rules stay there too, and it answers `{ kind, text }`.
//
// The passwords are uncontrolled fields read at submit, for the reason the
// login card's is: a password in state is a password a re-render can put back
// on screen.
import { useEffect, useRef, useState } from 'react';
import { AuthCardStore } from '../../ui/auth-card-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

const CARD = 'register';

function RegisterCard() {
  const t = useT();
  const { authScreens } = useDeps();
  const { card } = useStore(AuthCardStore);
  const username = useRef(null);
  const email = useRef(null);
  const password = useRef(null);
  const repeated = useRef(null);
  // A returning visitor who has agreed before arrives with the box ticked and
  // the button live, which is what the shell did: wireTermsCheckbox restored
  // 'regAgreeTerms' from cdd_terms_agreed exactly as it did the login card's.
  const [agreed, setAgreed] = useState(() => authScreens.termsAlreadyAgreed());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const invited = card === CARD ? authScreens.hasPendingInvitation() : false;

  useEffect(() => {
    if (card !== CARD) return;
    setError('');
    setBusy(false);
  }, [card]);

  if (card !== CARD) return null;

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    const answer = await authScreens.register({
      username: username.current ? username.current.value.trim() : '',
      email: email.current ? email.current.value.trim() : '',
      password: password.current ? password.current.value : '',
      repeated: repeated.current ? repeated.current.value : '',
      agreedNow: agreed,
    });
    // A success reloads the page; only a refusal has anything to say.
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

  const field = (id, label, ref, type, placeholder, autoComplete) => (
    <div className="auth-field">
      <label htmlFor={id}>{t(label)}</label>
      <input
        ref={ref}
        id={id}
        type={type}
        placeholder={t(placeholder)}
        autoComplete={autoComplete}
        onKeyDown={onEnter}
      />
    </div>
  );

  return (
    <div className="auth-card" id="authRegister">
      <div className="auth-icon">📝</div>
      <h2>{t('reg.title')}</h2>
      <div className="auth-sub">{t('reg.sub')}</div>
      <div className={`auth-invite-notice${invited ? ' show' : ''}`} id="regInviteNotice">
        {t('cm.registerToAccept')}
      </div>
      {error ? <div className="auth-error show" id="regError">{error}</div> : null}
      <form style={{ margin: 0, padding: 0 }} onSubmit={(event) => event.preventDefault()}>
        {field('regUsername', 'reg.username', username, 'text', 'reg.usernamePh', 'username')}
        {field('regEmail', 'reg.email', email, 'email', 'reg.emailPh', 'email')}
        {field('regPassword', 'reg.password', password, 'password', 'reg.passwordPh', 'new-password')}
        {field('regPassword2', 'reg.confirmPass', repeated, 'password', 'reg.confirmPassPh', 'new-password')}
        <div className="auth-field auth-terms">
          {/* No class — see LoginCard: the rule is `.auth-terms label`, anchored
              on the wrapper so it outranks `.auth-field label`. */}
          <label>
            <input
              id="regAgreeTerms"
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
          id="regSubmit"
          disabled={!agreed || busy}
          onClick={submit}
        >
          {t('reg.submit')}
        </button>
        <div className="auth-forgot">
          <a href="#" onClick={(event) => { event.preventDefault(); authScreens.showLogin(); }}>
            {t('auth.backLogin')}
          </a>
        </div>
      </form>
    </div>
  );
}

export { CARD, RegisterCard };
