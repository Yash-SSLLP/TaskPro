/**
 * The privacy policy, as data, so the web page and the mobile screen show the
 * same words. This file is copied byte for byte to
 * mobile/src/platform/privacy.js: change one, copy it over the other.
 *
 * Each section's `body` is a list of paragraphs (strings) and bullet lists
 * ({ list: [strings] }). The name, the company and the email are written
 * once, here, and the text is built from them.
 */
const app = 'Karo';
const org = 'Sequence Surface LLP';
const email = 'support@sequencesurface.com';

export const PRIVACY = {
  app,
  org,
  email,
  updated: '11 October 2026',

  intro: [
    `This policy explains what information ${app} (the ${app} app on Android, iPhone and the web, and the ${app} website with its blog) collects, why, who it is shared with, and the choices you have. ${app} is run by ${org} ("we", "us").`,
    `By creating an account or using ${app} you agree to this policy. If you do not agree, please do not use ${app}.`,
  ],

  sections: [
    {
      title: 'What we collect',
      body: [
        'Information you give us:',
        {
          list: [
            'Account details: your name, your email address or mobile number, and your password (stored only in scrambled, hashed form; we cannot read it). You can also add a job title.',
            `Your profile photo, if you add one. Anyone signed in to ${app} can see it next to your name.`,
            'Your Task Pin: the short ID we give you so other people can find and add you.',
            'Your work: tasks, sub-tasks, descriptions, notes and comments, due dates, priorities, reminders, repeating schedules, categories, links and status changes.',
            'Files you attach: photos, documents and videos you choose to upload, and voice notes you record.',
            `Your contacts and organizations inside ${app}: the people you have added by their Task Pin, the organizations you create or join, and your role in them. ${app} does not read the address book on your phone.`,
            'Your settings: time zone, language, reminder and daily-summary choices, and the order of your organization tabs.',
          ],
        },
        'Information collected automatically:',
        {
          list: [
            'A push-notification token for your phone (and whether it is Android or iOS), so we can send you task alerts.',
            'Your sign-ins: for each phone or browser you are signed in on, the kind of device, the app version, the network (IP) address and when it was last used. You can sign a device out, and so can our administrators.',
            `A record of what happens in your account, for example sign-ins, changes to your profile and the tasks you work on. It is kept for 180 days, to keep ${app} secure and to help when something goes wrong.`,
            'Your IP address, which our server also uses to stop password guessing.',
          ],
        },
        'We do not collect your location, we do not read your phone contacts, and we do not use advertising or analytics trackers, in the app or on the website.',
      ],
    },
    {
      title: 'Phone permissions',
      body: [
        `${app} asks for a permission only when you use the feature that needs it, and you can turn each one off in your phone settings at any time:`,
        {
          list: [
            'Camera: to take a photo to attach to a task, or a profile photo.',
            'Photos and files: to pick a photo or document to attach, or a profile photo. Only the items you pick are uploaded.',
            'Microphone: to record a voice note on a task. The microphone is used only while you are recording.',
            'Notifications: to alert you about new tasks, reminders and updates.',
          ],
        },
      ],
    },
    {
      title: 'Our website',
      body: [
        {
          list: [
            `Anyone can read the ${app} website (the home page, the feature pages and the blog) without an account. Our administrators write its pages and posts. It has no forms of its own: Log in and Register open the ${app} web app.`,
            'Neither the website nor the web app uses cookies. They keep a few things in your browser\'s own storage on your device: light or dark, an announcement you closed, and in the web app your sign-in. The website looks only at whether you are signed in, to take you straight to your tasks.',
            `If the website shows numbers, such as how many people use ${app}, they are totals and never about any one person.`,
            'Links to our pages on other sites (for example Instagram) take you to those sites, and their own policies apply there. Nothing from them is loaded on our pages.',
          ],
        },
      ],
    },
    {
      title: 'How we use your information',
      body: [
        {
          list: [
            'To create and run your account and sign you in.',
            'To show your tasks to you and to the people you share them with, and to send the tasks, reminders, nudges and daily summaries you set up.',
            'To let people find you by your Task Pin, and to run your contacts and organizations.',
            'To send password-reset emails when you ask for one, and reminders you choose to get by email.',
            `To keep ${app} secure, prevent abuse and fix problems.`,
            'To meet our legal obligations.',
          ],
        },
        'We do not sell your information, and we do not use it for advertising.',
      ],
    },
    {
      title: 'Who can see your information',
      body: [
        {
          list: [
            'People you work with: anyone on a task (whoever set it, the people doing it, people kept in the loop, and the owner and admins of the organization it is filed under) can see that task, its history, its files and the names of the people on it. Other people in that organization see it only if they are on it.',
            'Your contacts and the people in your organizations can see your name, job title, Task Pin and photo, and can give you tasks. Any of them who owns or runs an organization can invite you to it; you are not added until you accept.',
            'People who have your Task Pin can see your name, job title and Task Pin, and can send you a contact request or an organization invite.',
            `Your email address is never shown to other users. Your mobile number is shown only to a contact you connected with through a WhatsApp invite link, on tasks you share, so you can WhatsApp each other about them. ${app} never sends WhatsApp messages itself: you choose whether to send one. Either of you can switch this off in Contacts.`,
            `Our administrators: a small number of ${app} administrators can see accounts, signed-in devices, the activity record and tasks to provide support, deal with abuse, and keep the service running. They do this only when needed.`,
          ],
        },
      ],
    },
    {
      title: 'Service providers we share with',
      body: [
        `We use a few trusted companies to run ${app}. They process information only on our instructions and only to provide their service to us:`,
        {
          list: [
            `Cloud hosting and database providers, which store ${app}'s data and files on secure servers.`,
            'Expo (expo.dev), Google Firebase Cloud Messaging and Apple Push Notification service, which deliver push notifications to your phone. They receive your push token and the text of the alert.',
            'An email provider, which delivers password-reset emails, and reminders you choose to get by email, to your email address.',
            'Google Fonts, which serves the typeface the website and the web app use. Your browser downloads it from Google, so Google receives your IP address and browser details. Nothing else on the website or in the web app is loaded from another company.',
          ],
        },
        'We may also disclose information if the law requires it, to protect the rights and safety of our users or the public, or as part of a merger or sale of our business (in which case this policy will continue to apply).',
      ],
    },
    {
      title: 'Security',
      body: [
        'Information travels between the apps, the website and our server over encrypted connections (HTTPS). Passwords are stored hashed, files can only be opened through short-lived signed links, and access is limited to people who need it. No system is perfectly secure, so please use a strong password and keep it to yourself.',
      ],
    },
    {
      title: 'How long we keep it',
      body: [
        {
          list: [
            'Your account and work: for as long as your account exists.',
            'Alerts in the bell: deleted automatically after 90 days.',
            'Files uploaded but never attached to a task: deleted after one day.',
            'When you delete your account: see the next section. Copies in our backups are overwritten within 30 days.',
          ],
        },
      ],
    },
    {
      title: 'Deleting your account',
      body: [
        `You can delete your account at any time, in the ${app} app (More → Delete account) or on the web (Settings → Delete account, or the "Delete your account" page). You will be asked for your password.`,
        'When you delete your account we immediately delete your name, email, mobile number, password, Task Pin, job title and settings; your contacts and pending requests; your organization memberships; your devices and alerts; and every task, repeating schedule and category that only you were on, including their files and voice notes.',
        'Tasks you shared with other people belong to them as well, so they stay in their accounts, with your name shown as "Deleted user". Organizations you owned pass to one of their admins or members, or are deleted if nobody else is in them. Deleting your account cannot be undone.',
        'If you cannot sign in, email us from the email address on your account (or tell us your mobile number) and we will delete it for you.',
      ],
    },
    {
      title: 'Your choices and rights',
      body: [
        'You can see and correct your details under My profile, change your settings at any time, turn off notifications and phone permissions in your phone settings, and delete your account as explained above. Depending on where you live (for example under India\'s Digital Personal Data Protection Act, 2023 or the EU/UK GDPR) you may also have the right to ask for a copy of your information, to have it corrected or erased, to withdraw your consent, and to complain to a data protection authority. To use any of these rights, contact us at the address below.',
      ],
    },
    {
      title: 'Children',
      body: [
        `${app} is meant for people aged 18 and over and is not directed at children. We do not knowingly collect information from children. If you believe a child has given us information, contact us and we will delete it.`,
      ],
    },
    {
      title: 'Where your information is stored',
      body: [
        `${app}'s servers and our service providers may be located outside the country where you live. Wherever your information is processed, we protect it as this policy describes.`,
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        `We may update this policy from time to time. We will change the "Last updated" date above, and for important changes we will let you know in ${app}. Continuing to use ${app} after a change means you accept the updated policy.`,
      ],
    },
    {
      title: 'Contact us',
      body: [
        `Questions, requests or complaints about your privacy (including grievances under India's Digital Personal Data Protection Act): email ${email}. We aim to reply within 7 days.`,
        org,
      ],
    },
  ],
};
