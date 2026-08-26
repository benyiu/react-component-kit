// Tier-3 smoke: the account screen and its overlays.
//
// ProfileForm receives its surface with open() (not through deps) — the test
// hands it a fake surface the way the lazily-loaded controller does. The
// pending-changes badge is driven twice: once through a minimal house-store
// stub (the documented seam for a new project), once through the kit's real
// createPendingChangeRequestStore primed from a fake request port.
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepsProvider } from '../src/react/deps.jsx';
import { ProfileForm } from '../src/react/tab-form/ProfileForm.jsx';
import { ProfileOverlays } from '../src/react/profile/ProfileOverlays.jsx';
import { createStore } from '../src/core/store.js';
import { createPendingChangeRequestStore } from '../src/core/pending-change-request-store.js';
import { createDirtyTracker } from '../src/ui/dirty-tracker.js';
import { createPanelStack } from '../src/ui/panel-stack.js';
import {
  PROFILE_OVERLAYS, ProfileOverlayStore, openProfileOverlay, resetProfileOverlays,
} from '../src/ui/profile-overlay-store.js';

const t = (key, vars) => `«${key}${vars ? ':' + JSON.stringify(vars) : ''}»`;

function makeDeps(overrides = {}) {
  return {
    t,
    getLanguage: () => 'zh',
    subscribeLanguage: () => () => {},
    dirtyTracker: createDirtyTracker(),
    panelStack: createPanelStack(),
    pendingChangeRequests: createStore({ total: 0 }),
    profileOverlays: {
      closeAvatar: vi.fn(() => 'close-avatar-result'),
      previewAvatar: vi.fn(() => 'preview-result'),
      saveAvatar: vi.fn(() => 'save-avatar-result'),
      closeDisplayName: vi.fn(() => 'close-disp-result'),
      saveDisplayName: vi.fn(() => 'save-disp-result'),
      closeUsername: vi.fn(() => 'close-user-result'),
      saveUsername: vi.fn(() => 'save-user-result'),
      closeEmail: vi.fn(() => 'close-email-result'),
      saveEmail: vi.fn(() => 'save-email-result'),
      closeLanguage: vi.fn(() => 'close-lang-result'),
      saveLanguage: vi.fn(() => 'save-lang-result'),
      closePassword: vi.fn(() => 'close-pwd-result'),
      savePassword: vi.fn(() => 'save-pwd-result'),
      closeGoogleLinkError: vi.fn(() => 'close-google-result'),
      googleErrorMessage: vi.fn((code) => `google-error(${code})`),
    },
    ...overrides,
  };
}

function makeSurface(capabilities = { changeRequests: true, billing: false }) {
  return {
    title: vi.fn(() => 'profile-title-sentinel'),
    capabilities: vi.fn(() => capabilities),
    onOpened: vi.fn(() => 'opened-result'),
  };
}

const USER = {
  id: 'u1',
  username: 'carol',
  display_name: 'Carol',
  email: 'carol@x.test',
  emailVerified: false,
  hasPassword: true,
  language: 'zh',
  isPlatformAdmin: false,
};

function mountProfile(deps, surface, user = USER) {
  render(<DepsProvider value={deps}><ProfileForm /></DepsProvider>);
  act(() => globalThis.profileTabForm.open('edit', user, surface));
}

afterEach(() => {
  cleanup();
  resetProfileOverlays();
});

