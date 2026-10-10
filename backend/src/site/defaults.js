/**
 * The website's first content, written once: the settings, the six main
 * pages, three use-case pages and three blog posts. Everything here is the
 * Super Admin's to change in the console afterwards.
 *
 * ensureSiteDefaults() runs at every start (app.js handler, server.js) and is
 * cheap once done: it reads one number (settings.seedVersion). Each entry in
 * SEEDS is written once, so a page the Super Admin deleted is not put back.
 * To add starter content later, add a new SEEDS entry with the next version.
 *
 * Copy rules: honest. Karo is free; WhatsApp is a nudge the person sends in
 * one tap (never automatic); no made-up numbers, ratings or testimonials; no
 * task templates (gone). The voice is "In Karo, you …". Search titles stay
 * within 60 characters (with " · Karo" added where the title lacks the name)
 * and descriptions within 155.
 *
 * Markdown here starts its sections with "#": the site makes that an h2 (the
 * page's title is its only h1), and "##" an h3.
 */
const SiteSettings = require('./models/SiteSettings');
const SitePage = require('./models/SitePage');
const BlogPost = require('./models/BlogPost');
const { parseContent } = require('./schemas');
const { renderMarkdown, readingMinutes } = require('./markdown');

const REGISTER = { label: 'Register free', href: '/sign-up' };
const ANDROID = { label: 'Get the Android app', href: '/get-app' };
// Shown as a row of ticks under a hero or a CTA (one tick per " · " part).
const FREE_NOTE = 'Free for everyone · No credit card · English, हिंदी, ಕನ್ನಡ, தமிழ், తెలుగు, മലയാളം';
const SUPPORT = 'support@sequencesurface.com';

// ---------------------------------------------------------------- settings

const SETTINGS = {
  brandName: 'Karo',
  tagline: 'In Karo, you give tasks to anyone by their Task Pin and see them through to done. Free, in six Indian languages.',
  seo: {
    titleTemplate: '%s · Karo',
    defaultDescription:
      'Karo is a free task app for Indian teams. Give tasks by Task Pin, see them accepted, moving and done. On Android, iPhone and the web.',
  },
  nav: [
    { label: 'Features', href: '/features' },
    { label: 'Business owners', href: '/for/business-owners' },
    { label: 'Shops', href: '/for/shops-and-outlets' },
    { label: 'Offices', href: '/for/offices' },
    { label: 'Blog', href: '/blog' },
  ],
  headerCta: { login: { label: 'Log in', href: '/sign-in' }, register: { label: 'Register free', href: '/sign-up' } },
  footer: {
    columns: [
      {
        title: 'Product',
        links: [
          { label: 'Features', href: '/features' },
          { label: 'Organizations', href: '/#organizations' },
          { label: 'Get the app', href: '/get-app' },
          { label: 'Log in', href: '/sign-in' },
        ],
      },
      {
        title: 'Use cases',
        links: [
          { label: 'Business owners', href: '/for/business-owners' },
          { label: 'Shops and outlets', href: '/for/shops-and-outlets' },
          { label: 'Offices', href: '/for/offices' },
        ],
      },
      {
        title: 'Resources',
        links: [
          { label: 'Blog', href: '/blog' },
          { label: 'What is a Task Pin?', href: '/blog/what-is-a-task-pin' },
          { label: 'Questions and answers', href: '/#faq' },
        ],
      },
      {
        title: 'Company',
        links: [
          { label: 'About', href: '/about' },
          { label: 'Contact', href: '/contact' },
          { label: 'Privacy policy', href: '/privacy' },
          { label: 'Terms of use', href: '/terms' },
          { label: 'Delete account', href: '/delete-account' },
        ],
      },
    ],
    note: 'Karo is made by Sequence Surface LLP.',
  },
  contact: { email: SUPPORT },
  announcement: {
    enabled: false,
    text: 'New in Karo: organizations. Your shop, your office and your family business in one list.',
    href: '/#organizations',
  },
  blog: {
    title: 'The Karo blog',
    description: 'Practical guides to giving tasks, following up and getting work done with your staff, your partners and everyone you work with.',
    cta: {
      title: 'Give your next task in Karo',
      text: 'Free for you and everyone you work with. Set up in a minute, on Android, iPhone or the web.',
      primary: { label: 'Register free', href: '/sign-up' },
      secondary: { label: 'Get the Android app', href: '/get-app' },
    },
  },
  notFound: {
    title: 'We could not find that page',
    text: 'The link may be old, or the page may have moved. These are a good place to start:',
  },
};

// ---------------------------------------------------------------- shared sections

const LANGUAGES = {
  type: 'languages',
  id: 'languages',
  props: {
    eyebrow: 'Languages',
    title: "Karo speaks your team's language",
    intro: 'In the Karo app, each person picks their own language for its screens, buttons and alerts. Your tasks stay exactly as you wrote them.',
    items: [
      { name: 'English', native: 'English' },
      { name: 'Hindi', native: 'हिंदी' },
      { name: 'Kannada', native: 'ಕನ್ನಡ' },
      { name: 'Tamil', native: 'தமிழ்' },
      { name: 'Telugu', native: 'తెలుగు' },
      { name: 'Malayalam', native: 'മലയാളം' },
    ],
  },
};

const PLATFORMS = {
  type: 'platforms',
  id: 'platforms',
  props: {
    eyebrow: 'Everywhere you work',
    title: 'On your phone and on your computer',
    intro: 'One free account and the same tasks, wherever you open Karo.',
    items: [
      {
        icon: 'phone',
        title: 'Android',
        text: 'Install the Karo app on any Android phone. Alerts arrive as notifications, and the app tells you when a new version is ready.',
        cta: ANDROID,
      },
      {
        icon: 'phone',
        title: 'iPhone',
        text: 'Open Karo in Safari and add it to your Home Screen. It opens full screen and can send you notifications. There is no App Store download.',
        cta: { label: 'How to add it', href: '/get-app' },
      },
      {
        icon: 'laptop',
        title: 'Web',
        text: 'Use Karo in any browser on your computer, with room to see every task, the calendar and the dashboard at once.',
        cta: { label: 'Open Karo', href: '/sign-in' },
      },
    ],
  },
};

const FINAL_CTA = {
  type: 'cta',
  id: 'get-started',
  props: {
    title: 'Give your first task in Karo today.',
    text: 'Free for you and everyone you work with. Set up in a minute, on your phone or your computer.',
    primary: REGISTER,
    secondary: ANDROID,
    note: FREE_NOTE,
  },
};

const WHATSAPP_SPLIT = {
  type: 'featureSplit',
  id: 'whatsapp',
  props: {
    eyebrow: 'Why Karo',
    title: 'WhatsApp groups bury work.',
    text: 'A task posted in a busy group sinks under forwards and good-mornings. Nobody is sure who owns it, when it is due or whether it is done, so you end up asking again and again.',
    bullets: [
      'In Karo, every task has one owner, one deadline and one status.',
      'Tasks stay on a list until they are done, not in a chat that scrolls away.',
      'Still need a push? Karo opens WhatsApp with a ready nudge, and you press send.',
    ],
    cta: { label: 'WhatsApp groups vs a task app', href: '/blog/whatsapp-groups-vs-task-app' },
    visual: 'chat',
  },
};

