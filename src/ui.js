/**
 * React UI for response annotations: floating toolbar, comment editor,
 * numbered markers and highlight overlay, mounted through `shell.overlay`.
 *
 * All colors go through `--dsw-alias-*` theme tokens with literal fallbacks;
 * every selector is scoped under `[data-dsh-annotation-ui]` so the host page is
 * never restyled. Components fail closed through an error boundary.
 */

const ANNOTATION_STYLE_TAG = 'dsh-annotation';
const ANNOTATION_OVERLAY_Z = 70;

const annotationStyleText = [
  '[data-dsh-annotation-ui]{box-sizing:border-box}',
  '[data-dsh-annotation-ui] *,[data-dsh-annotation-ui] *::before,[data-dsh-annotation-ui] *::after{box-sizing:border-box}',
  '[data-dsh-annotation-ui] button{font-family:inherit}',
  '.dsh-annotation-toolbar{z-index:' + ANNOTATION_OVERLAY_Z + ';pointer-events:none;position:fixed}',
  '.dsh-annotation-toolbar-btn{display:inline-flex;align-items:center;gap:6px;pointer-events:auto;cursor:pointer;',
  'border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:999px;',
  'background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);',
  'box-shadow:var(--dsw-elevation-panel,0 4px 16px rgba(0,0,0,.16));padding:6px 12px;',
  'font-size:13px;line-height:18px;font-weight:500;white-space:nowrap}',
  '.dsh-annotation-toolbar-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}',
  '.dsh-annotation-toolbar-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
  '.dsh-annotation-toolbar-icon{display:inline-flex;align-items:center;justify-content:center;flex:none}',
  '.dsh-annotation-highlight{position:fixed;border-radius:3px;background:var(--dsw-alias-button-info-fill,#339cff);',
  'opacity:.14;pointer-events:none;transition:opacity .12s ease}',
  '.dsh-annotation-highlight.is-active{opacity:.3}',
  '.dsh-annotation-marker{position:fixed;transform:translate(-50%,-50%);width:25px;height:25px;padding:0;',
  'border-radius:50% 50% 50% 3px;border:1px solid #fff;cursor:pointer;pointer-events:auto;',
  'background:var(--dsw-alias-button-info-fill,#339cff);color:#fff;font-size:12px;font-weight:600;line-height:1;',
  'display:inline-flex;align-items:center;justify-content:center;',
  'box-shadow:0 2px 8px rgba(0,0,0,.28);transition:transform .12s ease,filter .12s ease}',
  '.dsh-annotation-marker:hover{transform:translate(-50%,-50%) scale(1.1);filter:brightness(1.05)}',
  '.dsh-annotation-marker:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
  '.dsh-annotation-marker[data-dsh-annotation-flash]{box-shadow:0 0 0 6px rgba(51,156,255,.35),0 2px 8px rgba(0,0,0,.28)}',
  '.dsh-annotation-card{z-index:' + (ANNOTATION_OVERLAY_Z + 1) + ';position:fixed;width:294px;display:flex;flex-direction:column;gap:8px;',
  'padding:12px;border-radius:16px;border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);',
  'background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);',
  'box-shadow:var(--dsw-elevation-panel,0 8px 32px rgba(0,0,0,.18));overflow:hidden}',
  '.dsh-annotation-quote-preview{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8f98);',
  'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}',
  '.dsh-annotation-textarea{width:100%;min-height:64px;max-height:160px;resize:vertical;border:none;outline:none;',
  'background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;padding:2px 0}',
  '.dsh-annotation-textarea::placeholder{color:var(--dsw-alias-label-tertiary,#8a8f98)}',
  '.dsh-annotation-card-actions{display:flex;align-items:center;gap:8px}',
  '.dsh-annotation-card-actions .dsh-annotation-spacer{flex:1 1 auto}',
  '.dsh-annotation-btn{border:none;cursor:pointer;border-radius:8px;padding:5px 11px;font-size:13px;line-height:18px;',
  'background:transparent;color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-annotation-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}',
  '.dsh-annotation-btn.is-danger{color:var(--dsw-alias-state-error-primary,#d93025)}',
  '.dsh-annotation-btn.is-primary{color:var(--dsw-alias-label-primary-foreground,#fff);background:var(--dsw-alias-button-primary-fill,#4d6bfe)}',
  '.dsh-annotation-btn.is-primary:hover{filter:brightness(1.05);background:var(--dsw-alias-button-primary-hover,#4d6bfe)}',
  '.dsh-annotation-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
  '.dsh-annotation-capsule{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px;',
  'color:var(--dsw-alias-label-secondary,#5c6066);align-self:flex-start;max-width:100%}',
  '.dsh-annotation-capsule-bar{display:flex;align-items:center;gap:6px}',
  '.dsh-annotation-capsule-toggle{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;cursor:pointer;',
  'border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:999px;background:transparent;',
  'color:inherit;font-size:12px;line-height:18px}',
  '.dsh-annotation-capsule-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}',
  '.dsh-annotation-capsule-clear{padding:3px 8px;border:none;border-radius:999px;background:transparent;',
  'color:var(--dsw-alias-label-tertiary,#8a8f98);cursor:pointer;font-size:12px;line-height:18px}',
  '.dsh-annotation-capsule-clear:hover{color:var(--dsw-alias-state-error-primary,#d93025)}',
  '.dsh-annotation-capsule-hint{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;line-height:16px;padding-left:2px}',
  '.dsh-annotation-capsule-list{margin-top:2px;max-height:220px;overflow-y:auto;border-radius:10px;',
  'border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);background:var(--dsw-alias-bg-base,#fff)}',
  '.dsh-annotation-capsule-row{display:flex;align-items:flex-start;gap:8px;padding:7px 9px;border-bottom:.5px solid var(--dsw-alias-border-l3,#eceef1)}',
  '.dsh-annotation-capsule-row:last-child{border-bottom:none}',
  '.dsh-annotation-capsule-row-main{flex:1 1 auto;min-width:0;cursor:pointer;text-align:left;background:transparent;border:none;padding:0;color:inherit;font:inherit}',
  '.dsh-annotation-capsule-row-main:hover .dsh-annotation-capsule-quote{color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-annotation-capsule-index{flex:none;color:var(--dsw-alias-label-tertiary,#8a8f98);font-variant-numeric:tabular-nums}',
  '.dsh-annotation-capsule-quote{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
  'color:var(--dsw-alias-label-secondary,#5c6066)}',
  '.dsh-annotation-capsule-comment{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
  'color:var(--dsw-alias-label-tertiary,#8a8f98)}',
  '.dsh-annotation-capsule-actions{flex:none;display:flex;gap:2px}',
  '.dsh-annotation-icon-btn{border:none;background:transparent;cursor:pointer;padding:3px;border-radius:6px;',
  'color:var(--dsw-alias-label-tertiary,#8a8f98);display:inline-flex;align-items:center}',
  '.dsh-annotation-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5);color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-annotation-icon-btn.is-danger:hover{color:var(--dsw-alias-state-error-primary,#d93025)}',
  '.dsh-annotation-sent{display:block;margin:4px 0 8px;padding:9px 11px;border-radius:12px;',
  'border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);background:var(--dsw-alias-bg-base,#fff);',
  'color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;line-height:20px}',
  '.dsh-annotation-sent-head{display:flex;align-items:center;gap:7px;width:100%;border:none;background:transparent;',
  'padding:0;cursor:pointer;color:inherit;font:inherit;text-align:left}',
  '.dsh-annotation-sent-count{font-weight:500}',
  '.dsh-annotation-sent-chevron{display:inline-flex;transition:transform .12s ease}',
  '.dsh-annotation-sent-chevron.is-open{transform:rotate(90deg)}',
  '.dsh-annotation-sent-list{margin-top:7px;display:flex;flex-direction:column;gap:7px}',
  '.dsh-annotation-sent-item{display:flex;flex-direction:column;gap:2px}',
  '.dsh-annotation-sent-label{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px;line-height:18px}',
  '.dsh-annotation-sent-quote{color:var(--dsw-alias-label-secondary,#5c6066);font-size:12px;line-height:18px;',
  'white-space:pre-wrap;word-break:break-word}',
  '.dsh-annotation-sent-comment{color:var(--dsw-alias-label-primary,#1a1a1a);font-size:12px;line-height:18px;',
  'white-space:pre-wrap;word-break:break-word}',
  '.dsh-annotation-sent-item-head{display:flex;align-items:center;gap:6px}',
  '.dsh-annotation-sent-locate{margin-left:auto;flex:none}',
  '.dsh-annotation-sent-quote[data-dsh-annotation-ui=sent-quote]{display:block;width:100%;text-align:left;',
  'border:none;background:transparent;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit}',
  '.dsh-annotation-sent-quote[data-dsh-annotation-ui=sent-quote]:hover{color:var(--dsw-alias-label-primary,#1a1a1a);',
  'text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px}',
  '.dsh-annotation-composer-annotations{position:absolute;left:12px;right:12px;bottom:100%;',
  'margin-bottom:8px;z-index:60;display:flex;justify-content:flex-start;pointer-events:none}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule{pointer-events:auto;position:relative;',
  'display:flex;flex-direction:column;align-items:flex-start;gap:4px;max-width:100%}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-bar{display:flex;align-items:center;gap:6px;',
  'padding:3px 4px 3px 3px;border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);border-radius:999px;',
  'background:var(--dsw-alias-bg-base,#fff);box-shadow:var(--dsw-elevation-soft,0 2px 8px rgba(0,0,0,.08))}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-toggle{border:none;background:transparent;',
  'padding:3px 6px}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-toggle:hover{background:transparent}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-clear{padding:3px 8px}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-list{position:absolute;bottom:calc(100% + 6px);',
  'left:0;min-width:min(360px,72vw);max-width:min(460px,86vw);max-height:min(320px,48vh);overflow-y:auto;',
  'border-radius:12px;border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);',
  'background:var(--dsw-alias-bg-base,#fff);box-shadow:var(--dsw-elevation-panel,0 8px 32px rgba(0,0,0,.18));',
  'padding:2px 0}',
  '.dsh-annotation-capsule-more{padding:6px 10px;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:12px}',
  '.dsh-annotation-marker.is-sent{width:21px;height:21px;background:var(--dsw-alias-label-secondary,#5c6066);',
  'border-radius:50%}',
  '.dsh-annotation-sent-popover{z-index:' + (ANNOTATION_OVERLAY_Z + 2) + ';gap:6px}',
  '.dsh-annotation-sent-quote-static{color:var(--dsw-alias-label-secondary,#5c6066);font-size:12px;',
  'line-height:18px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow-y:auto}',
  '.dsh-annotation-notice{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:' + (ANNOTATION_OVERLAY_Z + 5) + ';',
  'max-width:min(560px,88vw);padding:7px 12px;border-radius:10px;font-size:12px;line-height:18px;',
  'border:.5px solid var(--dsw-alias-border-l2,#d8dbe0);background:var(--dsw-alias-bg-base,#fff);',
  'color:var(--dsw-alias-label-primary,#1a1a1a);box-shadow:var(--dsw-elevation-panel,0 8px 32px rgba(0,0,0,.18));',
  'pointer-events:auto;cursor:copy;user-select:text;white-space:pre-wrap;word-break:break-word}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-send{display:inline-flex;align-items:center;',
  'justify-content:center;border:none;background:transparent;cursor:pointer;padding:3px 6px;border-radius:999px;',
  'color:var(--dsw-alias-brand-primary,#4d6bfe)}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-send:hover{background:var(--dsw-alias-interactive-bg-hover,#f2f3f5)}',
  '.dsh-annotation-composer-annotations .dsh-annotation-capsule-send:disabled{opacity:.45;cursor:default}',
  '.dsh-annotation-send-overlay{position:fixed;z-index:' + (ANNOTATION_OVERLAY_Z + 3) + ';border:none;border-radius:999px;',
  'background:var(--dsw-alias-button-info-fill,#4d6bfe);color:#fff;cursor:pointer;pointer-events:auto;',
  'display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.2)}',
  '.dsh-annotation-send-overlay:hover{filter:brightness(1.05)}',
  '.dsh-annotation-send-overlay:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
  '.dsh-annotation-send-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;',
  'border-radius:999px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);',
  'font-size:10px;line-height:16px;text-align:center;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
  '.dsh-annotation-notice{display:flex;align-items:flex-start;gap:8px}',
  '.dsh-annotation-notice-text{flex:1 1 auto;min-width:0}',
  '.dsh-annotation-notice-close{flex:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8f98);',
  'font-size:16px;line-height:16px;cursor:pointer;padding:0 2px}',
  '.dsh-annotation-notice-close:hover{color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-annotation-capsule-diagnostics{padding:4px 10px 6px;border-top:.5px solid var(--dsw-alias-border-l1,#ececf0)}',
  '.dsh-annotation-link-btn{border:none;background:transparent;padding:2px 0;cursor:pointer;font:inherit;',
  'font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8f98);text-align:left}',
  '.dsh-annotation-link-btn:hover{color:var(--dsw-alias-label-primary,#1a1a1a);text-decoration:underline;',
  'text-underline-offset:2px}',
].join('');

