// "I've forgotten my password."
//
// The first auth screen to leave the page, and chosen for the same reason the
// policy reader was: it is the piece of the auth surface that touches no
// credentials and no session. A wrong answer here sends an email; a wrong
// answer on the login card locks everyone out, which is why this document's
// plan says to do that one with a context of its own.
//
// So this is the recipe rather than the whole job. Three things it settles for
// the screens that follow:
//
//   **Which card is showing is state, not five `classList.toggle` calls.**
//   The shell has a card-visibility store now, and asking it to show a screen
//   is what `showForgotPassword()` does — the same call, from the same places.
//
//   **The two messages are state too.** An error and a success were an
//   element each, cleared by three different functions and set by a fourth.
//   Here they are one value with a kind, so "clearing" is not a thing anyone
//   has to remember to do.
//
//   **The request stays where it is.** `requestPasswordReset` is the shell's,
//   and it stays the shell's: this asks it and renders what it answers.
import { useEffect, useState } from 'react';
import { AuthCardStore } from '../../ui/auth-card-store.js';
import { useDeps, useT } from '../deps.jsx';
import { useStore } from '../store.js';

const CARD = 'forgot-password';

function ForgotPasswordCard() {
  const t = useT();
  const { authScreens } = useDeps();
  const { card } = useStore(AuthCardStore);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(null);

  // Showing the card again is a fresh attempt: the previous answer, and the
  // address it was about, are gone. The classic screen did this by hand in
  // showForgotPassword, which is why the clearing and the setting lived in
  // different functions.
  useEffect(() => {
    if (card !== CARD) return;
    setEmail('');
    setMessage(null);
  }, [card]);

  if (card !== CARD) return null;

  const submit = async () => {
    if (!email.trim()) {
      setMessage({ kind: 'error', text: t('auth.invalidEmail') });
      return;
    }
    const answer = await authScreens.requestPasswordReset(email.trim());
    setMessage(answer);
  };

  // A dev-mode reset answers with a link to follow rather than an email.
  const sent = message && message.kind === 'success';

  return (
    <div className="auth-card" id="authForgotPwd">
      <div className="auth-icon">📧</div>
      <h2>{t('auth.forgotPwd')}</h2>
      <div className="auth-sub">{t('auth.forgotPwdSub')}</div>
      {message && message.kind === 'error' ? (
        <div className="auth-error show" id="fpError">{message.text}</div>
      ) : null}
      {sent ? (
        <div className="auth-success show" id="fpSuccess">
          {message.text}
          {message.resetUrl ? (
            <>
              <br />
              <a href={message.resetUrl} className="auth-dev-reset-link">{t('auth.clickReset')}</a>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="auth-field">
        <input
          id="fpEmail"
          className="form-input"
          type="text"
          placeholder={t('ph.usernameEmail')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, except while an IME is composing.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            submit();
          }}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary auth-btn"
        id="fpSubmit"
        // One link per request: asking twice would send a second email.
        disabled={sent}
        onClick={submit}
      >
        {t('auth.sendReset')}
      </button>
      <div className="auth-forgot">
        <a
          href="#"
          onClick={(event) => { event.preventDefault(); authScreens.showLogin(); }}
        >
          {t('auth.backLogin')}
        </a>
      </div>
    </div>
  );
}

export { CARD, ForgotPasswordCard };