const ORGS_SPLIT = {
  type: 'featureSplit',
  id: 'organizations',
  props: {
    eyebrow: 'New: Organizations',
    title: 'Your shop, your office, your family business. One list.',
    text: 'In Karo, you can be in many organizations. Your Tasks screen has a tab for All, one for General and one for each organization, in the order you choose. The first tab is the one Karo opens on.',
    bullets: [
      'Anyone can create an organization and invite people by Task Pin or from the people they already work with.',
      'People accept the invite before they join.',
      'Owners and admins see every task filed under their organization.',
    ],
    cta: { label: 'See every feature', href: '/features' },
    visual: 'orgTabs',
    reverse: true,
  },
};

// ---------------------------------------------------------------- pages

const HOME = {
  path: '/',
  system: true,
  title: 'Karo: free task app for Indian teams',
  seo: {
    title: 'Karo: Free Task Delegation App for Indian Teams',
    description:
      'Karo is a free task app for India. Give tasks to your staff or anyone with a Task Pin, nudge them on WhatsApp in one tap and see the work done.',
  },
  sections: [
    {
      type: 'hero',
      id: 'hero',
      props: {
        eyebrow: 'Free task app for Indian teams',
        title: 'In Karo, you give a task once. It gets done.',
        subtitle:
          'Give work to your staff, your partners or anyone with a Task Pin. See who accepted it, what is moving and what is done, without calling anyone to ask.',
        primary: REGISTER,
        secondary: ANDROID,
        note: FREE_NOTE,
        visual: 'phone',
      },
    },
    {
      type: 'steps',
      id: 'how-it-works',
      props: {
        eyebrow: 'How it works',
        title: 'From “please do this” to done, in three steps',
        items: [
          {
            title: 'Share your Task Pin',
            text: 'In Karo, you get your own Task Pin. Share it, or add someone else’s, and you are connected. Nobody needs your phone number.',
          },
          {
            title: 'Give a task with a deadline',
            text: 'Say what needs doing, by when and how urgent it is. Add a voice note, a photo or a file, and give it to one person or several.',
          },
          {
            title: 'Watch it move to done',
            text: 'They accept it, update the progress and send it back for your review. You see every step without asking.',
          },
        ],
      },
    },
    WHATSAPP_SPLIT,
    {
      type: 'featureGrid',
      id: 'features',
      props: {
        eyebrow: 'Features',
        title: 'Everything you need to see work through',
        intro: 'A few things, done simply. Each one saves you a follow-up.',
        items: [
          { icon: 'check', title: 'Know it landed', text: 'In Karo, you see the moment a task is accepted, or declined with a reason.' },
          { icon: 'progress', title: 'Progress without asking', text: 'In Karo, you watch each task move from to do, to in progress, to done.' },
          { icon: 'review', title: 'Check it before it closes', text: 'In Karo, you can review the work first. Approve it, or send it back with a note.' },
          { icon: 'time', title: 'No silent delays', text: 'In Karo, people ask for more time before the deadline, and you say yes or no.' },
          { icon: 'repeat', title: 'Set it once, every month', text: 'In Karo, you repeat tasks daily, weekly or monthly: rent, GST, salaries, stock checks.' },
          { icon: 'calendar', title: 'Every date in one place', text: 'In Karo, you see every due date and reminder for the month on one calendar.' },
          { icon: 'mic', title: 'Say it, don’t type it', text: 'In Karo, you add a voice note, a photo or a document when typing is slow.' },
          { icon: 'sheet', title: 'Reports in Excel', text: 'In Karo, you download your tasks as an Excel sheet whenever you need a report.' },
        ],
      },
    },
    ORGS_SPLIT,
    LANGUAGES,
    {
      type: 'audiences',
      id: 'use-cases',
      props: {
        eyebrow: 'Use cases',
        title: 'Made for the way you already work',
        items: [
          {
            icon: 'briefcase',
            title: 'Business owners',
            text: 'Give work to your staff and know what is done, without calling everyone every evening.',
            href: '/for/business-owners',
          },
          {
            icon: 'store',
            title: 'Shops and outlets',
            text: 'Opening, restocking, deliveries and cleaning, each with an owner, a time and a photo when it is done.',
            href: '/for/shops-and-outlets',
          },
          {
            icon: 'building',
            title: 'Offices',
            text: 'Follow up on files, payments and client work, and review it before it goes out.',
            href: '/for/offices',
          },
        ],
      },
    },
    PLATFORMS,
    {
      type: 'stats',
      id: 'numbers',
      // Shown when the Super Admin decides the real numbers are worth showing.
      hidden: true,
      props: {
        eyebrow: 'Karo today',
        title: 'Work getting done in Karo',
        mode: 'live',
        items: [
          { key: 'people', label: 'People on Karo' },
          { key: 'organizations', label: 'Organizations' },
          { key: 'tasksDone', label: 'Tasks done' },
        ],
      },
    },
    // Real words from real people only: empty and hidden until there are some.
    { type: 'testimonials', id: 'stories', hidden: true, props: { eyebrow: 'Stories', title: 'What people say about Karo', items: [] } },
    {
      type: 'faq',
      id: 'faq',
      props: {
        eyebrow: 'Questions',
        title: 'Questions people ask',
        intro: 'Short answers about how Karo works. The rest is on the features page and the blog.',
        items: [
          { q: 'Is Karo free?', a: 'Yes. Karo is free for you and for everyone you give tasks to. There is no credit card to add and no trial that runs out.' },
          {
            q: 'What is a Task Pin?',
            a: 'Your Task Pin is a short code that is yours in Karo. Share it, and people can add you as a contact and give you tasks without seeing your phone number or email. [Read more about the Task Pin](/blog/what-is-a-task-pin).',
          },
          {
            q: 'Does the other person need Karo?',
            a: 'Yes, they need a free Karo account to see and update tasks. Send them your invite link on WhatsApp: it helps them get Karo and adds you as a contact.',
          },
          {
            q: 'How do WhatsApp nudges work?',
            a: 'When a task needs a push, tap the WhatsApp button on it. Karo opens WhatsApp with a ready message about the task; you check it and press send. Karo never sends WhatsApp messages on its own.',
          },
          {
            q: 'Which languages does Karo speak?',
            a: 'English, Hindi (हिंदी), Kannada (ಕನ್ನಡ), Tamil (தமிழ்), Telugu (తెలుగు) and Malayalam (മലയാളം). In the Karo app, each person picks their own.',
          },
          {
            q: 'Does Karo work on iPhone?',
            a: 'Yes. Open Karo in Safari on your iPhone and add it to your Home Screen. It opens full screen like any other app and can send you notifications. There is no App Store download. [See how](/get-app).',
          },
          { q: 'Can I export my tasks to Excel?', a: 'Yes. In Karo, you can download your tasks, with the filters you have chosen, as an Excel file.' },
          {
            q: 'Can I be in more than one organization?',
            a: 'Yes. In Karo, you can create or join many organizations. Your Tasks screen has a tab for All, one for General (tasks not filed under any organization) and one for each organization.',
          },
          {
            q: 'Can tasks repeat?',
            a: 'Yes. Set a task to repeat every day, on chosen weekdays or every month, and Karo creates each one on time for the people on it.',
          },
          {
            q: 'How do I delete my account and my data?',
            a: 'In the Karo app go to More → Delete account, or use the [Delete account](/delete-account) page on the website. Your account and the tasks only you were on are deleted. Our [privacy policy](/privacy) has the details.',
          },
        ],
      },
    },
    { type: 'blogTeaser', id: 'blog', props: { eyebrow: 'From the blog', title: 'Guides for getting work done', count: 3 } },
    FINAL_CTA,
  ],
};

