// Keep every app-owned pull-to-refresh indicator on the same release
// animation: snap into a stable refresh position, then retract when its
// actual refresh promise settles.
function fSetPullIndicatorRefreshing(indicator, refreshing) {
  if (!indicator) return;
  if (refreshing) {
    indicator.classList.add('f-refreshing');
    indicator.style.height = '44px';
  } else {
    indicator.classList.remove('f-refreshing', 'f-flip');
    indicator.style.height = '0';
  }
}

function fSetPullIndicatorOffset(indicator, distance) {
  if (!indicator) return;
  var offset = Math.min(Math.max(0, distance || 0) * 0.5, 70);
  indicator.style.height = offset + 'px';
}

export { fSetPullIndicatorOffset, fSetPullIndicatorRefreshing };
