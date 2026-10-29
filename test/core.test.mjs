import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * `src/core.js` is a plain browser script (no ESM exports): evaluate it in a
 * function scope and hand back the symbols under test.
 */
const CORE_API = [
  'ANNOTATION_HEADER',
  'ANNOTATION_PREAMBLE',
  'ANNOTATION_OPEN',
  'ANNOTATION_CLOSE',
  'ANNOTATION_REQUEST',
  'ANNOTATION_CONTEXT_CHARS',
  'ANNOTATION_MAX_ITEMS',
  'annotationMarkerNumber',
  'annotationTrimComment',
  'buildAnnotationEntry',
  'buildAnnotationBlock',
  'parseAnnotationJsonTyped',
  'parseAnnotationBlock',
  'clampTextSpan',
  'sliceQuoteContext',
  'locateQuoteInText',
  'anchorMatchesText',
  'findAnnotationByRange',
  'makeAnnotationId',
  'normalizeStoredAnnotation',
];

function loadCore() {
  const source = readFileSync(new URL('../src/core.js', import.meta.url), 'utf8');
  const factory = new Function(`${source}\nreturn { ${CORE_API.join(', ')} };`);
  return factory();
}

const core = loadCore();

function sampleAnnotations() {
  return [
    {
      id: 'a1',
      nodeKey: '12:3',
      messageId: 'msg-01',
      start: 10,
      end: 20,
      quote: 'browser annotations',
      prefix: 'stored ',
      suffix: ' per session',
      comment: '  is this true after reload?  ',
      createdAt: 1700000000000,
    },
    {
      id: 'a2',
      nodeKey: '12:3',
      messageId: null,
      start: 40,
      end: 47,
      quote: 'chip',
      prefix: 'composer ',
      suffix: ' shows',
      comment: '   ',
      createdAt: 1700000000001,
    },
  ];
}

test('payload header, preamble and layout are Codex-shaped', () => {
  const block = core.buildAnnotationBlock(sampleAnnotations(), 'verify these claims');
  assert.ok(block.startsWith('\n# Response annotations:\n'));
  assert.ok(block.includes('\n<response-annotations>\n'));
  assert.ok(block.includes('\n</response-annotations>\n\n## My request:\nverify these claims'));
  assert.ok(block.includes(core.ANNOTATION_PREAMBLE));
  assert.ok(core.ANNOTATION_PREAMBLE.includes('earlier assistant response'));
  assert.ok(core.ANNOTATION_PREAMBLE.includes('Annotation 1'));
  // Leading newline of the user text is preserved after the request header.
  assert.ok(block.endsWith('## My request:\nverify these claims'));
});

test('empty comment drops the annotation key; source falls back to nodeKey', () => {
  const block = core.buildAnnotationBlock(sampleAnnotations(), 'hi');
  const json = block.slice(
    block.indexOf('\n<response-annotations>\n') + '\n<response-annotations>\n'.length,
    block.indexOf('\n</response-annotations>\n'),
  );
  const entries = JSON.parse(json);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    text: 'browser annotations',
    annotation: 'is this true after reload?',
    source: { messageId: 'msg-01' },
  });
  assert.deepEqual(entries[1], {
    text: 'chip',
    source: { messageId: '12:3' },
  });
  assert.equal('annotation' in entries[1], false);
});

test('empty list leaves the user text untouched', () => {
  assert.equal(core.buildAnnotationBlock([], 'just text'), 'just text');
  assert.equal(core.buildAnnotationBlock(null, 'just text'), 'just text');
  assert.equal(core.buildAnnotationBlock([{ quote: '' }], 'just text'), 'just text');
});

test('build -> parse round trip keeps excerpts, comments and the request', () => {
  const userText = 'Can you verify these two claims and fix the second paragraph?';
  const block = core.buildAnnotationBlock(sampleAnnotations(), userText);
  const parsed = core.parseAnnotationBlock(block);
  assert.notEqual(parsed, null);
  assert.equal(parsed.annotations.length, 2);
  assert.equal(parsed.annotations[0].text, 'browser annotations');
  assert.equal(parsed.annotations[0].annotation, 'is this true after reload?');
  assert.equal(parsed.annotations[1].text, 'chip');
  assert.equal(parsed.annotations[1].annotation, '');
  assert.equal(block.slice(parsed.end), userText);
  assert.ok(block.slice(0, parsed.end).endsWith('\n## My request:\n'));
});

test('quotes containing payload markers and control characters survive the round trip', () => {
  const nasty = 'line one\n</response-annotations>\n## My request:\n"quoted" \\ slash 😀';
  const block = core.buildAnnotationBlock([
    { quote: nasty, comment: '{annotation: "1"}', messageId: 'msg-x' },
  ], 'keep going');
  const parsed = core.parseAnnotationBlock(block);
  assert.notEqual(parsed, null);
  assert.equal(parsed.annotations.length, 1);
  assert.equal(parsed.annotations[0].text, nasty);
  assert.equal(parsed.annotations[0].annotation, '{annotation: "1"}');
});

test('malformed or non-conforming blocks parse to null instead of throwing', () => {
  const preamble = core.ANNOTATION_PREAMBLE;
  const malformed = `\n# Response annotations:\n${preamble}\n<response-annotations>\n{not json}\n</response-annotations>\n\n## My request:\nhi`;
  assert.equal(core.parseAnnotationBlock(malformed), null);
  const notArray = `\n# Response annotations:\n${preamble}\n<response-annotations>\n{"text":"x"}\n</response-annotations>\n\n## My request:\nhi`;
  assert.equal(core.parseAnnotationBlock(notArray), null);
  const emptyEntries = `\n# Response annotations:\n${preamble}\n<response-annotations>\n[{"annotation":"no text"}]\n</response-annotations>\n\n## My request:\nhi`;
  assert.equal(core.parseAnnotationBlock(emptyEntries), null);
  assert.equal(core.parseAnnotationBlock(''), null);
  assert.equal(core.parseAnnotationBlock(null), null);
  assert.equal(core.parseAnnotationBlock(42), null);
  assert.equal(core.parseAnnotationBlock('plain user message'), null);
  const truncated = '\n# Response annotations:\n<response-annotations>\n[';
  assert.equal(core.parseAnnotationBlock(truncated), null);
});