const FEATURES = {
  path: '/features',
  system: true,
  title: 'Features',
  seo: {
    title: 'Karo Features: Task Pin, Reminders, Review and More',
    description:
      'Every Karo feature in plain words: Task Pin, organizations, accept and decline, progress, review, more time, reminders, recurring tasks and Excel export.',
  },
  sections: [
    {
      type: 'hero',
      id: 'hero',
      props: {
        eyebrow: 'Features',
        title: 'Everything Karo does, in plain words',
        subtitle: 'Karo is built for one job: a task given once and followed through to done. Here is how each part gets you there, from the first Task Pin to the monthly report.',
        primary: REGISTER,
        secondary: ANDROID,
        note: FREE_NOTE,
        visual: 'phone',
      },
    },
    {
      type: 'featureGrid',
      id: 'connect',
      props: {
        eyebrow: 'Connect',
        title: 'Work with anyone, not just your staff list',
        intro: 'Your staff, your partners, your CA, a supplier: if they have Karo, you can give them a task.',
        items: [
          { icon: 'pin', title: 'Your Task Pin', text: 'In Karo, you have a Task Pin. Share it and people find you in a tap, without your number.' },
          { icon: 'users', title: 'Contacts', text: 'In Karo, you add people by their Task Pin. They accept, and you can give each other tasks.' },
          { icon: 'building', title: 'Organizations', text: 'In Karo, you create organizations and invite people. Members accept before they join.' },
          { icon: 'whatsapp', title: 'Invite on WhatsApp', text: 'In Karo, you send an invite link on WhatsApp. It helps the other person get Karo and connect with you.' },
        ],
      },
    },
    {
      type: 'featureGrid',
      id: 'follow-through',
      props: {
        eyebrow: 'Follow through',
        title: 'Give a task once and see it through',
        items: [
          { icon: 'check', title: 'Accept or decline', text: 'The person you give a task to accepts it, or declines it with a reason. You are never left guessing.' },
          { icon: 'progress', title: 'Progress', text: 'Each task moves from to do, to in progress, to done, and you see every step.' },
          { icon: 'review', title: 'Review', text: 'Ask to check the work before it is marked done. Approve it, or send it back with a note.' },
          { icon: 'time', title: 'More time', text: 'The person doing a task can ask for a new date. The person who gave it says yes or no.' },
          { icon: 'layers', title: 'Sub-tasks', text: 'Break a big job into smaller pieces, each with its own person and date.' },
          { icon: 'users', title: 'Keep people in the loop', text: 'Add people who should follow a task without doing it, like a manager or a partner.' },
        ],
      },
    },
    {
      type: 'featureGrid',
      id: 'remember',
      props: {
        eyebrow: 'Remember',
        title: 'Never miss a date again',
        items: [
          { icon: 'bell', title: 'Reminders', text: 'Set reminders on a task, for yourself or for everyone on it.' },
          { icon: 'repeat', title: 'Recurring tasks', text: 'Rent, GST, salaries, stock checks: set them once and Karo creates each one on time.' },
          { icon: 'calendar', title: 'Calendar', text: 'Every due date and reminder on one calendar, month by month.' },
          { icon: 'inbox', title: 'Daily summary', text: 'A short summary of what is due and what is late, at the time you choose.' },
        ],
      },
    },
    WHATSAPP_SPLIT,
    ORGS_SPLIT,
    {
      type: 'featureGrid',
      id: 'overview',
      props: {
        eyebrow: 'See it all',
        title: 'Know where everything stands',
        items: [
          { icon: 'layers', title: 'Clear figures', text: 'Open, not accepted yet, overdue, in progress, under review and more time asked, at the top of your list.' },
          { icon: 'chart', title: 'Dashboard', text: 'See how work is going across the people you give tasks to.' },
          { icon: 'search', title: 'Search and filters', text: 'Find any task by words, person, date, priority or status.' },
          { icon: 'sheet', title: 'Excel export', text: 'Download your tasks as an Excel sheet for a report or a meeting.' },
          { icon: 'mic', title: 'Voice notes and files', text: 'Record a voice note or attach photos and documents to any task or update.' },
          { icon: 'shield', title: 'Private by default', text: 'Only the people on a task, and the owner and admins of its organization, can see it. No ads, and your data is never sold.' },
        ],
      },
    },
    LANGUAGES,
    PLATFORMS,
    FINAL_CTA,
  ],
};

const ABOUT_MD = `Karo is a simple task app for the way work really happens in India: in shops, offices, clinics and family businesses, between owners, staff, partners and the people they work with outside the company.

# Why we made Karo

Most small teams run on phone calls and WhatsApp groups. They work, until a task gets lost in a busy chat, nobody is sure who said they would do it, and the owner ends up calling everyone to ask "is it done?".

In Karo, you give a task once. It has one owner, one deadline and one status, and it stays in front of everyone until it is done. You see who accepted it, what is moving and what is waiting for your review, without asking.

# What we believe

- **Free and simple.** Karo is free to use. You should be able to start in a minute without training.
- **Anyone can join in.** With a Task Pin you can work with your staff, your CA, a vendor or your family, not just people on a company list.
- **Your language.** The Karo app speaks English, हिंदी, ಕನ್ನಡ, தமிழ், తెలుగు and മലയാളം.
- **Your data is yours.** No ads, no selling your information, and you can delete your account at any time. Read our [privacy policy](/privacy).

# Who we are

Karo is made in India by Sequence Surface LLP. Write to us at [${SUPPORT}](mailto:${SUPPORT}). We read every message.`;

const CONTACT_MD = `We would love to hear from you: a question, an idea, or something that is not working the way it should.

# Write to us

Email **[${SUPPORT}](mailto:${SUPPORT})**. We aim to reply within 7 days, usually much sooner.

When you write about a problem, it helps to tell us:

- whether you use Karo on Android, iPhone or a computer,
- what you were trying to do, and what happened instead,
- a screenshot, if you can.

# Your account and your data

- To delete your account, use [Delete account](/delete-account) or, in the Karo app, More → Delete account.
- For anything about your personal data, including requests under India's Digital Personal Data Protection Act, see our [privacy policy](/privacy) or email us at the address above.

# Getting started

New to Karo? [Register free](/sign-up) or [get the Android app](/get-app). The [blog](/blog) has short guides, starting with [what a Task Pin is](/blog/what-is-a-task-pin).`;

