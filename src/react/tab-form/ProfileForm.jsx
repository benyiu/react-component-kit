// The account screen: avatar, the six things about you that can be changed,
// and the way out of the app.
//
// The last form to leave the factory, and the one that looks least like the
// others. It has no record to save, no menu and one tab — every row opens a
// page-level overlay, and those overlays live outside this panel and stay the
// controller's.
//
// **The body is JSX** (ProfileBody.jsx). It was the page's `<template>`, cloned
// through `dangerouslySetInnerHTML`, until the twenty-five `data-i18n` labels
// inside it turned out to be the last thing keeping the DOM applier alive that
// was not page chrome — React could not translate labels it never saw as
// elements. Rendering them means a language change re-renders them, which is
// what every other converted body already relied on.
//
// **So there is no paint step any more.** The controller used to resolve eight
// ids in this body and write the account's values into them, which is why the
// panel had to hand it a moment after the commit. The values are props now,
// and the pending-changes badge renders itself from the store it subscribes
// to; what is left of that call is the work outside this panel that opening it
// triggers — the header avatar, and priming that store so the badge has a
// fresh count — and it stays an effect because it reaches outside the render.
//
// **Its surface arrives with `open`, not through deps**, for the reason the
// platform user editor's does: profile is a lazily-loaded chunk
// (features/profile/lazy-controller.js) and a lazy proxy can only forward
// methods as promises.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormShell, tabFormIds } from './FormShell.jsx';
import { ProfileBody } from './ProfileBody.jsx';
import { useTabFormHandle } from './useTabFormHandle.js';
import { useDeps, useLanguage } from '../deps.jsx';

const PROFILE_FORM_ID = 'profile';

function ProfileForm() {
  const { dirtyTracker, panelStack } = useDeps();
  // The title comes from the surface rather than from t(), and reads the
  // language at call time, so the panel still has to re-render when it changes.
  // The body has its own useT.
  useLanguage();
  // Handed over by the controller when it opens this panel.
  const [profileForm, setProfileForm] = useState(null);

  const [open, setOpen] = useState(false);
  // A fresh wrapper per open, never the account object itself: re-opening an
  // already-open Profile is how it refreshes, and a display-name save mutates
  // the session user in place — so identity has to change even when the record
  // does not.
  const [account, setAccount] = useState(null);
  const [panel, setPanel] = useState(null);
  // What "yes" means, held while the confirmation is up. Null is not showing.
  const [logoutPrompt, setLogoutPrompt] = useState(null);
  const ids = tabFormIds(PROFILE_FORM_ID);

  const latest = useRef({});
  latest.current = { open, account, surface: profileForm };

  const handle = useTabFormHandle({
    id: PROFILE_FORM_ID,
    panelId: ids.panelId,
    panel,
    open,
    dirty: false,
    onClose: () => {
      setOpen(false);
      setLogoutPrompt(null);
    },
    dirtyTracker,
    panelStack,
    extra: useMemo(() => ({
      contentId: ids.contentId,
      open: (mode, user, surface) => {
        if (surface) setProfileForm(surface);
        setAccount({ user });
        setOpen(true);
      },
      // Asked for after a password change. The panel owns the confirmation
      // because it is inside the body; the controller owns what agreeing to it
      // does.
      confirmLogout: (onConfirm) => setLogoutPrompt(() => onConfirm),
      getData: () => (latest.current.account ? latest.current.account.user : undefined),
      getActiveTab: () => PROFILE_FORM_ID,
      isTabActive: (tabId) => tabId === PROFILE_FORM_ID,
      isCreate: () => false,
      isBusy: () => false,
      hasRestoredDraft: () => false,
    }), [ids.contentId]),
  });

  useEffect(() => {
    globalThis.profileTabForm = handle;
    return () => {
      if (globalThis.profileTabForm === handle) delete globalThis.profileTabForm;
    };
  }, [handle]);

  // After the commit, never during the render: the surface's outside work
  // refreshes the header avatar and primes the pending-changes store, both of
  // which reach beyond what this panel is drawing.
  useEffect(() => {
    if (!open || !profileForm || !account) return;
    profileForm.onOpened(account.user);
  }, [open, profileForm, account]);

  // Read every render rather than captured on open: a role change is what
  // decides whether two of these rows exist at all.
  const capabilities = open && profileForm ? profileForm.capabilities() : null;

  return (
    <FormShell
      ids={ids}
      panelRef={setPanel}
      open={open}
      title={open && profileForm ? profileForm.title() : ''}
      mode="edit"
      canSave={false}
      busy={false}
      saving={false}
      dirty={false}
      restoredDraft={false}
      serverDraftWorkflow={false}
      hasServerDraft={false}
      tabs={[{ id: PROFILE_FORM_ID, label: '' }]}
      activeTab={PROFILE_FORM_ID}
      onBack={() => setOpen(false)}
      onSave={() => {}}
      onSubmit={() => {}}
      onSelectTab={() => {}}
    >
      {account && account.user && capabilities ? (
        <ProfileBody
          user={account.user}
          changeRequests={capabilities.changeRequests}
          billing={capabilities.billing}
          logoutPrompt={Boolean(logoutPrompt)}
          onLogoutConfirm={() => {
            const confirmed = logoutPrompt;
            setLogoutPrompt(null);
            confirmed();
          }}
          onLogoutCancel={() => setLogoutPrompt(null)}
        />
      ) : null}
    </FormShell>
  );
}

export { PROFILE_FORM_ID, ProfileForm };
