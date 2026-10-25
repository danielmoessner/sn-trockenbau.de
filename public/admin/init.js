import config from './config.js';

function start() {
  if (!window.CMS) {
    document.body.textContent = 'Das CMS konnte nicht geladen werden. Bitte die Seite neu laden.';
    return;
  }
  // Discover the local development proxy on loopback; production uses GitHub OAuth.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  window.CMS.init({ config: { ...config, local_backend: local } });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