// web/src/platform/privacy.js (the apps' copy of the policy) as Markdown, word
// for word: test/site.test.js fails when the two differ.
const PRIVACY_MD = `_Last updated: 11 October 2026_

This policy explains what information Karo (the Karo app on Android, iPhone and the web, and the Karo website with its blog) collects, why, who it is shared with, and the choices you have. Karo is run by Sequence Surface LLP ("we", "us").

By creating an account or using Karo you agree to this policy. If you do not agree, please do not use Karo.

# What we collect

Information you give us:

- Account details: your name, your email address or mobile number, and your password (stored only in scrambled, hashed form; we cannot read it). You can also add a job title.
- Your profile photo, if you add one. Anyone signed in to Karo can see it next to your name.
- Your Task Pin: the short ID we give you so other people can find and add you.
- Your work: tasks, sub-tasks, descriptions, notes and comments, due dates, priorities, reminders, repeating schedules, categories, links and status changes.
- Files you attach: photos, documents and videos you choose to upload, and voice notes you record.
- Your contacts and organizations inside Karo: the people you have added by their Task Pin, the organizations you create or join, and your role in them. Karo does not read the address book on your phone.
- Your settings: time zone, language, reminder and daily-summary choices, and the order of your organization tabs.

Information collected automatically:

- A push-notification token for your phone (and whether it is Android or iOS), so we can send you task alerts.
- Your sign-ins: for each phone or browser you are signed in on, the kind of device, the app version, the network (IP) address and when it was last used. You can sign a device out, and so can our administrators.
- A record of what happens in your account, for example sign-ins, changes to your profile and the tasks you work on. It is kept for 180 days, to keep Karo secure and to help when something goes wrong.
- Your IP address, which our server also uses to stop password guessing.

We do not collect your location, we do not read your phone contacts, and we do not use advertising or analytics trackers, in the app or on the website.

# Phone permissions

Karo asks for a permission only when you use the feature that needs it, and you can turn each one off in your phone settings at any time:

- Camera: to take a photo to attach to a task, or a profile photo.
- Photos and files: to pick a photo or document to attach, or a profile photo. Only the items you pick are uploaded.
- Microphone: to record a voice note on a task. The microphone is used only while you are recording.
- Notifications: to alert you about new tasks, reminders and updates.

# Our website

- Anyone can read the Karo website (the home page, the feature pages and the blog) without an account. Our administrators write its pages and posts. It has no forms of its own: Log in and Register open the Karo web app.
- Neither the website nor the web app uses cookies. They keep a few things in your browser's own storage on your device: light or dark, an announcement you closed, and in the web app your sign-in. The website looks only at whether you are signed in, to take you straight to your tasks.
- If the website shows numbers, such as how many people use Karo, they are totals and never about any one person.
- Links to our pages on other sites (for example Instagram) take you to those sites, and their own policies apply there. Nothing from them is loaded on our pages.

# How we use your information

- To create and run your account and sign you in.
- To show your tasks to you and to the people you share them with, and to send the tasks, reminders, nudges and daily summaries you set up.
- To let people find you by your Task Pin, and to run your contacts and organizations.
- To send password-reset emails when you ask for one, and reminders you choose to get by email.
- To keep Karo secure, prevent abuse and fix problems.
- To meet our legal obligations.

We do not sell your information, and we do not use it for advertising.

# Who can see your information

- People you work with: anyone on a task (whoever set it, the people doing it, people kept in the loop, and the owner and admins of the organization it is filed under) can see that task, its history, its files and the names of the people on it. Other people in that organization see it only if they are on it.
- Your contacts and the people in your organizations can see your name, job title, Task Pin and photo, and can give you tasks. Any of them who owns or runs an organization can invite you to it; you are not added until you accept.
- People who have your Task Pin can see your name, job title and Task Pin, and can send you a contact request or an organization invite.
- Your email address is never shown to other users. Your mobile number is shown only to a contact you connected with through a WhatsApp invite link, on tasks you share, so you can WhatsApp each other about them. Karo never sends WhatsApp messages itself: you choose whether to send one. Either of you can switch this off in Contacts.
- Our administrators: a small number of Karo administrators can see accounts, signed-in devices, the activity record and tasks to provide support, deal with abuse, and keep the service running. They do this only when needed.

# Service providers we share with

We use a few trusted companies to run Karo. They process information only on our instructions and only to provide their service to us:

- Cloud hosting and database providers, which store Karo's data and files on secure servers.
- Expo (expo.dev), Google Firebase Cloud Messaging and Apple Push Notification service, which deliver push notifications to your phone. They receive your push token and the text of the alert.
- An email provider, which delivers password-reset emails, and reminders you choose to get by email, to your email address.
- Google Fonts, which serves the typeface the website and the web app use. Your browser downloads it from Google, so Google receives your IP address and browser details. Nothing else on the website or in the web app is loaded from another company.

We may also disclose information if the law requires it, to protect the rights and safety of our users or the public, or as part of a merger or sale of our business (in which case this policy will continue to apply).

# Security

Information travels between the apps, the website and our server over encrypted connections (HTTPS). Passwords are stored hashed, files can only be opened through short-lived signed links, and access is limited to people who need it. No system is perfectly secure, so please use a strong password and keep it to yourself.

# How long we keep it

- Your account and work: for as long as your account exists.
- Alerts in the bell: deleted automatically after 90 days.
- Files uploaded but never attached to a task: deleted after one day.
- When you delete your account: see the next section. Copies in our backups are overwritten within 30 days.

# Deleting your account

You can delete your account at any time, in the Karo app (More → Delete account) or on the web (Settings → Delete account, or the [Delete your account](/delete-account) page). You will be asked for your password.

When you delete your account we immediately delete your name, email, mobile number, password, Task Pin, job title and settings; your contacts and pending requests; your organization memberships; your devices and alerts; and every task, repeating schedule and category that only you were on, including their files and voice notes.

Tasks you shared with other people belong to them as well, so they stay in their accounts, with your name shown as "Deleted user". Organizations you owned pass to one of their admins or members, or are deleted if nobody else is in them. Deleting your account cannot be undone.

If you cannot sign in, email us from the email address on your account (or tell us your mobile number) and we will delete it for you.

# Your choices and rights

You can see and correct your details under My profile, change your settings at any time, turn off notifications and phone permissions in your phone settings, and delete your account as explained above. Depending on where you live (for example under India's Digital Personal Data Protection Act, 2023 or the EU/UK GDPR) you may also have the right to ask for a copy of your information, to have it corrected or erased, to withdraw your consent, and to complain to a data protection authority. To use any of these rights, contact us at the address below.

# Children

Karo is meant for people aged 18 and over and is not directed at children. We do not knowingly collect information from children. If you believe a child has given us information, contact us and we will delete it.

# Where your information is stored

Karo's servers and our service providers may be located outside the country where you live. Wherever your information is processed, we protect it as this policy describes.

# Changes to this policy

We may update this policy from time to time. We will change the "Last updated" date above, and for important changes we will let you know in Karo. Continuing to use Karo after a change means you accept the updated policy.

# Contact us

Questions, requests or complaints about your privacy (including grievances under India's Digital Personal Data Protection Act): email [${SUPPORT}](mailto:${SUPPORT}). We aim to reply within 7 days.

Sequence Surface LLP`;

