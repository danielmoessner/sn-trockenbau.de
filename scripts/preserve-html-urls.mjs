// Preserve the original exported .html URLs alongside Astro's directory routes.
import { copyFileSync } from 'node:fs';
for (const page of ['bescheinigungen', 'datenschutz', 'impressum', 'kontakt', 'partner', 'projekte', 'projekte-liste', 'ueber-uns']) {
  copyFileSync(`dist/${page}/index.html`, `dist/${page}.html`);
}
