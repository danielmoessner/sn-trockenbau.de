import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';

const root = process.cwd();
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-decap-test-'));
fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
fs.cpSync('src/content', path.join(fixture, 'src/content'), { recursive: true });
fs.mkdirSync(path.join(fixture, 'public/uploads'), { recursive: true });
const proxy = spawn(process.execPath, [path.join(root, 'node_modules/decap-server/dist/index.js')], {
  cwd: fixture, env: { ...process.env, PORT: '8081' }, stdio: ['ignore','pipe','pipe'],
});
let proxyLog = '';
proxy.stdout.on('data', b => { proxyLog += b; });
proxy.stderr.on('data', b => { proxyLog += b; });
const types = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.wasm':'application/wasm' };
const server = http.createServer((req,res) => {
  let file = path.join(root, 'dist', decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404);res.end();return; }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(4328, '127.0.0.1', r));
let browser;
try {
  for(let i=0;i<50;i++) {
    if(proxyLog.includes('listening on port 8081')) break;
    if(proxy.exitCode !== null) throw new Error(proxyLog);
    await new Promise(r=>setTimeout(r,100));
  }
  assert(proxyLog.includes('listening on port 8081') && proxy.exitCode === null, proxyLog || 'Local CMS proxy did not start');
  browser = await chromium.launch({ channel:process.env.CHROME_CHANNEL || undefined, headless:true });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', e=>browserErrors.push(e.message));
  await page.route('**/*', request => ['localhost','127.0.0.1'].includes(new URL(request.request().url()).hostname) ? request.continue() : request.abort());
  await page.goto('http://localhost:4328/admin/');
  await page.waitForTimeout(2000);
  await page.getByRole('button', {name:'Login', exact:true}).click();
  await page.waitForTimeout(1500);
  await page.getByText('Moxy Hotels', {exact:true}).click();
  await page.waitForTimeout(1000);
  await page.locator('input[id^="title-field"]').fill('Moxy Hotels CMS-Test');
  await page.locator('input[id^="partner-field"]').fill('');
  await page.locator('input[id^="homeOrder-field"]').fill('');
  const image = fs.readFileSync('public/images/logo.png');
  await page.getByRole('button', {name:'Wähle ein anderes Bild',exact:true}).first().click();
  await page.locator('input[type="file"]').setInputFiles({name:'cms-test.png',mimeType:'image/png',buffer:image});
  await expect(page.getByText('cms-test.png', {exact:true}).first()).toBeVisible();
  await page.getByRole('button', {name:'Ausgewähltes Element verwenden',exact:true}).click();
  await page.getByRole('button', {name:'Veröffentlichen', exact:true}).click();
  await page.getByText('Jetzt veröffentlichen', {exact:true}).click();
  const savedProject = () => JSON.parse(fs.readFileSync(path.join(fixture,'src/content/projekte/moxy-motels.json'),'utf8'));
  await expect.poll(() => savedProject().title).toBe('Moxy Hotels CMS-Test');
  assert([null, undefined, ''].includes(savedProject().homeOrder), 'Cleared homepage order is empty');
  assert(!savedProject().partner, 'Cleared partner is empty');
  assert.equal(savedProject().images.length, 2);
  assert.equal(savedProject().cover, '/uploads/cms-test.png');
  assert(fs.readFileSync(path.join(fixture,'public/uploads/cms-test.png')).equals(image));
  console.log('Project save, image upload and optional field clearing passed');
  await page.waitForTimeout(1500);
  await page.getByText('Zurück zu allen Projekte', {exact:true}).click();
  await page.getByText('Bescheinigungen', {exact:true}).first().click();
  await page.waitForTimeout(500);
  await page.getByText('＋ Bescheinigung', {exact:true}).click();
  await page.waitForTimeout(500);
  await page.locator('input[id^="title-field"]').fill('CMS Testbescheinigung');
  await page.locator('input[id^="id-field"]').fill('cms-testbescheinigung');
  await page.getByRole('button', {name:'Wählen Sie eine Datei',exact:true}).click();
  await page.waitForTimeout(500);
  const pdf = fs.readFileSync('public/webflow-assets/5c9be19f5bef78c47aa90bc9/zertifikat-owa-plus-2025-2026.pdf');
  await page.locator('input[type="file"]').setInputFiles({ name:'cms-test.pdf', mimeType:'application/pdf', buffer:pdf });
  await expect(page.getByText('cms-test.pdf', {exact:true}).first()).toBeVisible();
  await page.getByRole('button', {name:'Ausgewähltes Element verwenden',exact:true}).click();
  await page.getByRole('button', {name:'Veröffentlichen',exact:true}).click();
  await page.getByText('Jetzt veröffentlichen', {exact:true}).click();
  const certificatePath = path.join(fixture,'src/content/bescheinigungen/cms-testbescheinigung.json');
  await expect.poll(() => fs.existsSync(certificatePath)).toBe(true);
  const certificate = JSON.parse(fs.readFileSync(certificatePath,'utf8'));
  assert.equal(certificate.file, '/uploads/cms-test.pdf');
  assert.equal(certificate.id, 'cms-testbescheinigung');
  assert(fs.readFileSync(path.join(fixture,'public/uploads/cms-test.pdf')).equals(pdf));
  console.log('Certificate creation, slug and PDF upload passed');
  await page.waitForTimeout(1500);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Lösche Beitrag',exact:true}).click();
  await expect.poll(() => fs.existsSync(certificatePath)).toBe(false);
  assert.deepEqual(browserErrors, []);
  console.log('Certificate deletion passed; production content was not modified.');
  await page.screenshot({path:'/tmp/sn-cms-admin.png'});
} finally {
  await browser?.close();
  await new Promise(r=>server.close(r));
  proxy.kill();
  fs.rmSync(fixture, {recursive:true,force:true});
}