// A plain-language starting point. Have it reviewed before relying on it.
const TERMS_MD = `_Last updated: 11 October 2026_

These terms are the agreement between you and Sequence Surface LLP ("we", "us") for using Karo: the Karo app on Android and iPhone, and the Karo website. Please read them with our [privacy policy](/privacy), which explains how we handle your information.

# Using Karo

- You must be 18 or older to use Karo.
- Karo is free to use. If we ever offer paid features, we will tell you clearly first, and nothing you already use will start costing money without your agreement.
- Keep your password to yourself. You are responsible for what happens in your account, so tell us at once if you think someone else has used it.

# Your content

Your tasks, notes, files and voice notes are yours. You give us permission to store them and to show them to the people you share them with, only so that Karo can work. We do not sell your content or use it for advertising.

You are responsible for what you put in Karo. Only upload what you have the right to share.

# Fair use

Please do not:

- break the law, or use Karo to harass, threaten or cheat anyone;
- send spam, or invite people who have not asked to hear from you;
- upload harmful software, or try to get into accounts or parts of Karo that are not yours;
- copy, resell or overload the service.

We may suspend or close an account that breaks these rules.

# Tasks between people

Karo helps people give and track tasks. Any work, payment or arrangement between you and the people you work with is between you and them. We are not a party to it.

# The service

We work hard to keep Karo running and your data safe, but we provide Karo "as is". We cannot promise it will never be interrupted or have mistakes. We may change, add or remove features over time.

As far as the law allows, we are not liable for indirect losses, such as lost profits or lost data, that come from using or not being able to use Karo.

# Ending your account

You can stop using Karo and delete your account at any time from [Delete account](/delete-account). What happens to your data is explained in our privacy policy.

# Changes to these terms

We may update these terms. We will change the date above, and tell you in Karo about important changes. Continuing to use Karo after a change means you accept the new terms.

# Law

These terms are governed by the laws of India.

# Contact

Email [${SUPPORT}](mailto:${SUPPORT}).`;

const plainPage = (path, title, description, md, seoTitle = '', more = []) => ({
  path,
  system: true,
  title,
  seo: { title: seoTitle, description },
  sections: [{ type: 'richText', id: 'content', props: { md } }, ...more],
});

const ABOUT = plainPage(
  '/about',
  'About Karo',
  'Karo is a free task app made in India by Sequence Surface LLP, for owners, staff and everyone they work with.',
  ABOUT_MD,
  'About Karo: a Free Task App Made in India',
  [FINAL_CTA]
);
const CONTACT = plainPage(
  '/contact',
  'Contact us',
  'Questions, ideas or a problem with Karo? Email support@sequencesurface.com and we will get back to you.',
  CONTACT_MD,
  'Contact Karo: Questions, Ideas and Support'
);
const PRIVACY = plainPage(
  '/privacy',
  'Privacy policy',
  'What information Karo collects, why, who can see it, how long we keep it and how to delete your account.',
  PRIVACY_MD
);
const TERMS = plainPage(
  '/terms',
  'Terms of use',
  'The terms for using Karo, the free task app by Sequence Surface LLP: your account, your content, fair use and the law.',
  TERMS_MD
);

/** A use-case page: a hero, how it works there, what helps, a split, questions, the CTA. */
function useCase({ slug, title, seo, hero, steps, features, split, faq }) {
  return {
    path: `/for/${slug}`,
    system: false,
    title,
    seo,
    sections: [
      { type: 'hero', id: 'hero', props: { eyebrow: title, ...hero, primary: REGISTER, secondary: ANDROID, note: FREE_NOTE, visual: 'phone' } },
      { type: 'steps', id: 'how-it-works', props: { eyebrow: 'How it works', title: steps.title, items: steps.items } },
      { type: 'featureGrid', id: 'features', props: { eyebrow: 'What helps', title: features.title, items: features.items } },
      ...(split ? [split] : []),
      { type: 'faq', id: 'faq', props: { eyebrow: 'Questions', title: 'Questions people ask', items: faq } },
      FINAL_CTA,
    ],
  };
}

const BUSINESS_OWNERS = useCase({
  slug: 'business-owners',
  title: 'Business owners',
  seo: {
    title: 'Employee Task App for Business Owners, Free',
    description:
      'Give work to your staff and see what is done without calling everyone. Karo is a free employee task app with review, reminders and WhatsApp nudges.',
  },
  hero: {
    title: 'Give work to your staff. Know when it is done.',
    subtitle: 'In Karo, you give each person their tasks with a deadline, and see who has accepted, what is moving and what is late, on your phone, from anywhere.',
  },
  steps: {
    title: 'Set up your team in an afternoon',
    items: [
      { title: 'Create your organization', text: 'Name it after your business. Invite your staff by their Task Pin, or send them an invite link on WhatsApp.' },
      { title: 'Give the day’s tasks', text: 'One task per job, with a person, a date and a priority. Set the daily and monthly ones to repeat, once.' },
      { title: 'Check the figures, not the people', text: 'Not accepted, overdue and under review sit at the top of your list. Follow up only where it is needed.' },
    ],
  },
  features: {
    title: 'Built for owners who are always on the move',
    items: [
      { icon: 'review', title: 'Review before done', text: 'Ask to check important work first. Approve it, or send it back with a note.' },
      { icon: 'alert', title: 'Overdue at a glance', text: 'Late work is counted and shown in red, so nothing slips quietly.' },
      { icon: 'repeat', title: 'Repeat tasks', text: 'Daily opening checks, weekly stock, monthly GST: set once, created on time.' },
      { icon: 'sheet', title: 'Excel export', text: 'Download tasks for a monthly review or for your accountant.' },
    ],
  },
  split: ORGS_SPLIT,
  faq: [
    { q: 'Do my staff need smartphones?', a: 'They need Karo on an Android phone, an iPhone or a computer. Karo is free for them too.' },
    { q: 'Can a manager give tasks for me?', a: 'Yes. Make them an admin of your organization. Owners and admins see every task filed under it.' },
    { q: 'What if someone cannot finish on time?', a: 'They can ask for more time in Karo. You approve or decline the new date, and everyone sees the answer.' },
    { q: 'Can I see who did what last month?', a: 'Yes. Every task keeps its history, and you can [export your tasks to Excel](/features) for any period you filter.' },
  ],
});