/**
 * Inject one plugin stylesheet per module instance. Duplicate tags during an
 * HMR swap are harmless (identical rules), while deduplicating would let the
 * outgoing instance's disposer remove the incoming instance's only tag.
 */
function ensureAnnotationStyles() {
  if (typeof document === 'undefined' || document === null) return function noop() {};
  try {
    const tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-response-annotations';
    tag.dataset.pluginCss = ANNOTATION_STYLE_TAG;
    tag.textContent = annotationStyleText;
    document.head.appendChild(tag);
    return function removeAnnotationStyles() {
      try {
        tag.remove();
      } catch (error) {
        /* ignore */
      }
    };
  } catch (error) {
    return function noop() {};
  }
}

/** Translate through the host locale, with an embedded fallback dictionary. */
function annotationTranslate(t, key, params) {
  if (typeof t === 'function') {
    try {
      const value = t(key, params);
      if (typeof value === 'string' && value.length > 0) return value;
    } catch (error) {
      /* fall through */
    }
  }
  let text = key;
  try {
    if (typeof LOCALE_ZH !== 'undefined' && LOCALE_ZH !== null
      && typeof LOCALE_ZH[key] === 'string') text = LOCALE_ZH[key];
    else if (typeof LOCALE_EN !== 'undefined' && LOCALE_EN !== null
      && typeof LOCALE_EN[key] === 'string') text = LOCALE_EN[key];
  } catch (error) {
    /* keep key */
  }
  if (params !== null && typeof params === 'object') {
    for (const name of Object.keys(params)) {
      text = text.split('{' + name + '}').join(String(params[name]));
    }
  }
  return text;
}

