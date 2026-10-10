/**
 * What each kind of page section holds, as the forms draw it. The same list
 * as PROPS in backend/src/site/schemas.js (the server checks every save
 * against that one): keep the two in step.
 *
 * A field: { key, label, kind, max?, hint?, half?, options?, show?(values, sectionProps) }
 *   text | textarea | markdown   plain words (the page escapes them); markdown for richText and FAQ answers
 *   href                         a link's address alone
 *   link                         { label, href }
 *   image                        { media: <media id>|null, alt }
 *   select | icon                one of `options` (icon: ICONS)
 *   switch                       true / false
 *   number                       a whole number from `min` to `max`
 *   list                         items, each with its own `fields` (≤ max)
 *   strings                      a list of short lines (≤ max)
 */
import {
  BarChart3,
  CircleHelp,
  Columns2,
  FileText,
  Globe,
  LayoutGrid,
  ListOrdered,
  Megaphone,
  MonitorSmartphone,
  Newspaper,
  Quote,
  Rocket,
  Users,
} from 'lucide-react';

/** The site's icon names (backend/src/site/render/icons.js ICON_NAMES). */
export const ICONS = [
  'pin', 'users', 'building', 'check', 'progress', 'review', 'time', 'bell', 'repeat', 'calendar', 'mic', 'file', 'sheet', 'chat', 'send',
  'inbox', 'layers', 'clock', 'alert', 'play', 'globe', 'phone', 'laptop', 'languages', 'shield', 'store', 'briefcase', 'home', 'chart',
  'sparkles', 'arrow', 'plus', 'search', 'filter', 'menu', 'close', 'download', 'news', 'mail', 'instagram', 'youtube', 'linkedin', 'x',
  'facebook', 'whatsapp',
];

const HEAD = [
  { key: 'eyebrow', label: 'Eyebrow', kind: 'text', max: 80, half: true, hint: 'A few words above the heading.' },
  { key: 'title', label: 'Heading', kind: 'text', max: 160, half: true },
  { key: 'intro', label: 'Intro', kind: 'textarea', max: 500 },
];

const IMAGE = { key: 'image', label: 'Picture', kind: 'image', show: (p) => p.visual === 'image' };

