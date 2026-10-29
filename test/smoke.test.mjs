import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/**
 * Smoke test for the generated browser artifact: evaluate it like the browser
 * module loader would, then run `apply` against a minimal fake Client context.
 * The fake has no `document`, exercising every DOM-missing degradation path.
 */

function createFakeReact() {
  class Component {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }

    setState(patch) {
      this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    }
  }
  return {
    Component,
    Fragment: Symbol('react.fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...(props || {}), children } };
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}];
    },
    useRef(value) {
      return { current: value };
    },
    useEffect() {},
    useCallback(fn) {
      return fn;
    },
    useSyncExternalStore() {
      return null;
    },
  };
}

function loadBundle() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.ok(source.includes('window.__ModuleLoader__.load('), 'bundle must register via the module loader');
  assert.ok(!/@deepseek-ai\//.test(source), 'bundle must not reference @deepseek-ai client packages');
  assert.ok(!/^\s*import\s/m.test(source), 'bundle must not use ESM import');

  let captured = null;
  const storage = new Map();
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    crypto: {
      randomUUID() {
        return 'uuid-' + Math.random().toString(16).slice(2);
      },
    },
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); },
    },
    window: {
      __ModuleLoader__: {
        load(entry) {
          captured = entry;
        },
      },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1280,
      innerHeight: 800,
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.notEqual(captured, null, 'bundle must call __ModuleLoader__.load');
  assert.equal(captured.id, 'dsh-response-annotations');
  const exportsObject = captured.factory((specifier) => {
    if (specifier === 'react') return createFakeReact();
    throw new Error(`unexpected require(${specifier})`);
  });
  return { exportsObject, storage, sandbox };
}

function createContext({ provided = {}, onSlot = () => {}, onEffectDispose = () => {} } = {}) {
  const effects = [];
  const injected = [];
  const slotKeys = [];
  const ctx = {
    effect(fn) {
      const disposer = fn();
      effects.push(disposer);
      return () => {};
    },
    locale: {
      register(namespace, dictionaries) {
        assert.equal(namespace, 'dsh-response-annotations');
        assert.ok(dictionaries.zh && dictionaries.en);
        return () => {};
      },
    },
    slots: {
      inject(key, callback) {
        slotKeys.push(key);
        onSlot(key);
        return callback();
      },
      register(options) {
        return () => {};
      },
    },
    inject(services, callback) {
      injected.push(services);
      if (!services.every((name) => provided[name] !== undefined)) return;
      const scope = {
        effect(fn) {
          const disposer = fn();
          effects.push(disposer);
          return () => {};
        },
        get(name) {
          return provided[name];
        },
        ...provided,
      };
      callback(scope);
    },
  };
  return {
    ctx,
    injected,
    slotKeys,
    disposeAll() {
      for (const disposer of effects.reverse()) {
        if (typeof disposer === 'function') disposer();
        onEffectDispose();
      }
    },
  };
}

test('artifact factory exposes inject/apply and applies with no optional services', () => {
  const { exportsObject } = loadBundle();
  assert.ok(Array.isArray(exportsObject.inject));
  assert.ok(exportsObject.inject.includes('slots'));
  assert.ok(exportsObject.inject.includes('locale'));
  assert.equal(typeof exportsObject.apply, 'function');

  const harness = createContext();
  assert.doesNotThrow(() => exportsObject.apply(harness.ctx));
  assert.deepEqual(harness.slotKeys.sort(), [
    'conversation.input.overlay',
    'conversation.input.overlay',
    'conversation.user.text.node',
    'shell.overlay',
    'shell.overlay',
  ]);
  assert.deepEqual(
    harness.injected.map((services) => services.join(',')).sort(),
    ['conversation', 'conversation,sessions', 'shortcuts', 'uiConversation', 'uiConversation'],
  );
  assert.doesNotThrow(() => harness.disposeAll());
});