describe('ProfileForm', () => {
  it('opens with the surface handed to open(), reports through it, and publishes the handle', () => {
    const deps = makeDeps();
    const surface = makeSurface();
    mountProfile(deps, surface);

    const panel = document.getElementById('tfPanel_profile');
    expect(panel.style.display).not.toBe('none');
    expect(document.getElementById('tfTitle_profile')).toHaveTextContent('profile-title-sentinel');
    // the after-commit effect handed the account to the surface's outside work.
    expect(surface.onOpened).toHaveBeenCalledWith(USER);
    // the handle is published for the controller that opens the panel.
    expect(globalThis.profileTabForm.getData()).toEqual(USER);
    expect(globalThis.profileTabForm.isTabActive('profile')).toBe(true);

    act(() => globalThis.profileTabForm.close());
    expect(panel.style.display).toBe('none');
  });

  it('renders the account rows from the record: unverified email suffix, password mask, language name', () => {
    mountProfile(makeDeps(), makeSurface());
    expect(screen.getByText('carol@x.test«profile.emailUnverified»')).toBeInTheDocument();
    expect(screen.getByLabelText('Password status')).toHaveTextContent('********');
    expect(screen.getByText('«profile.languageZh»')).toBeInTheDocument();
    // non-admin: the admin section is not in the document.
    expect(screen.queryByText('«profile.adminUsers»')).toBeNull();
  });

  it('the pending badge follows the injected store count', () => {
    const deps = makeDeps();
    mountProfile(deps, makeSurface());
    const badge = document.getElementById('pfChangeRequestsBadge');
    expect(badge).toHaveTextContent('0');
    expect(badge.className).not.toContain('has-items');

    act(() => deps.pendingChangeRequests.update({ total: 3 }));
    expect(badge).toHaveTextContent('3');
    expect(badge.className).toContain('has-items');
    expect(badge).toHaveAttribute('title', '«changeRequest.pendingCount:{"count":3}»');

    act(() => deps.pendingChangeRequests.update({ total: 0 }));
    expect(badge).toHaveTextContent('0');
    expect(badge.className).not.toContain('has-items');
  });

  it('the badge also follows the kit\'s real pending store, primed from the request port', async () => {
    const request = vi.fn(async () => ({
      changeRequests: [
        { id: 'cr1', status: 'PENDING', entityType: 'CLIENT', entityId: 'c1' },
        { id: 'cr2', status: 'PENDING', entityType: 'REVIEW', entityId: 'r1' },
      ],
      hasMore: false,
    }));
    const pending = createPendingChangeRequestStore({
      request,
      getActiveCompanyId: () => 'co1',
      canOpenChangeRequests: () => true,
      now: () => Date.now(),
      schedule: (fn) => setTimeout(fn, 0),
    });
    const deps = makeDeps({ pendingChangeRequests: pending });
    mountProfile(deps, makeSurface());
    const badge = document.getElementById('pfChangeRequestsBadge');
    expect(badge).toHaveTextContent('0');
    await act(async () => { await pending.prime(); });
    expect(request).toHaveBeenCalled();
    expect(badge).toHaveTextContent('2');
    expect(badge.className).toContain('has-items');
  });

  it('a viewer without the capability has no change-requests row at all', () => {
    mountProfile(makeDeps(), makeSurface({ changeRequests: false, billing: false }));
    expect(document.getElementById('pfChangeRequestsBadge')).toBeNull();
    expect(screen.queryByText('«changeRequest.title»')).toBeNull();
  });

  it('confirmLogout raises the in-panel confirmation and yes runs what the controller handed over', () => {
    const deps = makeDeps();
    mountProfile(deps, makeSurface());
    const confirmed = vi.fn(() => 'logout-confirmed-result');
    act(() => globalThis.profileTabForm.confirmLogout(confirmed));
    expect(document.getElementById('pfLogoutConfirm')).toBeInTheDocument();

    fireEvent.click(document.getElementById('pfLogoutConfirmNo'));
    expect(confirmed).not.toHaveBeenCalled();
    expect(document.getElementById('pfLogoutConfirm')).toBeNull();

    act(() => globalThis.profileTabForm.confirmLogout(confirmed));
    fireEvent.click(document.getElementById('pfLogoutConfirmYes'));
    expect(confirmed).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileOverlays', () => {
  function mountOverlays(deps) {
    render(<DepsProvider value={deps}><ProfileOverlays /></DepsProvider>);
  }

  it('renders nothing until the store names an overlay, and typing lands in the store', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    expect(document.getElementById('pfDispOverlay')).toBeNull();

    act(() => openProfileOverlay(PROFILE_OVERLAYS.DISPLAY_NAME, { displayName: 'Carol' }));
    const input = document.getElementById('pfDispInput');
    expect(input.value).toBe('Carol');

    fireEvent.change(input, { target: { value: 'Caroline' } });
    expect(ProfileOverlayStore.fields.displayName).toBe('Caroline');

    // Enter saves through the controller's no-argument port.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(deps.profileOverlays.saveDisplayName).toHaveBeenCalledTimes(1);
  });

  it('opening an overlay clears what the previous one left behind', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    act(() => openProfileOverlay(PROFILE_OVERLAYS.USERNAME, { username: 'carol' }));
    act(() => ProfileOverlayStore.update({ error: 'left-over-error', busy: true }));
    expect(screen.getByText('left-over-error')).toBeInTheDocument();

    act(() => openProfileOverlay(PROFILE_OVERLAYS.EMAIL, { email: '' }));
    expect(document.getElementById('pfUserOverlay')).toBeNull();
    expect(ProfileOverlayStore.error).toBe('');
    expect(ProfileOverlayStore.busy).toBe(false);
  });

  it('the username save shows its running state and cannot be pressed twice', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    act(() => openProfileOverlay(PROFILE_OVERLAYS.USERNAME, { username: 'carol' }));
    act(() => ProfileOverlayStore.update({ busy: true }));
    const saving = screen.getByText('«profile.saving»');
    expect(saving).toBeDisabled();
  });

  it('the email overlay resolves its notice key on render and shows the dev verification link', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    act(() => openProfileOverlay(PROFILE_OVERLAYS.EMAIL, { email: 'x@y.test' }));
    act(() => ProfileOverlayStore.update({
      notice: 'profile.sendVerification',
      noticeSuffix: ' x@y.test',
      verifyUrl: 'https://kit.test/verify-email?token=tk',
    }));
    expect(document.getElementById('pfEmailMsg')).toHaveTextContent('«profile.sendVerification» x@y.test');
    const link = document.getElementById('pfEmailVerifyLink').querySelector('a');
    expect(link).toHaveAttribute('href', 'https://kit.test/verify-email?token=tk');
  });

  it('the language overlay checks the stored preference and reports the change', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    act(() => openProfileOverlay(PROFILE_OVERLAYS.LANGUAGE, { language: 'zh' }));
    const zh = screen.getByLabelText('«profile.languageZh»');
    const en = screen.getByLabelText('«profile.languageEn»');
    expect(zh.checked).toBe(true);
    fireEvent.click(en);
    expect(ProfileOverlayStore.fields.language).toBe('en');
    fireEvent.click(screen.getByText('«profile.save»'));
    expect(deps.profileOverlays.saveLanguage).toHaveBeenCalledTimes(1);
  });

  it('the google-error dialog resolves its code through the controller and closes on the backdrop', () => {
    const deps = makeDeps();
    mountOverlays(deps);
    act(() => openProfileOverlay(PROFILE_OVERLAYS.GOOGLE_ERROR, { googleErrorCode: 'identity_in_use' }));
    expect(screen.getByText('google-error(identity_in_use)')).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.click(document.getElementById('pfGoogleLinkErrorOverlay'));
    expect(deps.profileOverlays.closeGoogleLinkError).toHaveBeenCalledTimes(1);
  });
});