/** Section types, in the order the "Add a section" picker lists them. */
export const SECTION_TYPES = {
  hero: {
    label: 'Hero',
    icon: Rocket,
    description: 'The opening: the big heading, a line under it, two buttons and a picture or the drawn phone.',
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', kind: 'text', max: 80, half: true, hint: 'A few words above the heading.' },
      { key: 'title', label: 'Heading', kind: 'text', max: 160, half: true, hint: 'The page’s main heading when this section comes first.' },
      { key: 'subtitle', label: 'Sub-heading', kind: 'textarea', max: 500 },
      { key: 'primary', label: 'Main button', kind: 'link' },
      { key: 'secondary', label: 'Second button', kind: 'link' },
      { key: 'note', label: 'Small print', kind: 'text', max: 200, hint: 'Under the buttons, e.g. “Free · No credit card · 6 languages”.' },
      {
        key: 'visual',
        label: 'Beside the words',
        kind: 'select',
        options: [
          { value: 'phone', label: 'The drawn phone (the Tasks screen)' },
          { value: 'image', label: 'A picture' },
          { value: 'none', label: 'Nothing' },
        ],
      },
      IMAGE,
    ],
  },
  steps: {
    label: 'Steps',
    icon: ListOrdered,
    description: 'How it works, as numbered steps (up to 6).',
    fields: [...HEAD, { key: 'items', label: 'Steps', itemLabel: 'Step', kind: 'list', max: 6, fields: [
      { key: 'title', label: 'Title', kind: 'text', max: 120 },
      { key: 'text', label: 'Text', kind: 'textarea', max: 500 },
    ] }],
  },
  featureGrid: {
    label: 'Feature grid',
    icon: LayoutGrid,
    description: 'Tiles with an icon, a title and a line each (up to 12).',
    fields: [...HEAD, { key: 'items', label: 'Tiles', itemLabel: 'Tile', kind: 'list', max: 12, fields: [
      { key: 'icon', label: 'Icon', kind: 'icon', half: true },
      { key: 'title', label: 'Title', kind: 'text', max: 120, half: true },
      { key: 'text', label: 'Text', kind: 'textarea', max: 500 },
      { key: 'href', label: 'Link', kind: 'href', hint: 'Optional: the tile links here.' },
    ] }],
  },
  featureSplit: {
    label: 'Text beside a picture',
    icon: Columns2,
    description: 'A heading, words and bullets on one side; a picture or a drawing on the other.',
    fields: [
      ...HEAD,
      { key: 'text', label: 'Text', kind: 'textarea', max: 1500 },
      { key: 'bullets', label: 'Bullets', itemLabel: 'Bullet', kind: 'strings', max: 8, itemMax: 300 },
      { key: 'cta', label: 'Button', kind: 'link' },
      {
        key: 'visual',
        label: 'The other side',
        kind: 'select',
        options: [
          { value: 'none', label: 'Nothing' },
          { value: 'image', label: 'A picture' },
          { value: 'orgTabs', label: 'Drawing: organization tabs' },
          { value: 'chat', label: 'Drawing: a busy WhatsApp group' },
          { value: 'phone', label: 'Drawing: the phone' },
        ],
      },
      IMAGE,
      { key: 'reverse', label: 'Picture on the left', kind: 'switch', hint: 'On a wide screen; phones always show the words first.' },
    ],
  },
  audiences: {
    label: 'Who it’s for',
    icon: Users,
    description: 'Tiles for each kind of customer, usually linking to a /for/… page (up to 8).',
    fields: [...HEAD, { key: 'items', label: 'Tiles', itemLabel: 'Tile', kind: 'list', max: 8, fields: [
      { key: 'icon', label: 'Icon', kind: 'icon', half: true },
      { key: 'title', label: 'Title', kind: 'text', max: 120, half: true },
      { key: 'text', label: 'Text', kind: 'textarea', max: 500 },
      { key: 'href', label: 'Link', kind: 'href', hint: 'e.g. /for/shops-and-outlets' },
    ] }],
  },
  languages: {
    label: 'Languages',
    icon: Globe,
    description: 'The languages Karo speaks, in English and in their own script.',
    fields: [...HEAD, { key: 'items', label: 'Languages', itemLabel: 'Language', kind: 'list', max: 12, compact: true, fields: [
      { key: 'name', label: 'Name in English', kind: 'text', max: 40, half: true },
      { key: 'native', label: 'In its own script', kind: 'text', max: 40, half: true },
    ] }],
  },
  platforms: {
    label: 'Platforms',
    icon: MonitorSmartphone,
    description: 'Android, iPhone and the web, each with its own button (up to 4).',
    fields: [...HEAD, { key: 'items', label: 'Platforms', itemLabel: 'Platform', kind: 'list', max: 4, fields: [
      { key: 'icon', label: 'Icon', kind: 'icon', half: true },
      { key: 'title', label: 'Title', kind: 'text', max: 80, half: true },
      { key: 'text', label: 'Text', kind: 'textarea', max: 500 },
      { key: 'cta', label: 'Button', kind: 'link' },
    ] }],
  },
  stats: {
    label: 'Numbers',
    icon: BarChart3,
    description: 'Big numbers: live counts from Karo (refreshed every 10 minutes) or your own. Only real ones.',
    fields: [
      ...HEAD,
      {
        key: 'mode',
        label: 'Where the numbers come from',
        kind: 'select',
        options: [
          { value: 'live', label: 'Live from Karo' },
          { value: 'manual', label: 'Typed here' },
        ],
      },
      { key: 'items', label: 'Numbers', itemLabel: 'Number', kind: 'list', max: 6, compact: true, fields: [
        {
          key: 'key',
          label: 'Live count',
          kind: 'select',
          half: true,
          show: (_, section) => section.mode !== 'manual',
          options: [
            { value: '', label: 'Choose one' },
            { value: 'people', label: 'People on Karo' },
            { value: 'organizations', label: 'Organizations' },
            { value: 'tasksDone', label: 'Tasks done' },
          ],
        },
        { key: 'value', label: 'Number', kind: 'text', max: 20, half: true, show: (_, section) => section.mode === 'manual', hint: 'e.g. 1,200+' },
        { key: 'label', label: 'Label', kind: 'text', max: 80, half: true },
      ] },
    ],
  },
  testimonials: {
    label: 'Testimonials',
    icon: Quote,
    description: 'Quotes from real customers, with their permission. Drawn only when there are some.',
    fields: [...HEAD, { key: 'items', label: 'Quotes', itemLabel: 'Quote', kind: 'list', max: 12, fields: [
      { key: 'quote', label: 'Quote', kind: 'textarea', max: 800 },
      { key: 'name', label: 'Name', kind: 'text', max: 80, half: true },
      { key: 'role', label: 'Role', kind: 'text', max: 80, half: true },
      { key: 'org', label: 'Business', kind: 'text', max: 80, half: true },
    ] }],
  },
  faq: {
    label: 'Questions and answers',
    icon: CircleHelp,
    description: 'Questions people ask, open on the page and marked up for Google (up to 30).',
    fields: [
      ...HEAD,
      { key: 'ask', label: 'Line above the contact email', kind: 'text', max: 120, hint: 'Beside the questions, with the email from Settings → Contact. Empty: “Still have a question?”' },
      { key: 'items', label: 'Questions', itemLabel: 'Question', kind: 'list', max: 30, fields: [
        { key: 'q', label: 'Question', kind: 'text', max: 240 },
        { key: 'a', label: 'Answer', kind: 'markdown', max: 3000, rows: 4 },
      ] },
    ],
  },
  blogTeaser: {
    label: 'Latest posts',
    icon: Newspaper,
    description: 'The newest blog posts as cards, optionally from one tag.',
    fields: [
      ...HEAD,
      { key: 'count', label: 'How many posts', kind: 'number', min: 1, max: 6, half: true, default: 3 },
      { key: 'tag', label: 'Only this tag', kind: 'text', max: 40, half: true, hint: 'Leave empty for every post.' },
    ],
  },
  cta: {
    label: 'Call to action',
    icon: Megaphone,
    description: 'A closing band with a heading and two buttons.',
    fields: [
      { key: 'title', label: 'Heading', kind: 'text', max: 160 },
      { key: 'text', label: 'Text', kind: 'textarea', max: 500 },
      { key: 'primary', label: 'Main button', kind: 'link' },
      { key: 'secondary', label: 'Second button', kind: 'link' },
      { key: 'note', label: 'Small print', kind: 'text', max: 200 },
    ],
  },
  richText: {
    label: 'Text',
    icon: FileText,
    description: 'Free text in Markdown: headings, lists, links and pictures from the library.',
    fields: [{ key: 'md', label: 'Text (Markdown)', kind: 'markdown', max: 80000, rows: 14 }],
  },
};

