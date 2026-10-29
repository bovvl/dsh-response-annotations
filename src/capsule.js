/**
 * Pending-annotation chip inside the composer overlay, rendered above the
 * composer card like the Codex "N annotations" attachment.
 *
 * Empty state renders nothing. The chip expands into a popover (opening
 * upward) with numbered rows; each row can locate its source passage, edit the
 * comment, or delete it. The chip also clears the pending set.
 */

function AnnotationCapsule(props) {
  const t = props !== null && props !== undefined ? props.t : undefined;
  const sessionId = props !== null && props !== undefined ? props.sessionId : undefined;
  const [expanded, setExpanded] = React.useState(false);
  const list = React.useSyncExternalStore(
    annotationStore.subscribe,
    function getCapsuleSnapshot() {
      return typeof sessionId === 'string' ? annotationStore.get(sessionId) : ANNOTATION_EMPTY_LIST;
    },
    function getCapsuleServerSnapshot() {
      return typeof sessionId === 'string' ? annotationStore.get(sessionId) : ANNOTATION_EMPTY_LIST;
    },
  );

  const [sending, setSending] = React.useState(false);

  if (typeof sessionId !== 'string' || list.length === 0) return null;

  const count = list.length;

  const copyDiagnostics = function copyDiagnostics(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      /* ignore */
    }
    try {
      const text = formatAnnotationDiagnostics();
      if (text.length === 0) {
        showAnnotationNotice(annotationTranslate(t, 'capsule.diagnosticsEmpty'));
        return;
      }
      if (navigator !== undefined && navigator.clipboard !== undefined) {
        void navigator.clipboard.writeText(text);
        showAnnotationNotice(annotationTranslate(t, 'capsule.diagnosticsCopied'));
      }
    } catch (error) {
      /* clipboard may be unavailable */
    }
  };

  const sendOnly = function sendOnlyAnnotations(event) {
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      /* ignore */
    }
    if (sending) return;
    setSending(true);
    Promise.resolve(sendPendingAnnotations(sessionId)).then(function sent(ok) {
      setSending(false);
      if (ok !== true) showAnnotationNotice(annotationTranslate(t, 'capsule.sendFailed'));
    }, function failed() {
      setSending(false);
      showAnnotationNotice(annotationTranslate(t, 'capsule.sendFailed'));
    });
  };

  const rows = list.slice(0, 20).map(function renderRow(annotation, index) {
    const number = annotationMarkerNumber(index);
    const quote = typeof annotation.quote === 'string' ? annotation.quote : '';
    const comment = annotationTrimComment(annotation.comment);
    return React.createElement('div', {
      key: annotation.id,
      className: 'dsh-annotation-capsule-row',
      'data-dsh-annotation-ui': 'capsule-row',
    },
    React.createElement('span', { className: 'dsh-annotation-capsule-index' }, number + '.'),
    React.createElement('button', {
      type: 'button',
      className: 'dsh-annotation-capsule-row-main',
      'aria-label': annotationTranslate(t, 'capsule.reveal', { number }),
      title: annotationTranslate(t, 'capsule.reveal', { number }),
      onClick: function reveal() {
        try {
          // Codex collapses the annotation list on a jump so it does not cover
          // the target passage.
          setExpanded(false);
          revealAnnotation(annotation);
        } catch (error) {
          /* ignore */
        }
      },
    },
    React.createElement('span', { className: 'dsh-annotation-capsule-quote' }, quote),
    comment.length > 0
      ? React.createElement('span', { className: 'dsh-annotation-capsule-comment' }, comment)
      : null),
    React.createElement('span', { className: 'dsh-annotation-capsule-actions' },
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-icon-btn',
        'aria-label': annotationTranslate(t, 'capsule.reveal', { number }),
        title: annotationTranslate(t, 'capsule.reveal', { number }),
        onClick: function revealRow() {
          try {
            setExpanded(false);
            revealAnnotation(annotation);
          } catch (error) {
            /* ignore */
          }
        },
      }, annotationTargetIcon()),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-icon-btn',
        'aria-label': annotationTranslate(t, 'capsule.edit', { number }),
        title: annotationTranslate(t, 'capsule.edit', { number }),
        onClick: function editRow() {
          try {
            openAnnotationEditorForStored(sessionId, annotation);
          } catch (error) {
            /* ignore */
          }
        },
      }, annotationPencilIcon()),
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-icon-btn is-danger',
        'aria-label': annotationTranslate(t, 'capsule.remove', { number }),
        title: annotationTranslate(t, 'capsule.remove', { number }),
        onClick: function removeRow() {
          try {
            annotationStore.remove(sessionId, annotation.id);
          } catch (error) {
            /* ignore */
          }
        },
      }, annotationTrashIcon())));
  });

  const popover = expanded
    ? React.createElement('div', {
      className: 'dsh-annotation-capsule-list',
      'data-dsh-annotation-ui': 'capsule-list',
      role: 'list',
    }, rows, list.length > 20
      ? React.createElement('div', { className: 'dsh-annotation-capsule-more' },
        '+' + (list.length - 20))
      : null,
    React.createElement('div', { className: 'dsh-annotation-capsule-diagnostics' },
      React.createElement('button', {
        type: 'button',
        className: 'dsh-annotation-link-btn',
        'data-dsh-annotation-ui': 'capsule-diagnostics',
        onClick: copyDiagnostics,
      }, annotationTranslate(t, 'capsule.diagnostics'))))
    : null;

  const chip = React.createElement('div', {
    className: 'dsh-annotation-capsule-bar',
    'data-dsh-annotation-ui': 'capsule-bar',
  },
  React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-capsule-toggle',
    'data-dsh-annotation-ui': 'capsule-toggle',
    'aria-expanded': expanded,
    'aria-label': expanded
      ? annotationTranslate(t, 'capsule.collapse')
      : annotationTranslate(t, 'capsule.expand'),
    title: annotationTranslate(t, 'capsule.hint'),
    onClick: function toggleExpanded() {
      setExpanded(function flip(value) { return !value; });
    },
  },
  React.createElement('span', { 'aria-hidden': true, style: { display: 'inline-flex' } },
    annotationChatIcon(13)),
  React.createElement('span', null, annotationTranslate(t, 'capsule.title', { count })),
  annotationChevronIcon(expanded)),
  React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-capsule-send',
    'data-dsh-annotation-ui': 'capsule-send',
    'aria-label': annotationTranslate(t, sending ? 'capsule.sending' : 'capsule.send'),
    title: annotationTranslate(t, sending ? 'capsule.sending' : 'capsule.send'),
    disabled: sending,
    onClick: sendOnly,
  }, annotationSendIcon(13)),
  React.createElement('button', {
    type: 'button',
    className: 'dsh-annotation-capsule-clear',
    'aria-label': annotationTranslate(t, 'capsule.clear'),
    title: annotationTranslate(t, 'capsule.clear'),
    onClick: function clearAll() {
      try {
        annotationStore.clear(sessionId);
      } catch (error) {
        /* ignore */
      }
    },
  }, annotationTranslate(t, 'capsule.clear')));

  return React.createElement(AnnotationErrorBoundary, null,
    React.createElement('div', {
      className: 'dsh-annotation-composer-annotations',
      'data-dsh-annotation-ui': 'composer-annotations',
      'data-dsh-annotation-session': sessionId,
    },
    React.createElement('div', {
      className: 'dsh-annotation-capsule',
      'data-dsh-annotation-ui': 'capsule',
    }, popover, chip)));
}


/**
 * Session-scoped bridge for root-scoped surfaces: records which conversation
 * session is mounted so the floating marker layer can read its annotations.
 */
function AnnotationSessionBridge(props) {
  const sessionId = props !== null && props !== undefined ? props.sessionId : undefined;
  React.useEffect(function bindActiveSession() {
    setAnnotationActiveSession(typeof sessionId === 'string' ? sessionId : null);
    return function releaseActiveSession() {
      if (getAnnotationActiveSession() === (typeof sessionId === 'string' ? sessionId : null)) {
        setAnnotationActiveSession(null);
      }
    };
  }, [sessionId]);
  return null;
}
