/**
 * DOM selection capture and annotation anchor resolution.
 *
 * Only serializable facts are stored at selection time; live Ranges are never
 * retained across events. Every DOM read is defensive and fails closed.
 */

const ANNOTATION_SELECTION_DEBOUNCE_MS = 120;
const ANNOTATION_ASSISTANT_ROW_SELECTOR = '[data-chat-flow-kind="assistant-step"][data-chat-node-key]';

let annotationSelection = null;
const annotationSelectionListeners = new Set();
let annotationSelectionTimer = 0;
let annotationMessageResolver = null;
let annotationLocator = null;
let annotationActiveSession = null;

/** Session-scoped bridge records the mounted conversation session for root UI. */
function setAnnotationActiveSession(sessionId) {
  annotationActiveSession = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
}

function getAnnotationActiveSession() {
  return annotationActiveSession;
}


/**
 * One transient "where is this annotation" highlight. It lasts at most six
 * seconds and is cancelled by an unrelated user action (pointer press or key
 * press outside the plugin UI, or a new text selection). Scrolling must NOT
 * cancel it: the layer re-measures on scroll instead.
 */
const ANNOTATION_FLASH_MS = 6000;
let annotationFlash = null;
const annotationFlashListeners = new Set();
let annotationFlashTimer = 0;
let annotationFlashDismiss = null;

