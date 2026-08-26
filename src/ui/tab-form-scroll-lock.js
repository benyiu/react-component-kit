// Full-screen tab forms must not allow the page behind them to scroll. This
// manager is reference-counted because an editor (for example, a company
// member form) may be opened on top of another tab form. The count, the saved
// scroll offset and the saved styles are private to it.

function createTabFormScrollLock(deps = {}) {
  const document = deps.document;
  const window = deps.window;
  const requestAnimationFrame = deps.requestAnimationFrame;
  const setTimeout = deps.setTimeout;
  const TabFormPanelStack = deps.TabFormPanelStack;

  var _tfPageScrollLockCount = 0;
  var _tfPageScrollY = 0;
  var _tfPageScrollStyles = null;

  function tfRestoreActiveListFocus() {
      // The selected row remains in the list's data state while a TabForm
      // is open, but focus itself is lost when the overlay closes. Restore
      // it only when that row is visible underneath the just-closed panel.
      setTimeout(function() {
          var rows = document.querySelectorAll('.f-list-row.f-active-row');
          for (var i = 0; i < rows.length; i++) {
              var row = rows[i];
              if (!row.getClientRects || !row.getClientRects().length) continue;
              row.tabIndex = -1;
              // Do not fall back to focus() without preventScroll: older
              // Safari versions then scroll the underlying list, defeating
              // the preserved return position.
              try { row.focus({ preventScroll: true }); } catch (e) {}
              return;
          }
      }, 0);
  }

  function tfLockOuterPageScroll() {
      if (_tfPageScrollLockCount++ > 0) return;
      var body = document.body;
      var html = document.documentElement;
      _tfPageScrollY = window.scrollY || window.pageYOffset || 0;
      _tfPageScrollStyles = {
          htmlOverflow: html.style.overflow,
          bodyPosition: body.style.position,
          bodyTop: body.style.top,
          bodyLeft: body.style.left,
          bodyRight: body.style.right,
          bodyWidth: body.style.width,
          bodyOverflow: body.style.overflow
      };
      // Most main lists use the document scroll, but some list shells own
      // their own scroll position. Preserve both while a full-screen form
      // is layered above them.
      _tfPageScrollStyles.listScrolls = [];
      // The homepage pager itself can own vertical scrolling (rather than
      // its nested list shell), so preserve either kind of real scroll
      // surface while the editor is on top.
      var listScrolls = document.querySelectorAll('.f-list-scroll, .main-tab-page');
      for (var li = 0; li < listScrolls.length; li++) {
          if (listScrolls[li].scrollTop && listScrolls[li].getClientRects().length) {
              _tfPageScrollStyles.listScrolls.push({ el: listScrolls[li], top: listScrolls[li].scrollTop });
          }
      }
      html.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = '-' + _tfPageScrollY + 'px';
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
      // Do not restyle the header or tab bar underneath the editor. Taking
      // either one out of normal flow causes #cddFormPanel to move upward,
      // hiding the list search bar and producing a fake lower page during
      // the edge-swipe preview. The real DOM already has the correct layout.
      // Safari can reset the document or nested list scroll while applying
      // fixed positioning. Re-assert the saved positions after layout;
      // body.top, rather than window scroll, keeps the document aligned.
      var lockY = _tfPageScrollY;
      requestAnimationFrame(function() {
          if (!_tfPageScrollStyles || _tfPageScrollLockCount === 0) return;
          body.style.top = '-' + lockY + 'px';
          try { window.scrollTo(0, 0); } catch (e) {}
          var savedLists = _tfPageScrollStyles.listScrolls || [];
          for (var si = 0; si < savedLists.length; si++) {
              if (savedLists[si].el && savedLists[si].el.isConnected) savedLists[si].el.scrollTop = savedLists[si].top;
          }
      });
  }

  function tfUnlockOuterPageScroll() {
      if (_tfPageScrollLockCount === 0 || --_tfPageScrollLockCount > 0) return;
      var body = document.body;
      var html = document.documentElement;
      var saved = _tfPageScrollStyles || {};
      html.style.overflow = saved.htmlOverflow || '';
      body.style.position = saved.bodyPosition || '';
      body.style.top = saved.bodyTop || '';
      body.style.left = saved.bodyLeft || '';
      body.style.right = saved.bodyRight || '';
      body.style.width = saved.bodyWidth || '';
      body.style.overflow = saved.bodyOverflow || '';
      _tfPageScrollStyles = null;
      var restoreY = _tfPageScrollY;
      var restoreLists = saved.listScrolls || [];
      function restoreUnderlyingScroll() {
          try { window.scrollTo(0, restoreY); } catch (e) {}
          for (var ri = 0; ri < restoreLists.length; ri++) {
              if (restoreLists[ri].el && restoreLists[ri].el.isConnected) restoreLists[ri].el.scrollTop = restoreLists[ri].top;
          }
      }
      // Restore synchronously before the closing panel is hidden. Otherwise
      // Safari can reveal the real underlying page for one frame at its
      // reset scroll position, which looks like a final jump after a swipe.
      restoreUnderlyingScroll();
      // Safari may reset a scroll position on the frame after fixed-body
      // styles are removed. Restore twice more so the list remains exactly
      // where it was after that delayed layout pass.
      requestAnimationFrame(function() {
          restoreUnderlyingScroll();
          requestAnimationFrame(restoreUnderlyingScroll);
      });
  }

  // Whether freezing the body is warranted at all. A fixed full-screen panel
  // already stops desktop pointer input reaching the page beneath it, and
  // freezing there can leave document-backed lists unable to scroll after a
  // close — so the lock is for touch devices at phone width only.
  function tfNeedsOuterPageScrollLock() {
      var hasTouch = ('ontouchstart' in window) || (window.navigator && window.navigator.maxTouchPoints > 0);
      return !!hasTouch && (!window.matchMedia || window.matchMedia('(max-width: 768px)').matches);
  }

  function tfEnsureOuterPageScrollUnlocked() {
      // A form can be closed by a native history gesture while another
      // close path is already in flight. Once no panels remain, never leave
      // the desktop page locked because of a stale reference count.
      if (!TabFormPanelStack.isEmpty()) return;
      while (_tfPageScrollLockCount > 0) tfUnlockOuterPageScroll();
  }

  return Object.freeze({
    tfRestoreActiveListFocus,
    tfLockOuterPageScroll,
    tfUnlockOuterPageScroll,
    tfNeedsOuterPageScrollLock,
    tfEnsureOuterPageScrollUnlocked,
  });
}

export { createTabFormScrollLock };
