// ===== ListSync — central registry for cross-list record sync =====
// Keyed by dataType: every createListModule instance carrying one registers
// itself here. Save, create and delete paths then call ListSync.save(dataType,
// record, ctx) or ListSync.remove(dataType, record) rather than mutating a
// particular cache array by hand, so every list showing that dataType stays
// consistent and newly created records always land at the top.
//
// Scoped modules (e.g. client- or review-scoped sub-lists) supply an `ownsRecord`
// guard so a record only updates the lists whose current context matches it.
// This module is imported before any list module is constructed, so register()
// is available to the first one.
var ListSync = {
    _mods: {},  // dataType -> [moduleInstance, ...]
    // Parent aggregates are delivered by independent HTTP responses. Keep
    // their server-assigned relation revision outside any individual list
    // cache, so a cache refresh/replacement cannot make an older response
    // acceptable again.
    _patchVersions: {},
    register: function(mod) {
        if (!mod || !mod._dataType) return;
        var arr = this._mods[mod._dataType] || (this._mods[mod._dataType] = []);
        // Same instance → never registered twice (no growth on repeated registration).
        if (arr.indexOf(mod) !== -1) return;
        // Drop any PREVIOUS instance that shared this module's instanceName before
        // pushing the new one. This guarantees a module can never accumulate stale
        // copies of itself if it is ever re-created (e.g. lazy re-init on navigation),
        // which would otherwise be a slow memory leak in the registry.
        if (mod._instanceName) {
            for (var k = arr.length - 1; k >= 0; k--) {
                if (arr[k] !== mod && arr[k]._instanceName === mod._instanceName) arr.splice(k, 1);
            }
        }
        arr.push(mod);
    },
    // Explicitly drop a module from the registry (call on teardown if ever needed).
    unregister: function(mod) {
        if (!mod || !mod._dataType) return;
        var arr = this._mods[mod._dataType];
        if (!arr) return;
        var idx = arr.indexOf(mod);
        if (idx !== -1) arr.splice(idx, 1);
    },
    _recordId: function(record) {
        if (!record || typeof record !== 'object') return null;
        return record._dbId != null ? record._dbId : (record.id != null ? record.id : null);
    },
    _patchVersionKey: function(dataType, id, syncKey) {
        return String(dataType) + '\u0000' + String(id) + '\u0000' + String(syncKey);
    },
    _acceptPatchVersion: function(dataType, id, syncKey, syncVersion) {
        var version = Number(syncVersion);
        if (!syncKey || !Number.isInteger(version) || version < 0) return true;
        var key = this._patchVersionKey(dataType, id, syncKey);
        var hasCurrent = Object.prototype.hasOwnProperty.call(this._patchVersions, key);
        var current = hasCurrent ? Number(this._patchVersions[key]) : -1;
        if (hasCurrent && version < current) return false;
        if (!hasCurrent || version > current) this._patchVersions[key] = version;
        return true;
    },
    _hasKnownPatchVersion: function(dataType, id, patch) {
        if (!patch || typeof patch !== 'object') return false;
        var fields = Object.keys(patch);
        for (var i = 0; i < fields.length; i++) {
            var key = this._patchVersionKey(dataType, id, fields[i]);
            if (Object.prototype.hasOwnProperty.call(this._patchVersions, key)) return true;
        }
        return false;
    },
    // Internal dispatch methods deliberately do not publish events. RecordSync
    // owns the single public mutation path, while these remain available to it
    // without creating a save() → apply() recursion.
    //
    // `ownsRecord` is a *current scope membership* predicate.  A scoped
    // list must return true only when the incoming canonical record belongs
    // in the scope it currently represents (for example, its clientId or
    // reviewId matches the loaded parent).  That makes an upsert a full
    // reconciliation operation: a record moved out of a scope is removed
    // from its old cached list, while the list for its new scope can add it.
    // Patches and removals are intentionally routed by cached record ID
    // instead; neither needs relation metadata and neither may create a
    // phantom row in an unrelated scoped list.
    _save: function(dataType, record, ctx) {
        var arr = this._mods[dataType];
        if (!arr) return 0;
        var c = ctx || {};
        var updated = 0;
        // A renderer can lazily replace a module. Work from a snapshot so it
        // cannot disturb this mutation half way through its fan-out.
        arr.slice().forEach(function(mod) {
            if (!mod.ownsRecord || mod.ownsRecord(record, c)) {
                mod._syncRecord(record, c);
                updated++;
            } else if (mod._syncRemove(record, c)) {
                // The canonical replacement no longer belongs to this
                // scope.  Remove it only if this particular cache already
                // has the same id; other scoped lists remain untouched.
                updated++;
            }
        });
        return updated;
    },
    _remove: function(dataType, record, ctx) {
        var arr = this._mods[dataType];
        if (!arr) return 0;
        var c = ctx || {};
        var updated = 0;
        arr.slice().forEach(function(mod) {
            // Delete envelopes often carry just an id.  It is safe (and
            // necessary for scoped lists) to remove by cached id without
            // asking a membership predicate that cannot inspect it.
            if (mod._syncRemove(record, c)) updated++;
        });
        return updated;
    },
    _patch: function(dataType, id, patch, ctx) {
        var arr = this._mods[dataType];
        if (!arr || id == null || id === '') return 0;
        var c = ctx || {};
        var updated = 0;
        arr.slice().forEach(function(mod) {
            // A patch is merge-only and _syncPatch is a cache-miss no-op.
            // Route it to every list so a scoped row already in a cache
            // receives metadata-only changes even when the patch does not
            // repeat relation fields such as _clientId or _reviewId.
            if (mod._syncPatch && mod._syncPatch(patch || {}, c, id)) updated++;
        });
        return updated;
    },
    // Compatibility API. Existing ListSync.save/remove callers now travel
    // through RecordSync, so a legacy mutation updates caches and notifies
    // dependent TabForm labels in the same order as new API mutations.
    save: function(dataType, record, ctx) {
        if (typeof RecordSync !== 'undefined' && RecordSync && RecordSync.apply) {
            return RecordSync.apply({ type: dataType, op: 'upsert', record: record, context: ctx || {} });
        }
        return this._save(dataType, record, ctx);
    },
    remove: function(dataType, record, ctx) {
        if (typeof RecordSync !== 'undefined' && RecordSync && RecordSync.apply) {
            return RecordSync.apply({ type: dataType, op: 'remove', record: record, context: ctx || {} });
        }
        return this._remove(dataType, record, ctx);
    },
    // Patch only records already present in a cache. Unlike save(), a
    // partial parent-count patch must never manufacture a phantom list row.
    patch: function(dataType, id, patch, ctx) {
        if (typeof RecordSync !== 'undefined' && RecordSync && RecordSync.apply) {
            return RecordSync.apply({ type: dataType, op: 'patch', id: id, patch: patch || {}, context: ctx || {} });
        }
        return this._patch(dataType, id, patch, ctx);
    }
};

