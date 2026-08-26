// Staging, submitting and abandoning a server draft.
//
// Extracted from RiskAssessmentForm when TransactionForm became its second
// consumer — which is also when its shape became answerable, rather than
// guessed from a plan. Both business records drive it identically; the
// remaining two are expected to as well, and any that does not will say so by
// not fitting.
//
// Every decision it makes is already shared: tfServerDraftRecord,
// tfSubmitRequest, tfSubmittedRecord and the two predicates live in
// tab-form-state.js and the classic pipeline runs the same ones. What is here
// is the sequencing around them, which genuinely differs between the two
// worlds because the state updates do.
import { useCallback } from 'react';
import {
  tfServerDraftRecord, tfSubmitRequest, tfSubmittedRecord,
} from '../../ui/tab-form-state.js';
import { useDeps, useT } from '../deps.jsx';

function useServerDraft({
  entityType,
  getState,        // () => { data, saving, mode }
  onConflict,      // (result) => Promise<void> — the form's shared merge
  apply,           // (patch) => void
  close,
  draft,           // the useFormDraft handle
  save,            // the record's own controller save
  draftParentId,
  draftRelatedId,
  buildPayload,
  onSaved,
}) {
  const t = useT();
  const {
    saveServerRecordDraft, deleteServerRecordDraft, showToast, confirmAsync,
    recordConflict,
  } = useDeps();

  // Stage the record server-side. Not a commit — the record stays a draft, and
  // its conditionally hidden values stay in this editing session so switching
  // the controlling field can still restore them.
  const stage = useCallback(async (state) => {
    if (state.saving) return false;
    apply({ saving: true });
    showToast(t('common.savingDraft'), 'saved');
    try {
      const result = await saveServerRecordDraft(
        entityType,
        draftParentId ? draftParentId(state.data) : null,
        draftRelatedId ? draftRelatedId(state.data) : null,
        buildPayload ? buildPayload(state.data) : state.data,
        state.data,
      );
      if (result && (result.conflict || result._conflict)) {
        await onConflict(result);
        return false;
      }
      const staged = tfServerDraftRecord(state.data, result);
      apply({
        data: staged,
        dbId: null,
        baseRecord: recordConflict.cloneValue(staged),
        dirty: false,
        redraw: staged,
      });
      draft.clear();
      showToast(t('common.draftSaved'), 'saved');
      return true;
    } catch (error) {
      showToast((error && error.message) || t('common.draftSaveFail'), 'deleted');
      return false;
    } finally {
      apply({ saving: false });
    }
  }, [
    entityType, apply, draftParentId, draftRelatedId, buildPayload,
    saveServerRecordDraft, onConflict, draft, showToast, t, recordConflict,
  ]);

  // Turn the draft into a real record.
  const submit = useCallback(async (state) => {
    if (state.saving || !save) return false;
    if (!(await confirmAsync(t('common.submitFormalConfirm')))) return false;

    // The in-flight model is written before the request, not after. If the
    // response is lost once the write has committed, a reload can resolve the
    // receipt to the real record instead of creating a second one.
    draft.flush({ ...state, mode: 'create', restoredDraft: false });
    apply({ saving: true });
    showToast(t('common.submittingFormal'), 'saved');
    try {
      const result = await save(state.data, true, tfSubmitRequest(state.data));
      if (result && (result.conflict || result._conflict)) {
        await onConflict(result);
        return false;
      }
      if (!result || !result.success) return false;

      const submitted = tfSubmittedRecord(state.data, result.savedData);
      // The server said yes but named nothing; carrying on would leave a later
      // save aiming at a row that does not exist.
      if (!submitted.dbId) throw new Error(t('common.draftInvalidResponse'));
      apply({
        data: submitted.record,
        dbId: submitted.dbId,
        mode: 'edit',
        baseRecord: recordConflict.cloneValue(submitted.record),
        dirty: false,
        clearConditionalFields: true,
        redraw: submitted.record,
      });
      draft.clear();
      showToast(t('common.submittedFormal'), 'saved');
      if (onSaved) onSaved(submitted.record);
      return true;
    } catch (error) {
      showToast((error && error.message) || t('common.draftSubmitFail'), 'deleted');
      return false;
    } finally {
      apply({ saving: false });
    }
  }, [save, confirmAsync, draft, apply, onConflict, onSaved, showToast, t, recordConflict]);

  // Abandon it. Confirmed first, because the staged work goes with it.
  const cancel = useCallback(async () => {
    if (!(await confirmAsync(t('common.cancelDraftConfirm')))) return false;
    try {
      const cancelled = await deleteServerRecordDraft(getState().data);
      if (cancelled && (cancelled.conflict || cancelled._conflict)) {
        await onConflict(cancelled);
        return false;
      }
      draft.clear();
      apply({ dirty: false });
      showToast(t('common.draftCancelled'), 'deleted');
      close();
      return true;
    } catch (error) {
      showToast((error && error.message) || t('common.draftCancelFail'), 'deleted');
      return false;
    }
  }, [confirmAsync, deleteServerRecordDraft, getState, onConflict, draft, apply, close, showToast, t]);

  return { stage, submit, cancel };
}

export { useServerDraft };