/** A field's empty value. */
function emptyOf(field) {
  if (field.default !== undefined) return field.default;
  switch (field.kind) {
    case 'link':
      return { label: '', href: '' };
    case 'image':
      return { media: null, alt: '' };
    case 'select':
      return field.options[0].value;
    case 'switch':
      return false;
    case 'number':
      return field.min ?? 0;
    case 'list':
    case 'strings':
      return [];
    default:
      return '';
  }
}

/** Every field's empty value: a new section's props, or a new list item. */
export function emptyProps(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, emptyOf(f)]));
}

/** A section id the server keeps (lowercase letters, numbers and dashes). */
const newId = (type) => `${type.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;

/** A new section of `type`, with one empty item where it has a list. */
export function newSection(type) {
  const { fields } = SECTION_TYPES[type];
  const props = emptyProps(fields);
  for (const f of fields) {
    if (f.kind === 'list') props[f.key] = [emptyProps(f.fields)];
    if (f.kind === 'strings') props[f.key] = [''];
  }
  return { id: newId(type), type, hidden: false, props };
}

/** A line to know a section by in the list: its heading, else its first words. */
export function sectionSummary(section) {
  const p = section.props || {};
  const text = p.title || p.eyebrow || p.intro || p.subtitle || p.text || (typeof p.md === 'string' ? p.md.replace(/[#*_>`[\]()-]/g, ' ') : '');
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}