// ===== RecordSync — mutation/event layer above ListSync =================
// The server can return canonical records and authoritative parent patches
// in one `mutations` array. This layer fans each mutation into all cached
// list modules first, then informs dependent UI (for example TabForm count
// labels). ListSync remains a compatible shorthand for legacy callers.
var RecordSync = {
    _listeners: [],

    recordId: function(record) {
        return ListSync._recordId(record);
    },

    subscribe: function(listener) {
        if (typeof listener !== 'function') return function() {};
        this._listeners.push(listener);
        var self = this;
        return function() {
            var index = self._listeners.indexOf(listener);
            if (index !== -1) self._listeners.splice(index, 1);
        };
    },

    _emit: function(mutation) {
        this._listeners.slice().forEach(function(listener) {
            try { listener(mutation); }
            catch (e) { console.error('RecordSync listener failed:', e); }
        });
    },

    apply: function(mutation) {
        if (!mutation || !mutation.type) return null;
        var op = mutation.op || 'upsert';
        if (op === 'save') op = 'upsert';
        if (op === 'delete') op = 'remove';
        if (op !== 'upsert' && op !== 'patch' && op !== 'remove') return null;

        var record = mutation.record || null;
        var patch = mutation.patch || null;
        if (op === 'patch' && !patch) patch = record || {};
        var id = mutation.id != null ? mutation.id : this.recordId(record || patch);
        var context = mutation.context || mutation.ctx || {};
        var parsedSyncVersion = Number(mutation.syncVersion);
        var syncKey = (typeof mutation.syncKey === 'string' && mutation.syncKey &&
            Number.isInteger(parsedSyncVersion) && parsedSyncVersion >= 0) ? mutation.syncKey : '';
        var syncVersion = syncKey ? parsedSyncVersion : null;

        // An upsert needs a complete record and a patch needs a target.
        // Ignore malformed response entries rather than letting a list
        // renderer throw while trying to read an id from null.
        if (op === 'upsert' && !record) return null;
        if (op === 'patch' && (id == null || id === '')) return null;

        // A remove response can legitimately only contain its id. Give
        // existing ListSync modules the familiar record-shaped argument.
        if (op === 'remove' && !record && id != null) record = { id: id, _dbId: id };

        var event = {
            type: mutation.type,
            op: op,
            id: id,
            record: record,
            patch: patch,
            context: context,
            source: mutation.source || null,
            syncKey: syncKey,
            syncVersion: syncVersion
        };

        // Relation-count patches carry a D1-owned monotonic revision.
        // Never allow an earlier HTTP response to regress either a list
        // cache or a TabForm subscriber. Once a relation has moved to the
        // versioned protocol, reject an unversioned legacy patch for the
        // same count field as well.
        //
        // The TabForm subscriber this reasons about is real again: the open
        // review form subscribes from react/tab-form/ReviewForm.jsx. It did
        // not for the length of the React port, which left this rule true of
        // the list caches only — a distinction nothing recorded, because the
        // sentence had been written while both halves existed.
        if (op === 'patch') {
            if (syncKey) {
                if (!ListSync._acceptPatchVersion(event.type, id, syncKey, syncVersion)) return null;
            } else if (ListSync._hasKnownPatchVersion(event.type, id, patch)) {
                return null;
            }
        }

        if (op === 'upsert') ListSync._save(event.type, record, context);
        else if (op === 'patch') ListSync._patch(event.type, id, patch, context);
        else ListSync._remove(event.type, record, context);

        // Subscribers always observe the cache after its mutation. This
        // prevents a tab label from reading a stale live-list record.
        this._emit(event);
        return event;
    },

    applyMany: function(mutations, options) {
        if (mutations && !Array.isArray(mutations) && Array.isArray(mutations.mutations)) mutations = mutations.mutations;
        if (!Array.isArray(mutations)) return [];
        var out = [];
        for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            if (!mutation) continue;
            if (options && options.context && !mutation.context && !mutation.ctx) {
                mutation = Object.assign({}, mutation, { context: options.context });
            }
            var applied = this.apply(mutation);
            if (applied) out.push(applied);
        }
        return out;
    },

    applyResponse: function(response, options) {
        return this.applyMany(response && response.mutations, options);
    }
};

export { ListSync, RecordSync };
