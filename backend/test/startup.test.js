const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const request = require('supertest');

const SRC = path.join(__dirname, '..', 'src');

describe('start-up never depends on the website', () => {
  test('every backend file loads where require() of an ES module is not allowed (Vercel runs Node 20/22)', () => {
    // 1.0.7 shipped sanitize-html 2.18, whose parser is ES-module-only: fine on
    // Node 24, fatal on Vercel. This loads every file the way older Node does.
    const major = Number(process.versions.node.split('.')[0]);
    const flags = major >= 22 ? ['--no-experimental-require-module'] : [];
    const script = `
      const fs = require('fs'), path = require('path');
      const files = [];
      (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js') && !p.endsWith('server.js')) files.push(p); } })(${JSON.stringify(SRC)});
      const bad = [];
      for (const f of files) { try { require(f); } catch (e) { if (e.code === 'ERR_REQUIRE_ESM' || /ES Module/.test(e.message)) bad.push(path.relative(${JSON.stringify(SRC)}, f) + ': ' + e.message.split('\\n')[0]); } }
      if (bad.length) { console.error(bad.join('\\n')); process.exit(1); }
    `;
    const run = spawnSync(process.execPath, [...flags, '-e', script], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'test' } });
    assert.equal(run.status, 0, run.stderr);
  });

  test('if the website cannot load, the API still answers and site pages get the landing page', async () => {
    const site = require('../src/site');
    const original = Object.getOwnPropertyDescriptor(site, 'publicRouter');
    Object.defineProperty(site, 'publicRouter', { configurable: true, enumerable: true, get() { throw new Error('the site would not load'); } });
    const quiet = console.error;
    console.error = () => {};
    try {
      const app = require('../src/app').createApp();
      const health = await request(app).get('/api/health');
      assert.equal(health.status, 200);
      assert.equal(health.body.ok, true);

      const home = await request(app).get('/');
      assert.equal(home.status, 503);
      assert.match(home.headers['content-type'], /^text\/html/);
      assert.equal(home.headers['retry-after'], '30');
      assert.match(home.text, /In Karo, you give a task once\. It gets done\./);
      assert.match(home.text, /href="\/sign-in">Log in</);

      const editor = await request(app).get('/api/site/settings');
      assert.equal(editor.status, 503);
      // Not a website path: the app's own 404, not the landing page.
      assert.equal((await request(app).get('/api/nothing-here')).status, 404);
    } finally {
      console.error = quiet;
      Object.defineProperty(site, 'publicRouter', original);
    }
  });
});

describe('the fallback landing page', () => {
  const { fallbackPage, sendFallback } = require('../src/site/fallback');

  test('a real landing page: Log in, Register, the app; never indexed; says Karo is being updated', () => {
    const page = fallbackPage();
    assert.match(page, /^<!doctype html>/);
    assert.match(page, /<meta name="robots" content="noindex">/);
    assert.match(page, /href="\/sign-up">Register free</);
    assert.match(page, /href="\/get-app"/);
    assert.match(page, /We are updating Karo right now/);
    assert.equal((page.match(/<h1/g) || []).length, 1);
    assert.doesNotMatch(page, /<script/);
    assert.doesNotMatch(page, /<style>/, 'inline styles only when asked (the site CSP blocks them)');
    assert.match(fallbackPage({ inlineStyle: true }), /<style>/);
    assert.doesNotMatch(fallbackPage({ signupEnabled: false }), /Register free/);
  });

  test('sent as a temporary outage: 503, Retry-After, no-store, noindex', () => {
    const headers = {};
    const res = { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (body) => { res.body = body; } };
    sendFallback(res);
    assert.equal(res.statusCode, 503);
    assert.equal(headers['retry-after'], '30');
    assert.equal(headers['cache-control'], 'no-store');
    assert.equal(headers['x-robots-tag'], 'noindex');
    assert.match(res.body, /Karo/);
  });
});