/** Chat bubble with a numbered badge; matches the plugin icon language. */
function annotationChatIcon(size) {
  const dimension = Number.isFinite(size) ? size : 15;
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: dimension,
    height: dimension,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
  }, React.createElement('path', {
    d: 'M3.2 2.9h9.6a1.3 1.3 0 0 1 1.3 1.3v5.6a1.3 1.3 0 0 1-1.3 1.3H7.4L4.6 13.4v-2.3H3.2a1.3 1.3 0 0 1-1.3-1.3V4.2a1.3 1.3 0 0 1 1.3-1.3Z',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinejoin: 'round',
  }), React.createElement('circle', {
    cx: 8,
    cy: 6.7,
    r: 1.5,
    fill: 'currentColor',
  }));
}

function annotationChevronIcon(open) {
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: 12,
    height: 12,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
    style: { display: 'block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' },
  }, React.createElement('path', {
    d: 'M6 3.5 10.5 8 6 12.5',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }));
}

function annotationPencilIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
  }, React.createElement('path', {
    d: 'm10.8 2.9 2.3 2.3-7 7-2.9.6.6-2.9 7-7Z',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinejoin: 'round',
  }));
}

function annotationTrashIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
  }, React.createElement('path', {
    d: 'M3.5 4.5h9M6.4 4.5V3.2h3.2v1.3M5 4.5l.6 8h4.8l.6-8',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }));
}

/** Paper-plane (up arrow) glyph for "send annotations only". */
function annotationSendIcon(size) {
  const dimension = Number.isFinite(size) ? size : 13;
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: dimension,
    height: dimension,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
  }, React.createElement('path', {
    d: 'M8 12.5V3.8M8 3.8 4.6 7.2M8 3.8l3.4 3.4',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }));
}

