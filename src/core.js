/**
 * Pure text helpers for response annotations.
 *
 * This file is concatenated into the Client bundle factory: ordinary script
 * syntax only (no import/export). Every symbol is a function declaration or a
 * top-level constant with a bundle-unique name.
 */

/** Codex-compatible payload header lines, verbatim (product name adjusted). */
const ANNOTATION_HEADER = '# Response annotations:';
const ANNOTATION_PREAMBLE = 'Each item contains text selected from an earlier assistant response and may include a user comment. Treat items as Annotation 1, Annotation 2, and so on in array order. Use every selection as context and address every comment. When addressing multiple comments, label each answer with its annotation number (for example, `Annotation 1`) so the user can match it to the numbered annotation.';
const ANNOTATION_OPEN = '<response-annotations>';
const ANNOTATION_CLOSE = '</response-annotations>';
const ANNOTATION_REQUEST = '## My request:';

/** Characters of context stored on each side of the quote for re-anchoring. */
const ANNOTATION_CONTEXT_CHARS = 40;

/** Hard cap on stored / parsed annotations to keep the payload bounded. */
const ANNOTATION_MAX_ITEMS = 200;

/** Marker numbers (1-based array order) used by the UI and the payload note. */
function annotationMarkerNumber(index) {
  return (Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0) + 1;
}

