// Tier-2 smoke: a minimal form assembled from the kit's own parts — FormShell,
// tabFormIds, useTabFormHandle, useFormDraft, the field primitives — mounted
// with fake deps and driven through open/dirty/close, draft recovery, the
// edge-back gesture, pull-to-refresh, the busy lock and conflict resolution.
//
// The registries (dirty tracker, panel stack) are the kit's real
// implementations, not fakes: the point of the tier is that these parts
// compose.
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepsProvider, useDeps } from '../src/react/deps.jsx';
import { FormShell, tabFormIds } from '../src/react/tab-form/FormShell.jsx';
import { Field, Input, RadioGroup, Row, Section } from '../src/react/tab-form/fields.jsx';
import { useFormDraft } from '../src/react/tab-form/useFormDraft.js';
import { useTabFormHandle } from '../src/react/tab-form/useTabFormHandle.js';
import { useConflictResolution, CONFLICT_OUTCOME } from '../src/react/tab-form/useConflictResolution.js';
import { usePullRefresh } from '../src/react/tab-form/usePullRefresh.js';
import { RecordConflict } from '../src/core/record-conflict.js';
import { createDirtyTracker } from '../src/ui/dirty-tracker.js';
import { createPanelStack } from '../src/ui/panel-stack.js';
import { setTabReadonly } from '../src/ui/tab-form-editability.js';
import {
  tfDraftPayload, tfPendingApprovalBanner, tfSaveButtonState, tfShouldWriteDraft,
} from '../src/ui/tab-form-state.js';
import { TAB_FORM_METHODS } from '../src/ui/tab-form-handle.js';

