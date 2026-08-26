// Setting a new password from an emailed link.
//
// The second auth screen, and the second-safest: it takes a token out of the
// URL and two new passwords, and on success it hands over to the login card
// rather than establishing a session itself. The three that remain — login,
// first-run setup and register — do establish one, which is what this
// document means by doing them with a context of their own.
//
// It follows the recipe the forgot-password card set: the card is state, its
// message is state, and the request stays in the controller and answers with
// what to say. One thing is its own: **the token lives in the URL**, so this
// asks the controller for it rather than reading `location.search` — a
// component that read the address bar would be a component the platform port
// has to rewrite.
import { useEffect, useState } from 'react';
import { AuthCardStore } from '../../ui/auth-card-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

const CARD = 'reset-password';

function ResetPasswordCard() {
  const t = useT();
  const { authScreens } = useDeps();
  const { card } = useStore(AuthCardStore);
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [error, setError] = useState('');

  // Showing the card again is a fresh attempt.
  useEffect(() => {
    if (card !== CARD) return;
    setPassword('');
    setRepeated('');
    setError('');
  }, [card]);

  if (card !== CARD) return null;

  const submit = async () => {
    const answer = await authScreens.resetPassword(password, repeated);
    // A success navigates away by showing the login card, so there is nothing
    // to say here; only a failure has a message.
    setError(answer && answer.kind === 'error' ? answer.text : '');
  };

  const onEnter = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="auth-card" id="authResetPwd">
      <div className="auth-icon">🔑</div>
      <h2>{t('auth.resetPwd')}</h2>
      <div className="auth-sub">{t('auth.resetPwdSub')}</div>
      {error ? <div className="auth-error show" id="rpError">{error}</div> : null}
      <div className="auth-field">
        <input
          id="rpNewPwd"
          className="form-input"
          type="password"
          placeholder={t('ph.newPassword')}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={onEnter}
        />
      </div>
      <div className="auth-field">
        <input
          id="rpNewPwd2"
          className="form-input"
          type="password"
          placeholder={t('ph.confirmPassword')}
          value={repeated}
          onChange={(event) => setRepeated(event.target.value)}
          onKeyDown={onEnter}
        />
      </div>
      <button type="button" className="btn btn-primary auth-btn" id="rpSubmit" onClick={submit}>
        {t('auth.confirmReset')}
      </button>
      <div className="auth-forgot">
        <a
          href="#"
          // Leaving drops the token from the address bar too, or a reload
          // would put the user straight back on this card.
          onClick={(event) => { event.preventDefault(); authScreens.backToLoginFromReset(); }}
        >
          {t('auth.backLogin')}
        </a>
      </div>
    </div>
  );
}

export { CARD, ResetPasswordCard };