const SHOPS = useCase({
  slug: 'shops-and-outlets',
  title: 'Shops and outlets',
  seo: {
    title: 'Staff Task Tracker for Shops and Outlets, Free',
    description:
      'Opening, restocking, deliveries and cleaning, each with an owner and a time. Karo is a free staff task tracker for shops, outlets and restaurants.',
  },
  hero: {
    title: 'Every job in the shop, given once and done',
    subtitle: 'In Karo, you give your counter, store and delivery staff their tasks with a time, get a photo when each one is done, and see what is still pending, even when you are not in the shop.',
  },
  steps: {
    title: 'From the morning opening to closing time',
    items: [
      { title: 'Add your staff', text: 'Each person shares their Task Pin, or joins from your WhatsApp invite link.' },
      { title: 'Set the daily routine', text: 'Opening checks, cleaning and the cash count as repeat tasks, created every day by themselves.' },
      { title: 'See it done', text: 'Staff mark tasks done and attach a photo. You review and approve from anywhere.' },
    ],
  },
  features: {
    title: 'What shop owners use most',
    items: [
      { icon: 'repeat', title: 'Daily repeat tasks', text: 'The same checklist every morning, without typing it again.' },
      { icon: 'file', title: 'Photos as proof', text: 'Staff attach a photo of the shelf, the delivery or the bill.' },
      { icon: 'mic', title: 'Voice notes', text: 'Explain a task by voice when typing takes too long.' },
      { icon: 'languages', title: 'Six languages', text: 'Each person uses the Karo app in their own language.' },
    ],
  },
  split: WHATSAPP_SPLIT,
  faq: [
    { q: 'Can I run more than one outlet?', a: 'Yes. Create an organization for each outlet, and see them all under All, or one at a time in its own tab.' },
    { q: 'Will my staff understand it?', a: 'Karo is kept simple on purpose, and the app speaks English, Hindi, Kannada, Tamil, Telugu and Malayalam.' },
    { q: 'Does it cost anything per user?', a: 'No. Karo is free, for you and for your staff.' },
    { q: 'Can I still use our WhatsApp group?', a: 'Yes. Keep the group for talking and keep tasks in Karo. When a task needs a push, Karo opens WhatsApp with a ready nudge and you press send.' },
  ],
});

const OFFICES = useCase({
  slug: 'offices',
  title: 'Offices',
  seo: {
    title: 'Office Task Management App, Free',
    description:
      'Follow up on files, payments and client work without chasing on calls. Karo is a free office task app with review, reminders and a shared calendar.',
  },
  hero: {
    title: 'Office work, followed up without the follow-up calls',
    subtitle: 'In Karo, you give files, payments and client work to the right person with a date, review it before it goes out, and see everything due this week on one calendar.',
  },
  steps: {
    title: 'How an office runs on Karo',
    items: [
      { title: 'Create the office organization', text: 'Invite your team. Make partners and managers admins.' },
      { title: 'Give and delegate', text: 'Give tasks to your team, or to people outside it, such as your CA or a vendor, by their Task Pin.' },
      { title: 'Review and close', text: 'Work comes back to you for review. Approve it, or send it back with a note.' },
    ],
  },
  features: {
    title: 'What offices use most',
    items: [
      { icon: 'review', title: 'Review step', text: 'Nothing is marked done until you have checked it.' },
      { icon: 'calendar', title: 'Calendar', text: 'Due dates and reminders for the week, in one view.' },
      { icon: 'users', title: 'People in the loop', text: 'Keep a partner or client manager informed without giving them the task.' },
      { icon: 'chart', title: 'Dashboard', text: 'See how work is going across your team.' },
    ],
  },
  split: ORGS_SPLIT,
  faq: [
    { q: 'Can I give tasks to people outside my office?', a: 'Yes. Anyone with Karo can be your contact by their Task Pin, so you can give tasks to your CA, a vendor or a freelancer.' },
    { q: 'Can I see what my team is working on?', a: 'Owners and admins of an organization see every task filed under it, with its status and history.' },
    { q: 'Can I keep my personal tasks separate?', a: 'Yes. Tasks not filed under any organization show in the General tab.' },
  ],
});

// ---------------------------------------------------------------- posts

const TASK_PIN_MD = `Every person in Karo has a **Task Pin**: a short code that belongs to them alone. If you used a BlackBerry years ago, it works much like a BBM PIN. Share it, and the other person can add you as a contact and start giving you tasks, without either of you sharing a phone number or an email address.

This guide explains what a Task Pin is, why Karo uses one, and how to connect with your staff, your partners and the people you work with outside your business.

# Why a Task Pin and not a phone number?

Most task apps make you add people by email or phone number. For a small Indian business, that causes three problems:

1. **You have to collect everyone's details first.** Before you can give a single task, you need the email of every staff member, and many of them hardly use email.
2. **Numbers change.** People switch SIMs, keep one number for family and another for work, or share one phone at the counter.
3. **Not everyone wants their number passed around.** A freelancer you work with once, or a supplier's delivery person, should not need your personal number to get a task from you.

In Karo, you share your Task Pin instead. Your email is never shown to other people. Your mobile number is shown only to a contact who joined through your WhatsApp invite link, on tasks you share, and either of you can switch that off in Contacts.

# Where to find your Task Pin

Your Task Pin is ready the moment you register. In the Karo app you will find it:

- on the **Contacts** screen, where you can copy it or share it,
- on the **More** screen, under your name,
- on your profile.

You can read it out on a call, write it on the staff notice board, or send it in a message. It is short on purpose.

# How to connect with someone

1. Share your Task Pin with the other person, or send them your invite link on WhatsApp. The link helps them get Karo if they don't have it yet.
2. They add your Task Pin in Karo, which sends you a contact request. (Or you add theirs.)
3. The person who gets the request accepts it. You are now contacts.

Nothing happens without that acceptance. A Task Pin lets someone ask to connect; it does not let them give you work on its own.

# What you can do once you are connected

Once you are contacts in Karo, you can:

- **give each other tasks** with a due date, a priority, a voice note or a photo,
- **keep each other in the loop** on a task, so a partner or manager can follow it without doing it,
- **invite each other to an organization**, such as your shop or office, where owners and admins see every task filed under it.

The [features page](/features) shows everything you can do with a task, from reminders to Excel export.

# Who should you connect with?

Anyone you work with, inside or outside your business:

- your staff and managers, at the shop, the office or the warehouse,
- partners and family members who help run the business,
- people outside the company: your CA, a supplier, a technician, a freelancer.

If you run a shop or an outlet, start with the people who open and close for you. The guide for [shops and outlets](/for/shops-and-outlets) shows a simple daily setup. Running an office? See [Karo for offices](/for/offices).

# Is it safe to share my Task Pin?

Yes. Someone with your Task Pin can see your name and job title, and send you a contact request or an organization invite. That is all. They cannot see your tasks, your phone number or your email, and nothing reaches your task list until you accept. You can remove a contact at any time.

If a request comes from someone you don't know, decline it. They are not told that you declined.

# Task Pin or invite link: which one should I use?

Use the **Task Pin** when the other person already has Karo. It is quick to type and easy to read out on a call.

Use the **invite link** when they are new to Karo. Send it on WhatsApp or any other app: when they tap it, it helps them get Karo and adds you as a contact in one go. Your Task Pin is written under the link too, in case they prefer to type it.

# Get your Task Pin

[Register free](/sign-up) and your Task Pin is ready straight away. Then read [how to delegate tasks to employees](/blog/how-to-delegate-tasks-to-employees) to give your first task the right way.`;