/** Crosshair/target glyph for "locate the annotated passage" actions. */
function annotationTargetIcon() {
  return React.createElement('svg', {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    fill: 'none',
    'aria-hidden': true,
    focusable: 'false',
  }, React.createElement('circle', {
    cx: 8,
    cy: 8,
    r: 4.2,
    stroke: 'currentColor',
    strokeWidth: 1.3,
  }), React.createElement('path', {
    d: 'M8 1.3v3M8 11.7v3M1.3 8h3M11.7 8h3',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
  }));
}

/** Overlay component boundary: a crash hides only the annotation layer. */
class AnnotationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    try {
      console.error('[dsh-annotation] annotation UI crashed:', error);
    } catch (ignored) {
      /* ignore */
    }
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/** Module-level editor state shared by the overlay, markers and capsule. */
const annotationEditorStore = (function createAnnotationEditorStore() {
  let current = null;
  const listeners = new Set();

  function emit() {
    for (const listener of Array.from(listeners)) {
      if (typeof listener !== 'function') continue;
      try {
        listener();
      } catch (error) {
        try {
          console.error('[dsh-annotation] editor listener failed:', error);
        } catch (ignored) {
          /* ignore */
        }
      }
    }
  }

  return {
    getSnapshot: function getSnapshot() { return current; },
    subscribe: function subscribe(listener) {
      if (typeof listener !== 'function') return function noop() {};
      listeners.add(listener);
      let active = true;
      return function unsubscribe() {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    open: function open(draft) {
      if (draft === null || typeof draft !== 'object') return;
      current = draft;
      emit();
    },
    close: function close() {
      if (current === null) return;
      current = null;
      emit();
    },
  };
})();

/** Deterministic editor anchor when the source range cannot be re-measured. */
function annotationDefaultAnchor() {
  const width = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1024;
  const height = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 768;
  const top = Math.max(64, Math.round(height * 0.5));
  const left = Math.round(width / 2);
  return { top, left, width: 0, height: 0, right: left, bottom: top };
}

/** Open the comment editor for a fresh selection, or its existing annotation. */
function openAnnotationEditorForSelection(selection) {
  if (selection === null || typeof selection !== 'object' || typeof selection.sessionId !== 'string') return;
  let existing = null;
  try {
    existing = annotationStore.findByRange(
      selection.sessionId,
      selection.nodeKey,
      selection.start,
      selection.end,
      selection.quote,
    );
  } catch (error) {
    existing = null;
  }
  annotationEditorStore.open({
    key: existing !== null ? existing.id : makeAnnotationId(),
    existingId: existing !== null ? existing.id : null,
    sessionId: selection.sessionId,
    nodeKey: selection.nodeKey,
    messageId: selection.messageId || null,
    start: selection.start,
    end: selection.end,
    quote: selection.quote,
    prefix: selection.prefix || '',
    suffix: selection.suffix || '',
    comment: existing !== null ? existing.comment : '',
    anchor: selection.rect || annotationDefaultAnchor(),
  });
}

/** Open the editor for an already stored annotation (marker / capsule edit). */
function openAnnotationEditorForStored(sessionId, annotation) {
  if (typeof sessionId !== 'string' || annotation === null || typeof annotation !== 'object') return;
  let anchor = null;
  try {
    const range = rangeForAnnotation(annotation);
    if (range !== null) anchor = rectOfRange(range);
  } catch (error) {
    anchor = null;
  }
  annotationEditorStore.open({
    key: annotation.id,
    existingId: annotation.id,
    sessionId,
    nodeKey: annotation.nodeKey,
    messageId: annotation.messageId || null,
    start: annotation.start,
    end: annotation.end,
    quote: annotation.quote,
    prefix: annotation.prefix || '',
    suffix: annotation.suffix || '',
    comment: annotation.comment || '',
    anchor: anchor !== null ? anchor : annotationDefaultAnchor(),
  });
}

/** Persist the editor draft into the store (create or update). */
function saveAnnotationEditorDraft(draft, comment) {
  if (draft === null || typeof draft !== 'object' || typeof draft.sessionId !== 'string') return;
  const trimmed = annotationTrimComment(comment);
  try {
    if (typeof draft.existingId === 'string' && draft.existingId.length > 0) {
      annotationStore.update(draft.sessionId, draft.existingId, { comment: trimmed });
    } else {
      const existing = annotationStore.findByRange(
        draft.sessionId,
        draft.nodeKey,
        draft.start,
        draft.end,
        draft.quote,
      );
      if (existing !== null) {
        annotationStore.update(draft.sessionId, existing.id, { comment: trimmed });
      } else {
        annotationStore.add(draft.sessionId, {
          id: draft.key || makeAnnotationId(),
          nodeKey: draft.nodeKey,
          messageId: draft.messageId || null,
          start: draft.start,
          end: draft.end,
          quote: draft.quote,
          prefix: draft.prefix || '',
          suffix: draft.suffix || '',
          comment: trimmed,
          createdAt: Date.now(),
        });
      }
    }
  } catch (error) {
    try {
      console.error('[dsh-annotation] could not save annotation:', error);
    } catch (ignored) {
      /* ignore */
    }
  }
  annotationEditorStore.close();
}

function annotationClampNumber(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function annotationViewport() {
  const width = typeof window !== 'undefined' && Number.isFinite(window.innerWidth) ? window.innerWidth : 1024;
  const height = typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 768;
  return { width: Math.max(width, 320), height: Math.max(height, 240) };
}

function annotationToolbarPosition(rect) {
  const viewport = annotationViewport();
  const margin = 8;
  const center = rect.left + rect.width / 2;
  const left = annotationClampNumber(center, 64, viewport.width - 64);
  const placeAbove = rect.top - 8 >= 52;
  return {
    position: 'fixed',
    left: left + 'px',
    top: (placeAbove ? rect.top - 8 : rect.bottom + 8) + 'px',
    transform: placeAbove ? 'translate(-50%,-100%)' : 'translate(-50%,0)',
    zIndex: ANNOTATION_OVERLAY_Z,
    pointerEvents: 'none',
  };
}

function annotationEditorPosition(anchor) {
  const viewport = annotationViewport();
  const margin = 10;
  const width = Math.min(294, viewport.width - margin * 2);
  const estimatedHeight = 220;
  const source = anchor !== null && typeof anchor === 'object' ? anchor : annotationDefaultAnchor();
  const center = source.left + (source.width || 0) / 2;
  const left = annotationClampNumber(center - width / 2, margin, viewport.width - width - margin);
  let top = source.bottom + 8;
  if (top + estimatedHeight > viewport.height - margin) {
    const above = source.top - 8 - estimatedHeight;
    top = above >= margin ? above : Math.max(margin, viewport.height - estimatedHeight - margin);
  }
  const maxHeight = Math.max(140, viewport.height - top - margin);
  return {
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    maxHeight: maxHeight + 'px',
  };
}

/** Floating pill above the selection. */
function AnnotationToolbar(props) {
  const t = props.t;
  const selection = props.selection;
  const onAdd = props.onAdd;
  const style = annotationToolbarPosition(selection.rect);
  return React.createElement('div', {
    className: 'dsh-annotation-toolbar',
    'data-dsh-annotation-ui': 'toolbar',
    style,
  }, React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-toolbar-btn',
    'aria-label': annotationTranslate(t, 'toolbar.addToChat'),
    title: annotationTranslate(t, 'toolbar.addToChat'),
    onMouseDown: function keepSelection(event) {
      try {
        event.preventDefault();
      } catch (error) {
        /* ignore */
      }
    },
    onClick: function addAnnotation(event) {
      try {
        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        /* ignore */
      }
      onAdd();
    },
  }, React.createElement('span', {
    className: 'dsh-annotation-toolbar-icon',
    'aria-hidden': true,
  }, annotationChatIcon(15)), React.createElement('span', null,
    annotationTranslate(t, 'toolbar.addToChat'))));
}

/** Selection-anchored optional-comment editor card. */
function AnnotationEditorCard(props) {
  const t = props.t;
  const draft = props.draft;
  const initialComment = typeof draft.comment === 'string' ? draft.comment : '';
  const [comment, setComment] = React.useState(initialComment);
  const commentRef = React.useRef(initialComment);
  commentRef.current = comment;
  const textareaRef = React.useRef(null);

  React.useEffect(function focusComment() {
    const element = textareaRef.current;
    if (element !== null && element !== undefined && typeof element.focus === 'function') {
      try {
        element.focus();
        if (typeof element.setSelectionRange === 'function') {
          element.setSelectionRange(element.value.length, element.value.length);
        }
      } catch (error) {
        /* ignore */
      }
    }
  }, []);

  React.useEffect(function bindDocumentGestures() {
    if (typeof document === 'undefined') return function noop() {};
    const saveCurrent = function saveCurrent() {
      saveAnnotationEditorDraft(draft, commentRef.current);
    };
    const cancelCurrent = function cancelCurrent() {
      annotationEditorStore.close();
    };
    const onPointerDown = function handlePointerDown(event) {
      try {
        const target = event.target;
        if (target !== null && target !== undefined && target.nodeType === 1
          && typeof target.closest === 'function'
          && target.closest('[data-dsh-annotation-ui]') !== null) return;
      } catch (error) {
        /* fall through to close */
      }
      cancelCurrent();
    };
    const onKeyDown = function handleKeyDown(event) {
      if (event === null || event === undefined) return;
      if (event.key === 'Escape') {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (error) {
          /* ignore */
        }
        cancelCurrent();
        return;
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (error) {
          /* ignore */
        }
        saveCurrent();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return function unbindDocumentGestures() {
      try {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
      } catch (error) {
        /* ignore */
      }
    };
  }, [draft]);

  return React.createElement('div', {
    className: 'dsh-annotation-card',
    'data-dsh-annotation-ui': 'editor',
    role: 'dialog',
    'aria-label': draft.existingId
      ? annotationTranslate(t, 'editor.titleEdit')
      : annotationTranslate(t, 'editor.titleNew'),
    style: annotationEditorPosition(draft.anchor),
  },
  React.createElement('div', {
    className: 'dsh-annotation-quote-preview',
    title: draft.quote,
    'data-dsh-annotation-ui': 'quote',
  }, draft.quote),
  React.createElement('textarea', {
    ref: textareaRef,
    className: 'dsh-annotation-textarea',
    value: comment,
    rows: 3,
    placeholder: annotationTranslate(t, 'editor.placeholder'),
    'aria-label': annotationTranslate(t, 'editor.noteAriaLabel'),
    onChange: function updateComment(event) {
      setComment(event.target.value);
    },
  }),
  React.createElement('div', { className: 'dsh-annotation-card-actions' },
    draft.existingId
      ? React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-btn is-danger',
        'aria-label': annotationTranslate(t, 'editor.delete'),
        onClick: function deleteAnnotation() {
          try {
            if (typeof draft.existingId === 'string') {
              annotationStore.remove(draft.sessionId, draft.existingId);
            }
          } catch (error) {
            /* ignore */
          }
          annotationEditorStore.close();
        },
      }, annotationTranslate(t, 'editor.delete'))
      : null,
    React.createElement('span', { className: 'dsh-annotation-spacer' }),
    React.createElement('button', {
      type: 'button',
      className: 'dsh-annotation-btn',
      'aria-label': annotationTranslate(t, 'editor.cancel'),
      onClick: function cancelEditing() {
        annotationEditorStore.close();
      },
    }, annotationTranslate(t, 'editor.cancel')),
    React.createElement('button', {
      type: 'button',
      className: 'dsh-annotation-btn is-primary',
      'aria-label': annotationTranslate(t, 'editor.save'),
      onClick: function saveEditing() {
        saveAnnotationEditorDraft(draft, commentRef.current);
      },
    }, annotationTranslate(t, 'editor.save'))));
}

/**
 * Transient source highlight for locate/jump actions. It replaces the old
 * always-on numbered markers: a pending or sent annotation is flashed for a
 * moment when the user asks where it came from.
 */
function AnnotationFlashLayer() {
  const flash = React.useSyncExternalStore(
    subscribeAnnotationFlash,
    getAnnotationFlash,
    getAnnotationFlash,
  );
  const [items, setItems] = React.useState([]);

  React.useEffect(function trackFlash() {
    if (flash === null || flash === undefined) {
      setItems([]);
      return function noop() {};
    }
    if (typeof window === 'undefined') return function noop() {};
    let disposed = false;
    let raf = 0;
    const measure = function measureFlash() {
      raf = 0;
      if (disposed) return;
      try {
        const next = measureAnnotationAnchors([flash]);
        const band = annotationViewportBand();
        const all = next.length > 0 ? next[0].rects : [];
        const clipped = [];
        for (const rect of all) {
          if (rect.bottom <= band.top || rect.top >= band.bottom) continue;
          const top = Math.max(rect.top, band.top);
          const bottom = Math.min(rect.bottom, band.bottom);
          if (bottom - top < 1) continue;
          clipped.push({ left: rect.left, top, width: rect.width, height: bottom - top });
        }
        setItems(clipped);
      } catch (error) {
        setItems([]);
      }
    };
    const schedule = function scheduleFlash() {
      if (disposed || raf !== 0) return;
      try {
        raf = requestAnimationFrame(measure);
      } catch (error) {
        measure();
      }
    };
    schedule();
    // The locate scroll happens before the effect; re-measure after it lands.
    const settle = setTimeout(schedule, 120);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return function disposeFlash() {
      disposed = true;
      clearTimeout(settle);
      if (raf !== 0) {
        try { cancelAnimationFrame(raf); } catch (error) { /* ignore */ }
      }
      raf = 0;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [flash]);

  if (flash === null || flash === undefined || items.length === 0) return null;
  return React.createElement('div', {
    'data-dsh-annotation-ui': 'highlight-layer',
    style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: ANNOTATION_OVERLAY_Z - 1 },
  }, items.map(function renderHighlight(rect, index) {
    return React.createElement('div', {
      key: 'flash:' + index,
      className: 'dsh-annotation-highlight is-active',
      'data-dsh-annotation-ui': 'highlight',
      style: {
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: Math.max(rect.width, 1) + 'px',
        height: Math.max(rect.height, 1) + 'px',
      },
    });
  }));
}

/**
 * Comment bubbles on annotated assistant replies. Pending annotations show
 * their pending number; already-sent annotations show a comment glyph so the
 * reader can see "I commented here" and reopen the excerpt/comment read-only.
 */
function AnnotationMarkerLayer(props) {
  const t = props !== null && props !== undefined ? props.t : undefined;
  const [snapshot, setSnapshot] = React.useState({ sessionId: null, items: [] });
  const [openSent, setOpenSent] = React.useState(null);

  React.useEffect(function trackAnchors() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return function noop() {};
    let disposed = false;
    let raf = 0;

    const measure = function measureMarkers() {
      raf = 0;
      if (disposed) return;
      try {
        const sessionId = getAnnotationActiveSession() || currentConversationSessionId();
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          setSnapshot(function keepEmpty(previous) {
            return previous.sessionId === null && previous.items.length === 0 ? previous : { sessionId: null, items: [] };
          });
          return;
        }
        const pending = annotationStore.get(sessionId);
        const sent = annotationSentStore.get(sessionId);
        const kinds = [];
        const list = [];
        for (const annotation of pending) { kinds.push('pending'); list.push(annotation); }
        for (const annotation of sent) { kinds.push('sent'); list.push(annotation); }
        if (list.length === 0) {
          setSnapshot(function keepEmptySession(previous) {
            return previous.sessionId === sessionId && previous.items.length === 0
              ? previous : { sessionId, items: [] };
          });
          return;
        }
        const anchors = measureAnnotationAnchors(list);
        const items = anchors.map(function withKind(anchor, index) {
          return { annotation: anchor.annotation, number: anchor.number, marker: anchor.marker, kind: kinds[index] };
        });
        setSnapshot({ sessionId, items });
      } catch (error) {
        setSnapshot({ sessionId: null, items: [] });
        showAnnotationNotice('气泡层异常：' + (error && error.message ? error.message : String(error)));
      }
    };
    const schedule = function scheduleMarkers() {
      if (disposed || raf !== 0) return;
      try {
        raf = requestAnimationFrame(measure);
      } catch (error) {
        measure();
      }
    };

    const offPending = annotationStore.subscribe(schedule);
    const offSent = annotationSentStore.subscribe(schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);

    let observer = null;
    try {
      observer = new MutationObserver(function onMutations() { schedule(); });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    } catch (error) {
      observer = null;
    }

    schedule();
    return function disposeMarkers() {
      disposed = true;
      offPending();
      offSent();
      try {
        if (raf !== 0) cancelAnimationFrame(raf);
      } catch (error) {
        /* ignore */
      }
      raf = 0;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (observer !== null) {
        try { observer.disconnect(); } catch (error) { /* ignore */ }
      }
    };
  }, []);

  // Outside press closes the read-only sent popover.
  React.useEffect(function bindSentPopoverDismiss() {
    if (openSent === null) return function noop() {};
    if (typeof document === 'undefined') return function noop() {};
    const onPointerDown = function handlePointerDown(event) {
      try {
        const target = event.target;
        if (target !== null && target !== undefined && target.nodeType === 1
          && typeof target.closest === 'function'
          && target.closest('[data-dsh-annotation-ui]') !== null) return;
      } catch (error) {
        /* ignore */
      }
      setOpenSent(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return function unbindSentPopoverDismiss() {
      try { document.removeEventListener('pointerdown', onPointerDown, true); } catch (error) { /* ignore */ }
    };
  }, [openSent]);

  if (snapshot.items.length === 0) return null;
  const sessionId = snapshot.sessionId;

  const band = annotationViewportBand();
  const markers = snapshot.items.filter(function visibleMarker(item) {
    return item.marker.top >= band.top + 8 && item.marker.top <= band.bottom - 8;
  }).map(function renderMarker(item) {
    const annotation = item.annotation;
    const isPending = item.kind === 'pending';
    const label = isPending
      ? annotationTranslate(t, 'marker.aria', { number: item.number })
      : annotationTranslate(t, 'marker.sentAria');
    return React.createElement('button', {
      key: (isPending ? 'p:' : 's:') + annotation.id,
      type: 'button',
      className: 'dsh-annotation-marker' + (isPending ? '' : ' is-sent'),
      'data-dsh-annotation-ui': 'marker',
      'data-dsh-annotation-marker': annotation.id,
      'aria-label': label,
      title: annotation.quote,
      style: { left: item.marker.left + 'px', top: item.marker.top + 'px' },
      onClick: function openMarker(event) {
        try {
          event.preventDefault();
          event.stopPropagation();
        } catch (error) {
          /* ignore */
        }
        // Highlight the annotated passage while the editor/popover is open.
        flashAnnotation(annotation, 6000);
        if (isPending) {
          openAnnotationEditorForStored(sessionId, annotation);
        } else {
          setOpenSent({ annotation, rect: item.marker });
        }
      },
    }, isPending ? String(item.number) : annotationChatIcon(12));
  });

  const popover = openSent === null ? null : (function renderSentPopover() {
    const annotation = openSent.annotation;
    const viewport = annotationViewport();
    const width = Math.min(320, viewport.width - 20);
    const left = annotationClampNumber(openSent.rect.left + 16, 10, viewport.width - width - 10);
    const top = annotationClampNumber(openSent.rect.top + 16, 10, viewport.height - 160);
    return React.createElement('div', {
      className: 'dsh-annotation-card dsh-annotation-sent-popover',
      'data-dsh-annotation-ui': 'sent-popover',
      style: { left: left + 'px', top: top + 'px', width: width + 'px' },
      role: 'dialog',
      'aria-label': annotationTranslate(t, 'sent.title', { count: 1 }),
    },
    React.createElement('div', { className: 'dsh-annotation-sent-label' },
      annotationTranslate(t, 'sent.selectedText')),
    React.createElement('div', { className: 'dsh-annotation-sent-quote-static' }, annotation.quote),
    annotationTrimComment(annotation.comment).length > 0
      ? React.createElement('div', { className: 'dsh-annotation-sent-label' },
        annotationTranslate(t, 'sent.userComment'))
      : null,
    annotationTrimComment(annotation.comment).length > 0
      ? React.createElement('div', { className: 'dsh-annotation-sent-comment' },
        annotationTrimComment(annotation.comment))
      : null,
    React.createElement('div', { className: 'dsh-annotation-card-actions' },
      React.createElement('span', { className: 'dsh-annotation-spacer' }),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-btn',
        onClick: function closeSentPopover() { setOpenSent(null); },
      }, annotationTranslate(t, 'editor.close'))));
  })();

  return React.createElement(React.Fragment, null,
    React.createElement('div', {
      'data-dsh-annotation-ui': 'marker-layer',
      style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: ANNOTATION_OVERLAY_Z },
    }, markers),
    popover);
}

