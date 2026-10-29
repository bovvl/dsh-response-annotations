/**
 * Sent-message presentation and outgoing payload injection.
 *
 * 1. A `uiConversation.userText` rule recognizes our payload prefix, parses the
 *    block and hands the display card the annotations while the user's own
 *    request stays visible as normal text.
 * 2. `conversation.sendSession` is wrapped once to prepend the annotation block
 *    to the outgoing text; a successful send consumes the pending set.
 */

/** User-text rule id; also used as the `conversation.user.text.node` slot key. */
const ANNOTATION_USER_TEXT_RULE_ID = 'dsh-response-annotations';

/**
 * Match the annotation block only at the start of a user message. The parse
 * failure path returns nothing, so the raw text keeps rendering unchanged.
 */
const annotationUserTextRule = {
  id: ANNOTATION_USER_TEXT_RULE_ID,
  order: -100,
  match: function matchAnnotationBlock(text, from) {
    if (from !== 0) return undefined;
    const parsed = parseAnnotationBlock(text);
    if (parsed === null) return undefined;
    return {
      id: ANNOTATION_USER_TEXT_RULE_ID,
      start: 0,
      end: parsed.end,
      data: {
        annotations: parsed.annotations,
        count: parsed.annotations.length,
      },
    };
  },
};

/** Stable archive id for a sent annotation (dedupe key survives reloads). */
function annotationSentArchiveId(messageId, quote, comment) {
  let hash = 5381;
  const text = (typeof quote === 'string' ? quote : '') + '\u0000' + (typeof comment === 'string' ? comment : '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return 'sent:' + String(messageId) + ':' + (hash >>> 0).toString(36);
}

/** Read-only card summarizing the annotations attached to one sent message. */
function SentAnnotationCard(props) {
  const t = props !== null && props !== undefined ? props.t : undefined;
  const node = props !== null && props !== undefined ? props.node : undefined;
  const propSessionId = props !== null && props !== undefined ? props.sessionId : undefined;
  const [expanded, setExpanded] = React.useState(false);

  let entries = [];
  try {
    if (node !== null && node !== undefined && node.data !== null && node.data !== undefined
      && Array.isArray(node.data.annotations)) {
      entries = node.data.annotations;
    }
  } catch (error) {
    entries = [];
  }
  React.useEffect(function archiveSentAnnotations() {
    try {
      const sessionId = typeof propSessionId === 'string' && propSessionId.length > 0
        ? propSessionId : currentConversationSessionId();
      if (typeof sessionId !== 'string' || sessionId.length === 0) return;
      const archive = [];
      for (const entry of entries) {
        if (entry === null || entry === undefined) continue;
        const messageId = typeof entry.messageId === 'string' ? entry.messageId : '';
        const excerpt = typeof entry.text === 'string' ? entry.text : '';
        if (messageId.length === 0 || excerpt.length === 0) continue;
        const nodeKey = resolveAnnotationNodeKey(sessionId, messageId);
        if (nodeKey === null) continue;
        archive.push({
          id: annotationSentArchiveId(messageId, excerpt, typeof entry.annotation === 'string' ? entry.annotation : ''),
          nodeKey,
          messageId,
          start: 0,
          end: excerpt.length,
          quote: excerpt,
          prefix: '',
          suffix: '',
          comment: typeof entry.annotation === 'string' ? entry.annotation : '',
          createdAt: Date.now(),
        });
      }
      if (archive.length > 0) annotationSentStore.addMany(sessionId, archive);
    } catch (error) {
      /* archive is best effort */
    }
  }, [node, propSessionId]);

  if (entries.length === 0) return null;
  const count = entries.length;


  const content = [
    React.createElement('button', {
      key: 'head',
      type: 'button',
      className: 'dsh-annotation-sent-head',
      'data-dsh-annotation-ui': 'sent-head',
      'aria-expanded': expanded,
      'aria-label': expanded
        ? annotationTranslate(t, 'sent.collapse')
        : annotationTranslate(t, 'sent.expand'),
      onClick: function toggleSentCard() {
        setExpanded(function flip(value) { return !value; });
      },
    },
    React.createElement('span', { 'aria-hidden': true, style: { display: 'inline-flex' } },
      annotationChatIcon(14)),
    React.createElement('span', { className: 'dsh-annotation-sent-count' },
      annotationTranslate(t, 'sent.title', { count })),
    React.createElement('span', {
      className: 'dsh-annotation-sent-chevron' + (expanded ? ' is-open' : ''),
      'aria-hidden': true,
      style: { display: 'inline-flex' },
    }, annotationChevronIcon(false))),
  ];

  if (expanded) {
    const items = entries.map(function renderEntry(entry, index) {
      const excerpt = entry !== null && entry !== undefined && typeof entry.text === 'string' ? entry.text : '';
      const comment = entry !== null && entry !== undefined && typeof entry.annotation === 'string'
        ? entry.annotation : '';
      const messageId = entry !== null && entry !== undefined && typeof entry.messageId === 'string'
        ? entry.messageId : '';
      const locate = function locateEntry(event) {
        try {
          if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
        } catch (error) {
          /* ignore */
        }
        locateAnnotation({
          sessionId: typeof propSessionId === 'string' ? propSessionId : currentConversationSessionId(),
          messageId: messageId.length > 0 ? messageId : undefined,
          quote: excerpt,
        });
      };
      return React.createElement('div', {
        key: 'sent-' + index,
        className: 'dsh-annotation-sent-item',
        'data-dsh-annotation-ui': 'sent-item',
      },
      React.createElement('div', {
        className: 'dsh-annotation-sent-item-head',
        'data-dsh-annotation-ui': 'sent-item-head',
      },
      React.createElement('span', { className: 'dsh-annotation-sent-label' },
        annotationMarkerNumber(index) + '. ' + annotationTranslate(t, 'sent.selectedText')),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-icon-btn dsh-annotation-sent-locate',
        'data-dsh-annotation-ui': 'sent-locate',
        'aria-label': annotationTranslate(t, 'sent.locate'),
        title: annotationTranslate(t, 'sent.locate'),
        onClick: locate,
      }, annotationTargetIcon())),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-sent-quote',
        'data-dsh-annotation-ui': 'sent-quote',
        'aria-label': annotationTranslate(t, 'sent.locate'),
        title: annotationTranslate(t, 'sent.locate'),
        onClick: locate,
      }, excerpt),
      comment.length > 0
        ? React.createElement('div', { className: 'dsh-annotation-sent-label' },
          annotationTranslate(t, 'sent.userComment'))
        : null,
      comment.length > 0
        ? React.createElement('div', { className: 'dsh-annotation-sent-comment' }, comment)
        : null);
    });
    content.push(React.createElement('div', {
      key: 'list',
      className: 'dsh-annotation-sent-list',
      'data-dsh-annotation-ui': 'sent-list',
    }, items));
  }

  return React.createElement(AnnotationErrorBoundary, null,
    React.createElement('div', {
      className: 'dsh-annotation-sent',
      'data-dsh-annotation-ui': 'sent',
      role: 'group',
      'aria-label': annotationTranslate(t, 'sent.title', { count }),
    }, content));
}

