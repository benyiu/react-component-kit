// The chrome every tab form wears: the toolbar, the tab bar, the two banners
// and the content column.
//
// This is the React half of createTabFormPanel plus the parts of
// tab-form-session and tab-form-toolbar that decide what the toolbar shows.
// It renders the same elements with the same ids and classes the classic
// panel produced, because legacy.css styles them and because consumers still
// read those ids through the handle (src/ui/tab-form-handle.js) until they
// convert too.
//
// The decisions are not reimplemented: tfSaveButtonState and
// tfSubmitButtonState are the same pure functions the classic toolbar uses.
import { useEffect, useState } from 'react';
import { tfSaveButtonState, tfSubmitButtonState } from '../../ui/tab-form-state.js';
import { useT } from '../deps.jsx';
import { useBusyLock } from './useBusyLock.js';
import { useFormChrome } from './useFormChrome.js';
import { useOuterScrollLock } from './useOuterScrollLock.js';

function BackIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Toolbar({
  ids, title, save, submit, menu, menuOpen, menuManaged,
  onBack, onSave, onSubmit, onToggleMenu, onCloseMenu,
}) {
  const t = useT();
  return (
    <div className="f-toolbar f-toolbar-edit" id={ids.toolbarId} style={{ position: 'relative' }}>
      <button
        type="button" className="f-back-btn" id={`${ids.toolbarId}Back`}
        title={t('common.back')} onClick={onBack}
      >
        <BackIcon />
      </button>
      <span className="f-toolbar-spacer" />
      <span className="f-edit-title" id={ids.titleId}>{title}</span>
      <span className="f-toolbar-spacer" />
      <button
        type="button"
        // The dirty class is what turns Save red; visibility and disabled come
        // from the same pure rule the classic toolbar applies.
        className={`f-save-btn${save.dirty ? ' dirty' : ''}`}
        id={ids.saveBtnId}
        style={{ display: save.visible ? '' : 'none' }}
        disabled={save.disabled}
        title={t('common.save')}
        onClick={onSave}
      >
        <SaveIcon />
      </button>
      <button
        type="button"
        className="f-save-btn tf-submit-btn"
        id={ids.submitBtnId}
        style={{ display: submit.visible ? '' : 'none' }}
        disabled={submit.disabled}
        title={t('common.submitFormal')}
        onClick={onSubmit}
      >
        <SubmitIcon />
      </button>
      <button
        type="button" className="f-action-menu-btn" id={ids.menuBtnId}
        // A form whose menu is filled by another owner also decides when the
        // button shows, so its display is left alone.
        style={menuManaged ? undefined : { display: menu && menu.length ? '' : 'none' }}
        // Stopped so the document handler that closes open menus does not
        // also see the click that is opening this one.
        onClick={(event) => { event.stopPropagation(); onToggleMenu(); }}
      >
        ⋯
      </button>
      {/* The shield both closes the menu and swallows the click, so dismissing
          it cannot also press whatever sits behind it. The classic helper
          inserts one imperatively; React renders its own so nothing foreign
          lands in a subtree React manages. */}
      {menuOpen ? (
        <div
          className="f-action-menu-shield show"
          data-menu={ids.menuId}
          onClick={onCloseMenu}
        />
      ) : null}
      <div className={`f-action-menu${menuOpen ? ' show' : ''}`} id={ids.menuId}>
        {(menuManaged ? [] : (menu || [])).map((item, index) => (
          <button
            key={item.key || item.label || index}
            type="button"
            className={item.cls || ''}
            data-tfmenu-idx={index}
            onClick={() => {
              onCloseMenu();
              if (typeof item.action === 'function') item.action();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TabBar({ ids, tabs, activeTab, onSelect }) {
  const t = useT();
  const visible = tabs.filter((tab) => tab.visible !== false);
  return (
    <div
      // Classic views ask "is a form managing this tab bar?" before drawing
      // their own. They must always find yes now, or they would build a second
      // tab bar inside this one.
      ref={(node) => { if (node) node._tfManaged = true; }}
      className="c-tabbar"
      id={ids.tabbarId}
      style={{ display: visible.length > 1 ? '' : 'none' }}
      role="tablist"
    >
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeTab}
          className={`c-tab${tab.id === activeTab ? ' active' : ''}${tab.className ? ` ${tab.className}` : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {t(tab.label)}
          {tab.count != null ? <span className="c-tab-count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

// Both banners are announced rather than shown silently: a record entering
// approval, or a server draft waiting to be submitted, changes what the
// toolbar will let the user do.
//
// `copy` is what tfPendingApprovalBanner / tfServerDraftBanner return — the
// same objects the classic banners rendered, in the same three parts, because
// legacy.css styles them by class. The optional action is record-scoped: the
// banner passes the request identity straight to the callback supplied by the
// host form.
function Banner({ id, className, copy, action }) {
  return (
    <div
      className={`tf-pending-approval-banner${className ? ` ${className}` : ''}`}
      id={id}
      role="status"
      hidden={!copy}
    >
      {copy ? (
        <>
          <span className="tf-pending-approval-icon" aria-hidden="true">{copy.icon}</span>
          <span className="tf-pending-approval-copy">
            <span className="tf-pending-approval-title">{copy.title}</span>
            <span className="tf-pending-approval-note">{copy.note}</span>
          </span>
          {action && copy.requestId ? (
            <button
              type="button"
              className="tf-pending-approval-action"
              onClick={() => action.onClick(copy.requestId)}
            >
              {action.label}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FormShell({
  ids, panelRef, open, fullViewport = true, title, tabs = [], activeTab,
  mode, canSave, busy, saving, dirty, restoredDraft,
  serverDraftWorkflow, hasServerDraft, menu, menuManaged = false,
  pendingApprovalBanner, serverDraftBanner, lockOuterScroll = true,
  onBack, onSave, onSubmit, onSelectTab, onOpenChangeRequestDetail, children,
}) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shell, setShell] = useState(null);
  const [body, setBody] = useState(null);
  // Every panel in the kit, rather than each one remembering to ask: the
  // classic factory did both of these for all of them too.
  useOuterScrollLock(open, lockOuterScroll);
  useFormChrome({ panel: shell, content: body, open });
  // A form working on something does not accept edits meanwhile — every panel
  // in the kit, because the classic pass ran for every form the factory built.
  useBusyLock({ root: body, busy });

  // A menu left open across a close, or after its last item disappears, would
  // reopen over the next record with nothing in it.
  useEffect(() => {
    if (!open || (!menuManaged && (!menu || !menu.length))) setMenuOpen(false);
  }, [open, menu, menuManaged]);

  const save = tfSaveButtonState(
    mode, canSave, busy, saving, dirty, restoredDraft, serverDraftWorkflow, hasServerDraft,
  );
  const submit = tfSubmitButtonState(mode, canSave, busy, saving, hasServerDraft);

  return (
    <div
      // panel-stack writes zIndex onto whatever it is handed, so it has to be
      // handed this element and not a wrapper around it — otherwise a form
      // opened over another never rises above it.
      ref={(node) => {
        setShell(node);
        if (typeof panelRef === 'function') panelRef(node);
        else if (panelRef) panelRef.current = node;
      }}
      className={`f-fullscreen-panel tf-panel f-form-panel${fullViewport ? ' tf-viewport-form' : ''}`}
      id={ids.panelId}
      style={{ display: open ? '' : 'none' }}
    >
      <div className="tf-column">
        <div className="tf-chrome">
          <Toolbar
            ids={ids} title={title} save={save} submit={submit} menu={menu}
            menuOpen={menuOpen} menuManaged={menuManaged}
            onBack={onBack} onSave={onSave} onSubmit={onSubmit}
            onToggleMenu={() => setMenuOpen((value) => !value)}
            onCloseMenu={() => setMenuOpen(false)}
          />
          <TabBar ids={ids} tabs={tabs} activeTab={activeTab} onSelect={onSelectTab} />
        </div>
        <Banner
          id={ids.pendingBannerId}
          copy={pendingApprovalBanner}
          action={{ onClick: onOpenChangeRequestDetail, label: t('changeRequest.view') }}
        />
        <Banner
          id={ids.serverDraftBannerId}
          className="tf-server-draft-banner"
          copy={serverDraftBanner}
        />
        <div className="f-form-container" id={ids.containerId || undefined}>
          {/* tf-body is what the stylesheet hangs the padding and the phone
              chrome inset on: the classic panel carried both on the per-tab
              panel inside a track, and there is no track here. */}
          <div className="f-form-inner tf-body" id={ids.contentId} ref={setBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// The ids a form publishes, derived exactly as createTabFormPanel derives
// them — same defaults, same caller overrides. Consumers read these through
// the handle (src/ui/tab-form-handle.js) and several are named in
// cdd-screening.html, so they are not free to change.
function tabFormIds(id, cfg = {}) {
  return {
    panelId: cfg.panelId || `tfPanel_${id}`,
    toolbarId: cfg.toolbarId || `tfToolbar_${id}`,
    titleId: cfg.titleId || `tfTitle_${id}`,
    saveBtnId: cfg.saveBtnId || `tfSaveBtn_${id}`,
    submitBtnId: cfg.submitBtnId || `tfSubmitBtn_${id}`,
    menuBtnId: cfg.menuBtnId || `tfMenuBtn_${id}`,
    menuId: cfg.menuId || `tfMenu_${id}`,
    tabbarId: cfg.tabbarId || `tfTabbar_${id}`,
    contentId: cfg.contentId || `tfContent_${id}`,
    containerId: cfg.containerId || null,
    pendingBannerId: `tfPendingApproval_${id}`,
    serverDraftBannerId: `tfServerDraft_${id}`,
  };
}

export { Banner, FormShell, TabBar, Toolbar, tabFormIds };
