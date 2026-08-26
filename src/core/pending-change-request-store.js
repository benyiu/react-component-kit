// The store's observable half is the house shape (src/core/store.js):
// subscribe/getSnapshot, which is deliberately what React's
// useSyncExternalStore expects. The profile badge renders from the snapshot
// (src/react/tab-form/ProfileBody.jsx); the injected onTotalChanged callback
// that used to reach the badge through the DOM is gone with its writer.
import { createStore } from './store.js';

function createPendingChangeRequestStore(options) {
  var request = options.request;
  var getActiveCompanyId = options.getActiveCompanyId;
  var canOpenChangeRequests = options.canOpenChangeRequests;
  var now = options.now;
  var schedule = options.schedule;

  var pendingByRecord = Object.create(null);
  var primeCompanyId = null;
  var primePromise = null;
  var primeLoadedAt = 0;
  var primeGeneration = 0;

  // What subscribers see. The house store notifies only when the value
  // actually changes, so a refresh that lands on the same count no longer
  // re-announces it — the old callback fired on every write because its one
  // listener repainted an element and repainting the same count was free.
  var badge = createStore({ total: 0 });

  function recordKey(entityType, entityId) {
    return String(entityType || '').toUpperCase() + ':' + String(entityId || '');
  }

  function publishTotal(total) {
    badge.update({ total: total });
  }

  function remember(changeRequest) {
    if (!changeRequest || !changeRequest.entityType || !changeRequest.entityId) return;
    var key = recordKey(changeRequest.entityType, changeRequest.entityId);
    var current = pendingByRecord[key];
    var changed = false;
    if (changeRequest.status === 'PENDING') {
      changed = !current || String(current.id || '') !== String(changeRequest.id || '') ||
        Number(current.version || 0) !== Number(changeRequest.version || 0);
      pendingByRecord[key] = changeRequest;
    } else if (current &&
        String(current.id || '') === String(changeRequest.id || '')) {
      Reflect.deleteProperty(pendingByRecord, key);
      changed = true;
    }
    if (changed) {
      primeLoadedAt = 0;
      primeGeneration++;
      // The old guard also asked `total >= 0`, which no assignment could make
      // false — every write was 0 or a length. Dead since the store was
      // extracted; dropped with the conversion to the observable shape.
      if (primeCompanyId === getActiveCompanyId()) {
        publishTotal(Object.keys(pendingByRecord).length);
      }
    }
  }

  function pendingForRecord(record, entityType) {
    if (!record) return null;
    var inline = record._pendingChangeRequest || record.pendingChangeRequest || null;
    if (inline && (!inline.status || inline.status === 'PENDING')) return inline;
    var inlineId = record._pendingChangeRequestId || record.pendingChangeRequestId;
    if (inlineId) {
      return {
        id: inlineId,
        status: 'PENDING',
        entityType: entityType,
        entityId: record._dbId || record.id,
      };
    }
    return pendingByRecord[recordKey(entityType, record._dbId || record.id)] || null;
  }

  function legacySet(target, property, value) {
    Reflect.set(Object(target), property, value, target);
  }

  function legacyDelete(target, property) {
    Reflect.deleteProperty(Object(target), property);
  }

  function adoptForRecord(response, record, entityType) {
    if (!record) return null;
    var hasInline = !!(response && (
      Object.prototype.hasOwnProperty.call(response, 'pendingChangeRequest') ||
      Object.prototype.hasOwnProperty.call(response, 'changeRequest')
    ));
    var changeRequest = response &&
      (response.pendingChangeRequest || response.changeRequest);
    if (!changeRequest) {
      changeRequest = record._pendingChangeRequest || record.pendingChangeRequest || null;
    }
    if (changeRequest && changeRequest.status === 'PENDING') {
      legacySet(record, '_pendingChangeRequest', changeRequest);
      remember(changeRequest);
      return changeRequest;
    }
    if (hasInline) {
      legacyDelete(record, '_pendingChangeRequest');
      var key = recordKey(entityType, record._dbId || record.id);
      if (pendingByRecord[key]) {
        Reflect.deleteProperty(pendingByRecord, key);
        primeLoadedAt = 0;
        primeGeneration++;
        publishTotal(Object.keys(pendingByRecord).length);
      }
    }
    return null;
  }

  function pendingSaveResult(response, fallbackRecord) {
    if (!response || !(response.pendingApproval || response.pending) ||
        !response.changeRequest) return null;
    var currentRecord = response.currentRecord || response.record || fallbackRecord || null;
    remember(response.changeRequest);
    schedule(function() { prime(true).catch(function() {}); }, 0);
    return {
      success: true,
      pending: true,
      pendingApproval: true,
      deletionRequested: !!response.deletionRequested,
      changeRequest: response.changeRequest,
      currentRecord: currentRecord,
      savedData: currentRecord,
    };
  }

  // Deliberately remains an ordinary function. Returning the shared promise
  // directly preserves strict identity for callers deduplicating an in-flight
  // company request.
  function prime(force) {
    var companyId = getActiveCompanyId();
    if (!companyId || !canOpenChangeRequests()) {
      publishTotal(0);
      return Promise.resolve([]);
    }
    if (primeCompanyId === companyId && primePromise) return primePromise;
    if (!force && primeCompanyId === companyId && primeLoadedAt &&
        now() - primeLoadedAt < 15000) {
      return Promise.resolve(Object.keys(pendingByRecord).map(function(key) {
        return pendingByRecord[key];
      }));
    }

    primeCompanyId = companyId;
    var startGeneration = primeGeneration;
    function loadPage(offset, collected) {
      return request(
        'GET',
        '/change-requests?status=PENDING&offset=' + offset + '&limit=100',
      ).then(function(response) {
        var items = response.changeRequests || [];
        var all = collected.concat(items);
        return response.hasMore ? loadPage(offset + items.length, all) : all;
      });
    }

    var nextPrimePromise = loadPage(0, []).then(function(items) {
      if (getActiveCompanyId() !== companyId) return [];
      if (startGeneration !== primeGeneration) {
        primeLoadedAt = 0;
        schedule(function() { prime(true).catch(function() {}); }, 0);
        return items;
      }
      var next = Object.create(null);
      for (var index = 0; index < items.length; index++) {
        var changeRequest = items[index];
        if (!changeRequest || changeRequest.status !== 'PENDING') continue;
        next[recordKey(changeRequest.entityType, changeRequest.entityId)] = changeRequest;
      }
      pendingByRecord = next;
      primeLoadedAt = now();
      // A subscriber that throws lands in this promise chain's catch, exactly
      // where the old callback's failures landed: the snapshot stays
      // installed, loadedAt is cleared by the catch, and prime resolves [].
      publishTotal(items.length);
      return items;
    }).catch(function() {
      primeLoadedAt = 0;
      return [];
    }).finally(function() {
      if (primePromise === nextPrimePromise) primePromise = null;
    });
    primePromise = nextPrimePromise;
    return primePromise;
  }

  function forgetSilently(entityTypeOrResolver, entityId) {
    // Capture the index before resolving a potentially getter-backed record
    // identity. This preserves the classic expression order of
    // `delete pendingByRecord[recordKey(...)]` if identity lookup re-enters a
    // company reset and replaces the live index.
    var target = pendingByRecord;
    var entityType = entityTypeOrResolver;
    if (typeof entityTypeOrResolver === 'function') {
      var identity = entityTypeOrResolver();
      entityType = identity && identity.entityType;
      entityId = identity && identity.entityId;
    }
    Reflect.deleteProperty(target, recordKey(entityType, entityId));
  }

  function resetForCompanyChange() {
    pendingByRecord = Object.create(null);
    primeCompanyId = null;
    primePromise = null;
    primeLoadedAt = 0;
    primeGeneration = Number(primeGeneration || 0) + 1;
    // The legacy reset left the zero unannounced, which the DOM badge could
    // afford: its writer repainted on the next explicit call. A subscriber
    // holds the snapshot it was last told about, so an unannounced zero would
    // leave the previous company's count on screen until something unrelated
    // re-rendered. Announcing it is the subscriber contract, not a new
    // behaviour of the reset.
    publishTotal(0);
  }

  return Object.freeze({
    remember: remember,
    pendingForRecord: pendingForRecord,
    adoptForRecord: adoptForRecord,
    pendingSaveResult: pendingSaveResult,
    prime: prime,
    forgetSilently: forgetSilently,
    resetForCompanyChange: resetForCompanyChange,
    subscribe: badge.subscribe,
    getSnapshot: badge.getSnapshot,
  });
}

export { createPendingChangeRequestStore };