/** Whether a prompt already carries our annotation block (avoid double attach). */
function isAnnotationBlockText(text) {
  if (typeof text !== 'string') return false;
  return text.startsWith('\n' + ANNOTATION_HEADER + '\n')
    || text.startsWith(ANNOTATION_HEADER + '\n');
}

/** Installed by apply when the client conversation/session services are ready. */
let annotationSendPendingAction = null;

function setAnnotationSendPendingAction(action) {
  annotationSendPendingAction = typeof action === 'function' ? action : null;
  return function releaseAnnotationSendPendingAction() {
    if (annotationSendPendingAction === action) annotationSendPendingAction = null;
  };
}

/** Send only the pending annotations of one Session (no typed prompt text). */
let annotationSendPendingInFlight = false;

function sendPendingAnnotations(sessionId) {
  if (typeof annotationSendPendingAction !== 'function') return Promise.resolve(false);
  if (annotationSendPendingInFlight) return Promise.resolve(false);
  annotationSendPendingInFlight = true;
  const release = function releaseSendPending() { annotationSendPendingInFlight = false; };
  try {
    return Promise.resolve(annotationSendPendingAction(sessionId)).then(function settle(value) {
      release();
      return value;
    }, function fail(error) {
      release();
      throw error;
    });
  } catch (error) {
    release();
    return Promise.reject(error);
  }
}

/** Shortcut service reference, installed while the client shortcuts service exists. */
let annotationShortcuts = null;

function setAnnotationShortcutsService(service) {
  annotationShortcuts = service === undefined ? null : service;
  return function releaseAnnotationShortcutsService() {
    if (annotationShortcuts === service) annotationShortcuts = null;
  };
}

/**
 * The host's own Send shortcut bindings (fixed.send and fixed.complementary),
 * read from the shortcut catalog so this plugin never hardcodes Enter.
 * Falls back to Enter + the platform complement before the catalog loads.
 */
