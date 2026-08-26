function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`TabForm edge-back requires ${name}()`);
  }
}

function createTabFormEdgeBackController({
  panel,
  window,
  isEnabled,
  flushDraft,
  isDirty,
  confirmDiscard,
  clearDirty,
  updateSaveButton,
  finishBack,
  requestBack,
  schedule = setTimeout,
  now = () => Date.now(),
} = {}) {
  if (!panel || typeof panel.addEventListener !== 'function' || !panel.style) {
    throw new TypeError('TabForm edge-back requires a panel');
  }
  if (!window || typeof window !== 'object') {
    throw new TypeError('TabForm edge-back requires a window');
  }
  const callbacks = {
    isEnabled,
    flushDraft,
    isDirty,
    confirmDiscard,
    clearDirty,
    updateSaveButton,
    finishBack,
    requestBack,
    schedule,
    now,
  };
  Object.entries(callbacks).forEach(([name, value]) => requireFunction(value, name));

  let touch = null;
  let closing = false;
  let confirming = false;

  function enabled() {
    return Boolean(isEnabled()) && panel.style.display !== 'none';
  }

  function setOffset(px, animate) {
    panel.style.transition = animate ? 'transform 180ms ease-out' : 'none';
    panel.style.transform = px ? `translate3d(${px}px,0,0)` : '';
  }

  function complete() {
    closing = true;
    setOffset(Math.max(panel.clientWidth || 0, window.innerWidth || 0), true);
    schedule(() => {
      setOffset(0, false);
      closing = false;
      finishBack();
    }, 180);
  }

  function commit() {
    if (!enabled()) return false;
    if (closing) return true;
    flushDraft();
    if (!isDirty()) {
      complete();
      return true;
    }
    if (confirming) return true;
    confirming = true;
    Promise.resolve(confirmDiscard()).then((confirmed) => {
      confirming = false;
      if (!confirmed) {
        setOffset(0, true);
        return;
      }
      clearDirty();
      updateSaveButton();
      complete();
    }).catch(() => {
      confirming = false;
      setOffset(0, true);
    });
    return true;
  }

  panel.addEventListener('touchstart', (event) => {
    if (!enabled() || !event.touches || event.touches.length !== 1) {
      touch = null;
      return;
    }
    const point = event.touches[0];
    const time = event.timeStamp || now();
    touch = point.clientX <= 32 ? {
      x: point.clientX,
      y: point.clientY,
      lastX: point.clientX,
      lastTime: time,
      velocityX: 0,
      horizontal: false,
    } : null;
  }, { passive: true });

  panel.addEventListener('touchmove', (event) => {
    if (!touch || !enabled() || !event.touches || event.touches.length !== 1) return;
    const point = event.touches[0];
    const dx = point.clientX - touch.x;
    const dy = point.clientY - touch.y;
    const time = event.timeStamp || now();
    const elapsed = Math.max(1, time - touch.lastTime);
    const stepX = point.clientX - touch.lastX;
    touch.velocityX = Math.max(0, (stepX / elapsed) * 0.7 + touch.velocityX * 0.3);
    touch.lastX = point.clientX;
    touch.lastTime = time;
    if (dx > 4 && Math.abs(dx) > Math.abs(dy)) {
      touch.horizontal = true;
      event.preventDefault();
      if (enabled()) setOffset(Math.min(dx * 0.85, window.innerWidth || 0), false);
    }
  }, { passive: false });

  panel.addEventListener('touchend', (event) => {
    const gesture = touch;
    touch = null;
    if (!gesture || !enabled() || !gesture.horizontal) return;
    const travel = gesture.lastX - gesture.x;
    const releasedAt = event.timeStamp || now();
    const releaseVelocity = releasedAt - gesture.lastTime > 120 ? 0 : gesture.velocityX;
    const closeThreshold = Math.max(
      120,
      Math.min(180, (window.innerWidth || panel.clientWidth || 360) * 0.32),
    );
    if (travel < closeThreshold || releaseVelocity < 0.75) {
      setOffset(0, true);
      return;
    }
    requestBack('swipe');
  }, { passive: true });

  panel.addEventListener('touchcancel', () => {
    touch = null;
    if (enabled() && !closing) setOffset(0, true);
  }, { passive: true });

  return Object.freeze({
    commit,
    reset() {
      touch = null;
      closing = false;
      confirming = false;
      setOffset(0, false);
    },
  });
}

export { createTabFormEdgeBackController };
