// Which policy document the reader asked for.
//
// The links that open one live in markup the shell still owns during Phase 4,
// so the request has to cross from that world into React. A store is the seam
// the migration already uses for exactly this.
//
// It carries a request rather than a state: two clicks on the same link are
// two requests, so the token distinguishes them and reopening works.

let request = { policy: null, token: 0 };
const listeners = new Set();

function notify() {
  for (const listener of [...listeners]) listener(request.policy, request.token);
}

function requestPolicy(policy) {
  request = { policy, token: request.token + 1 };
  notify();
}

function listenerCount() {
  return listeners.size;
}

function subscribePolicyRequests(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// For tests, which must not inherit a request from the case before.
function resetPolicyRequests() {
  request = { policy: null, token: 0 };
  listeners.clear();
}

const PolicyStore = Object.freeze({
  requestPolicy,
  subscribePolicyRequests,
  resetPolicyRequests,
  getRequest: () => request,
  // Exposed so a test can assert a torn-down reader actually let go, which
  // is otherwise invisible: a leaked listener sets state on a dead tree and
  // React merely warns.
  listenerCount: () => listeners.size,
});

export {
  PolicyStore, listenerCount, requestPolicy, resetPolicyRequests,
  subscribePolicyRequests,
};