/** Normalize a comment: comments are optional and trimmed for the payload. */
function annotationTrimComment(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Build one payload entry. Empty comments drop the `annotation` key, matching
 * Codex (`{"text": "...", "source": {...}}` for a plain reference).
 */
function buildAnnotationEntry(annotation) {
  if (annotation === null || typeof annotation !== 'object') return null;
  const text = typeof annotation.quote === 'string' ? annotation.quote : '';
  if (text.length === 0) return null;
  const entry = { text };
  const comment = annotationTrimComment(annotation.comment);
  if (comment.length > 0) entry.annotation = comment;
  const source = annotation.messageId || annotation.nodeKey || '';
  entry.source = { messageId: source };
  return entry;
}

/**
 * Render the model-facing block. Mirrors Codex's `\n# Response annotations:\n…`
 * placement with `## My request:` immediately before the user's own text.
 *
 * @param {Array} list - pending annotations, array order = marker numbers.
 * @param {string} userText - the user's own prompt text.
 * @returns {string} decorated text; unchanged when there is nothing to attach.
 */
function buildAnnotationBlock(list, userText) {
  const text = typeof userText === 'string' ? userText : '';
  const entries = [];
  if (Array.isArray(list)) {
    for (const annotation of list) {
      const entry = buildAnnotationEntry(annotation);
      if (entry === null) continue;
      entries.push(entry);
      if (entries.length >= ANNOTATION_MAX_ITEMS) break;
    }
  }
  if (entries.length === 0) return text;
  return '\n' + ANNOTATION_HEADER + '\n' + ANNOTATION_PREAMBLE + '\n'
    + ANNOTATION_OPEN + '\n' + JSON.stringify(entries) + '\n'
    + ANNOTATION_CLOSE + '\n\n' + ANNOTATION_REQUEST + '\n' + text;
}

/** Safe JSON parse used by the display parser; never throws. */
function parseAnnotationJsonTyped(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse a persisted user message back into display annotations.
 *
 * Requires the block to be the start of the message (an optional single
 * leading newline is tolerated), finds the JSON between the open/close tags,
 * and returns the candidate range end just after `## My request:\n` so the
 * renderer can keep the user's own text visible.
 *
 * @param {string} text - raw user message text from the session log.
 * @returns {{annotations: Array<{text: string, annotation: string}>, end: number}|null}
 */
function parseAnnotationBlock(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  let headerAt = 0;
  if (text[0] === '\n') headerAt = 1;
  if (text.slice(headerAt, headerAt + ANNOTATION_HEADER.length) !== ANNOTATION_HEADER) return null;
  const headerEnd = text.indexOf('\n', headerAt + ANNOTATION_HEADER.length);
  if (headerEnd < 0) return null;
  const openAt = text.indexOf(ANNOTATION_OPEN, headerEnd);
  if (openAt < 0) return null;
  const jsonAt = openAt + ANNOTATION_OPEN.length;
  if (text[jsonAt] !== '\n') return null;
  const closeLine = text.indexOf('\n' + ANNOTATION_CLOSE, jsonAt);
  if (closeLine < 0) return null;
  const json = text.slice(jsonAt + 1, closeLine);
  const parsed = parseAnnotationJsonTyped(json);
  if (parsed === null) return null;
  const annotations = [];
  for (const item of parsed) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const excerpt = typeof item.text === 'string' ? item.text : '';
    if (excerpt.length === 0) continue;
    const source = item.source !== null && typeof item.source === 'object' && !Array.isArray(item.source)
      ? item.source : null;
    const messageId = source !== null && typeof source.messageId === 'string' && source.messageId.length > 0
      ? source.messageId : null;
    annotations.push({
      text: excerpt,
      annotation: typeof item.annotation === 'string' ? item.annotation : '',
      messageId,
    });
    if (annotations.length >= ANNOTATION_MAX_ITEMS) break;
  }
  if (annotations.length === 0) return null;
  let end = closeLine + 1 + ANNOTATION_CLOSE.length;
  const requestLine = text.indexOf('\n' + ANNOTATION_REQUEST + '\n', end);
  if (requestLine >= 0) end = requestLine + 1 + ANNOTATION_REQUEST.length + 1;
  else if (text.slice(end, end + ANNOTATION_REQUEST.length + 1) === ANNOTATION_REQUEST + '\n') {
    end += ANNOTATION_REQUEST.length + 1;
  } else if (text[end] === '\n') {
    end += 1;
  }
  return { annotations, end };
}

/** Clamp a text span to a row length; returns null for an unusable span. */
function clampTextSpan(length, start, end) {
  const size = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  let from = Math.max(0, Math.min(size, Math.floor(start)));
  let to = Math.max(0, Math.min(size, Math.floor(end)));
  if (to < from) {
    const swap = from;
    from = to;
    to = swap;
  }
  if (to === from) return null;
  return { start: from, end: to };
}

/**
 * Slice quote plus surrounding context from a row's text.
 *
 * @param {string} rowText - the row's rendered text.
 * @param {number} start - quote start offset.
 * @param {number} end - quote end offset.
 * @param {number} [contextChars] - context width per side (default 40).
 * @returns {{quote: string, prefix: string, suffix: string}|null}
 */
function sliceQuoteContext(rowText, start, end, contextChars) {
  const text = typeof rowText === 'string' ? rowText : '';
  const span = clampTextSpan(text.length, start, end);
  if (span === null) return null;
  const width = Number.isFinite(contextChars) && contextChars > 0
    ? Math.floor(contextChars) : ANNOTATION_CONTEXT_CHARS;
  return {
    quote: text.slice(span.start, span.end),
    prefix: text.slice(Math.max(0, span.start - width), span.start),
    suffix: text.slice(span.end, Math.min(text.length, span.end + width)),
  };
}

/**
 * Locate a stored quote in current row text, preferring the occurrence closest
 * to the stale offset.
 *
 * @returns {number} 0-based start offset, or -1 when absent.
 */
function locateQuoteInText(rowText, quote, preferredStart) {
  const text = typeof rowText === 'string' ? rowText : '';
  const needle = typeof quote === 'string' ? quote : '';
  if (needle.length === 0 || text.length === 0) return -1;
  const preferred = Number.isFinite(preferredStart) ? Math.max(0, Math.floor(preferredStart)) : 0;
  let best = -1;
  let bestDistance = Infinity;
  let from = text.indexOf(needle);
  let guard = 0;
  while (from >= 0 && guard < 64) {
    const distance = Math.abs(from - preferred);
    if (distance < bestDistance) {
      best = from;
      bestDistance = distance;
    }
    guard += 1;
    from = text.indexOf(needle, from + 1);
  }
  return best;
}

/**
 * Locate a quote that differs from the rendered row only by whitespace that
 * Selection.toString() inserts at block boundaries (for example a multi-line
 * list selection). Matching ignores every whitespace character and maps the
 * match back to real row offsets.
 *
 * @returns {{start: number, end: number}|null}
 */
function locateQuoteLoose(rowText, quote, preferredStart) {
  const text = typeof rowText === 'string' ? rowText : '';
  const needle = typeof quote === 'string' ? quote : '';
  if (text.length === 0 || needle.length === 0) return null;
  const exact = locateQuoteInText(text, needle, preferredStart);
  if (exact >= 0) return { start: exact, end: exact + needle.length };
  const target = needle.replace(/\s+/gu, '');
  if (target.length === 0) return null;
  let normalized = '';
  const map = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    if (/\s/u.test(character)) continue;
    normalized += character;
    map.push(index);
  }
  if (normalized.length === 0) return null;
  const preferred = Number.isFinite(preferredStart) ? Math.max(0, Math.floor(preferredStart)) : 0;
  let best = -1;
  let bestDistance = Infinity;
  let from = normalized.indexOf(target);
  let guard = 0;
  while (from >= 0 && guard < 64) {
    const original = map[from];
    const distance = Math.abs(original - preferred);
    if (distance < bestDistance) {
      best = original;
      bestDistance = distance;
    }
    guard += 1;
    from = normalized.indexOf(target, from + 1);
  }
  if (best < 0) return null;
  let index = best;
  let matched = 0;
  while (index < text.length && matched < target.length) {
    if (!/\s/u.test(text.charAt(index))) matched += 1;
    index += 1;
  }
  return { start: best, end: index };
}

