// Version-conflict handling for TabForm splits into two halves: deciding what
// the merged record should be, and describing the overlap to the user. Both are
// pure, so they live here and leave only the state mutation in the form itself.

const TERMINAL_DRAFT_STATUSES = ['SUBMITTED', 'CANCELLED'];

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    throw new TypeError(`TabForm conflict requires ${name}()`);
  }
}

// Long objects are truncated rather than wrapped so a conflicting row stays a
// single scannable line in the choice dialog.
function formatConflictValue(value, { translate } = {}) {
  requireFunction(translate, 'translate');
  if (value === undefined || value === null || value === '') return translate('common.blank');
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  }
  return String(value);
}

function buildConflictChoiceHtml(conflicts, { escapeHtml, translate, language } = {}) {
  requireFunction(escapeHtml, 'escapeHtml');
  requireFunction(translate, 'translate');
  const isEnglish = language === 'en';
  const intro = isEnglish
    ? 'The same fields were changed locally and on the server. Choose how to resolve these overlapping changes.'
    : '你與伺服器同時修改了以下欄位，請選擇如何處理這些重疊修改。';
  let html = `<div style="text-align:left;max-height:52vh;overflow:auto"><p>${escapeHtml(intro)}</p><ul>`;
  (conflicts || []).forEach((conflict) => {
    html += `<li><strong>${escapeHtml(conflict.path)}</strong><br>`
      + `<span style="color:var(--text-secondary)">${escapeHtml(isEnglish ? 'Mine: ' : '我的值：')}`
      + `${escapeHtml(formatConflictValue(conflict.local, { translate }))}</span><br>`
      + `<span style="color:var(--warning,#b45309)">${escapeHtml(isEnglish ? 'Server: ' : '伺服器值：')}`
      + `${escapeHtml(formatConflictValue(conflict.server, { translate }))}</span></li>`;
  });
  return `${html}</ul></div>`;
}

// The server record only carries canonical persisted fields, so it is overlaid
// onto the base before merging to keep local UI-only keys alive.
function mergeConflictState({ base, local, server, recordConflict } = {}) {
  if (!recordConflict || typeof recordConflict.threeWayMerge !== 'function') {
    throw new TypeError('TabForm conflict requires a recordConflict module');
  }
  const overlaidServer = recordConflict.overlayServerRecord(
    recordConflict.cloneValue(base || {}),
    server,
  );
  const conflicts = [];
  const merged = recordConflict.threeWayMerge(
    recordConflict.cloneValue(base || {}),
    local || {},
    overlaidServer,
    '',
    conflicts,
  );
  return { merged, conflicts, server: overlaidServer };
}

function applyServerChoice({ merged, conflicts, recordConflict } = {}) {
  if (!recordConflict || typeof recordConflict.setPath !== 'function') {
    throw new TypeError('TabForm conflict requires a recordConflict module');
  }
  (conflicts || []).forEach((conflict) => {
    recordConflict.setPath(merged, conflict.path, conflict.server);
  });
  return merged;
}

// The three answers the choice dialog can come back with, named rather than
// spelled out at each call site: they are confirmAsync3's slots, so "skip"
// meaning "use the server's values" is not guessable from the word.
const CONFLICT_CHOICE = Object.freeze({
  MINE: 'ok',
  SERVER: 'skip',
  LATER: 'cancel',
});

// Both worlds must offer the same three answers in the same words.
function conflictChoiceLabels(language) {
  const isEnglish = language === 'en';
  return {
    ok: isEnglish ? 'Keep mine' : '保留我的修改',
    skip: isEnglish ? 'Use server' : '使用伺服器版本',
    cancel: isEnglish ? 'Review later' : '稍後處理',
  };
}

// Where a rejected save carries the server's current record. A conflict
// without one cannot be merged and the caller has to report it instead.
function conflictFreshRecord(result) {
  const fresh = result && (result.freshData || result.record);
  return fresh && typeof fresh === 'object' ? fresh : null;
}

// Settle a prepared merge with the user's answer.
//
// Returns null when the user chose to review later, which means nothing is
// adopted — not the merge, not the server's values. An empty conflict list
// never asks: the merge already combines both sides without overlap.
function applyConflictChoice({ prepared, choice, recordConflict } = {}) {
  if (!prepared) throw new TypeError('TabForm conflict requires a prepared merge');
  if (!prepared.conflicts || !prepared.conflicts.length) return prepared;
  if (choice === CONFLICT_CHOICE.LATER) return null;
  if (choice === CONFLICT_CHOICE.SERVER) {
    applyServerChoice({
      merged: prepared.merged,
      conflicts: prepared.conflicts,
      recordConflict,
    });
  }
  return prepared;
}

// A draft that the server already submitted or cancelled cannot become editable
// again, so the caller recovers instead of offering a misleading merge.
function readTerminalDraftStatus(fresh) {
  if (!fresh || typeof fresh !== 'object') return null;
  const status = String(fresh._recordState || fresh.status || '').toUpperCase();
  return TERMINAL_DRAFT_STATUSES.includes(status) ? status : null;
}

export {
  CONFLICT_CHOICE,
  applyConflictChoice,
  applyServerChoice,
  conflictChoiceLabels,
  conflictFreshRecord,
  buildConflictChoiceHtml,
  formatConflictValue,
  mergeConflictState,
  readTerminalDraftStatus,
};
