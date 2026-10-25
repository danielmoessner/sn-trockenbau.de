# SN Trockenbau — Astro

The existing Webflow design is rendered as a static Astro site. Original styles,
fonts, images, element classes, Webflow identifiers, and interaction scripts are
kept intact. No client framework or replacement CSS is introduced.

## Development

Requires Node.js 22.23.4 or newer.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

`dist/` is the deployable site. The IONOS workflow installs dependencies, checks
and builds Astro, then mirrors `dist/` over SFTP. Original `.html` URLs are also
emitted for existing links. PHP runs on the hosting server; Astro's development
and preview servers do not execute PHP.

## Shared components

- `src/layouts/SiteLayout.astro`: document shell and page attributes.
- `src/components/Head.astro`: titles, metadata, styles, icons, and cookie consent.
- `Nav.astro`, `Footer.astro`, `FooterDecoration.astro`, `BackToTop.astro`:
  shared navigation and footer, including the original per-page variants.
- `PageBanner.astro`: page title and call to action.
- `Scripts.astro`: original jQuery and Webflow runtime, kept in execution order.
- `ContactPopup.astro`: shared popup, retaining the original form variants.
- `ProjectCard.astro`, `CertificateList.astro`: collection-backed content.

Templates deliberately preserve adjacent elements and text whitespace from the
export. Reformatting inline elements can change spacing. Keep the original CSS
and Webflow data attributes when changing content.

## Editing projects

Edit projects through `/admin/` or in `src/content/projekte/<id>.json`. Each entry has:

- `id`: stable URL slug (`/projekt/<id>`).
- `title`, `completion`, `partner`, `client`, `location`, `description`: text.
- `cover`: gallery image URL; `images`: the two detail-page image URLs.
- `galleryOrder`, `listOrder`: ascending display order for each existing view.
- `homeOrder`: ascending homepage order, or `null` to omit it there.

The homepage, project gallery, project list, and all project detail routes use
this collection. Empty project facts remain hidden as in the original design.
Add images under `public/` and reference their absolute site URLs.

## Editing certificates

Edit certificates through `/admin/` or in `src/content/bescheinigungen/<id>.json`: each entry has a unique `id`, `title`,
`file` (PDF URL), and ascending `order`. Put new PDFs under `public/`.
Both collections are validated by `src/content.config.ts` during the build.

## Visual regression checks

Keep a copy of the original deployed `src/` export outside this repository, then:

```sh
npm run build
BASELINE_DIR=/path/to/original-export CHROME_CHANNEL=chrome npm run test:parity
```

The test compares parsed DOM structure and full-page screenshots of every route
at 1440, 1024, and 390 pixels. It uses an isolated browser, local assets, settled
scroll animations, frozen carousel autoplay, and a blank response for external embeds (including the map),
so third-party responses cannot affect comparisons. It does not submit forms.
Pixel differences and a JSON report are saved in `.parity/`. Omit
`CHROME_CHANNEL` if using Playwright's installed Chromium instead of Chrome.

## Decap CMS

The editor is available at `/admin/` after deployment. It uses German labels,
individual JSON entries, image/PDF uploads to `public/uploads/`, and direct
publishing to `main`. Saving content starts the existing IONOS deployment workflow.
The admin is self-hosted, with the pinned Decap 3.17.1 distribution (including
lazy-loaded modules) in `public/admin/vendor/`; its source and archive checksum
are recorded in `version.json`. `public/admin/config.js` is the configuration.

For local editing, run these in separate terminals from the repository root:

```sh
npm run dev
npm run cms
```

Open `http://localhost:4321/admin/`. With the local proxy running, edits write to
the local content files. Start the proxy before logging in. The production CMS
uses GitHub login and requires write access to the repository.

### Shared OAuth proxy and repository visibility

This follows the setup in
[the reference repository](https://github.com/danielmoessner/katharina-greuner.de).
The existing Worker and public OAuth client ID are reused. No OAuth secret is
stored in the site. The callback remains on the Worker, so another OAuth app or
callback URL is not needed for this site.

The live `/auth` redirect was checked on 2026-10-25. It accepts the SN Trockenbau
site ID, uses the expected OAuth client, and currently requests `public_repo,user`.
That works for the intended **public** repository. The repository is currently
private, so production login cannot yet access it with this scope. If it stays
private, set `GITHUB_REPO_PRIVATE=1` on the existing Worker, redeploy, and authorize
GitHub again; the Worker then requests `repo,user`. Supplying a `scope` query
parameter does not override the Worker's configured scope.

**Before changing visibility:** a real SMTP password exists in Git history.
Rotate/revoke it and remove the credential-bearing file from all Git history
before making the repository public. Ignoring/deleting the current file alone
is insufficient. No visibility change or history rewrite has been performed.

The real `php/.smtp-config.php` is now ignored locally. The deployment mirror
excludes it, preserving the server's existing file instead of overwriting or
deleting it. For a fresh server, install a private copy of
`public/php/.smtp-config.php.example` as `php/.smtp-config.php` through SFTP and
supply the credentials there. Never commit the real configuration.

To test the real CMS locally without changing your content:

```sh
CHROME_CHANNEL=chrome npm run test:cms
```

This starts a disposable content copy and a local proxy, then exercises project
edits, optional field clearing, image/PDF uploads, and certificate creation and
deletion. It needs free local ports 4328 and 8081 and never authenticates to GitHub.