const t = (key, vars) => `«${key}${vars ? ':' + JSON.stringify(vars) : ''}»`;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function makeDeps(overrides = {}) {
  return {
    t,
    getLanguage: () => 'zh',
    subscribeLanguage: () => () => {},
    getCurrentUser: () => ({ id: 'u1' }),
    getActiveCompanyId: () => 'c1',
    recordConflict: RecordConflict,
    sessionStorage: fakeStorage(),
    localStorage: fakeStorage(),
    scrollLock: {
      tfNeedsOuterPageScrollLock: vi.fn(() => true),
      tfLockOuterPageScroll: vi.fn(() => 'lock-result'),
      tfUnlockOuterPageScroll: vi.fn(() => 'unlock-result'),
      tfEnsureOuterPageScrollUnlocked: vi.fn(() => 'ensure-result'),
      tfRestoreActiveListFocus: vi.fn(() => 'restore-result'),
    },
    dirtyTracker: createDirtyTracker(),
    panelStack: createPanelStack(),
    confirmAsync: vi.fn(async () => true),
    confirmAsync3: vi.fn(async () => 'local'),
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`),
    loadSubmittedRecordDraft: vi.fn(async () => ({ id: 'db-1' })),
    saveServerRecordDraft: vi.fn(async () => ({ savedData: {} })),
    deleteServerRecordDraft: vi.fn(async () => ({})),
    showToast: vi.fn(() => 'toast-result'),
    ...overrides,
  };
}

// The minimal form of the tier: one tab, one text field, a draft, the handle.
function TestForm({
  api, onRequestBack, onRefresh, pendingApprovalBanner, onOpenChangeRequestDetail,
}) {
  const { dirtyTracker, panelStack } = useDeps();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('create');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [data, setData] = useState({});
  const [panel, setPanel] = useState(null);
  const ids = tabFormIds('kitform', { containerId: 'kitformContainer' });

  const latest = useRef({});
  latest.current = { open, mode, busy, dirty, data };

  const draft = useFormDraft({
    formId: 'kitform',
    enabled: true,
    getScope: () => '',
  });

  const handle = useTabFormHandle({
    id: 'kitform',
    panelId: ids.panelId,
    panel,
    open,
    dirty,
    onClose: () => setOpen(false),
    onRequestBack: (source) => {
      if (onRequestBack) onRequestBack(source);
      setOpen(false);
      return 'request-back-result';
    },
    onSetDirty: setDirty,
    dirtyTracker,
    panelStack,
    extra: {
      contentId: ids.contentId,
      open: (nextMode, record) => {
        setMode(nextMode);
        setData(record || {});
        setDirty(false);
        setOpen(true);
      },
      getData: () => latest.current.data,
      setBusy,
    },
  });

  usePullRefresh({
    ids, open, mode, busy, onRefresh,
  });

  api.current = { handle, draft, ids, state: latest };

  return (
    <FormShell
      ids={ids}
      panelRef={setPanel}
      open={open}
      title="kit form"
      mode={mode}
      canSave
      busy={busy}
      saving={false}
      dirty={dirty}
      restoredDraft={false}
      serverDraftWorkflow={false}
      hasServerDraft={false}
      tabs={[
        { id: 'kitform', label: 'auth.title', count: 2 },
        { id: 'other', label: 'auth.sub' },
      ]}
      activeTab="kitform"
      menu={[{ key: 'noop', label: 'menu-item-label', action: () => {} }]}
      pendingApprovalBanner={pendingApprovalBanner}
      onBack={() => handle.requestBack('toolbar')}
      onSave={() => {}}
      onSubmit={() => {}}
      onSelectTab={() => {}}
      onOpenChangeRequestDetail={onOpenChangeRequestDetail}
    >
      <Section title="section-title">
        <Row>
          <Field label="name-label" htmlFor="kitName">
            <Input
              id="kitName"
              value={data.name}
              onChange={(value) => {
                latest.current.data = { ...latest.current.data, name: value };
                setData(latest.current.data);
                setDirty(true);
                draft.schedule(() => ({
                  mode: latest.current.mode,
                  data: latest.current.data,
                  dirty: true,
                  restoredDraft: false,
                  saving: false,
                }));
              }}
            />
          </Field>
        </Row>
        <div className="f-ss-display" data-action="kit.edit" id="kitClickToEdit">click-to-edit</div>
      </Section>
    </FormShell>
  );
}

function mountForm(deps, extras = {}) {
  const api = { current: null };
  const onRequestBack = vi.fn(() => 'on-request-back-result');
  const onRefresh = extras.onRefresh;
  render(
    <DepsProvider value={deps}>
      <TestForm
        api={api}
        onRequestBack={onRequestBack}
        onRefresh={onRefresh}
        pendingApprovalBanner={extras.pendingApprovalBanner}
        onOpenChangeRequestDetail={extras.onOpenChangeRequestDetail}
      />
    </DepsProvider>,
  );
  return { api, onRequestBack };
}

afterEach(cleanup);

describe('the assembled form', () => {
  it('opens through the handle, registers with both registries, and closes', () => {
    const deps = makeDeps();
    const { api } = mountForm(deps);
    const panel = document.getElementById('tfPanel_kitform');
    expect(panel.style.display).toBe('none');
    expect(api.current.handle.isOpen()).toBe(false);

    act(() => api.current.handle.open('edit', { name: 'first' }));
    expect(panel.style.display).not.toBe('none');
    expect(api.current.handle.isOpen()).toBe(true);
    // panel-stack wrote its z-index onto the panel element itself.
    expect(panel.style.zIndex).toBe('300');
    // the outer scroll lock engaged through the injected manager.
    expect(deps.scrollLock.tfLockOuterPageScroll).toHaveBeenCalledTimes(1);

    act(() => api.current.handle.close());
    expect(panel.style.display).toBe('none');
    // closing released the lock and restored list focus.
    expect(deps.scrollLock.tfUnlockOuterPageScroll).toHaveBeenCalledTimes(1);
    expect(deps.scrollLock.tfRestoreActiveListFocus).toHaveBeenCalledTimes(1);
  });

  it('publishes the handle members its extras declare, and the registries can reach it', () => {
    const deps = makeDeps();
    const { api } = mountForm(deps);
    act(() => api.current.handle.open('edit', { name: 'record' }));
    expect(api.current.handle.getData()).toEqual({ name: 'record' });
    expect(api.current.handle.isDirty()).toBe(false);

    // The authoritative member list ships with the kit; the registries' four
    // core members must be present on every handle.
    for (const member of ['isOpen', 'isDirty', 'setDirty', 'close', 'requestBack']) {
      expect(typeof api.current.handle[member], member).toBe('function');
    }
    expect(TAB_FORM_METHODS).toContain('requestBack');

    // dirty tracker: an edit makes the form dirty, and the tracker sees it.
    expect(deps.dirtyTracker.anyDirty()).toBe(false);
    fireEvent.change(document.getElementById('kitName'), { target: { value: 'edited' } });
    expect(deps.dirtyTracker.anyDirty()).toBe(true);

    // hardware back routes through the tracker to this panel's handle.
    const routed = deps.dirtyTracker.requestBackForPanel('tfPanel_kitform', 'hardware');
    expect(routed).toBe(true);
  });

  // A control's accessible name is what a screen reader announces and what
  // getByLabelText finds. Field draws the <label> and the caller supplies the
  // id; the link between them is a single htmlFor, and until now nothing here
  // asserted it — dropping htmlFor left every suite green while the input
  // became an anonymous box.
  //
  // The source project proves this with an accessible-name oracle over 10,368
  // rendered states. That does not travel with the kit, so this is the kit's
  // own minimum: the control the label names must be reachable BY that name,
  // which is a different claim from "a label element exists".
  it('a labelled control is reachable by the name its label gives it', () => {
    const deps = makeDeps();
    const { api } = mountForm(deps);
    act(() => api.current.handle.open('edit', { name: 'first' }));
    const named = screen.getByLabelText('name-label');
    expect(named).toHaveAttribute('id', 'kitName');
    expect(named.tagName).toBe('INPUT');
  });

  it('shows Save only when there is something to save, and marks it dirty', () => {
    const { api } = mountForm(makeDeps());
    act(() => api.current.handle.open('edit', { name: 'v' }));
    const save = document.getElementById('tfSaveBtn_kitform');
    // an untouched edit form has nothing to save.
    expect(save.style.display).toBe('none');
    fireEvent.change(document.getElementById('kitName'), { target: { value: 'v2' } });
    expect(save.style.display).not.toBe('none');
    expect(save.className).toContain('dirty');
  });

  it('locks the body while busy and restores exactly what it changed', () => {
    const { api } = mountForm(makeDeps());
    act(() => api.current.handle.open('edit', { name: 'v' }));
    const input = document.getElementById('kitName');
    const clickToEdit = document.getElementById('kitClickToEdit');
    expect(input.disabled).toBe(false);
    expect(clickToEdit.getAttribute('data-action')).toBe('kit.edit');

    act(() => api.current.handle.setBusy(true));
    expect(input.disabled).toBe(true);
    expect(input.getAttribute('data-tf-busy-disabled')).toBe('1');
    expect(clickToEdit.getAttribute('data-action')).toBeNull();
    expect(clickToEdit.className).toContain('f-ss-locked');

    act(() => api.current.handle.setBusy(false));
    expect(input.disabled).toBe(false);
    expect(clickToEdit.getAttribute('data-action')).toBe('kit.edit');
    expect(clickToEdit.className).not.toContain('f-ss-locked');
  });

  it('renders the tab bar with counts and the action menu behind its shield', () => {
    const { api } = mountForm(makeDeps());
    act(() => api.current.handle.open('edit', {}));
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent('«auth.title»');
    expect(tabs[0]).toHaveTextContent('2');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    const menu = document.getElementById('tfMenu_kitform');
    expect(menu.className).not.toContain('show');
    fireEvent.click(document.getElementById('tfMenuBtn_kitform'));
    expect(menu.className).toContain('show');
    fireEvent.click(screen.getByText('menu-item-label'));
    expect(menu.className).not.toContain('show');
  });

  it('passes a pending request id directly to the host callback', () => {
    const onOpenChangeRequestDetail = vi.fn();
    const { api } = mountForm(makeDeps(), {
      pendingApprovalBanner: {
        icon: '◷', title: 'Waiting', note: 'Since Tuesday', requestId: 'cr-kit-9',
      },
      onOpenChangeRequestDetail,
    });
    act(() => api.current.handle.open('edit', {}));
    const action = screen.getByRole('button', { name: '«changeRequest.view»' });
    expect(action.getAttribute('data-action')).toBeNull();
    expect(action.getAttribute('data-request-id')).toBeNull();
    fireEvent.click(action);
    expect(onOpenChangeRequestDetail).toHaveBeenCalledWith('cr-kit-9');
  });
});

describe('draft recovery', () => {
  it('writes a create draft on flush, strips bookkeeping keys, and finds it again', () => {
    const deps = makeDeps();
    const { api } = mountForm(deps);
    act(() => api.current.handle.open('create', {}));
    fireEvent.change(document.getElementById('kitName'), { target: { value: 'half-typed' } });

    const state = {
      mode: 'create',
      data: { name: 'half-typed', _dbId: 'stale-id', _version: 9 },
      dirty: true,
      restoredDraft: false,
      saving: false,
    };
    expect(api.current.draft.flush(state)).toBe(true);
    // the payload lost its underscore-prefixed bookkeeping.
    const recovered = api.current.draft.load();
    expect(recovered).toEqual({ name: 'half-typed' });
    // a browser draft is a create-form thing only (the middle rule).
    expect(tfShouldWriteDraft({
      useFactoryDraft: true, mode: 'edit', hasData: true, dirty: true, restoredDraft: false,
    })).toBe(false);

    api.current.draft.clear();
    expect(api.current.draft.load()).toBeNull();
  });

  it('debounces typing into one write and skips a save in flight', async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps();
      const { api } = mountForm(deps);
      act(() => api.current.handle.open('create', {}));
      const saving = { value: false };
      api.current.draft.schedule(() => ({
        mode: 'create', data: { name: 'a' }, dirty: true, restoredDraft: false, saving: saving.value,
      }));
      api.current.draft.schedule(() => ({
        mode: 'create', data: { name: 'ab' }, dirty: true, restoredDraft: false, saving: saving.value,
      }));
      await vi.advanceTimersByTimeAsync(400);
      // one write, carrying the latest keystroke.
      expect(api.current.draft.load()).toEqual({ name: 'ab' });

      saving.value = true;
      api.current.draft.schedule(() => ({
        mode: 'create', data: { name: 'abc' }, dirty: true, restoredDraft: false, saving: true,
      }));
      await vi.advanceTimersByTimeAsync(400);
      // a keystroke timer landing mid-save writes nothing.
      expect(api.current.draft.load()).toEqual({ name: 'ab' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the edge-back gesture', () => {
  it('a committed left-edge swipe asks the panel to go back; a short one snaps home', () => {
    const { api, onRequestBack } = mountForm(makeDeps());
    act(() => api.current.handle.open('edit', {}));
    const panel = document.getElementById('tfPanel_kitform');

    // Short travel: the panel follows the finger, then snaps square.
    fireEvent.touchStart(panel, { touches: [{ clientX: 10, clientY: 200 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 60, clientY: 205 }] });
    fireEvent.touchEnd(panel, { touches: [] });
    expect(onRequestBack).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');

    // Full travel with velocity: the release goes through the back rule.
    fireEvent.touchStart(panel, { touches: [{ clientX: 8, clientY: 200 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 150, clientY: 202 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 320, clientY: 204 }] });
    fireEvent.touchEnd(panel, { touches: [] });
    expect(onRequestBack).toHaveBeenCalledWith('swipe');
  });

  it('a panel under another does not answer the gesture', () => {
    const deps = makeDeps();
    const { api, onRequestBack } = mountForm(deps);
    act(() => api.current.handle.open('edit', {}));
    const panel = document.getElementById('tfPanel_kitform');
    // Something else lands on top of the stack.
    const other = document.createElement('div');
    act(() => deps.panelStack.push(other));

    fireEvent.touchStart(panel, { touches: [{ clientX: 8, clientY: 200 }] });
    fireEvent.touchMove(panel, { touches: [{ clientX: 320, clientY: 204 }] });
    fireEvent.touchEnd(panel, { touches: [] });
    expect(onRequestBack).not.toHaveBeenCalled();
  });
});

describe('pull-to-refresh', () => {
  it('creates the indicator on first pull, flips past the threshold, and runs the refresh', async () => {
    const onRefresh = vi.fn(() => Promise.resolve('refresh-result'));
    const { api } = mountForm(makeDeps(), { onRefresh });
    act(() => api.current.handle.open('edit', {}));
    const content = document.getElementById('tfContent_kitform');

    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] });
    const indicator = content.querySelector('.f-pull-indicator');
    expect(indicator).not.toBeNull();
    expect(indicator.textContent).toContain('«common.pullRefresh»');

    fireEvent.touchMove(content, { touches: [{ clientX: 102, clientY: 180 }] });
    expect(indicator.className).toContain('f-flip');
    expect(indicator.style.height).toBe('40px');

    fireEvent.touchEnd(content, { touches: [] });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(indicator.className).toContain('f-refreshing');
    await waitFor(() => expect(indicator.className).not.toContain('f-refreshing'));
    expect(indicator.style.height).toBe('0px');
  });

  it('leaves a create form alone — there is no saved record to reload', () => {
    const onRefresh = vi.fn(() => Promise.resolve('refresh-result'));
    const { api } = mountForm(makeDeps(), { onRefresh });
    act(() => api.current.handle.open('create', {}));
    const content = document.getElementById('tfContent_kitform');
    fireEvent.touchStart(content, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchMove(content, { touches: [{ clientX: 100, clientY: 180 }] });
    fireEvent.touchEnd(content, { touches: [] });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('conflict resolution', () => {
  function Probe({ out }) {
    out.current = useConflictResolution();
    return null;
  }
  function mountResolver(deps) {
    const out = { current: null };
    render(<DepsProvider value={deps}><Probe out={out} /></DepsProvider>);
    return out;
  }

  it('merges non-overlapping edits without asking, and reports the server baseline', async () => {
    const deps = makeDeps();
    const resolve = mountResolver(deps);
    const answer = await resolve.current({
      result: { freshData: { a: 1, b: 'server', _version: 3 } },
      base: { a: 1, b: 'old' },
      local: { a: 2, b: 'old' },
      entityType: 'CLIENT',
      serverDraft: false,
    });
    expect(answer.outcome).toBe(CONFLICT_OUTCOME.RESOLVED);
    // the user's edit to `a` survives, the server's `b` lands, no dialog.
    expect(answer.merged.a).toBe(2);
    expect(answer.merged.b).toBe('server');
    expect(deps.confirmAsync3).not.toHaveBeenCalled();
  });

  it('asks only about the overlap and honours "keep mine"', async () => {
    const deps = makeDeps({ confirmAsync3: vi.fn(async () => 'local') });
    const resolve = mountResolver(deps);
    const answer = await resolve.current({
      result: { freshData: { a: 'server-a', _version: 3 } },
      base: { a: 'base-a' },
      local: { a: 'local-a' },
      entityType: 'CLIENT',
      serverDraft: false,
    });
    expect(deps.confirmAsync3).toHaveBeenCalledTimes(1);
    expect(answer.outcome).toBe(CONFLICT_OUTCOME.RESOLVED);
    expect(answer.merged.a).toBe('local-a');
    // the baseline the form should now measure dirtiness against is the
    // server's state, so the kept field still reads as unsaved work.
    expect(answer.server.a).toBe('server-a');
  });

  it('a server with nothing to merge against is unmergeable', async () => {
    const deps = makeDeps();
    const resolve = mountResolver(deps);
    const answer = await resolve.current({
      result: { error: 'boom' }, base: {}, local: {}, entityType: 'CLIENT', serverDraft: false,
    });
    expect(answer.outcome).toBe(CONFLICT_OUTCOME.UNMERGEABLE);
    expect(answer.message).toBe('boom');
  });
});

describe('the pure state layer', () => {
  it('tfSaveButtonState: create is ready, an untouched edit is not', () => {
    expect(tfSaveButtonState('create', true, false, false, false, false, false, false).visible).toBe(true);
    expect(tfSaveButtonState('edit', true, false, false, false, false, false, false).visible).toBe(false);
    expect(tfSaveButtonState('edit', true, false, false, true, false, false, false)).toEqual({
      visible: true, disabled: false, dirty: true,
    });
    expect(tfSaveButtonState('edit', true, true, false, true, false, false, false).visible).toBe(false);
  });

  it('tfDraftPayload strips every underscore key and keeps the rest', () => {
    expect(tfDraftPayload({ name: 'x', _dbId: '1', _version: 2, nested: { _keep: true } }))
      .toEqual({ name: 'x', nested: { _keep: true } });
  });

  it('the pending-approval banner names a delete differently and offers view only with an id', () => {
    const banner = tfPendingApprovalBanner(
      { operation: 'DELETE', id: 'cr-9' },
      { translate: t, formatDate: (v) => `d(${v})` },
    );
    expect(banner.title).toBe('«changeRequest.pendingDeleteTitle»');
    expect(banner.requestId).toBe('cr-9');
    expect(tfPendingApprovalBanner(null, { translate: t, formatDate: (v) => v })).toBeNull();
  });

  it('setTabReadonly hides mutation buttons, disables controls, and puts back only what it took', () => {
    const root = document.createElement('div');
    root.innerHTML = '<input id="a"><input id="b" disabled>'
      + '<button id="del">x</button>'
      + '<div class="f-ss-display" data-action="open.editor" id="c">v</div>';
    setTabReadonly(root, true);
    expect(root.querySelector('#a').disabled).toBe(true);
    expect(root.querySelector('#del').style.display).toBe('none');
    expect(root.querySelector('#c').getAttribute('data-action')).toBeNull();
    setTabReadonly(root, false);
    expect(root.querySelector('#a').disabled).toBe(false);
    // pre-disabled by its renderer: stays disabled, exactly as it was.
    expect(root.querySelector('#b').disabled).toBe(true);
    expect(root.querySelector('#del').style.display).toBe('');
    expect(root.querySelector('#c').getAttribute('data-action')).toBe('open.editor');
  });
});

describe('field primitives', () => {
  it('a controlled RadioGroup reports the choice; an uncontrolled one compares loosely', () => {
    const onChange = vi.fn(() => 'change-result');
    const deps = makeDeps();
    render(
      <DepsProvider value={deps}>
        <RadioGroup
          name="controlled" label="rating" value={3}
          choices={[{ value: 1, label: 'low' }, { value: 3, label: 'mid' }]}
          onChange={onChange}
        />
        <RadioGroup
          name="uncontrolled" label="factor" value="5"
          choices={[{ value: 5, label: 'high' }]}
        />
      </DepsProvider>,
    );
    const mid = screen.getByLabelText('mid');
    expect(mid.checked).toBe(true);
    fireEvent.click(screen.getByLabelText('low'));
    expect(onChange).toHaveBeenCalledWith(1);
    // DOM gave back a string, the choice is a number: loose comparison seats it.
    expect(screen.getByLabelText('high').checked).toBe(true);
    // the group is named the ARIA way.
    expect(screen.getByRole('radiogroup', { name: 'rating' })).toBeInTheDocument();
  });
});