const DELEGATE_MD = `Delegating is how a business grows beyond what one person can do. Yet for many owners in India it ends in chasing: "Did you do it?" "Which one?" "I thought Ravi was doing it." By evening the owner has made twenty calls and still isn't sure what got done.

The problem is rarely the staff. It is how the work was handed over: a quick word at the counter, a line in a WhatsApp group, a voice message nobody can find later. Here is a simple five-step way to delegate so the work comes back done, with an example from a small business at each step.

# 1. Give every task one owner

A task given to "everyone" is a task given to no one. When you say "someone please call the AC service", five people hear it and each one assumes another will do it.

Name one person who is responsible. Others can help, or be kept informed, but one person owns the result.

- **Do:** "Suresh, book the AC service for Saturday."
- **Avoid:** "Can someone look into the AC?"

In Karo, you give a task to a person and they **accept** it. If they can't do it, they **decline with a reason**, so you know at once instead of finding out on Saturday.

# 2. Set a real deadline

"As soon as possible" means different things to different people. To you it means today; to a busy staff member it means after the rush. Give a date, and a time when it matters: "by 6 pm today", "before the 10th".

Deadlines also need a fair way to move. Things go wrong: the supplier is late, a customer calls. Ask people to say so **before** the deadline, not after it.

In Karo, the person doing the task can **ask for more time**. You approve or decline the new date, and the task shows what was agreed.

# 3. Say what "done" looks like

Half the back-and-forth in delegation comes from two different pictures of the result. Write one or two lines about what you expect to see at the end:

- a photo of the restocked shelf,
- the March bills sent to the CA, with the courier slip,
- the client's signed form, scanned.

If explaining takes too long to type, record a short **voice note**. Many people find it easier to listen than to read a long message, and they can play it again later.

In Karo, you can attach a voice note, photos or files to any task, and the person doing it can add their own photo or file when they update it.

# 4. Let updates come to you

Asking "is it done?" ten times a day wastes your time and tells your staff you don't trust them. Flip it around: ask people to update the task as they go.

A simple rhythm works for most teams:

1. **Accepted** when they have seen it.
2. **In progress** when they start.
3. **Done**, or sent to you for review, when they finish.

In Karo, every task shows its status, and the figures at the top of your Tasks screen count what is not accepted yet, what is in progress, what is under review and what is overdue. One look in the morning tells you where to follow up. You can also get a short daily summary at a time you choose.

# 5. Review, then close

For work that matters, check it before it is marked done. A quick review catches mistakes while they are cheap to fix, and shows your team that finishing well counts.

Keep reviews light: approve what is good, and when something needs fixing, send it back with one clear note rather than a long lecture.

In Karo, you can ask to **review a task before it is done**. When the person finishes, it comes back to you to approve or send back. Turn it on for the tasks that need it and leave it off for the rest.

# What about work that repeats?

Many jobs in a business come back every day, week or month: opening checks, the weekly stock count, rent, salaries, GST filing. Don't delegate them again each time. Set them up once as **recurring tasks**, and Karo creates each one on time for the right person.

# When a task still needs a push

Sometimes a task is late and a nudge is the right thing. In Karo, you can send a **WhatsApp nudge in one tap**: Karo opens WhatsApp with a short message about the task, and you check it and press send. Karo never sends WhatsApp messages on its own.

# A quick checklist before you hand over

Before you give your next task, check that it has:

- one owner,
- a date, and a time if it matters,
- one line on what "done" looks like,
- a review step, if the result matters,
- a repeat schedule, if it comes back.

> Delegation is not giving work away. It is giving work with everything the other person needs to finish it without asking you.

# Start delegating today

Karo is free for you and your staff. [Register](/sign-up), share your [Task Pin](/blog/what-is-a-task-pin) with your team, and give your first task in a minute. If you run a business with staff, see [how Karo works for business owners](/for/business-owners), or browse [every feature](/features).`;

const WHATSAPP_MD = `WhatsApp is where most Indian teams talk. It is quick, everyone already has it, and it costs nothing. So it is natural to post work in the team group too: "Please send the bills to the CA today", "Who is opening tomorrow?", "Shelf 4 needs restocking".

It works, until it doesn't. This guide looks at where a WhatsApp group is the right tool, where tasks get lost, and how to use a group and a task app together without asking your team to change everything at once.

# Where WhatsApp groups work well

Group chats are good at conversation:

- **quick questions and answers**: "Is the courier here yet?",
- **sharing** photos, locations, voice notes and documents,
- **announcements** that everyone should see once: "Shop closed on Monday",
- **staying in touch** across shifts and branches.

If a message needs a reply in the next few minutes and nobody has to remember it tomorrow, the group is the right place.

# Where tasks get lost

Work is different from conversation. A task has to be remembered until it is done, and that is exactly what a busy chat is bad at.

- **Tasks sink.** A request posted at 10 am is buried under forwards, good-mornings and offers by lunch. A busy staff group can easily see a hundred messages a day.
- **Nobody owns it.** "Someone please send the bills" is read by ten people and done by none. Each person assumes another has it.
- **No deadline, no status.** Was it done? Is it late? The only way to know is to scroll up and ask again.
- **Follow-ups land on the owner.** You become the reminder: calling, messaging and checking each person, every day.
- **No record.** Three months later, when a customer asks why their order was late, the conversation is impossible to find.

# What a task app adds

A task app gives each piece of work three things a chat message can't: **one owner, one deadline and one status**. It keeps the task on a list until it is done, so it can't scroll away.

In Karo, you:

- give a task to one person, or several, with a date and a priority,
- see it **accepted**, or **declined with a reason**,
- see it move to **in progress** and **done**, without asking,
- **review** important work before it is closed,
- see what is **overdue** at a glance, in the figures at the top of your list,
- set daily, weekly and monthly jobs as **recurring tasks**, so you never type them again.

The [features page](/features) lists everything else, from voice notes to Excel export.

# Group chat or task app: a quick guide

| Situation | Best place |
|---|---|
| "Is the courier here?" | WhatsApp group |
| Holiday notice for all staff | WhatsApp group |
| Send the March bills to the CA by Friday | Karo task |
| Restock shelf 4 every morning | Karo recurring task |
| Fix a customer complaint and confirm | Karo task, with review |

A simple rule: **if someone has to do something by a certain time, it is a task.** Put it where it can't get lost.

# Use both

You don't have to leave WhatsApp, and you shouldn't ask your team to. Keep the group for talking. Keep tasks in Karo.

When a task needs a push, Karo can open WhatsApp for you. Tap the WhatsApp button on the task, and Karo opens a chat with a short message about it already typed in. You check it, change it if you like, and press send. **Karo never sends WhatsApp messages on its own**, so nothing goes out in your name without you seeing it first.

New people can join the same way: send your Karo invite link on WhatsApp, and it helps them get the app and connect with you.

# How to switch without a fuss

You don't need a big launch. Start small:

1. **Pick one job that often gets missed**, such as GST bills, the stock check or the daily cash count.
2. **Give it in Karo** to one person this week, with a date.
3. **Tell the group**: "From now on, tasks come in Karo. We keep chatting here."
4. **Add the next job** once the first one has gone well.

Most teams feel the difference quickly: fewer "is it done?" messages, and one list that tells everyone what is pending.

# Try it with one task

Karo is free for you and your team, on Android, iPhone and the web. [Register free](/sign-up) or [get the Android app](/get-app). If you run a shop or an outlet, our guide for [shops and outlets](/for/shops-and-outlets) shows a simple daily setup, and [Karo for offices](/for/offices) shows how to follow up on files and payments.`;

