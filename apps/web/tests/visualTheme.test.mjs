import assert from 'node:assert/strict';
import test from 'node:test';
import { themedVisualSvg } from '../src/features/whiteboard/model/visual.ts';

test('i visual dell’AI seguono il tema chiaro', () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="#222936" stroke="#536076"/><text fill="#F1F4FA">x</text></svg>';
  assert.equal(themedVisualSvg(svg, 'dark'), svg);
  const light = themedVisualSvg(svg, 'light');
  assert.match(light, /fill="#ffffff"/);
  assert.match(light, /fill="#1f2633"/);
  assert.doesNotMatch(light, /#222936/);
});