test('with uiConversation and conversation installed: rule + send wrapper work', async () => {
  const { exportsObject, storage } = loadBundle();

  const rules = [];
  const registrations = [];
  const fakeUiConversation = {
    binding(sessionId) {
      return {
        target() {
          return {
            getSnapshot() {
              return {
                nodes: new Map([['12:3', { data: { finalNode: { messageId: 'msg-42' } } }]]),
              };
            },
          };
        },
      };
    },
    userText: {
      register(rule) {
        rules.push(rule);
        return () => {};
      },
    },
  };
  const fakeConversation = {
    sent: [],
    result: { kind: 'success' },
    sendSession(session, text) {
      this.sent.push({ session, text });
      return Promise.resolve(this.result);
    },
  };

  const harness = createContext({
    provided: { uiConversation: fakeUiConversation, conversation: fakeConversation },
    onSlot(key, options) {
      registrations.push(key);
    },
  });
  const originalSlots = harness.ctx.slots;
  harness.ctx.slots = {
    ...originalSlots,
    register(options) {
      registrations.push(options);
      return () => {};
    },
  };

  exportsObject.apply(harness.ctx);

  // The user-text rule is registered once and finds our payload prefix only.
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.equal(rule.id, 'dsh-response-annotations');
  assert.equal(typeof rule.match, 'function');
  assert.equal(rule.match('plain user text', 0), undefined);
  const payload = '\n# Response annotations:\nEach item contains text selected from an earlier assistant response and may include a user comment.\n<response-annotations>\n'
    + '[{"text":"selected","annotation":"why?","source":{"messageId":"msg-42"}}]\n'
    + '</response-annotations>\n\n## My request:\nplease continue';
  const node = rule.match(payload, 0);
  assert.notEqual(node, undefined);
  assert.equal(node.id, 'dsh-response-annotations');
  assert.equal(node.start, 0);
  assert.equal(node.end, payload.indexOf('please continue'));
  assert.equal(node.data.count, 1);
  assert.equal(node.data.annotations[0].text, 'selected');
  assert.equal(rule.match(payload, 1), undefined);

  // A conversation.user.text.node keyed registration exists for the rule id.
  const sentCardRegistration = registrations.find(
    (item) => item && item.name === 'conversation.user.text.node',
  );
  assert.notEqual(sentCardRegistration, undefined);
  assert.equal(sentCardRegistration.key, 'dsh-response-annotations');
  assert.equal(sentCardRegistration.priority, 100);

  // The send wrapper is installed once and injects the exact Codex block.
  assert.equal(fakeConversation.__dshAnnotationWrapped, true);
  storage.set('dsh-annotation.v1.s1', JSON.stringify([
    {
      id: 'a1',
      nodeKey: '12:3',
      messageId: 'msg-42',
      start: 0,
      end: 8,
      quote: 'selected',
      prefix: '',
      suffix: '',
      comment: 'why?',
      createdAt: 1,
    },
  ]));

  const success = await fakeConversation.sendSession({ sessionId: 's1' }, 'please continue', [], 'queue');
  assert.deepEqual(success, { kind: 'success' });
  assert.equal(fakeConversation.sent.length, 1);
  const outgoing = fakeConversation.sent[0].text;
  assert.ok(outgoing.startsWith('\n# Response annotations:\n'));
  assert.ok(outgoing.includes('"text":"selected"'));
  assert.ok(outgoing.includes('"annotation":"why?"'));
  assert.ok(outgoing.includes('"messageId":"msg-42"'));
  assert.ok(outgoing.endsWith('\n## My request:\nplease continue'));
  assert.equal(storage.has('dsh-annotation.v1.s1'), false, 'successful send consumes the pending set');

  // Failure keeps the pending annotations.
  storage.set('dsh-annotation.v1.s1', JSON.stringify([
    {
      id: 'a2',
      nodeKey: '12:3',
      messageId: 'msg-42',
      start: 0,
      end: 8,
      quote: 'selected',
      prefix: '',
      suffix: '',
      comment: '',
      createdAt: 2,
    },
  ]));
  fakeConversation.result = { kind: 'error' };
  await fakeConversation.sendSession({ sessionId: 's1' }, 'retry', [], 'queue');
  assert.equal(storage.has('dsh-annotation.v1.s1'), true, 'failed send keeps the pending set');

  // Commands and empty text are never decorated; no pending set means passthrough.
  storage.delete('dsh-annotation.v1.s1');
  fakeConversation.result = { kind: 'success' };
  await fakeConversation.sendSession({ sessionId: 's1' }, 'plain', [], 'queue');
  assert.equal(fakeConversation.sent.at(-1).text, 'plain');

  assert.doesNotThrow(() => harness.disposeAll());
  assert.notEqual(fakeConversation.sendSession, undefined);
});