const AUTHOR = { name: 'Karo team', title: '' };

const POSTS = [
  {
    slug: 'what-is-a-task-pin',
    title: 'What Is a Task Pin? Connect and Give Tasks in Karo',
    excerpt: 'Every Karo user gets a Task Pin. Share it to connect with anyone and give or receive tasks, without sharing a phone number.',
    tags: ['Task Pin', 'Getting started'],
    seo: {
      description:
        'Every Karo user gets a Task Pin, like a BlackBerry PIN. Share it to connect with anyone and give or receive tasks without sharing a number.',
    },
    bodyMd: TASK_PIN_MD,
  },
  {
    slug: 'how-to-delegate-tasks-to-employees',
    title: 'How to Delegate Tasks to Employees: A Simple 5-Step Guide',
    excerpt: 'Stop chasing your staff for updates. Five steps to delegate with one owner, a real deadline and updates that come to you.',
    tags: ['Delegation', 'Business owners'],
    seo: {
      title: 'How to Delegate Tasks to Employees in 5 Steps',
      description:
        'Stop chasing staff on WhatsApp. A 5-step way to delegate tasks with one owner, a deadline and follow-ups, and how Karo does it for free.',
    },
    bodyMd: DELEGATE_MD,
  },
  {
    slug: 'whatsapp-groups-vs-task-app',
    title: 'WhatsApp Groups vs a Task App: Which Gets Work Done?',
    excerpt: 'Tasks get lost in busy WhatsApp groups. When a group chat is enough, when you need a task app, and how to use both.',
    tags: ['WhatsApp', 'Delegation'],
    seo: {
      description:
        'Tasks get lost in busy WhatsApp groups. When a group chat is enough, when you need a task app, and how to send a WhatsApp nudge from Karo.',
    },
    bodyMd: WHATSAPP_MD,
  },
];

// ---------------------------------------------------------------- seeding

// Version 2 (Karo 1.0.7): the starter copy was rewritten after a pre-release
// build had already written version 1 into a database. A refresh rewrites the
// earlier seeds' settings, pages and posts that nobody has saved in the
// console since (updatedBy still empty); edited and deleted ones stay as they are.
const SEEDS = [
  { version: 1, pages: [HOME, FEATURES, ABOUT, CONTACT, PRIVACY, TERMS, BUSINESS_OWNERS, SHOPS, OFFICES], posts: POSTS },
  { version: 2, refresh: true, pages: [], posts: [] },
];
const SEED_VERSION = SEEDS[SEEDS.length - 1].version;

const duplicate = (err) =>
  err?.code === 11000 || (Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000));

/** Insert, skipping anything already there (another instance may be seeding too). */
async function insertNew(Model, docs) {
  if (!docs.length) return;
  try {
    await Model.insertMany(docs, { ordered: false });
  } catch (err) {
    if (!duplicate(err)) throw err;
  }
}

/** A seeded page, published as written. */
function pageDoc(page, at) {
  const content = parseContent({ title: page.title, seo: page.seo, sections: page.sections });
  return { path: page.path, system: !!page.system, status: 'published', draft: content, published: { ...content, publishedAt: at } };
}

function postDoc(post, at) {
  const { html, toc, words } = renderMarkdown(post.bodyMd);
  return {
    ...post,
    author: AUTHOR,
    bodyHtml: html,
    toc,
    readingMinutes: readingMinutes(words),
    status: 'published',
    publishedAt: at,
  };
}

/** Rewrite the starter content of the seeds before `version` that no one has edited in the console. */
async function refreshUntouched(version, now) {
  await SiteSettings.updateOne({ _id: 'site', updatedBy: null }, { $set: SETTINGS });
  const earlier = SEEDS.filter((s) => s.version < version);
  for (const page of earlier.flatMap((s) => s.pages)) {
    await SitePage.updateOne({ path: page.path, updatedBy: null }, { $set: pageDoc(page, new Date(now)) });
  }
  const posts = earlier.flatMap((s) => s.posts);
  for (const [i, post] of posts.entries()) {
    await BlogPost.updateOne({ slug: post.slug, updatedBy: null }, { $set: postDoc(post, new Date(now - (posts.length - i) * 60 * 1000)) });
  }
}

/** Write whatever starter content this database has not had yet. Safe to run at every start. */
async function ensureSiteDefaults() {
  const current = await SiteSettings.findById('site').select('seedVersion').lean();
  const done = current?.seedVersion || 0;
  if (done >= SEED_VERSION) return;
  if (!current) {
    try {
      await SiteSettings.create({ _id: 'site', ...SETTINGS });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  const now = Date.now();
  for (const seed of SEEDS.filter((s) => s.version > done)) {
    if (seed.refresh) {
      if (done > 0) await refreshUntouched(seed.version, now);
      continue;
    }
    const paths = seed.pages.map((p) => p.path);
    const havePages = new Set((await SitePage.find({ path: { $in: paths } }).select('path').lean()).map((p) => p.path));
    await insertNew(
      SitePage,
      seed.pages.filter((p) => !havePages.has(p.path)).map((p) => pageDoc(p, new Date(now)))
    );
    const slugs = seed.posts.map((p) => p.slug);
    const taken = await BlogPost.find({ $or: [{ slug: { $in: slugs } }, { previousSlugs: { $in: slugs } }] }).select('slug previousSlugs').lean();
    const haveSlugs = new Set(taken.flatMap((p) => [p.slug, ...(p.previousSlugs || [])]));
    // A minute apart, the first one oldest, so the blog lists them in a fixed order.
    await insertNew(
      BlogPost,
      seed.posts.filter((p) => !haveSlugs.has(p.slug)).map((p, i, list) => postDoc(p, new Date(now - (list.length - i) * 60 * 1000)))
    );
  }
  await SiteSettings.updateOne({ _id: 'site' }, { $set: { seedVersion: SEED_VERSION } });
  console.log(`[site] starter website content written (version ${SEED_VERSION})`);
}

module.exports = { ensureSiteDefaults, SEED_VERSION, SETTINGS, PAGES: SEEDS.flatMap((s) => s.pages), POSTS };
