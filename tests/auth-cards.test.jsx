// Tier-1 smoke: the five auth cards and the policy reader, mounted with fake
// deps and driven through their submits.
//
// Conventions from the source project's test discipline:
//   - marking translator `«key»` — an identity t cannot catch a missed t()
//   - every fake returns a sentinel, never undefined
//   - assertions read the DOM the user reads, by role/id, not the source
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DepsProvider } from '../src/react/deps.jsx';
import { LoginCard } from '../src/react/auth/LoginCard.jsx';
import { RegisterCard } from '../src/react/auth/RegisterCard.jsx';
import { ForgotPasswordCard } from '../src/react/auth/ForgotPasswordCard.jsx';
import { SetupCard } from '../src/react/auth/SetupCard.jsx';
import { ResetPasswordCard } from '../src/react/auth/ResetPasswordCard.jsx';
import { PolicyModal } from '../src/react/auth/PolicyModal.jsx';
import { AuthCardStore, showAuthCard } from '../src/ui/auth-card-store.js';
import {
  requestPolicy, resetPolicyRequests, subscribePolicyRequests,
} from '../src/ui/policy-store.js';

const t = (key, vars) => `«${key}${vars ? ':' + JSON.stringify(vars) : ''}»`;

function makeAuthScreens(overrides = {}) {
  return {
    termsAlreadyAgreed: vi.fn(() => false),
    takePendingLoginError: vi.fn(() => ''),
    hasPendingInvitation: vi.fn(() => false),
    login: vi.fn(async () => ({ kind: 'error', text: 'login-error-sentinel' })),
    register: vi.fn(async () => ({ kind: 'error', text: 'register-error-sentinel' })),
    setup: vi.fn(async () => ({ kind: 'error', text: 'setup-error-sentinel' })),
    requestPasswordReset: vi.fn(async () => (
      { kind: 'success', text: 'reset-sent-sentinel', resetUrl: 'https://kit.test/reset?rt=x' }
    )),
    resetPassword: vi.fn(async () => ({ kind: 'error', text: 'reset-error-sentinel' })),
    startGoogleLogin: vi.fn(async () => ({ kind: 'error', text: 'google-error-sentinel' })),
    showPrivacyPolicy: vi.fn(() => 'show-privacy-result'),
    showTermsOfService: vi.fn(() => 'show-tos-result'),
    showForgotPassword: vi.fn(() => 'show-forgot-result'),
    showRegister: vi.fn(() => 'show-register-result'),
    showLogin: vi.fn(() => 'show-login-result'),
    backToLoginFromReset: vi.fn(() => 'back-from-reset-result'),
    ...overrides,
  };
}

function mount(children, authScreens) {
  const deps = {
    t,
    getLanguage: () => 'zh',
    subscribeLanguage: () => () => {},
    authScreens,
    subscribePolicyRequests,
  };
  return render(<DepsProvider value={deps}>{children}</DepsProvider>);
}

beforeEach(() => {
  AuthCardStore.reset();
  resetPolicyRequests();
});
afterEach(cleanup);

describe('AuthCardStore', () => {
  it('shows exactly the card the store names', () => {
    const authScreens = makeAuthScreens();
    mount(
      <>
        <LoginCard />
        <RegisterCard />
        <ForgotPasswordCard />
      </>,
      authScreens,
    );
    // null before the shell decides: none of the three renders.
    expect(document.getElementById('authLoginCard')).toBeNull();
    expect(document.getElementById('authRegister')).toBeNull();
    expect(document.getElementById('authForgotPwd')).toBeNull();

    act(() => showAuthCard('login'));
    expect(document.getElementById('authLoginCard')).not.toBeNull();
    expect(document.getElementById('authRegister')).toBeNull();

    act(() => showAuthCard('register'));
    expect(document.getElementById('authLoginCard')).toBeNull();
    expect(document.getElementById('authRegister')).not.toBeNull();
  });
});