function annotationSendShortcutBindings() {
  const fallback = [
    { code: 'Enter', modifiers: [] },
    { code: 'Enter', modifiers: ['control'] },
    { code: 'Enter', modifiers: ['meta'] },
  ];
  try {
    const catalog = annotationShortcuts !== null && annotationShortcuts !== undefined
      && annotationShortcuts.fixedCatalog !== null && annotationShortcuts.fixedCatalog !== undefined
      && typeof annotationShortcuts.fixedCatalog.getSnapshot === 'function'
      ? annotationShortcuts.fixedCatalog.getSnapshot() : null;
    if (!Array.isArray(catalog)) return fallback;
    const bindings = [];
    for (const row of catalog) {
      if (row === null || row === undefined || !Array.isArray(row.bindings)) continue;
      if (row.id !== 'fixed.send' && row.id !== 'fixed.complementary') continue;
      for (const binding of row.bindings) {
        if (binding !== null && binding !== undefined && typeof binding.code === 'string') {
          bindings.push({ code: binding.code, modifiers: Array.isArray(binding.modifiers) ? binding.modifiers : [] });
        }
      }
    }
    return bindings.length > 0 ? bindings : fallback;
  } catch (error) {
    return fallback;
  }
}

/** Whether the mounted composer editor is empty (null when it cannot be read). */
function annotationComposerDraftEmpty() {
  try {
    const editor = document.querySelector('[data-composer-card] [data-composer-input]');
    if (editor === null || editor === undefined) return null;
    return (editor.textContent || '').trim().length === 0;
  } catch (error) {
    return null;
  }
}

/**
 * Whether the host primary button reflects "empty draft" — disabled (idle) or
 * showing the Stop glyph (running with an empty draft). In both states the
 * host will not send, so the annotation-only send is safe.
 */
function annotationPrimaryAcceptsSend(button) {
  if (button === null || button === undefined) return false;
  if (button.disabled === true) return annotationComposerDraftEmpty() !== false;
  try {
    return button.querySelector('svg rect') !== null;
  } catch (error) {
    return false;
  }
}

function annotationGestureMatches(event, binding) {
  if (binding === null || binding === undefined || binding.code !== event.code) return false;
  const modifiers = Array.isArray(binding.modifiers) ? binding.modifiers : [];
  return Boolean(event.ctrlKey) === modifiers.includes('control')
    && Boolean(event.metaKey) === modifiers.includes('meta')
    && Boolean(event.shiftKey) === modifiers.includes('shift')
    && Boolean(event.altKey) === modifiers.includes('alt');
}

/**
 * The host's Send shortcut in an empty composer (host Send disabled) sends the
 * pending annotations instead of doing nothing. Bindings come from the host
 * shortcut catalog (fixed.send / fixed.complementary), so Enter, Cmd/Ctrl+Enter
 * and any host rebinding stay in sync. Only fires when the composer is focused
 * (or nothing is focused) and no IME composition is active.
 */