/** Whether a stored anchor still matches the row text at its offsets. */
function anchorMatchesText(rowText, annotation) {
  if (annotation === null || typeof annotation !== 'object') return false;
  const text = typeof rowText === 'string' ? rowText : '';
  const quote = typeof annotation.quote === 'string' ? annotation.quote : '';
  if (quote.length === 0) return false;
  const span = clampTextSpan(text.length, annotation.start, annotation.end);
  if (span === null) return false;
  return text.slice(span.start, span.end) === quote;
}

/** Find an existing annotation for the same excerpt range or the same quote. */
function findAnnotationByRange(list, nodeKey, start, end, quote) {
  if (!Array.isArray(list)) return null;
  const raw = typeof quote === 'string' ? quote.trim() : '';
  for (const annotation of list) {
    if (annotation === null || typeof annotation !== 'object') continue;
    if (annotation.nodeKey === nodeKey
      && annotation.start === start && annotation.end === end) return annotation;
  }
  if (raw.length === 0) return null;
  for (const annotation of list) {
    if (annotation !== null && typeof annotation === 'object'
      && typeof annotation.quote === 'string' && annotation.quote.trim() === raw) return annotation;
  }
  return null;
}

/** Generate a durable annotation id, with a non-crypto fallback. */
function makeAnnotationId() {
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    /* fall through */
  }
  return 'annotation-' + Date.now().toString(36) + '-'
    + Math.random().toString(36).slice(2, 10);
}

/** Normalize one persisted annotation; returns null for unusable records. */
function normalizeStoredAnnotation(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const quote = typeof value.quote === 'string' ? value.quote : '';
  if (quote.length === 0) return null;
  const start = Number.isFinite(value.start) ? Math.max(0, Math.floor(value.start)) : 0;
  let end = Number.isFinite(value.end) ? Math.floor(value.end) : start + quote.length;
  if (end <= start) end = start + quote.length;
  const nodeKey = typeof value.nodeKey === 'string' ? value.nodeKey : '';
  return {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id : makeAnnotationId(),
    nodeKey,
    messageId: typeof value.messageId === 'string' && value.messageId.length > 0 ? value.messageId : null,
    start,
    end,
    quote,
    prefix: typeof value.prefix === 'string' ? value.prefix : '',
    suffix: typeof value.suffix === 'string' ? value.suffix : '',
    comment: typeof value.comment === 'string' ? value.comment : '',
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
  };
}