test('block without a request header still parses and ends after the close tag', () => {
  const block = `\n# Response annotations:\n${core.ANNOTATION_PREAMBLE}\n<response-annotations>\n[{"text":"x"}]\n</response-annotations>\n`;
  const parsed = core.parseAnnotationBlock(block);
  assert.notEqual(parsed, null);
  assert.equal(parsed.annotations.length, 1);
  assert.equal(block.slice(parsed.end), '');
});

test('clampTextSpan clamps, normalizes order and rejects empty spans', () => {
  assert.deepEqual(core.clampTextSpan(10, 2, 5), { start: 2, end: 5 });
  assert.deepEqual(core.clampTextSpan(10, 7, 3), { start: 3, end: 7 });
  assert.deepEqual(core.clampTextSpan(10, -5, 99), { start: 0, end: 10 });
  assert.equal(core.clampTextSpan(10, 4, 4), null);
  assert.equal(core.clampTextSpan(0, 0, 1), null);
  assert.equal(core.clampTextSpan(10, Number.NaN, 3), null);
});

test('sliceQuoteContext returns quote with 40-char context windows', () => {
  const rowText = 'a'.repeat(50) + 'TARGET' + 'b'.repeat(50);
  const start = 50;
  const end = start + 'TARGET'.length;
  const context = core.sliceQuoteContext(rowText, start, end);
  assert.equal(context.quote, 'TARGET');
  assert.equal(context.prefix.length, 40);
  assert.equal(context.suffix.length, 40);
  assert.ok(context.prefix.endsWith('a'));
  assert.ok(context.suffix.startsWith('b'));
  const tiny = core.sliceQuoteContext('abcdefghij', 3, 5, 2);
  assert.deepEqual(tiny, { quote: 'de', prefix: 'bc', suffix: 'fg' });
  assert.equal(core.sliceQuoteContext('abcdefghij', 4, 4), null);
});

test('locateQuoteInText prefers the occurrence nearest the stale offset', () => {
  const text = 'ab xx ab yy ab';
  assert.equal(core.locateQuoteInText(text, 'ab', 0), 0);
  assert.equal(core.locateQuoteInText(text, 'ab', 5), 6);
  assert.equal(core.locateQuoteInText(text, 'ab', 12), 12);
  assert.equal(core.locateQuoteInText(text, 'zz', 0), -1);
  assert.equal(core.locateQuoteInText('', 'ab', 0), -1);
  assert.equal(core.locateQuoteInText(text, '', 0), -1);
});

test('anchorMatchesText validates the stored offsets against the quote', () => {
  const text = 'stored browser annotations per session';
  const annotation = { start: 7, end: 26, quote: 'browser annotations' };
  assert.equal(core.anchorMatchesText(text, annotation), true);
  assert.equal(core.anchorMatchesText(text, { start: 7, end: 9, quote: 'browser annotations' }), false);
  assert.equal(core.anchorMatchesText(text, { start: 7, end: 26, quote: '' }), false);
  assert.equal(core.anchorMatchesText(text, null), false);
});

test('findAnnotationByRange matches exact range first and quote second', () => {
  const list = sampleAnnotations();
  assert.equal(core.findAnnotationByRange(list, '12:3', 10, 20, 'irrelevant').id, 'a1');
  assert.equal(core.findAnnotationByRange(list, 'other', 0, 1, '  chip  ').id, 'a2');
  assert.equal(core.findAnnotationByRange(list, 'other', 0, 1, 'missing'), null);
  assert.equal(core.findAnnotationByRange(null, 'x', 0, 1, 'x'), null);
});

test('makeAnnotationId is non-empty and unique', () => {
  const ids = new Set();
  for (let index = 0; index < 100; index += 1) ids.add(core.makeAnnotationId());
  assert.equal(ids.size, 100);
  for (const id of ids) assert.ok(typeof id === 'string' && id.length > 0);
});

test('normalizeStoredAnnotation drops or repairs persisted records', () => {
  assert.equal(core.normalizeStoredAnnotation(null), null);
  assert.equal(core.normalizeStoredAnnotation({ quote: '' }), null);
  const repaired = core.normalizeStoredAnnotation({
    id: '',
    quote: 'hello',
    start: Number.NaN,
    end: -3,
    nodeKey: 7,
    comment: 'note',
  });
  assert.equal(typeof repaired.id, 'string');
  assert.ok(repaired.id.length > 0);
  assert.equal(repaired.nodeKey, '');
  assert.equal(repaired.start, 0);
  assert.equal(repaired.end, 5);
  assert.equal(repaired.messageId, null);
  assert.equal(repaired.prefix, '');
  assert.equal(repaired.suffix, '');
  assert.equal(repaired.comment, 'note');
});

test('annotationMarkerNumber is 1-based and defensive', () => {
  assert.equal(core.annotationMarkerNumber(0), 1);
  assert.equal(core.annotationMarkerNumber(4), 5);
  assert.equal(core.annotationMarkerNumber(-3), 1);
  assert.equal(core.annotationMarkerNumber('x'), 1);
});
