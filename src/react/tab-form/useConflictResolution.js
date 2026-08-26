// What a React form does when a save comes back rejected because someone else
// saved first.
//
// The classic pipeline has answered this since long before the migration, and
// the answer is not "show an error". It three-way merges what the user has in
// front of them against what the server now holds, and asks only about the
// fields both sides actually changed. A ported form that skipped this would
// look correct and quietly let one user overwrite another's edit.
//
// Everything decided here comes from the shared pure layer in
// tab-form-conflict.js, so both worlds merge alike and offer the same three
// answers in the same words.
import { useCallback } from 'react';
import {
  applyConflictChoice,
  buildConflictChoiceHtml,
  conflictChoiceLabels,
  conflictFreshRecord,
  mergeConflictState,
  readTerminalDraftStatus,
} from '../../ui/tab-form-conflict.js';
import { RecordConflict } from '../../core/record-conflict.js';
import { useDeps } from '../deps.jsx';

// The outcome a form acts on.
//
// `resolved` carries the record to adopt and the server state that becomes the
// new baseline. `deferred` means the user chose to review later and nothing
// changes. `unmergeable` means the server sent no record to merge against, so
// all the form can do is report it.
// `draft-cancelled` and `draft-submitted` are the two answers that are not a
// merge at all: the draft this form is editing stopped existing while the
// save was in flight, so there is nothing to merge into. Merging anyway would
// hand the user a form that looks editable and saves into a row that is gone.
const CONFLICT_OUTCOME = Object.freeze({
  RESOLVED: 'resolved',
  DEFERRED: 'deferred',
  UNMERGEABLE: 'unmergeable',
  DRAFT_CANCELLED: 'draft-cancelled',
  DRAFT_SUBMITTED: 'draft-submitted',
});

function useConflictResolution() {
  const {
    t, getLanguage, confirmAsync3, escapeHtml, recordConflict = RecordConflict,
    loadSubmittedRecordDraft,
  } = useDeps();

  return useCallback(async ({ result, base, local, entityType, serverDraft }) => {
    const server = conflictFreshRecord(result);
    if (!server) {
      return {
        outcome: CONFLICT_OUTCOME.UNMERGEABLE,
        message: (result && result.error) || t('client.saveConflict'),
      };
    }

    // Asked before the merge, never after: a terminal draft is not a
    // difference of opinion about field values, it is the row disappearing.
    const terminal = serverDraft ? readTerminalDraftStatus(server) : null;
    if (terminal === 'CANCELLED') {
      return { outcome: CONFLICT_OUTCOME.DRAFT_CANCELLED, message: t('common.draftAlreadyCancelled') };
    }
    if (terminal === 'SUBMITTED') {
      const submittedId = server._submittedEntityId || server.submittedEntityId;
      try {
        const canonical = await loadSubmittedRecordDraft(entityType, submittedId);
        // Copied, not adopted in place. adoptWorkingValue keeps the mounted
        // model's identity — which is what the classic form wanted and what
        // React must not have: setData with the same reference does not
        // re-render, and the form would keep showing the draft it just left.
        // It also drops keys the canonical record does not have, which is why
        // the draft's own identity (_draftId, _draftVersion) needs no
        // deleting: a save carrying those would aim at a row that is gone.
        const adopted = { ...recordConflict.adoptWorkingValue(local, canonical, () => local) };
        adopted._recordState = 'SUBMITTED';
        const dbId = adopted._dbId || adopted.id || submittedId || null;
        // Without an id the form would look editable and save into nothing.
        if (!dbId) throw new Error(t('common.draftInvalidResponse'));
        return {
          outcome: CONFLICT_OUTCOME.DRAFT_SUBMITTED,
          record: adopted,
          dbId,
          message: t('common.draftAlreadySubmitted'),
        };
      } catch (error) {
        // Terminal and unreadable: the form cannot safely become editable
        // again, so it closes rather than offering a misleading Save.
        return {
          outcome: CONFLICT_OUTCOME.DRAFT_CANCELLED,
          message: t('common.draftSubmittedReloadFail'),
        };
      }
    }

    const prepared = mergeConflictState({
      base: base || local || {},
      local: local || {},
      server,
      recordConflict,
    });

    // Only overlapping fields are a question. Everything else merges without
    // the user having to look at it.
    let choice = null;
    if (prepared.conflicts.length) {
      const language = getLanguage();
      choice = await confirmAsync3(
        buildConflictChoiceHtml(prepared.conflicts, {
          escapeHtml, translate: t, language,
        }),
        conflictChoiceLabels(language),
      );
    }

    const settled = applyConflictChoice({ prepared, choice, recordConflict });
    if (!settled) return { outcome: CONFLICT_OUTCOME.DEFERRED };

    return {
      outcome: CONFLICT_OUTCOME.RESOLVED,
      // What the form should now hold, and what its dirty comparison should
      // measure against — the server's state, not the merge, so the fields the
      // user kept still read as unsaved work.
      merged: settled.merged,
      server: settled.server,
      conflicts: settled.conflicts,
    };
  }, [t, getLanguage, confirmAsync3, escapeHtml, recordConflict, loadSubmittedRecordDraft]);
}

export { CONFLICT_OUTCOME, useConflictResolution };
