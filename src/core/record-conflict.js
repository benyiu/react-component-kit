function cloneValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && Object.prototype.toString.call(value) === '[object Object]';
}

function deleteSloppyProperty(target, key) {
  if (target == null) return target[key];
  return Reflect.deleteProperty(Object(target), key);
}

function setSloppyProperty(target, key, readValue) {
  if (target == null) return target[key];
  const value = readValue();
  return Reflect.set(Object(target), key, value, target);
}

// Mounted form adapters retain the working model by reference. Reconcile a
// canonical response into that object while allowing the legacy owner to be
// re-read after an accessor or Proxy callback re-enters the form lifecycle.
function adoptWorkingValue(current, next, readCurrent) {
  const read = typeof readCurrent === 'function'
    ? readCurrent
    : function() { return current; };
  if (isPlainObject(read()) && isPlainObject(next) && read() !== next) {
    Object.keys(read()).forEach(function(key) {
      // This operation used to run in a sloppy classic script. A refused
      // delete must leave the property in place without aborting adoption.
      deleteSloppyProperty(read(), key);
    });
    Object.keys(next).forEach(function(key) {
      // Clone only after every stale key has been removed, and ignore a false
      // set result to retain the classic script's rejected-write semantics.
      const target = read();
      setSloppyProperty(target, key, function() {
        return cloneValue(next[key]);
      });
    });
    return read();
  }
  return next;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.keys(value).sort().forEach(function(key) {
    if (value[key] !== undefined) out[key] = stableValue(value[key]);
  });
  return out;
}

function sameValue(a, b) {
  return JSON.stringify(stableValue(a)) === JSON.stringify(stableValue(b));
}

function overlayServerRecord(base, fresh) {
  if (!isPlainObject(base) || !isPlainObject(fresh)) return cloneValue(fresh);
  const out = cloneValue(base) || {};
  Object.keys(fresh).forEach(function(key) {
    out[key] = isPlainObject(out[key]) && isPlainObject(fresh[key])
      ? overlayServerRecord(out[key], fresh[key])
      : cloneValue(fresh[key]);
  });
  return out;
}

function isServerMetadataKey(key) {
  return key === '_version' || key === 'version' || key === '_updatedAt' ||
    key === 'updatedAt' || key === 'updated_at' || key === '_draftId' ||
    key === '_draftVersion' || key === '_recordState';
}

function threeWayMerge(base, local, server, path, conflicts) {
  if (sameValue(local, base)) return cloneValue(server);
  if (sameValue(server, base) || sameValue(local, server)) return cloneValue(local);
  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(server)) {
    const merged = {};
    const keys = {};
    Object.keys(base).forEach(function(key) { keys[key] = true; });
    Object.keys(local).forEach(function(key) { keys[key] = true; });
    Object.keys(server).forEach(function(key) { keys[key] = true; });
    Object.keys(keys).forEach(function(key) {
      const childPath = path ? path + '.' + key : key;
      let value;
      if (isServerMetadataKey(key)) value = cloneValue(server[key]);
      else value = threeWayMerge(base[key], local[key], server[key], childPath, conflicts);
      if (value !== undefined) merged[key] = value;
    });
    return merged;
  }
  conflicts.push({
    path: path || 'record',
    base: cloneValue(base),
    local: cloneValue(local),
    server: cloneValue(server),
  });
  return cloneValue(local);
}

function setPath(target, path, value) {
  const parts = String(path || '').split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isPlainObject(cursor[parts[i]])) cursor[parts[i]] = {};
    cursor = cursor[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cursor[last];
  else cursor[last] = cloneValue(value);
}

const RecordConflict = Object.freeze({
  cloneValue,
  isPlainObject,
  adoptWorkingValue,
  sameValue,
  overlayServerRecord,
  threeWayMerge,
  setPath,
});

export { RecordConflict };
