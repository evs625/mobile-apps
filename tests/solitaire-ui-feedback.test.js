import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../apps/solitaire/app.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../apps/solitaire/service-worker.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../apps/solitaire/index.html', import.meta.url), 'utf8');

test('double-tap feedback includes success flight and rejection wiggle', () => {
  assert.match(app, /flyDoubleTapCardToFoundation/);
  assert.match(app, /wiggleRejectedCard/);
  assert.match(app, /duration: 340/);
  assert.match(app, /duration: 260/);
  assert.match(app, /void handleDoubleTapFeedback/);
});

test('feedback animation locks interactions and bumps PWA version', () => {
  assert.match(app, /let moveAnimating = false/);
  assert.match(app, /APP_VERSION = '1\.0\.4'/);
  assert.match(sw, /solitaire-v1\.0\.4/);
});


test('version is visible in both settings and menu', () => {
  assert.equal((html.match(/data-version-value/g) || []).length, 2);
  assert.match(app, /data-version-value/);
});
