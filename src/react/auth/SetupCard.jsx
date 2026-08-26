// Creating the first account on a fresh installation.
//
// The last of the five, and the only one nobody sees twice: it appears when
// the server reports it has no users yet, and never again. That is why it is
// last — a screen with no returning visitor is the cheapest to be wrong about,
// and by now the recipe the other four settled is just followed.
//
// It is otherwise the login card's shape, down to the terms checkbox starting
// from the remembered answer: the shell wired all three boxes through one
// wireTermsCheckbox, and a fresh installation reached by someone who has
// agreed on another deployment is not a case worth being different about.
//
// The screen around it (#authSetup) stays the shell's, because the five
// `show*` functions and `showApp` still toggle it. This owns the card inside.
import { useEffect, useRef, useState } from 'react';
import { AuthCardStore } from '../../ui/auth-card-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

const CARD = 'setup';

function SetupCard() {
  const t = useT();
  const { authScreens } = useDeps();
  const { card } = useStore(AuthCardStore);
  const username = useRef(null);
  const password = useRef(null);
  const repeated = useRef(null);
  const [agreed, setAgreed] = useState(() => authScreens.termsAlreadyAgreed());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (card !== CARD) return;
    setError('');
    setBusy(false);
  }, [card]);

  if (card !== CARD) return null;

  // The passwords are uncontrolled fields read at submit, for the reason the
  // login card's are: a password in state is a password a re-render can put
  // back on screen.
  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    const answer = await authScreens.setup({
      username: username.current ? username.current.value.trim() : '',
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
    <div className="auth-card" id="authSetupCard">
      <div className="auth-icon">⚙️</div>
      <h2>{t('setup.title')}</h2>
      <div className="auth-sub">{t('setup.sub')}</div>
      {error ? <div className="auth-error show" id="setupError">{error}</div> : null}
      <form style={{ margin: 0, padding: 0 }} onSubmit={(event) => event.preventDefault()}>
        {field('setupUsername', 'setup.adminUser', username, 'text', 'ph.setupUsername', 'off')}
        {field('setupPassword', 'setup.adminPass', password, 'password', 'ph.setupPassword', 'new-password')}
        {field('setupPassword2', 'setup.confirmPass', repeated, 'password', 'ph.setupPassword2', 'new-password')}
        <div className="auth-field auth-terms">
          {/* No class — see LoginCard: the rule is `.auth-terms label`, anchored
              on the wrapper so it outranks `.auth-field label`. */}
          <label>
            <input
              id="setupAgreeTerms"
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
          id="setupSubmit"
          disabled={!agreed || busy}
          onClick={submit}
        >
          {t('setup.submit')}
        </button>
      </form>
    </div>
  );
}

export { CARD, SetupCard };
