/**
 * Client plugin entry: registers locale, styles, selection tracking, the three
 * slot contributions, the user-text rule and the sendSession wrapper.
 *
 * Optional DSH services are consumed through `ctx.inject` so a profile without
 * ui-conversation or the conversation service still loads (annotation capture
 * and markers simply stay inactive / message ids stay unresolved).
 */

const ANNOTATION_LOCALE_NS = 'dsh-response-annotations';

/** Services required for the slot/locale half; everything else is optional. */
const inject = ['slots', 'locale'];

/** Resolve the Assistant message id behind one chat node key, if available. */
function annotationResolveChatMessageId(uiConversation, sessionId, nodeKey) {
  if (uiConversation === null || uiConversation === undefined) return null;
  try {
    if (typeof uiConversation.binding !== 'function') return null;
    const binding = uiConversation.binding(sessionId);
    if (binding === null || binding === undefined || typeof binding.target !== 'function') return null;
    const target = binding.target('chat');
    if (target === null || target === undefined || typeof target.getSnapshot !== 'function') return null;
    const snapshot = target.getSnapshot();
    if (snapshot === null || snapshot === undefined) return null;
    const nodes = snapshot.nodes;
    if (nodes === null || nodes === undefined || typeof nodes.get !== 'function') return null;
    const node = nodes.get(nodeKey);
    if (node === null || node === undefined || node.data === null || node.data === undefined) return null;
    const finalNode = node.data.finalNode;
    if (finalNode === null || finalNode === undefined) return null;
    const messageId = finalNode.messageId;
    return typeof messageId === 'string' && messageId.length > 0 ? messageId : null;
  } catch (error) {
    return null;
  }
}

/** Resolve the chat node key whose finalized assistant message owns `messageId`. */
function annotationNodeKeyForMessageId(uiConversation, sessionId, messageId) {
  if (uiConversation === null || uiConversation === undefined || typeof messageId !== 'string') return null;
  try {
    if (typeof uiConversation.binding !== 'function') return null;
    const binding = uiConversation.binding(sessionId);
    if (binding === null || binding === undefined || typeof binding.target !== 'function') return null;
    const target = binding.target('chat');
    if (target === null || target === undefined || typeof target.getSnapshot !== 'function') return null;
    const snapshot = target.getSnapshot();
    const nodes = snapshot === null || snapshot === undefined ? null : snapshot.nodes;
    if (nodes === null || nodes === undefined || typeof nodes.forEach !== 'function') return null;
    let found = null;
    nodes.forEach(function findNode(node, key) {
      if (found !== null) return;
      try {
        const finalNode = node === null || node === undefined || node.data === null || node.data === undefined
          ? null : node.data.finalNode;
        if (finalNode !== null && finalNode !== undefined && finalNode.messageId === messageId) found = key;
      } catch (error) {
        /* ignore one node */
      }
    });
    return found;
  } catch (error) {
    return null;
  }
}

