// @ts-check
// The chrome a form wears on a phone: how tall it is, and when it gets out of
// the way.
//
// The third and largest thing the retirement measurement turned up, and the
// only one that was visible. On a phone the toolbar and tab bar are taken out
// of flow and laid over the form body (legacy.css, `.tf-panel.tf-viewport-form
// > .tf-column > .tf-chrome`), which works because the body reserves their
// height as a top inset and because scrolling down slides them away. Both of
// those were the classic chrome controller's, and it was only ever built by
// the factory — so every ported form laid its first field underneath its own
// toolbar, and nothing ever moved.
//
// Two things are published here, and the stylesheet does the rest:
//
//   --tf-toolbar-height / --tf-tabbar-height / --tf-chrome-height, measured
//   from what was actually rendered, because a form with no tab bar reserves
//   less than one with a tab bar, and the same panel changes as tabs appear.
//
//   .tf-chrome-collapsed, toggled on the panel by the same scroll rule the
//   classic chrome used — including its two awkward parts, which are load
//   bearing: the chrome stays put until the body has scrolled past its own
//   inset (otherwise it hides while it is still the only thing at the top),
//   and it stays hidden at the very bottom (otherwise iOS rubber-banding
//   alternates the delta, and each toggle changes the body height, which
//   feeds the next one).
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** @param {HTMLElement} panel */
function canCollapse(panel) {
  const view = /** @type {Window & typeof globalThis} */ (globalThis);
  const touch = ('ontouchstart' in view)
    || !!(view.navigator && view.navigator.maxTouchPoints > 0);
  return panel.classList.contains('tf-viewport-form')
    && !panel.classList.contains('f-inline')
    && touch
    && (!view.matchMedia || view.matchMedia('(max-width: 768px)').matches);
}

function useFormChrome({ panel, content, open }) {
  const collapsed = useRef(false);
  const lastTop = useRef(0);
  const chromeHeight = useRef(0);

  const measure = useCallback(() => {
    if (!panel) return;
    const chrome = panel.querySelector('.tf-chrome');
    const toolbar = panel.querySelector('.f-toolbar');
    const tabbar = panel.querySelector('.c-tabbar');
    const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
    const tabbarHeight = tabbar && tabbar.style.display !== 'none' ? tabbar.offsetHeight : 0;
    chromeHeight.current = chrome ? chrome.offsetHeight : toolbarHeight + tabbarHeight;
    panel.style.setProperty('--tf-toolbar-height', `${toolbarHeight}px`);
    panel.style.setProperty('--tf-tabbar-height', `${tabbarHeight}px`);
    panel.style.setProperty('--tf-chrome-height', `${chromeHeight.current}px`);
  }, [panel]);

  // Layout, not effect: the inset is read from these variables on the very
  // first paint of an opened form, and a frame without them is a frame with
  // the first field under the toolbar.
  //
  // Every commit, with no dependency list, because everything that changes
  // this height is a render — a tab bar appearing, a banner, a longer title
  // wrapping. Three offsetHeight reads is a cheaper price than a dependency
  // list that has to be right.
  useLayoutEffect(measure);

  useEffect(() => {
    // A rotation changes every one of them.
    globalThis.addEventListener('resize', measure);
    return () => globalThis.removeEventListener('resize', measure);
  }, [measure]);

  // A form reopened after being scrolled down would otherwise come back with
  // its chrome hidden and no scroll to bring it out of hiding.
  useEffect(() => {
    if (!panel || open) return;
    collapsed.current = false;
    lastTop.current = 0;
    panel.classList.remove('tf-chrome-collapsed');
  }, [panel, open]);

  // The body element outlives the record shown in it, so an open lands on
  // wherever the last record was left. Deferred a tick, as the classic reset
  // was, so it happens after the new content has its height.
  useEffect(() => {
    if (!content || !open) return undefined;
    const id = setTimeout(() => { content.scrollTop = 0; }, 0);
    return () => clearTimeout(id);
  }, [content, open]);

  useEffect(() => {
    if (!panel || !content) return undefined;
    const setCollapsed = (next) => {
      if (collapsed.current === next) return;
      collapsed.current = next;
      panel.classList.toggle('tf-chrome-collapsed', next);
    };
    const onScroll = () => {
      if (!canCollapse(panel)) { setCollapsed(false); return; }
      const top = content.scrollTop;
      const maxTop = Math.max(0, content.scrollHeight - content.clientHeight);
      const delta = top - lastTop.current;
      // The body's top inset is the chrome's own height. Hiding the chrome
      // before that inset has scrolled away would expose empty space.
      const insetScrolledAway = top > chromeHeight.current + 4;
      if (top <= 4) setCollapsed(false);
      else if (maxTop > 0 && top >= maxTop - 4) {
        if (insetScrolledAway) setCollapsed(true);
        lastTop.current = top;
        return;
      } else if (delta > 6 && insetScrolledAway) setCollapsed(true);
      else if (delta < -6) setCollapsed(false);
      lastTop.current = top;
    };
    content.addEventListener('scroll', onScroll, { passive: true });
    return () => content.removeEventListener('scroll', onScroll);
  }, [panel, content]);
}

export { useFormChrome };