/** Transient status line (double-click/locate diagnostics, failures). */
function AnnotationNoticeToast() {
  const notice = React.useSyncExternalStore(
    subscribeAnnotationNotice,
    getAnnotationNotice,
    getAnnotationNotice,
  );
  if (notice === null || notice === undefined) return null;
  const copy = function copyNotice(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      /* ignore */
    }
    try {
      if (navigator !== undefined && navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(notice);
      }
    } catch (error) {
      /* clipboard may be unavailable */
    }
  };
  return React.createElement('div', {
    className: 'dsh-annotation-notice',
    'data-dsh-annotation-ui': 'notice',
    role: 'status',
    title: '点击复制 / Click to copy',
    onClick: copy,
  }, React.createElement('span', { className: 'dsh-annotation-notice-text' }, notice),
  React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-notice-close',
    'aria-label': '关闭 / Close',
    onClick: function closeNotice(event) {
      try {
        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        /* ignore */
      }
      clearAnnotationNotice();
    },
  }, '×'));
}

/**
 * Covers the host composer's primary button while the draft is empty and
 * pending annotations exist, so clicking (or Enter-then-click) sends the
 * annotations alone instead of doing nothing.
 */
function AnnotationSendOverlay(props) {
  const t = props !== null && props !== undefined ? props.t : undefined;
  const [state, setState] = React.useState(null);

  React.useEffect(function trackComposerPrimary() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return function noop() {};
    let disposed = false;
    let raf = 0;
    let timer = 0;

    const measure = function measurePrimary() {
      if (disposed) return;
      try {
        const sessionId = getAnnotationActiveSession() || currentConversationSessionId();
        const count = typeof sessionId === 'string' ? annotationStore.get(sessionId).length : 0;
        if (count === 0) {
          setState(null);
          return;
        }
        const buttons = document.querySelectorAll('[data-composer-card] button[class*="_primary"]');
        const button = buttons.length > 0 ? buttons[buttons.length - 1] : null;
        if (button === null) {
          setState(null);
          return;
        }
        let coverable = button.disabled === true && annotationComposerDraftEmpty() !== false;
        if (!coverable) {
          // Running with an empty draft: the host primary is Stop. Cover it with
          // the annotation send button (Codex behaviour); removing the pending
          // annotations brings Stop back because this overlay disappears.
          try {
            coverable = button.querySelector('svg rect') !== null;
          } catch (error) {
            coverable = false;
          }
        }
        if (!coverable) {
          // Draft has text (or another sendable state): let the host button act.
          setState(null);
          return;
        }
        const rect = button.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          setState(null);
          return;
        }
        setState({ sessionId, count, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      } catch (error) {
        setState(null);
      }
    };
    const schedule = function schedulePrimary() {
      if (disposed || raf !== 0) return;
      try {
        raf = requestAnimationFrame(function runMeasure() {
          raf = 0;
          measure();
        });
      } catch (error) {
        measure();
      }
    };

    const offStore = annotationStore.subscribe(schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    let observer = null;
    try {
      observer = new MutationObserver(schedule);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (error) {
      observer = null;
    }
    timer = setInterval(schedule, 700);
    schedule();
    return function disposePrimary() {
      disposed = true;
      offStore();
      try { clearInterval(timer); } catch (error) { /* ignore */ }
      try { if (raf !== 0) cancelAnimationFrame(raf); } catch (error) { /* ignore */ }
      raf = 0;
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (observer !== null) {
        try { observer.disconnect(); } catch (error) { /* ignore */ }
      }
    };
  }, []);

  if (state === null) return null;

  const label = annotationTranslate(t, 'sendOnly.aria', { count: state.count });
  return React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-send-overlay',
    'data-dsh-annotation-ui': 'send-overlay',
    'aria-label': label,
    title: label,
    style: {
      left: state.left + 'px',
      top: state.top + 'px',
      width: state.width + 'px',
      height: state.height + 'px',
    },
    onClick: function sendOnly(event) {
      try {
        event.preventDefault();
        event.stopPropagation();
      } catch (error) {
        /* ignore */
      }
      state && sendPendingAnnotations(state.sessionId).then(function sent(ok) {
        if (ok !== true) showAnnotationNotice(annotationTranslate(t, 'capsule.sendFailed'));
      }, function failed() {
        showAnnotationNotice(annotationTranslate(t, 'capsule.sendFailed'));
      });
    },
  }, annotationSendIcon(16),
  React.createElement('span', {
    className: 'dsh-annotation-send-badge',
    'aria-hidden': true,
  }, String(state.count)));
}