/** Client plugin apply. */
function apply(ctx) {
  ctx.effect(function registerLocale() {
    return ctx.locale.register(ANNOTATION_LOCALE_NS, {
      zh: LOCALE_ZH,
      en: LOCALE_EN,
    });
  }, 'dsh-annotation: dictionaries');

  ctx.effect(function registerStyles() {
    return ensureAnnotationStyles();
  }, 'dsh-annotation: stylesheet');

  // Keep the annotation-send gesture bound to the host's Send shortcut rows.
  ctx.inject(['shortcuts'], function installShortcutBridge(scope) {
    scope.effect(function bindShortcutService() {
      return setAnnotationShortcutsService(scope.shortcuts);
    }, 'dsh-annotation: shortcut catalog');
  });

  ctx.effect(function registerEnterToSend() {
    return installAnnotationEnterSend();
  }, 'dsh-annotation: enter sends annotations');

  ctx.effect(function registerDiagnosticsShortcut() {
    return installAnnotationDiagnosticsShortcut();
  }, 'dsh-annotation: diagnostics shortcut');

  ctx.effect(function registerErrorCapture() {
    return installAnnotationErrorCapture();
  }, 'dsh-annotation: error diagnostics');

  ctx.effect(function registerSelectionTracking() {
    return installAnnotationSelectionTracking();
  }, 'dsh-annotation: selection tracking');

  ctx.effect(function closeEditorOnDispose() {
    return function closeEditor() {
      try {
        annotationEditorStore.close();
      } catch (error) {
        /* ignore */
      }
    };
  }, 'dsh-annotation: editor state');

  // Optional: message-id resolution and locate support through the Chat target.
  ctx.inject(['uiConversation'], function installChatBridge(scope) {
    scope.effect(function bindResolver() {
      const service = scope.uiConversation;
      const releaseResolver = setAnnotationMessageResolver(function resolve(sessionId, nodeKey) {
        return annotationResolveChatMessageId(service, sessionId, nodeKey);
      });
      const releaseLocator = setAnnotationLocator(function locate(sessionId, messageId) {
        return annotationNodeKeyForMessageId(service, sessionId, messageId);
      });
      return function unbindResolver() {
        releaseResolver();
        releaseLocator();
      };
    }, 'dsh-annotation: chat target bridge');
  });

  // Floating toolbar + comment editor + transient locate highlight.
  ctx.slots.inject('shell.overlay', function registerOverlay() {
    return ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-annotation-toolbar',
      order: 50,
      locale: ANNOTATION_LOCALE_NS,
    }, AnnotationOverlay);
  });

  // Root-scoped markers need to know the mounted conversation session.
  ctx.slots.inject('conversation.input.overlay', function registerSessionBridge() {
    return ctx.slots.register({
      name: 'conversation.input.overlay',
      id: 'dsh-annotation-session',
      order: 5,
    }, AnnotationSessionBridge);
  });

  // Cover the disabled host Send button while annotations are waiting and no
  // text has been typed, so the normal-looking Send action sends annotations.
  ctx.slots.inject('shell.overlay', function registerSendOverlay() {
    return ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-annotation-send',
      order: 51,
      locale: ANNOTATION_LOCALE_NS,
    }, AnnotationSendOverlay);
  });

  // Pending-annotation chip above the composer card (Codex-style attachment).
  // `sessionId` arrives as a standard session-scope slot prop.
  ctx.slots.inject('conversation.input.overlay', function registerCapsule() {
    return ctx.slots.register({
      name: 'conversation.input.overlay',
      id: 'dsh-annotation-pending',
      order: 6,
      locale: ANNOTATION_LOCALE_NS,
    }, AnnotationCapsule);
  });

  // Read-only card for already sent messages.
  ctx.slots.inject('conversation.user.text.node', function registerSentCard() {
    return ctx.slots.register({
      name: 'conversation.user.text.node',
      key: ANNOTATION_USER_TEXT_RULE_ID,
      priority: 100,
      locale: ANNOTATION_LOCALE_NS,
    }, SentAnnotationCard);
  });

  // The user-text rule itself is owned by uiConversation's registry.
  ctx.inject(['uiConversation'], function installUserTextRule(scope) {
    scope.effect(function registerRule() {
      return scope.uiConversation.userText.register(annotationUserTextRule);
    }, 'dsh-annotation: user text rule');
  });

  // Send pending annotations without typed text (bypasses the empty-draft
  // Send button by calling the same conversation service the composer uses).
  ctx.inject(['conversation', 'sessions'], function installSendPendingAction(scope) {
    scope.effect(function bindSendPendingAction() {
      const conversation = scope.get('conversation');
      const sessions = scope.get('sessions');
      return setAnnotationSendPendingAction(async function sendOnlyAnnotations(sessionId) {
        try {
          if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
          const list = annotationStore.get(sessionId);
          if (list.length === 0 || conversation === undefined || sessions === undefined) return false;
          const binding = sessions.binding(sessionId);
          const session = binding === undefined ? undefined : binding.session;
          if (session === undefined || typeof conversation.sendSession !== 'function') return false;
          const text = buildAnnotationBlock(list, '');
          const result = await conversation.sendSession(session, text, [], 'queue');
          if (result !== null && result !== undefined && result.kind === 'success') {
            annotationSentStore.addMany(sessionId, list);
            annotationStore.removeMany(sessionId, list.map(function idOf(annotation) { return annotation.id; }));
            return true;
          }
          return false;
        } catch (error) {
          return false;
        }
      });
    }, 'dsh-annotation: send annotations only');
  });

  // Decorate outgoing prompts on their way through the conversation service.
  ctx.inject(['conversation'], function installSendHook(scope) {
    scope.effect(function wrapSendSession() {
      const conversation = typeof scope.get === 'function'
        ? scope.get('conversation') : undefined;
      return installSendSessionAnnotationWrap(conversation);
    }, 'dsh-annotation: sendSession wrapper');
  });
}
