// Same self-hosted GitHub OAuth setup as katharina-greuner.de.
// The shared proxy currently grants public_repo scope: this repo must be public,
// or the Worker must set GITHUB_REPO_PRIVATE=1 before private-repo login will work.
const id = {
  label: 'Kennung', name: 'id', widget: 'string',
  pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Nur Kleinbuchstaben, Zahlen und Bindestriche verwenden.'],
  hint: 'Eindeutige, dauerhafte Kennung. Bei Projekten ist sie Teil der Seitenadresse.',
};
const position = (name, label) => ({
  name, label, widget: 'number', value_type: 'int', min: 0, step: 1, default: 0,
  hint: 'Kleinere Zahlen werden zuerst angezeigt.',
});
const optionalText = (name, label) => ({ name, label, widget: 'string', required: false, default: '' });
const collection = {
  create: true, delete: true, extension: 'json', format: 'json',
  identifier_field: 'id', slug: '{{id}}', summary: '{{title}}',
  editor: { preview: false },
};

export default {
  load_config_file: false,
  publish_mode: 'simple',
  backend: {
    name: 'github',
    repo: 'danielmoessner/sn-trockenbau.de',
    branch: 'main',
    base_url: 'https://katharina-greuner-decap-proxy.katharina-greuner-decap-proxy.workers.dev',
    auth_endpoint: 'auth',
    app_id: 'Ov23liHUSdKZi36Ddn9D', // Public OAuth client ID, not a secret.
  },
  locale: 'de',
  site_url: 'https://www.sn-trockenbau.de',
  display_url: 'https://www.sn-trockenbau.de',
  logo_url: '/images/logo.png',
  media_folder: 'public/uploads',
  public_folder: '/uploads',
  media_processing: { enabled: false },
  collections: [
    {
      ...collection,
      name: 'projekte', label: 'Projekte', label_singular: 'Projekt',
      folder: 'src/content/projekte',
      preview_path: 'projekt/{{id}}',
      sortable_fields: ['title', 'galleryOrder', 'listOrder'],
      fields: [
        { label: 'Projektname', name: 'title', widget: 'string' },
        id,
        { label: 'Fertigstellung', name: 'completion', widget: 'string', hint: 'Zum Beispiel März 2020 oder 2015–2017.' },
        optionalText('partner', 'In Zusammenarbeit mit'),
        optionalText('client', 'Kunde'),
        optionalText('location', 'Ort'),
        { label: 'Projektbeschreibung', name: 'description', widget: 'text' },
        { label: 'Vorschaubild', name: 'cover', widget: 'image' },
        {
          label: 'Bilder auf der Projektseite', name: 'images', widget: 'list',
          min: 2, max: 2, collapsed: false,
          hint: 'Zwei Bilder: zuerst links, dann rechts.',
          field: { label: 'Bild', name: 'image', widget: 'image' },
        },
        position('galleryOrder', 'Reihenfolge in der Projektgalerie'),
        position('listOrder', 'Reihenfolge in der Projektliste'),
        {
          ...position('homeOrder', 'Reihenfolge auf der Startseite'),
          required: false, default: '',
          hint: 'Leer lassen, um das Projekt auf der Startseite auszublenden. 0 zeigt es zuerst an.',
        },
      ],
    },
    {
      ...collection,
      name: 'bescheinigungen', label: 'Bescheinigungen', label_singular: 'Bescheinigung',
      folder: 'src/content/bescheinigungen',
      preview_path: 'bescheinigungen',
      sortable_fields: ['title', 'order'],
      fields: [
        { label: 'Bezeichnung', name: 'title', widget: 'string' },
        id,
        {
          label: 'PDF-Dokument', name: 'file', widget: 'file',
          media_library: { config: { multiple: false } },
          pattern: ['\\.[pP][dD][fF]$', 'Bitte eine PDF-Datei auswählen.'],
        },
        position('order', 'Reihenfolge'),
      ],
    },
  ],
};