/** Root entry registered in `shell.overlay`. */
function AnnotationOverlay(props) {
  const t = props !== null && props !== undefined ? props.t : undefined;
  const editorDraft = React.useSyncExternalStore(
    annotationEditorStore.subscribe,
    annotationEditorStore.getSnapshot,
    annotationEditorStore.getSnapshot,
  );
  const selection = React.useSyncExternalStore(
    subscribeAnnotationSelection,
    getAnnotationSelection,
    getAnnotationSelection,
  );

  const onAdd = React.useCallback(function onAdd() {
    const current = getAnnotationSelection();
    if (current === null) return;
    try {
      // Drop the native selection before the editor opens (Codex behavior).
      if (typeof document !== 'undefined' && typeof document.getSelection === 'function') {
        const nativeSelection = document.getSelection();
        if (nativeSelection !== null && nativeSelection !== undefined
          && typeof nativeSelection.removeAllRanges === 'function') {
          nativeSelection.removeAllRanges();
        }
      }
    } catch (error) {
      /* ignore */
    }
    try {
      clearAnnotationSelection();
      openAnnotationEditorForSelection(current);
    } catch (error) {
      try {
        console.error('[dsh-annotation] could not open annotation editor:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }, []);

  const onEditMarker = React.useCallback(function onEditMarker(annotation, sessionId) {
    try {
      openAnnotationEditorForStored(sessionId, annotation);
    } catch (error) {
      try {
        console.error('[dsh-annotation] could not open stored annotation:', error);
      } catch (ignored) {
        /* ignore */
      }
    }
  }, []);

  return React.createElement(AnnotationErrorBoundary, null,
    React.createElement(AnnotationFlashLayer, null),
    React.createElement(AnnotationMarkerLayer, { t }),
    React.createElement(AnnotationNoticeToast, null),
    selection !== null && editorDraft === null
      ? React.createElement(AnnotationToolbar, { t, selection, onAdd })
      : null,
    editorDraft !== null
      ? React.createElement(AnnotationEditorCard, { key: editorDraft.key, t, draft: editorDraft })
      : null);
}
