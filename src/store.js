/**
 * Per-session pending annotation state with localStorage persistence.
 *
 * The store keeps immutable arrays so React `useSyncExternalStore` snapshots
 * stay referentially stable between mutations. localStorage is best-effort:
 * failures keep the in-memory state usable for the current page.
 */

const ANNOTATION_STORAGE_PREFIX = 'dsh-annotation.v1.';
const ANNOTATION_EMPTY_LIST = Object.freeze([]);

const annotationStore = (function createAnnotationStore() {
  const sessions = new Map();
  const listeners = new Set();

  function storageKey(sessionId) {
    return ANNOTATION_STORAGE_PREFIX + sessionId;
  }

  function getStorage() {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return null;
      return localStorage;
    } catch (error) {
      return null;
    }
  }

  function notify() {
    for (const listener of Array.from(listeners)) {
      if (typeof listener !== 'function') continue;
      try {
        listener();
      } catch (error) {
        try {
          console.error('[dsh-annotation] store listener failed:', error);
        } catch (ignored) {
          /* ignore */
        }
      }
    }
  }

  function readPersisted(sessionId) {
    const storage = getStorage();
    if (storage === null) return ANNOTATION_EMPTY_LIST;
    let raw = null;
    try {
      raw = storage.getItem(storageKey(sessionId));
    } catch (error) {
      return ANNOTATION_EMPTY_LIST;
    }
    if (raw === null || raw === '') return ANNOTATION_EMPTY_LIST;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return ANNOTATION_EMPTY_LIST;
    }
    if (!Array.isArray(parsed)) return ANNOTATION_EMPTY_LIST;
    const list = [];
    for (const item of parsed) {
      const annotation = normalizeStoredAnnotation(item);
      if (annotation === null) continue;
      list.push(annotation);
      if (list.length >= ANNOTATION_MAX_ITEMS) break;
    }
    return list.length === 0 ? ANNOTATION_EMPTY_LIST : list;
  }

  function writePersisted(sessionId, list) {
    const storage = getStorage();
    if (storage === null) return;
    try {
      if (list.length === 0) storage.removeItem(storageKey(sessionId));
      else storage.setItem(storageKey(sessionId), JSON.stringify(list));
    } catch (error) {
      try {
        console.warn('[dsh-annotation] could not persist annotations:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }

  function setList(sessionId, list) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return;
    const previous = sessions.get(sessionId);
    if (previous === list) return;
    sessions.set(sessionId, list);
    writePersisted(sessionId, list);
    notify();
  }

  /** Immutable snapshot for one session; empty list when unknown. */
  function get(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return ANNOTATION_EMPTY_LIST;
    const cached = sessions.get(sessionId);
    if (cached !== undefined) return cached;
    const loaded = readPersisted(sessionId);
    sessions.set(sessionId, loaded);
    return loaded;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function noop() {};
    listeners.add(listener);
    let active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  function add(sessionId, annotation) {
    const normalized = normalizeStoredAnnotation(annotation);
    if (normalized === null) return null;
    const list = get(sessionId);
    if (list.length >= ANNOTATION_MAX_ITEMS) return null;
    setList(sessionId, list.concat([normalized]));
    return normalized;
  }

  function update(sessionId, id, patch) {
    const list = get(sessionId);
    let changed = false;
    const next = list.map(function applyPatch(annotation) {
      if (annotation.id !== id) return annotation;
      changed = true;
      return {
        ...annotation,
        ...(patch && typeof patch.comment === 'string'
          ? { comment: patch.comment } : {}),
      };
    });
    if (changed) setList(sessionId, next);
    return changed;
  }

  function remove(sessionId, id) {
    const list = get(sessionId);
    const next = list.filter(function keep(annotation) { return annotation.id !== id; });
    if (next.length === list.length) return false;
    setList(sessionId, next);
    return true;
  }

  function clear(sessionId) {
    const list = get(sessionId);
    if (list.length === 0) return;
    setList(sessionId, ANNOTATION_EMPTY_LIST);
  }

  function findByRange(sessionId, nodeKey, start, end, quote) {
    return findAnnotationByRange(get(sessionId), nodeKey, start, end, quote);
  }

  /** Count helper for surfaces that do not need the list itself. */
  function count(sessionId) {
    return get(sessionId).length;
  }

  /** Remove exactly the annotations consumed by one send, keeping newer ones. */
  function removeMany(sessionId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const wanted = new Set(ids);
    const list = get(sessionId);
    const next = list.filter(function keep(annotation) {
      return !wanted.has(annotation.id);
    });
    if (next.length !== list.length) setList(sessionId, next);
  }

  return {
    storageKey,
    get,
    subscribe,
    add,
    update,
    remove,
    removeMany,
    clear,
    findByRange,
    count,
  };
})();

const ANNOTATION_SENT_STORAGE_PREFIX = 'dsh-annotation.sent.v1.';
const ANNOTATION_SENT_MAX_ITEMS = 1000;

/**
 * Read-only archive of annotations that were already sent in one Session.
 * It feeds the persistent comment bubbles on assistant replies; the pending
 * store above remains the composer draft.
 */
const annotationSentStore = (function createAnnotationSentStore() {
  const sessions = new Map();
  const listeners = new Set();

  function storageKey(sessionId) {
    return ANNOTATION_SENT_STORAGE_PREFIX + sessionId;
  }

  function getStorage() {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return null;
      return localStorage;
    } catch (error) {
      return null;
    }
  }

  function notify() {
    for (const listener of Array.from(listeners)) {
      if (typeof listener !== 'function') continue;
      try {
        listener();
      } catch (error) {
        try {
          console.error('[dsh-annotation] sent store listener failed:', error);
        } catch (ignored) {
          /* ignore */
        }
      }
    }
  }

  function readPersisted(sessionId) {
    const storage = getStorage();
    if (storage === null) return ANNOTATION_EMPTY_LIST;
    let raw = null;
    try {
      raw = storage.getItem(storageKey(sessionId));
    } catch (error) {
      return ANNOTATION_EMPTY_LIST;
    }
    if (raw === null || raw === '') return ANNOTATION_EMPTY_LIST;
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return ANNOTATION_EMPTY_LIST;
    }
    if (!Array.isArray(parsed)) return ANNOTATION_EMPTY_LIST;
    const list = [];
    for (const item of parsed) {
      const annotation = normalizeStoredAnnotation(item);
      if (annotation === null) continue;
      list.push(annotation);
      if (list.length >= ANNOTATION_SENT_MAX_ITEMS) break;
    }
    return list.length === 0 ? ANNOTATION_EMPTY_LIST : list;
  }

  function writePersisted(sessionId, list) {
    const storage = getStorage();
    if (storage === null) return;
    try {
      if (list.length === 0) storage.removeItem(storageKey(sessionId));
      else storage.setItem(storageKey(sessionId), JSON.stringify(list));
    } catch (error) {
      try {
        console.warn('[dsh-annotation] could not persist sent annotations:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }

  function setList(sessionId, list) {
    sessions.set(sessionId, list);
    writePersisted(sessionId, list);
    notify();
  }

  function get(sessionId) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return ANNOTATION_EMPTY_LIST;
    const cached = sessions.get(sessionId);
    if (cached !== undefined) return cached;
    const loaded = readPersisted(sessionId);
    sessions.set(sessionId, loaded);
    return loaded;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function noop() {};
    listeners.add(listener);
    let active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  /** One identity per annotated passage, regardless of how it was archived. */
  function contentKey(annotation) {
    return annotation.nodeKey + '\u0000' + annotation.quote + '\u0000' + annotation.comment;
  }

  /**
   * Archive the annotations a successful send attached. Entries from the send
   * hook carry real offsets; entries backfilled from a rendered sent card only
   * know the excerpt, so a real-offset entry wins over a zero-offset one.
   */
  function addMany(sessionId, list) {
    if (typeof sessionId !== 'string' || sessionId.length === 0 || !Array.isArray(list)) return;
    const merged = new Map();
    for (const annotation of get(sessionId)) merged.set(contentKey(annotation), annotation);
    for (const annotation of list) {
      const normalized = normalizeStoredAnnotation(annotation);
      if (normalized === null) continue;
      const key = contentKey(normalized);
      const existing = merged.get(key);
      if (existing !== undefined && existing.start > 0 && !(normalized.start > 0)) continue;
      merged.set(key, normalized);
    }
    const next = Array.from(merged.values()).slice(-ANNOTATION_SENT_MAX_ITEMS);
    sessions.set(sessionId, next);
    writePersisted(sessionId, next);
    notify();
  }

  function clear(sessionId) {
    if (get(sessionId).length === 0) return;
    setList(sessionId, ANNOTATION_EMPTY_LIST);
  }

  return { get, subscribe, addMany, clear, storageKey };
})();
