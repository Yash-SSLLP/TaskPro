/**
 * The privacy policy, as data, so the web page and the mobile screen show the
 * same words. This file is copied byte for byte to
 * mobile/src/platform/privacy.js: change one, copy it over the other.
 *
 * Each section's `body` is a list of paragraphs (strings) and bullet lists
 * ({ list: [strings] }).
 */
export const PRIVACY = {
  app: 'Task Pro',
  org: 'Sequence Surface LLP',
  email: 'support@sequencesurface.com',
  updated: '5 October 2026',

  intro: [
    'This policy explains what information Task Pro (the mobile app and the website) collects, why, who it is shared with, and the choices you have. Task Pro is run by Sequence Surface LLP ("we", "us").',
    'By creating an account or using Task Pro you agree to this policy. If you do not agree, please do not use Task Pro.',
  ],

  sections: [
    {
      title: 'What we collect',
      body: [
        'Information you give us:',
        {
          list: [
            'Account details: your name, your email address or mobile number, and your password (stored only in scrambled, hashed form; we cannot read it). You can also add a job title.',
            'Your Task Pin: the short ID we give you so other people can find and add you.',
            'Your work: tasks, sub-tasks, descriptions, notes and comments, due dates, priorities, reminders, repeating schedules, templates, categories, links and status changes.',
            'Files you attach: photos, documents and videos you choose to upload, and voice notes you record.',
            'Your contacts and teams inside Task Pro: the people you have added by their Task Pin, the teams you create or join, and your role in them. Task Pro does not read the address book on your phone.',
            'Your settings: time zone, language, reminder and daily-summary choices.',
          ],
        },
        'Information collected automatically:',
        {
          list: [
            'A push-notification token for your phone (and whether it is Android or iOS), so we can send you task alerts.',
            'When you last signed in and last used Task Pro.',
            'Your IP address, which our server sees with every request and uses to stop password guessing. It is not stored with your account.',
          ],
        },
        'We do not collect your location, we do not read your phone contacts, and we do not use advertising or analytics trackers.',
      ],
    },
    {
      title: 'Phone permissions',
      body: [
        'Task Pro asks for a permission only when you use the feature that needs it, and you can turn each one off in your phone settings at any time:',
        {
          list: [
            'Camera: to take a photo to attach to a task.',
            'Photos and files: to pick a photo or document to attach. Only the items you pick are uploaded.',
            'Microphone: to record a voice note on a task. The microphone is used only while you are recording.',
            'Notifications: to alert you about new tasks, reminders and updates.',
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
            'To let people find you by your Task Pin, and to run your contacts and teams.',
            'To send password-reset emails when you ask for one.',
            'To keep Task Pro secure, prevent abuse and fix problems.',
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
            'People you work with: anyone on a task (whoever set it, the people doing it, people kept in the loop, and the owner and admins of a team it is filed under) can see that task, its history, its files and the names of the people on it.',
            'People who have your Task Pin can see your name and Task Pin, and can send you a contact request or a team invite. Your email and mobile number are never shown to other users.',
            'Our administrators: a small number of Task Pro administrators can see accounts and tasks to provide support, deal with abuse, and keep the service running. They do this only when needed.',
          ],
        },
      ],
    },
    {
      title: 'Service providers we share with',
      body: [
        'We use a few trusted companies to run Task Pro. They process information only on our instructions and only to provide their service to us:',
        {
          list: [
            'Cloud hosting and database providers, which store Task Pro\'s data and files on secure servers.',
            'Expo (expo.dev), Google Firebase Cloud Messaging and Apple Push Notification service, which deliver push notifications to your phone. They receive your push token and the text of the alert.',
            'An email provider, which delivers password-reset emails to your email address.',
          ],
        },
        'We may also disclose information if the law requires it, to protect the rights and safety of our users or the public, or as part of a merger or sale of our business (in which case this policy will continue to apply).',
      ],
    },
    {
      title: 'Security',
      body: [
        'Information travels between the apps and our server over encrypted connections (HTTPS). Passwords are stored hashed, files can only be opened through short-lived signed links, and access is limited to people who need it. No system is perfectly secure, so please use a strong password and keep it to yourself.',
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
        'You can delete your account at any time, from inside the app (More → Delete account) or on the website (Settings → Delete account, or the "Delete your account" page). You will be asked for your password.',
        'When you delete your account we immediately delete your name, email, mobile number, password, Task Pin, job title and settings; your contacts and pending requests; your team memberships; your devices and alerts; and every task, repeating schedule, template and category that only you were on, including their files and voice notes.',
        'Tasks you shared with other people belong to them as well, so they stay in their accounts, with your name shown as "Deleted user". Teams you owned pass to one of their admins or members, or are deleted if nobody else is in them. Deleting your account cannot be undone.',
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
        'Task Pro is meant for people aged 18 and over and is not directed at children. We do not knowingly collect information from children. If you believe a child has given us information, contact us and we will delete it.',
      ],
    },
    {
      title: 'Where your information is stored',
      body: [
        'Task Pro\'s servers and our service providers may be located outside the country where you live. Wherever your information is processed, we protect it as this policy describes.',
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        'We may update this policy from time to time. We will change the "Last updated" date above, and for important changes we will let you know in the app. Continuing to use Task Pro after a change means you accept the updated policy.',
      ],
    },
    {
      title: 'Contact us',
      body: [
        'Questions, requests or complaints about your privacy (including grievances under India\'s Digital Personal Data Protection Act): email support@sequencesurface.com. We aim to reply within 7 days.',
        'Sequence Surface LLP',
      ],
    },
  ],
};
