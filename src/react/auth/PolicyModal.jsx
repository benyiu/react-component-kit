// The privacy policy and terms-of-service reader.
//
// The first piece of Phase 4's auth surface to convert, and deliberately the
// smallest: it holds no credentials, reads no session, and its only state is
// which of two documents is open. Its markup leaves cdd-screening.html, which
// is what Phase 4 is ultimately for.
//
// The classic version wrote `textContent` into a static overlay and toggled an
// `active` class. Both documents are plain text with newlines, which is why
// the body keeps `white-space: pre-wrap` rather than being marked up.
import { useCallback, useEffect, useState } from 'react';
import { useDeps, useT } from '../deps.jsx';

// Which document, not how it looks — the translation keys are the model.
const POLICIES = Object.freeze({
  privacy: { title: 'terms.privacyTitle', body: 'terms.privacyBody' },
  terms: { title: 'terms.tosTitle', body: 'terms.tosBody' },
});

function PolicyModal() {
  const t = useT();
  const { subscribePolicyRequests } = useDeps();
  const [policy, setPolicy] = useState(null);

  const close = useCallback(() => setPolicy(null), []);

  // The links that open this live in markup the shell still owns, so the
  // request arrives through a store rather than a prop.
  useEffect(() => {
    if (!subscribePolicyRequests) return undefined;
    // An unknown key resolves to no document below, so it is stored as-is
    // rather than being filtered twice.
    return subscribePolicyRequests((requested) => setPolicy(requested));
  }, [subscribePolicyRequests]);

  // Escape closes it, as any reader would expect of a document overlay.
  useEffect(() => {
    if (!policy) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [policy, close]);

  const chosen = policy ? POLICIES[policy] : null;

  return (
    <div
      className={`f-confirm-overlay${chosen ? ' active' : ''}`}
      id="fPolicyOverlay"
      style={{ zIndex: 100001 }}
      // Clicking the backdrop closes; clicking the document itself does not.
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div
        className="f-confirm-box"
        style={{ maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
      >
        <h3 id="fPolicyTitle">{chosen ? t(chosen.title) : ''}</h3>
        <div
          id="fPolicyBody"
          style={{
            whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.8, color: '#555',
          }}
        >
          {chosen ? t(chosen.body) : ''}
        </div>
        <div className="f-confirm-btns" style={{ justifyContent: 'center', marginTop: '16px' }}>
          <button
            type="button"
            style={{
              padding: '7px 24px', borderRadius: '5px', border: '1px solid #d0d0d0',
              background: '#f5f5f5', color: '#555', fontSize: '13px', cursor: 'pointer',
            }}
            onClick={close}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

export { POLICIES, PolicyModal };