function installAnnotationEnterSend() {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return function noop() {};
  }
  const onKeyDown = function handleAnnotationEnter(event) {
    if (event === null || event === undefined) return;
    if (event.isComposing === true || event.keyCode === 229) return;
    const bindings = annotationSendShortcutBindings();
    let matched = false;
    for (const binding of bindings) {
      if (annotationGestureMatches(event, binding)) {
        matched = true;
        break;
      }
    }
    if (!matched) return;
    try {
      const active = document.activeElement;
      const inComposer = active !== null && active !== undefined
        && typeof active.closest === 'function' && active.closest('[data-composer-card]') !== null;
      const nothingFocused = active === null || active === undefined || active === document.body;
      if (!inComposer && !nothingFocused) return;
      if (active !== null && active !== undefined && typeof active.closest === 'function'
        && active.closest('[data-dsh-annotation-ui]') !== null) return;
      const buttons = document.querySelectorAll('[data-composer-card] button[class*="_primary"]');
      const primary = buttons.length > 0 ? buttons[buttons.length - 1] : null;
      if (!annotationPrimaryAcceptsSend(primary)) return;
      const sessionId = getAnnotationActiveSession() || currentConversationSessionId();
      if (typeof sessionId !== 'string' || sessionId.length === 0) return;
      if (annotationStore.get(sessionId).length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      sendPendingAnnotations(sessionId).then(function sent(ok) {
        if (ok !== true) showAnnotationNotice(annotationTranslate(undefined, 'capsule.sendFailed'));
      }, function failed() {
        showAnnotationNotice(annotationTranslate(undefined, 'capsule.sendFailed'));
      });
    } catch (error) {
      /* ignore */
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  return function disposeAnnotationEnter() {
    try {
      document.removeEventListener('keydown', onKeyDown, true);
    } catch (error) {
      /* ignore */
    }
  };
}

const ANNOTATION_SEND_WRAP_FLAG = '__dshAnnotationWrapped';

/**
 * Cordis exposes traceable services through a per-read Proxy; writing a method
 * on that Proxy reaches the underlying instance, while reading it back yields
 * a fresh shadow-method wrapper. Use the globally shared `cordis.original`
 * symbol to reach the instance itself so wrap ownership and restore stay
 * identity-stable across HMR reloads.
 */
const ANNOTATION_CORDIS_ORIGINAL = typeof Symbol === 'function' && typeof Symbol.for === 'function'
  ? Symbol.for('cordis.original') : null;

function annotationRawService(service) {
  try {
    if (service !== null && typeof service === 'object' && ANNOTATION_CORDIS_ORIGINAL !== null) {
      const raw = service[ANNOTATION_CORDIS_ORIGINAL];
      if (raw !== null && raw !== undefined && typeof raw === 'object') return raw;
    }
  } catch (error) {
    /* fall through to the given object */
  }
  return service;
}

function annotationSessionIdOf(session) {
  if (session === null || session === undefined) return null;
  if (typeof session.sessionId === 'string' && session.sessionId.length > 0) return session.sessionId;
  if (typeof session.id === 'string' && session.id.length > 0) return session.id;
  return null;
}

/**
 * Wrap `conversation.sendSession` exactly once. The wrapper decorates prompts
 * (text and/or attachments) of Sessions with pending annotations and removes
 * exactly the consumed annotations after the Host acknowledges a successful send.
 *
 * @returns {Function} restore callback (idempotent).
 */
function installSendSessionAnnotationWrap(service) {
  const target = annotationRawService(service);
  if (target === null || target === undefined || typeof target.sendSession !== 'function') {
    return function noop() {};
  }
  if (target[ANNOTATION_SEND_WRAP_FLAG] === true) return function noop() {};
  const original = target.sendSession;

  const wrapped = function sendSessionWithAnnotations(session, text, attachmentIds, mode, signal) {
    let outgoing = text;
    let decorated = false;
    let consumed = ANNOTATION_EMPTY_LIST;
    try {
      const sessionId = annotationSessionIdOf(session);
      const list = sessionId === null ? ANNOTATION_EMPTY_LIST : annotationStore.get(sessionId);
      const trimmed = typeof text === 'string' ? text.trim() : '';
      const hasAttachments = Array.isArray(attachmentIds) && attachmentIds.length > 0;
      if (sessionId !== null && list.length > 0 && !isAnnotationBlockText(text)
        && (trimmed.length > 0 || hasAttachments)
        && (trimmed.length === 0 || trimmed.charAt(0) !== '/')) {
        const block = buildAnnotationBlock(list, text);
        if (block !== text) {
          outgoing = block;
          decorated = true;
          consumed = list;
        }
      }
    } catch (error) {
      outgoing = text;
      decorated = false;
    }

    const result = original.call(this, session, outgoing, attachmentIds, mode, signal);
    if (!decorated) return result;

    try {
      return Promise.resolve(result).then(function consumeOnSuccess(response) {
        try {
          if (response !== null && response !== undefined && response.kind === 'success') {
            const sessionId = annotationSessionIdOf(session);
            if (sessionId !== null && consumed.length > 0) {
              // Keep a read-only archive so the reply keeps its comment bubbles.
              annotationSentStore.addMany(sessionId, consumed);
              // Keep annotations the user added after the send was accepted.
              annotationStore.removeMany(sessionId, consumed.map(function idOf(annotation) { return annotation.id; }));
            }
          }
        } catch (error) {
          /* ignore consumption failure */
        }
        return response;
      }, function keepOnFailure(error) {
        throw error;
      });
    } catch (error) {
      return result;
    }
  };

  try {
    target.sendSession = wrapped;
  } catch (error) {
    return function noop() {};
  }
  try {
    target[ANNOTATION_SEND_WRAP_FLAG] = true;
  } catch (error) {
    /* flag is best effort */
  }

  let restored = false;
  return function restoreSendSession() {
    if (restored) return;
    restored = true;
    try {
      if (target[ANNOTATION_SEND_WRAP_FLAG] === true) {
        target.sendSession = original;
        delete target[ANNOTATION_SEND_WRAP_FLAG];
      }
    } catch (error) {
      /* ignore */
    }
  };
}
