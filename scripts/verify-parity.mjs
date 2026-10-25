/** Compare a pre-migration export with dist using real browser rendering.
 * Usage: BASELINE_DIR=/path/to/export npm run test:parity
 * CHROME_CHANNEL=chrome uses an installed Chrome; omit for Playwright Chromium.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { parse } from 'parse5';
const baseline = process.env.BASELINE_DIR;
assert(baseline, 'Set BASELINE_DIR to the original static export');
const output = path.resolve('.parity');
fs.mkdirSync(output, { recursive: true });
// Remove only artifacts owned by this test, so old diffs cannot look like new failures.
for (const name of fs.readdirSync(output)) {
  if (name === 'results.json' || /-(before|after)\.png$/.test(name)) fs.unlinkSync(path.join(output, name));
}
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const files = walk(baseline).filter(f => f.endsWith('.html') && (!process.env.ROUTE_FILTER || f.includes(process.env.ROUTE_FILTER)));
const mime = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.pdf':'application/pdf' };
function resolve(root, url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const file = path.join(root, pathname);
  return [file, file + '.html', path.join(file, 'index.html')].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
}
function normalize(node) {
  if (node.nodeName === '#comment') return null;
  if (node.nodeName === '#text') {
    const value = node.value.replace(/\s+/g, ' ').trim();
    return value || null;
  }
  // Compare inline program/style contents without formatting differences.
  const children = ['script','style'].includes(node.tagName)
    ? (node.childNodes || []).map(n => n.value?.replace(/\s/g, ''))
    : (node.childNodes || []).map(normalize).filter(n => n !== null);
  return { tag: node.tagName || node.nodeName, attrs: Object.fromEntries((node.attrs || []).map(a => [a.name,a.value]).sort()), children };
}
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || undefined, headless: true, args: ["--disable-gpu", "--disable-lcd-text", "--font-render-hinting=none"] });
const results = [];
try {
  await Promise.all((process.env.WIDTHS || '1440,1024,390').split(',').map(Number).map(async width => {
    for (const file of files) {
      const rel = path.relative(baseline, file);
      const route = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '');
      const built = resolve(path.resolve('dist'), 'http://parity.test' + route);
      assert(built, `Missing built route ${route}`);
      assert.deepEqual(normalize(parse(fs.readFileSync(built,'utf8'))), normalize(parse(fs.readFileSync(file,'utf8'))), `DOM mismatch: ${route}`);
      let root = baseline;
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await context.route('**/*', async request => {
        const url = new URL(request.request().url());
        if (url.hostname !== 'parity.test') return request.fulfill({ status:200, contentType:'text/html', body:'<!doctype html><html></html>' });
        const f = resolve(root, url.href);
        if (!f) return request.fulfill({ status:404, body:'' });
        let body = fs.readFileSync(f);
        // Compare the same carousel frame; keep the production autoplay untouched.
        if (f.endsWith('.html')) body = Buffer.from(body.toString().replaceAll('data-autoplay="true"', 'data-autoplay="false"'));
        await request.fulfill({ status:200, contentType:mime[path.extname(f)] || 'application/octet-stream', body });
      });
      try {
        const page = await context.newPage();
        const screenshots = [];
        for (const source of [baseline, path.resolve('dist')]) {
          root = source;
          await page.mouse.move(0, 0);
          await page.goto('http://parity.test' + route, { waitUntil:'load' });
          await page.evaluate(() => document.fonts.ready);
          // Let the original scroll handlers, reveals and lazy images settle.
          const height = await page.evaluate(() => document.body.scrollHeight);
          for (let y = 0; y < height; y += 700) {
            await page.evaluate(y => window.scrollTo(0, y), y);
            await page.waitForTimeout(80);
          }
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(2500);
          const screenshot = await page.screenshot({ fullPage:true, animations:'disabled' });
          if (route === '/' && width === 390) {
            await page.locator('.w-nav-button').click();
            await page.waitForTimeout(500);
            assert(await page.locator('.w-nav-button').evaluate(el => el.classList.contains('w--open')), 'Mobile menu opens');
            await page.locator('.w-nav-button').click();
            await page.waitForTimeout(500);
            assert(await page.locator('.w-nav-button').evaluate(el => !el.classList.contains('w--open')), 'Mobile menu closes');
          }
          if (route === '/' && width === 1440) {
            await page.locator('.w-dropdown-toggle').first().hover();
            await page.waitForTimeout(500);
            assert(await page.locator('.w-dropdown-list').first().evaluate(el => el.classList.contains('w--open')), 'Services dropdown opens');
          }
          screenshots.push(screenshot);
        }
        const [a,b] = screenshots.map(s=>PNG.sync.read(s));
        let pixels = 0;
        if(a.width !== b.width || a.height !== b.height) pixels = -1;
        else for(let i=0;i<a.data.length;i+=4) if(a.data[i]!==b.data[i] || a.data[i+1]!==b.data[i+1] || a.data[i+2]!==b.data[i+2] || a.data[i+3]!==b.data[i+3]) pixels++;
        const result = { route, width, pixels, before:[a.width,a.height], after:[b.width,b.height] };
        results.push(result);
        if(pixels !== 0) screenshots.forEach((s,i)=>fs.writeFileSync(path.join(output,`${rel.replaceAll('/','-')}-${width}-${i?'after':'before'}.png`),s));
        console.log(JSON.stringify(result));
      } finally { await context.close(); }
    }
  }));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
}
assert(results.every(r=>r.pixels===0), 'Visual differences found; see .parity/');
console.log(`${results.length} screenshots match exactly (zero differing pixels).`);