describe('LoginCard', () => {
  it('gates the submit on the terms checkbox and hands the trimmed credentials to authScreens.login', async () => {
    const authScreens = makeAuthScreens();
    mount(<LoginCard />, authScreens);
    act(() => showAuthCard('login'));

    const submit = document.getElementById('authSubmit');
    // termsAlreadyAgreed answered false, so the button starts gated.
    expect(submit).toBeDisabled();

    fireEvent.change(document.getElementById('authUsername'), { target: { value: '  alice  ' } });
    fireEvent.change(document.getElementById('authPassword'), { target: { value: 'pw-1234' } });
    fireEvent.click(document.getElementById('authAgreeTerms'));
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(authScreens.login).toHaveBeenCalledWith({
      username: 'alice',
      password: 'pw-1234',
      remember: false,
      agreedNow: true,
    });
    // The fake refuses, so the error renders and the button unlocks again.
    expect(await screen.findByText('login-error-sentinel')).toHaveAttribute('id', 'authError');
    expect(submit).toBeEnabled();
  });

  it('labels its fields through the translator', () => {
    mount(<LoginCard />, makeAuthScreens());
    act(() => showAuthCard('login'));
    expect(screen.getByLabelText('«auth.username»')).toHaveAttribute('id', 'authUsername');
    expect(screen.getByLabelText('«auth.password»')).toHaveAttribute('id', 'authPassword');
    expect(document.getElementById('authSubmit')).toHaveTextContent('«auth.submit»');
  });

  it('routes the terms links and the Google button through the injected screens', async () => {
    const authScreens = makeAuthScreens({ termsAlreadyAgreed: vi.fn(() => true) });
    mount(<LoginCard />, authScreens);
    act(() => showAuthCard('login'));
    fireEvent.click(screen.getByText('«terms.privacy»'));
    expect(authScreens.showPrivacyPolicy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('«terms.tos»'));
    expect(authScreens.showTermsOfService).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('«auth.google»'));
    expect(authScreens.startGoogleLogin).toHaveBeenCalledWith({ remember: false, agreedNow: true });
    expect(await screen.findByText('google-error-sentinel')).toBeInTheDocument();
  });

  it('shows the invitation notice only when a pending invitation exists', () => {
    const authScreens = makeAuthScreens({ hasPendingInvitation: vi.fn(() => true) });
    mount(<LoginCard />, authScreens);
    act(() => showAuthCard('login'));
    expect(document.getElementById('authInviteNotice').className).toContain('show');
  });
});

describe('RegisterCard', () => {
  it('collects all four fields and reports the refusal', async () => {
    const authScreens = makeAuthScreens();
    mount(<RegisterCard />, authScreens);
    act(() => showAuthCard('register'));

    fireEvent.change(document.getElementById('regUsername'), { target: { value: ' bob ' } });
    fireEvent.change(document.getElementById('regEmail'), { target: { value: ' bob@x.test ' } });
    fireEvent.change(document.getElementById('regPassword'), { target: { value: 'pw' } });
    fireEvent.change(document.getElementById('regPassword2'), { target: { value: 'pw' } });
    fireEvent.click(document.getElementById('regAgreeTerms'));
    fireEvent.click(document.getElementById('regSubmit'));

    expect(authScreens.register).toHaveBeenCalledWith({
      username: 'bob',
      email: 'bob@x.test',
      password: 'pw',
      repeated: 'pw',
      agreedNow: true,
    });
    expect(await screen.findByText('register-error-sentinel')).toHaveAttribute('id', 'regError');
  });
});

describe('ForgotPasswordCard', () => {
  it('refuses an empty address locally, then renders the controller answer with the dev reset link', async () => {
    const authScreens = makeAuthScreens();
    mount(<ForgotPasswordCard />, authScreens);
    act(() => showAuthCard('forgot-password'));

    fireEvent.click(document.getElementById('fpSubmit'));
    expect(authScreens.requestPasswordReset).not.toHaveBeenCalled();
    expect(await screen.findByText('«auth.invalidEmail»')).toHaveAttribute('id', 'fpError');

    fireEvent.change(document.getElementById('fpEmail'), { target: { value: ' carol@x.test ' } });
    fireEvent.click(document.getElementById('fpSubmit'));
    expect(authScreens.requestPasswordReset).toHaveBeenCalledWith('carol@x.test');
    const success = await screen.findByText(/reset-sent-sentinel/);
    expect(success).toHaveAttribute('id', 'fpSuccess');
    expect(screen.getByText('«auth.clickReset»')).toHaveAttribute('href', 'https://kit.test/reset?rt=x');
    // One link per request: sending disables the button.
    expect(document.getElementById('fpSubmit')).toBeDisabled();
  });
});