function notifyAnnotationFlash() {
  for (const listener of Array.from(annotationFlashListeners)) {
    if (typeof listener !== 'function') continue;
    try {
      listener();
    } catch (error) {
      try {
        console.error('[dsh-annotation] flash listener failed:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }
}

function getAnnotationFlash() {
  return annotationFlash;
}

function subscribeAnnotationFlash(listener) {
  if (typeof listener !== 'function') return function noop() {};
  annotationFlashListeners.add(listener);
  let active = true;
  return function unsubscribe() {
    if (!active) return;
    active = false;
    annotationFlashListeners.delete(listener);
  };
}

/** Detach the flash's dismiss listeners. */
function detachFlashDismiss() {
  const off = annotationFlashDismiss;
  annotationFlashDismiss = null;
  if (typeof off === 'function') {
    try { off(); } catch (error) { /* ignore */ }
  }
}

/**
 * Show one annotation's passage. Dismissed early by an unrelated pointer/key
 * action or a new selection; a scroll only re-measures the highlight.
 *
 * @param {object} annotation - annotation carrying nodeKey/quote/offsets.
 * @param {number} [durationMs] - maximum duration (default six seconds).
 */
function flashAnnotation(annotation, durationMs) {
  if (annotation === null || typeof annotation !== 'object') return;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : ANNOTATION_FLASH_MS;
  detachFlashDismiss();
  annotationFlash = annotation;
  notifyAnnotationFlash();
  try {
    if (annotationFlashTimer !== 0) clearTimeout(annotationFlashTimer);
    annotationFlashTimer = setTimeout(function timeoutFlash() {
      annotationFlashTimer = 0;
      detachFlashDismiss();
      annotationFlash = null;
      notifyAnnotationFlash();
    }, duration);
  } catch (error) {
    /* timer unavailable: keep the highlight until the next action */
  }
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  // Attach on the next task so the click that opened this flash never cancels it.
  setTimeout(function attachFlashDismiss() {
    if (annotationFlash !== annotation) return;
    const isPluginUi = function isPluginUi(event) {
      try {
        const target = event.target;
        return target !== null && target !== undefined && target.nodeType === 1
          && typeof target.closest === 'function'
          && target.closest('[data-dsh-annotation-ui]') !== null;
      } catch (error) {
        return false;
      }
    };
    const onPointerDown = function handlePointerDown(event) {
      if (isPluginUi(event)) return;
      clearAnnotationFlash();
    };
    const onKeyDown = function handleKeyDown(event) {
      if (isPluginUi(event)) return;
      clearAnnotationFlash();
    };
    const onSelectionChange = function handleSelectionChange() {
      try {
        const selection = document.getSelection();
        if (selection !== null && selection !== undefined && selection.rangeCount > 0 && !selection.isCollapsed) {
          clearAnnotationFlash();
        }
      } catch (error) {
        /* ignore */
      }
    };
    try {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('selectionchange', onSelectionChange);
    } catch (error) {
      return;
    }
    annotationFlashDismiss = function dismissFlashListeners() {
      try {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        document.removeEventListener('selectionchange', onSelectionChange);
      } catch (error) {
        /* ignore */
      }
    };
  }, 0);
}

/** Silent, bounded diagnostic log kept in localStorage for intermittent bugs. */
const ANNOTATION_DIAGNOSTIC_KEY = 'dsh-response-annotations.diagnostics.v1';
const ANNOTATION_DIAGNOSTIC_MAX = 200;

function readAnnotationDiagnostics() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return [];
    const raw = localStorage.getItem(ANNOTATION_DIAGNOSTIC_KEY);
    if (raw === null || raw === '') return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function recordAnnotationDiagnostic(entry) {
  if (entry === null || typeof entry !== 'object') return;
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return;
    const list = readAnnotationDiagnostics();
    list.push({
      time: new Date().toISOString(),
      kind: typeof entry.kind === 'string' ? entry.kind : 'event',
      message: typeof entry.message === 'string' ? entry.message : String(entry.message || ''),
      sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : null,
    });
    localStorage.setItem(ANNOTATION_DIAGNOSTIC_KEY, JSON.stringify(list.slice(-ANNOTATION_DIAGNOSTIC_MAX)));
  } catch (error) {
    /* diagnostics are best effort */
  }
}

function getAnnotationDiagnostics() {
  return readAnnotationDiagnostics();
}

function clearAnnotationDiagnostics() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return;
    localStorage.removeItem(ANNOTATION_DIAGNOSTIC_KEY);
  } catch (error) {
    /* ignore */
  }
}

/** Render the diagnostic log as clipboard-friendly text. */
function formatAnnotationDiagnostics() {
  const entries = readAnnotationDiagnostics();
  if (entries.length === 0) return '';
  return entries.map(function line(entry) {
    const when = typeof entry.time === 'string' ? entry.time : '';
    const kind = typeof entry.kind === 'string' ? entry.kind : 'event';
    const session = typeof entry.sessionId === 'string' ? ' session=' + entry.sessionId : '';
    return '[' + when + '] ' + kind + session + '\n' + (entry.message || '');
  }).join('\n\n');
}

/** Cmd/Ctrl+Alt+Shift+D copies the silent diagnostic log from anywhere. */
function installAnnotationDiagnosticsShortcut() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return function noop() {};
  }
  const onKeyDown = function handleDiagnosticsShortcut(event) {
    try {
      if (event === null || event === undefined || event.code !== 'KeyD') return;
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      const text = formatAnnotationDiagnostics();
      if (text.length === 0) {
        showAnnotationNotice(annotationTranslate(undefined, 'capsule.diagnosticsEmpty'));
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(text);
        showAnnotationNotice(annotationTranslate(undefined, 'capsule.diagnosticsCopied'));
      }
    } catch (error) {
      /* ignore */
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  return function disposeDiagnosticsShortcut() {
    try { document.removeEventListener('keydown', onKeyDown, true); } catch (error) { /* ignore */ }
  };
}

/** Capture only this plugin's uncaught errors so the log stays useful. */
function installAnnotationErrorCapture() {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return function noop() {};
  }
  const relevant = function isRelevant(text) {
    return /dsh-response-annotations|dsh-annotation/u.test(typeof text === 'string' ? text : '');
  };
  const onError = function handleError(event) {
    try {
      const detail = [event.message, event.filename, event.lineno, event.colno, event.error && event.error.stack]
        .filter(function keep(value) { return typeof value === 'string' || typeof value === 'number'; }).join(' | ');
      if (!relevant(detail)) return;
      recordAnnotationDiagnostic({
        kind: 'error',
        message: detail,
        sessionId: getAnnotationActiveSession() || currentConversationSessionId(),
      });
    } catch (error) {
      /* ignore */
    }
  };
  const onRejection = function handleRejection(event) {
    try {
      const reason = event.reason;
      const detail = reason && reason.stack ? String(reason.stack) : String(reason);
      if (!relevant(detail)) return;
      recordAnnotationDiagnostic({
        kind: 'rejection',
        message: detail,
        sessionId: getAnnotationActiveSession() || currentConversationSessionId(),
      });
    } catch (error) {
      /* ignore */
    }
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return function disposeAnnotationErrorCapture() {
    try {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    } catch (error) {
      /* ignore */
    }
  };
}

/** Short-lived on-screen diagnostic notice (also used when locate fails). */
let annotationNotice = null;
const annotationNoticeListeners = new Set();
let annotationNoticeTimer = 0;

function notifyAnnotationNotice() {
  for (const listener of Array.from(annotationNoticeListeners)) {
    if (typeof listener !== 'function') continue;
    try {
      listener();
    } catch (error) {
      /* ignore */
    }
  }
}

function getAnnotationNotice() {
  return annotationNotice;
}

function subscribeAnnotationNotice(listener) {
  if (typeof listener !== 'function') return function noop() {};
  annotationNoticeListeners.add(listener);
  let active = true;
  return function unsubscribe() {
    if (!active) return;
    active = false;
    annotationNoticeListeners.delete(listener);
  };
}

function showAnnotationNotice(message, durationMs) {
  if (typeof message !== 'string' || message.length === 0) return;
  const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 30000;
  annotationNotice = message;
  recordAnnotationDiagnostic({ kind: 'notice', message: message, sessionId: getAnnotationActiveSession() || currentConversationSessionId() });
  notifyAnnotationNotice();
  try {
    if (annotationNoticeTimer !== 0) clearTimeout(annotationNoticeTimer);
    annotationNoticeTimer = setTimeout(function clearNotice() {
      annotationNoticeTimer = 0;
      annotationNotice = null;
      notifyAnnotationNotice();
    }, duration);
  } catch (error) {
    /* ignore */
  }
}

function clearAnnotationNotice() {
  try {
    if (annotationNoticeTimer !== 0) clearTimeout(annotationNoticeTimer);
  } catch (error) {
    /* ignore */
  }
  annotationNoticeTimer = 0;
  if (annotationNotice === null) return;
  annotationNotice = null;
  notifyAnnotationNotice();
}

/** Explain why a selection did not become an annotation candidate. */
function clearAnnotationFlash() {
  try {
    if (annotationFlashTimer !== 0) clearTimeout(annotationFlashTimer);
  } catch (error) {
    /* ignore */
  }
  annotationFlashTimer = 0;
  detachFlashDismiss();
  if (annotationFlash === null) return;
  annotationFlash = null;
  notifyAnnotationFlash();
}

function notifyAnnotationSelection() {
  for (const listener of Array.from(annotationSelectionListeners)) {
    if (typeof listener !== 'function') continue;
    try {
      listener();
    } catch (error) {
      try {
        console.error('[dsh-annotation] selection listener failed:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }
}

function getAnnotationSelection() {
  return annotationSelection;
}

function subscribeAnnotationSelection(listener) {
  if (typeof listener !== 'function') return function noop() {};
  annotationSelectionListeners.add(listener);
  let active = true;
  return function unsubscribe() {
    if (!active) return;
    active = false;
    annotationSelectionListeners.delete(listener);
  };
}

function publishAnnotationSelection(next) {
  annotationSelection = next;
  notifyAnnotationSelection();
}

function clearAnnotationSelection() {
  if (annotationSelection === null) return;
  annotationSelection = null;
  notifyAnnotationSelection();
}

/**
 * The active message-id resolver, installed only while uiConversation exists.
 * Returns an identity-checked release so an outgoing HMR instance cannot clear
 * the resolver an incoming instance just installed.
 */
function setAnnotationMessageResolver(resolver) {
  const next = typeof resolver === 'function' ? resolver : null;
  annotationMessageResolver = next;
  return function releaseAnnotationMessageResolver() {
    if (annotationMessageResolver === next) annotationMessageResolver = null;
  };
}

/**
 * Resolve a sent annotation back to its assistant row through the Chat target
 * snapshot (messageId -> nodeKey). Installed only while uiConversation exists.
 * Returns an identity-checked release.
 */
function setAnnotationLocator(locator) {
  const next = typeof locator === 'function' ? locator : null;
  annotationLocator = next;
  return function releaseAnnotationLocator() {
    if (annotationLocator === next) annotationLocator = null;
  };
}

/** Resolve an assistant message id to its current chat node key, if possible. */
function resolveAnnotationNodeKey(sessionId, messageId) {
  if (annotationLocator === null || typeof messageId !== 'string' || messageId.length === 0) return null;
  try {
    const resolved = annotationLocator(sessionId, messageId);
    return typeof resolved === 'string' && resolved.length > 0 ? resolved : null;
  } catch (error) {
    return null;
  }
}

/**
 * Scroll to and briefly highlight one annotation's source passage. Used from
 * the pending capsule and from sent-card rows.
 *
 * @param {{sessionId?: string, messageId?: string, nodeKey?: string, quote: string, start?: number}} target
 * @returns {boolean} whether a source row was found.
 */
/** Nearest scrollable transcript container for one chat row. */
function annotationScrollContainer(row) {
  try {
    const explicit = row.closest('[data-conversation-scroll]');
    if (explicit !== null) return explicit;
    let node = row.parentElement;
    while (node !== null && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll)/u.test(style.overflowY)) return node;
      node = node.parentElement;
    }
  } catch (error) {
    /* fall through */
  }
  return null;
}

/**
 * Scroll the transcript so the centre of the annotated passage, not the whole
 * message, lands in the centre of the visible transcript area (above the
 * composer). Tail passages simply clamp at the bottom.
 */
function centerAnnotationPassage(row, start, end) {
  try {
    const range = rangeFromRowOffsets(row, start, end);
    const container = annotationScrollContainer(row);
    if (range === null || container === null) {
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center', inline: 'nearest' });
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    let visibleBottom = box.bottom;
    try {
      const composer = container.querySelector('[data-composer-seat]');
      if (composer !== null) {
        const composerBox = composer.getBoundingClientRect();
        if (composerBox.height > 0 && composerBox.top > box.top) visibleBottom = Math.min(visibleBottom, composerBox.top);
      }
    } catch (error) {
      /* use full box */
    }
    const delta = (rect.top + rect.height / 2) - (box.top + visibleBottom) / 2;
    if (Math.abs(delta) > 2) {
      const maxTop = container.scrollHeight - container.clientHeight;
      container.scrollTop = Math.max(0, Math.min(maxTop, container.scrollTop + delta));
    }
  } catch (error) {
    try {
      row.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (ignored) {
      /* ignore */
    }
  }
}

function locateAnnotation(target) {
  if (target === null || typeof target !== 'object') return false;
  const quote = typeof target.quote === 'string' ? target.quote : '';
  if (quote.length === 0) return false;
  try {
    const rows = assistantRowsByNodeKey();
    const wantedSession = typeof target.sessionId === 'string' && target.sessionId.length > 0
      ? target.sessionId : null;
    const rowSessionId = function sessionOfRow(row) {
      try {
        const element = row.closest('[data-conversation-session]');
        return element === null ? null : element.getAttribute('data-conversation-session');
      } catch (error) {
        return null;
      }
    };
    const acceptedRow = function acceptRow(candidate) {
      if (candidate === null || candidate === undefined) return false;
      return wantedSession === null || rowSessionId(candidate) === wantedSession;
    };
    let row = null;
    let nodeKey = typeof target.nodeKey === 'string' ? target.nodeKey : null;
    if (nodeKey !== null) row = rows.get(nodeKey) || null;
    if (!acceptedRow(row)) row = null;
    if (row === null && typeof target.messageId === 'string' && target.messageId.length > 0
      && annotationLocator !== null) {
      try {
        const resolved = annotationLocator(target.sessionId, target.messageId);
        if (typeof resolved === 'string' && resolved.length > 0) {
          row = rows.get(resolved) || null;
          if (acceptedRow(row)) nodeKey = resolved;
          else row = null;
        }
      } catch (error) {
        row = null;
      }
    }
    if (row === null) {
      // Last resort: any mounted assistant row containing the excerpt; prefer
      // painted rows over hidden duplicates of the same node.
      let fallback = null;
      for (const candidate of allAssistantRows()) {
        if (!acceptedRow(candidate)) continue;
        if (rowTextOf(candidate).indexOf(quote) < 0) continue;
        const key = candidate.getAttribute('data-chat-node-key');
        if (isVisibleRow(candidate)) {
          row = candidate;
          nodeKey = typeof key === 'string' ? key : nodeKey;
          break;
        }
        if (fallback === null) fallback = candidate;
      }
      if (row === null && fallback !== null) {
        row = fallback;
        const key = fallback.getAttribute('data-chat-node-key');
        if (typeof key === 'string') nodeKey = key;
      }
    }
    if (row === null) {
      const mounted = allAssistantRows();
      let quoteRows = 0;
      for (const candidate of mounted) {
        if (acceptedRow(candidate) && rowTextOf(candidate).indexOf(quote) >= 0) quoteRows += 1;
      }
      showAnnotationNotice('定位失败：找不到原回复段落'
        + '（session=' + String(wantedSession) + ' 行数=' + mounted.length
        + ' 含原文的行=' + quoteRows + ' key=' + String(nodeKey) + '）');
      return false;
    }
    const text = rowTextOf(row);
    const preferred = Number.isFinite(target.start) ? Math.max(0, Math.floor(target.start)) : 0;
    const span = locateQuoteLoose(text, quote, preferred);
    const start = span === null ? preferred : span.start;
    const end = span === null ? preferred + quote.length : span.end;
    // Centre the passage itself so it does not land near the composer edge.
    centerAnnotationPassage(row, start, end);
    flashAnnotation({
      id: 'locate-' + Date.now().toString(36),
      nodeKey,
      start,
      end,
      quote: span === null ? quote : text.slice(span.start, span.end),
    });
    return true;
  } catch (error) {
    return false;
  }
}

function elementOfNode(node) {
  if (node === null || node === undefined) return null;
  if (node.nodeType === 1) return node;
  return node.parentElement || null;
}

function isEditableNode(element) {
  if (element === null || element === undefined || typeof element.closest !== 'function') return false;
  try {
    return element.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [data-dsh-annotation-ui]') !== null;
  } catch (error) {
    return true;
  }
}

function toPlainRect(rect) {
  if (rect === null || rect === undefined) return null;
  const top = Number(rect.top);
  const left = Number(rect.left);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (!Number.isFinite(top) || !Number.isFinite(left)) return null;
  return {
    top,
    left,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    right: Number.isFinite(rect.right) ? Number(rect.right) : left + (Number.isFinite(width) ? width : 0),
    bottom: Number.isFinite(rect.bottom) ? Number(rect.bottom) : top + (Number.isFinite(height) ? height : 0),
  };
}

/** Measure a Range, preferring the first actually visible client rect. */
function rectOfRange(range) {
  if (range === null || range === undefined) return null;
  try {
    const rects = range.getClientRects();
    for (let index = 0; index < rects.length; index += 1) {
      const plain = toPlainRect(rects[index]);
      if (plain !== null && plain.width > 0 && plain.height > 0) return plain;
    }
    return toPlainRect(range.getBoundingClientRect());
  } catch (error) {
    return null;
  }
}

/** Rendered text of one chat row (text-node concatenation, matching offsets). */
function rowTextOf(row) {
  try {
    return typeof row.textContent === 'string' ? row.textContent : '';
  } catch (error) {
    return '';
  }
}

/** 1-based insertion point for one text offset inside a row. */
function textPointAtOffset(root, offset) {
  if (root === null || root === undefined || typeof document === 'undefined'
    || typeof document.createTreeWalker !== 'function') return null;
  const target = Math.max(0, Math.floor(Number(offset) || 0));
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let remaining = target;
    let lastNode = null;
    let node = walker.nextNode();
    while (node !== null) {
      const value = typeof node.nodeValue === 'string' ? node.nodeValue : '';
      if (remaining <= value.length) return { node, offset: remaining };
      remaining -= value.length;
      lastNode = node;
      node = walker.nextNode();
    }
    if (lastNode !== null) {
      return { node: lastNode, offset: (lastNode.nodeValue || '').length };
    }
  } catch (error) {
    return null;
  }
  return null;
}

/** Build a DOM Range from row-local text offsets. */
function rangeFromRowOffsets(row, start, end) {
  if (row === null || row === undefined) return null;
  const span = clampTextSpan(rowTextOf(row).length, start, end);
  if (span === null) return null;
  const startPoint = textPointAtOffset(row, span.start);
  const endPoint = textPointAtOffset(row, span.end);
  if (startPoint === null || endPoint === null) return null;
  try {
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    if (range.collapsed) return null;
    return range;
  } catch (error) {
    return null;
  }
}

/**
 * Text offset of a DOM boundary inside a row, measured the same way as
 * `textContent` (Range.toString() never inserts block newlines).
 */
function boundaryTextOffset(row, container, offset) {
  try {
    const range = document.createRange();
    range.selectNodeContents(row);
    range.setEnd(container, offset);
    return range.toString().length;
  } catch (error) {
    return -1;
  }
}

/** All mounted assistant rows, keyed by their `data-chat-node-key`. */
/** Every mounted assistant row, including hidden duplicates (e.g. folded seats). */
function allAssistantRows() {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return [];
  try {
    return Array.prototype.slice.call(document.querySelectorAll(ANNOTATION_ASSISTANT_ROW_SELECTOR));
  } catch (error) {
    return [];
  }
}

/** Whether a mounted row currently paints (hidden seats must not win). */
function isVisibleRow(row) {
  try {
    if (row === null || row === undefined) return false;
    if (row.isConnected === false) return false;
    const rects = typeof row.getClientRects === 'function' ? row.getClientRects() : null;
    if (rects !== null && rects !== undefined && rects.length > 0) {
      for (let index = 0; index < rects.length; index += 1) {
        if (rects[index].width > 0 && rects[index].height > 0) return true;
      }
    }
    return typeof row.getBoundingClientRect === 'function'
      && row.getBoundingClientRect().height > 0;
  } catch (error) {
    return false;
  }
}

function assistantRowsByNodeKey() {
  const rows = new Map();
  const found = allAssistantRows();
  for (let index = 0; index < found.length; index += 1) {
    const row = found[index];
    const key = row.getAttribute('data-chat-node-key');
    if (typeof key !== 'string' || key.length === 0) continue;
    const existing = rows.get(key);
    // Prefer a painted row: folding can leave a hidden duplicate first in DOM order.
    if (existing === undefined || (!isVisibleRow(existing) && isVisibleRow(row))) rows.set(key, row);
  }
  return rows;
}

/** Whether a row is currently streaming (anchors are unstable then). */
function isStreamingRow(row) {
  try {
    return row !== null && row !== undefined && typeof row.querySelector === 'function'
      && row.querySelector('[data-streaming]') !== null;
  } catch (error) {
    return true;
  }
}

/**
 * Resolve the stored annotation to a live Range inside its row, falling back
 * from the stale offsets to the nearest matching quote.
 */
function rangeForAnnotationInRow(annotation, row) {
  if (annotation === null || typeof annotation !== 'object' || row === null || row === undefined) return null;
  const text = rowTextOf(row);
  if (anchorMatchesText(text, annotation)) {
    const exact = rangeFromRowOffsets(row, annotation.start, annotation.end);
    if (exact !== null) return exact;
  }
  const span = locateQuoteLoose(text, annotation.quote, annotation.start);
  if (span === null) return null;
  return rangeFromRowOffsets(row, span.start, span.end);
}

/** Resolve one annotation against the currently mounted transcript. */
function rangeForAnnotation(annotation) {
  if (annotation === null || typeof annotation !== 'object') return null;
  try {
    const rows = assistantRowsByNodeKey();
    const row = rows.get(annotation.nodeKey);
    if (row === undefined || isStreamingRow(row)) return null;
    return rangeForAnnotationInRow(annotation, row);
  } catch (error) {
    return null;
  }
}

/** Active conversation session id from the transcript DOM. */
function currentConversationSessionId() {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null;
  try {
    const candidates = document.querySelectorAll('[data-conversation-session]');
    let fallback = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const element = candidates[index];
      const value = element.getAttribute('data-conversation-session');
      if (typeof value !== 'string' || value.length === 0) continue;
      if (fallback === null) fallback = value;
      try {
        const rect = element.getBoundingClientRect();
        if (rect !== null && rect.width > 0 && rect.height > 0) return value;
      } catch (error) {
        /* try the next candidate */
      }
    }
    return fallback;
  } catch (error) {
    return null;
  }
}

/** Visible transcript band for the mounted conversation (above the composer). */
function annotationViewportBand() {
  let top = 0;
  let bottom = typeof window !== 'undefined' && Number.isFinite(window.innerHeight)
    ? window.innerHeight : 800;
  try {
    const scroller = document.querySelector('[data-conversation-scroll]');
    if (scroller !== null) {
      const box = scroller.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
    }
  } catch (error) {
    /* keep viewport */
  }
  try {
    const composer = document.querySelector('[data-composer-seat]');
    if (composer !== null) {
      const box = composer.getBoundingClientRect();
      if (box.height > 0 && box.top > top) bottom = Math.min(bottom, box.top);
    }
  } catch (error) {
    /* ignore */
  }
  return { top, bottom };
}

/** Vertical band of the transcript that is actually visible above the composer. */
/**
 * Measure marker points and highlight rects for a pending list. Rows are
 * looked up once per refresh; annotations without a resolvable anchor are
 * omitted from the visual layer but kept in the store.
 *
 * @returns {Array<{annotation: object, number: number, marker: object, rects: Array<object>}>}
 */
function measureAnnotationAnchors(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const items = [];
  let rows = null;
  try {
    rows = assistantRowsByNodeKey();
  } catch (error) {
    return [];
  }
  list.forEach(function measure(annotation, index) {
    if (annotation === null || typeof annotation !== 'object') return;
    try {
      const row = rows.get(annotation.nodeKey);
      if (row === undefined || isStreamingRow(row)) return;
      const range = rangeForAnnotationInRow(annotation, row);
      if (range === null) {
        // The row is mounted but the anchor cannot be resolved: keep the bubble
        // visible at the row's leading edge instead of dropping it.
        const rowRect = toPlainRect(row.getBoundingClientRect());
        if (rowRect !== null && rowRect.height > 0) {
          items.push({
            annotation,
            number: annotationMarkerNumber(index),
            marker: { top: rowRect.top + 14, left: rowRect.left + 10 },
            rects: [],
          });
        }
        return;
      }
      const rects = [];
      try {
        const clientRects = range.getClientRects();
        for (let rectIndex = 0; rectIndex < clientRects.length; rectIndex += 1) {
          const plain = toPlainRect(clientRects[rectIndex]);
          if (plain !== null && plain.width > 0 && plain.height > 0) rects.push(plain);
        }
      } catch (error) {
        /* keep fallback below */
      }
      // The bubble sits at the end of the annotated passage (last client rect).
      let marker = rects.length > 0
        ? {
          top: rects[rects.length - 1].top + rects[rects.length - 1].height / 2,
          left: rects[rects.length - 1].right + 10,
        }
        : null;
      if (marker === null) {
        const bounding = toPlainRect(range.getBoundingClientRect());
        if (bounding !== null && (bounding.width > 0 || bounding.height > 0)) {
          marker = { top: bounding.top, left: bounding.left };
        }
      }
      if (marker === null) return;
      items.push({
        annotation,
        number: annotationMarkerNumber(index),
        marker,
        rects,
      });
    } catch (error) {
      /* fail closed per annotation */
    }
  });
  return items;
}

/** Scroll the transcript to one annotation and briefly highlight its passage. */
function revealAnnotation(annotation) {
  if (annotation === null || typeof annotation !== 'object') return false;
  return locateAnnotation({
    sessionId: annotation.sessionId,
    messageId: annotation.messageId,
    nodeKey: annotation.nodeKey,
    quote: annotation.quote,
    start: annotation.start,
  });
}

/** Capture the current document selection into serializable facts. */
function captureAnnotationSelectionInner() {
  try {
    if (typeof document === 'undefined' || typeof document.getSelection !== 'function') {
      clearAnnotationSelection();
      return;
    }
    const selection = document.getSelection();
    if (selection === null || selection === undefined || selection.isCollapsed
      || typeof selection.rangeCount !== 'number' || selection.rangeCount === 0) {
      clearAnnotationSelection();
      return;
    }
    const range = selection.getRangeAt(0);
    const startElement = elementOfNode(range.startContainer);
    const endElement = elementOfNode(range.endContainer);
    if (startElement === null || endElement === null) {
      clearAnnotationSelection();
      return;
    }
    if (isEditableNode(startElement) || isEditableNode(endElement)) {
      clearAnnotationSelection();
      return;
    }
    let row = null;
    try {
      row = startElement.closest('[data-chat-flow-kind="assistant-step"]');
    } catch (error) {
      row = null;
    }
    if (row === null) {
      clearAnnotationSelection();
      return;
    }
    let endRow = null;
    try {
      endRow = endElement.closest('[data-chat-flow-kind="assistant-step"]');
    } catch (error) {
      endRow = null;
    }
    if (endRow !== row || isStreamingRow(row)) {
      clearAnnotationSelection();
      return;
    }
    const nodeKey = row.getAttribute('data-chat-node-key');
    if (typeof nodeKey !== 'string' || nodeKey.length === 0) {
      clearAnnotationSelection();
      return;
    }
    const selectionText = typeof selection.toString === 'function' ? selection.toString() : '';
    if (typeof selectionText !== 'string' || selectionText.trim().length === 0) {
      clearAnnotationSelection();
      return;
    }
    // Measure the selection boundaries against the row's textContent. This is
    // the only reliable path for multi-line selections: Selection.toString()
    // inserts newlines at block boundaries that textContent does not contain.
    const rowText = rowTextOf(row);
    let start = boundaryTextOffset(row, range.startContainer, range.startOffset);
    let end = boundaryTextOffset(row, range.endContainer, range.endOffset);
    if (start < 0 || end < 0 || end === start) {
      const span = locateQuoteLoose(rowText, selectionText, Math.max(0, start));
      if (span === null) {
        clearAnnotationSelection();
        return;
      }
      start = span.start;
      end = span.end;
    }
    if (end < start) {
      const swap = start;
      start = end;
      end = swap;
    }
    if (start < 0 || end <= start || end > rowText.length) {
      clearAnnotationSelection();
      return;
    }
    let quote = rowText.slice(start, end);
    if (typeof quote !== 'string' || quote.trim().length === 0) {
      clearAnnotationSelection();
      return;
    }
    let context = sliceQuoteContext(rowText, start, end, ANNOTATION_CONTEXT_CHARS);
    if (context === null) context = { quote: quote, prefix: '', suffix: '' };
    let sessionId = null;
    try {
      const sessionElement = row.closest('[data-conversation-session]');
      sessionId = sessionElement === null ? null : sessionElement.getAttribute('data-conversation-session');
    } catch (error) {
      sessionId = null;
    }
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      sessionId = currentConversationSessionId();
    }
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      clearAnnotationSelection();
      return;
    }
    let messageId = null;
    if (annotationMessageResolver !== null) {
      try {
        const resolved = annotationMessageResolver(sessionId, nodeKey);
        messageId = typeof resolved === 'string' && resolved.length > 0 ? resolved : null;
      } catch (error) {
        messageId = null;
      }
    }
    let rect = rectOfRange(range);
    if (rect === null) {
      try {
        const rowRect = row.getBoundingClientRect();
        rect = toPlainRect(rowRect);
      } catch (error) {
        rect = null;
      }
    }
    if (rect === null) rect = { top: 140, left: 240, width: 0, height: 0, right: 240, bottom: 140 };
    publishAnnotationSelection({
      sessionId,
      nodeKey,
      messageId,
      start,
      end,
      quote,
      prefix: context.prefix,
      suffix: context.suffix,
      rect,
    });
  } catch (error) {
    try {
      console.error('[dsh-annotation] selection capture failed:', error);
    } catch (ignored) {
      /* ignore */
    }
    clearAnnotationSelection();
  }
}

/** Extra numbers for the double-click diagnostic notice. */
function annotationSelectionDetail() {
  try {
    if (typeof document === 'undefined' || typeof document.getSelection !== 'function') return '无 document';
    const selection = document.getSelection();
    if (selection === null || selection === undefined || selection.rangeCount === 0) return '无选区';
    const range = selection.getRangeAt(0);
    const element = elementOfNode(range.startContainer);
    const row = element === null ? null : element.closest('[data-chat-flow-kind="assistant-step"]');
    let probeLength = 'n/a';
    if (row !== null) {
      try {
        const probe = document.createRange();
        probe.selectNodeContents(row);
        probe.setEnd(range.startContainer, range.startOffset);
        probeLength = probe.toString().length;
      } catch (error) {
        probeLength = 'throw:' + (error && error.name ? error.name : 'Error');
      }
    }
    const rowText = row === null ? '' : rowTextOf(row);
    const quote = typeof selection.toString === 'function' ? selection.toString() : '';
    return 'rowText=' + rowText.length + ' probe=' + probeLength
      + ' quote=' + JSON.stringify(quote.slice(0, 24))
      + ' key=' + (row === null ? 'null' : String(row.getAttribute('data-chat-node-key')))
      + ' sessionEl=' + (row === null ? 'null' : (row.closest('[data-conversation-session]') !== null));
  } catch (error) {
    return '诊断异常:' + (error && error.message ? error.message : String(error));
  }
}

/**
 * Whether the current selection still looks like prose inside one assistant
 * reply. Used to keep the retry-loop diagnostic quiet for double-clicks on
 * non-prose row chrome (token usage, timestamps, action buttons, ...).
 */
function annotationSelectionLooksLikeProse() {
  try {
    if (typeof document.getSelection !== 'function') return false;
    const selection = document.getSelection();
    if (selection === null || selection === undefined || selection.isCollapsed
      || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    const startElement = elementOfNode(range.startContainer);
    const endElement = elementOfNode(range.endContainer);
    if (startElement === null || endElement === null) return false;
    const row = startElement.closest('[data-chat-flow-kind="assistant-step"]');
    if (row === null || endElement.closest('[data-chat-flow-kind="assistant-step"]') !== row) return false;
    const rowText = rowTextOf(row);
    const start = boundaryTextOffset(row, range.startContainer, range.startOffset);
    const end = boundaryTextOffset(row, range.endContainer, range.endOffset);
    if (start < 0 || end <= start || start >= rowText.length || end > rowText.length) return false;
    const quote = typeof selection.toString === 'function' ? selection.toString() : '';
    if (typeof quote !== 'string' || quote.trim().length === 0) return false;
    const normalize = function collapse(value) { return value.replace(/\s+/gu, ' ').trim(); };
    return normalize(rowText).includes(normalize(quote));
  } catch (error) {
    return false;
  }
}

/**
 * Capture the current selection and report whether a usable annotation
 * selection was published (used by the double-click retry loop).
 *
 * @param {boolean} [debug] - show a detailed notice when nothing was published.
 */
function captureAnnotationSelection(debug) {
  captureAnnotationSelectionInner();
  if (annotationSelection !== null) return true;
  if (debug === true && annotationSelectionLooksLikeProse()) {
    showAnnotationNotice('双击未捕获：' + annotationSelectionDetail());
  }
  return false;
}

/** Install selection listeners; returns the disposer for `ctx.effect`. */
function installAnnotationSelectionTracking() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return function noop() {};
  }
  let disposed = false;
  const schedule = function scheduleCapture(delay) {
    if (disposed) return;
    if (annotationSelectionTimer !== 0) clearTimeout(annotationSelectionTimer);
    annotationSelectionTimer = setTimeout(function runCapture() {
      annotationSelectionTimer = 0;
      if (!disposed) captureAnnotationSelection();
    }, Number.isFinite(delay) ? delay : ANNOTATION_SELECTION_DEBOUNCE_MS);
  };
  const onSelectionChange = function handleSelectionChange() {
    schedule(ANNOTATION_SELECTION_DEBOUNCE_MS);
  };
  const onPointerUp = function handlePointerUp() {
    schedule(40);
  };
  const onMouseUp = function handleMouseUp() {
    schedule(40);
  };
  /**
   * Double-click word selection can settle after the dblclick event and can be
   * cleared again by a later capture, so poll briefly until a usable selection
   * is published.
   */
  const onDoubleClick = function handleDoubleClick(event) {
    if (disposed) return;
    // Ignore double-clicks outside assistant replies (Plugins page, sidebar,
    // user messages, ...). The retry loop + failure notice are only useful
    // when the gesture actually targets (or selects) assistant text.
    let likely = false;
    try {
      const target = event !== null && event !== undefined && event.target instanceof Element
        ? event.target : null;
      if (target !== null && target.closest('[data-chat-flow-kind="assistant-step"]') !== null) {
        likely = true;
      } else if (typeof document.getSelection === 'function') {
        const selection = document.getSelection();
        if (selection !== null && selection !== undefined && selection.rangeCount > 0) {
          const start = elementOfNode(selection.getRangeAt(0).startContainer);
          if (start !== null && start.closest('[data-chat-flow-kind="assistant-step"]') !== null) likely = true;
        }
      }
    } catch (error) {
      likely = false;
    }
    if (!likely) return;
    if (annotationSelectionTimer !== 0) {
      clearTimeout(annotationSelectionTimer);
      annotationSelectionTimer = 0;
    }
    let tries = 0;
    const attempt = function attemptDoubleClickCapture() {
      if (disposed) return;
      const debug = tries >= 11;
      if (captureAnnotationSelection(debug)) return;
      tries += 1;
      if (tries < 12) setTimeout(attempt, 40);
    };
    attempt();
  };
  const onKeyUp = function handleKeyUp(event) {
    if (event === null || event === undefined) return;
    if (event.key === 'Shift' || event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      schedule(40);
    }
  };
  const onScroll = function handleScroll() {
    if (annotationSelection !== null) clearAnnotationSelection();
  };
  const onResize = function handleResize() {
    if (annotationSelection !== null) clearAnnotationSelection();
  };
  try {
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('dblclick', onDoubleClick, true);
    document.addEventListener('keyup', onKeyUp, true);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
    }
  } catch (error) {
    return function noop() {};
  }
  return function disposeSelectionTracking() {
    if (disposed) return;
    disposed = true;
    if (annotationSelectionTimer !== 0) {
      clearTimeout(annotationSelectionTimer);
      annotationSelectionTimer = 0;
    }
    try {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('dblclick', onDoubleClick, true);
      document.removeEventListener('keyup', onKeyUp, true);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
      }
    } catch (error) {
      /* ignore */
    }
    clearAnnotationSelection();
    clearAnnotationFlash();
  };
}