describe('SetupCard', () => {
  it('hands the first-admin credentials to authScreens.setup and renders the refusal', async () => {
    const authScreens = makeAuthScreens();
    mount(<SetupCard />, authScreens);
    act(() => showAuthCard('setup'));

    fireEvent.change(document.getElementById('setupUsername'), { target: { value: 'admin' } });
    fireEvent.change(document.getElementById('setupPassword'), { target: { value: 'root-pw' } });
    fireEvent.change(document.getElementById('setupPassword2'), { target: { value: 'root-pw' } });
    fireEvent.click(document.getElementById('setupAgreeTerms'));
    fireEvent.click(document.getElementById('setupSubmit'));

    expect(authScreens.setup).toHaveBeenCalledWith({
      username: 'admin',
      password: 'root-pw',
      repeated: 'root-pw',
      agreedNow: true,
    });
    expect(await screen.findByText('setup-error-sentinel')).toHaveAttribute('id', 'setupError');
  });
});

describe('ResetPasswordCard', () => {
  it('submits both passwords and renders only a refusal', async () => {
    const authScreens = makeAuthScreens();
    mount(<ResetPasswordCard />, authScreens);
    act(() => showAuthCard('reset-password'));

    fireEvent.change(document.getElementById('rpNewPwd'), { target: { value: 'new-pw' } });
    fireEvent.change(document.getElementById('rpNewPwd2'), { target: { value: 'new-pw' } });
    fireEvent.click(document.getElementById('rpSubmit'));

    expect(authScreens.resetPassword).toHaveBeenCalledWith('new-pw', 'new-pw');
    expect(await screen.findByText('reset-error-sentinel')).toHaveAttribute('id', 'rpError');
  });

  it('leaves through the controller so the token leaves the address bar too', () => {
    const authScreens = makeAuthScreens();
    mount(<ResetPasswordCard />, authScreens);
    act(() => showAuthCard('reset-password'));
    fireEvent.click(screen.getByText('«auth.backLogin»'));
    expect(authScreens.backToLoginFromReset).toHaveBeenCalledTimes(1);
  });
});

describe('PolicyModal', () => {
  it('opens the requested document through the store, resolves its keys, and closes on Escape and backdrop', () => {
    mount(<PolicyModal />, makeAuthScreens());
    const overlay = document.getElementById('fPolicyOverlay');
    expect(overlay.className).not.toContain('active');

    act(() => requestPolicy('privacy'));
    expect(overlay.className).toContain('active');
    expect(document.getElementById('fPolicyTitle')).toHaveTextContent('«terms.privacyTitle»');
    expect(document.getElementById('fPolicyBody')).toHaveTextContent('«terms.privacyBody»');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(overlay.className).not.toContain('active');

    // Reopening the same document is a second request, not a no-op.
    act(() => requestPolicy('terms'));
    expect(document.getElementById('fPolicyTitle')).toHaveTextContent('«terms.tosTitle»');
    fireEvent.click(overlay);
    expect(overlay.className).not.toContain('active');
  });
});

describe('kit i18n slice', () => {
  it('resolves the auth keys in both languages and falls back to zh', async () => {
    const { I18N, t: realT, setLang, initLanguage } = await import('../src/core/i18n.js');
    expect(Object.keys(I18N.zh).length).toBe(144);
    initLanguage('zh');
    expect(realT('auth.submit')).toBe('登錄');
    setLang('en');
    expect(realT('auth.submit')).toBe('Sign In');
    expect(realT('changeRequest.pendingCount', { count: 3 })).toContain('3');
    setLang('zh');
  });
});
