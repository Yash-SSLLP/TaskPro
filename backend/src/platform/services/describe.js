/**
 * An activity row in words (the HRMS audit log's idea): one sentence saying
 * what happened, and a short coloured badge.
 *
 *   "Asha Rao accepted the task “TSK-2026-00008 Check delivery schedule”."
 *   "Ravi Test signed in on Android (Karo 1.0.3)."
 *   "Someone tried to sign in as ra…@example.com — there is no such account."
 *   "Super Admin deleted Priya Shah's account."
 *
 * `actorLabel` is how the sentence names whoever did it (it always starts the
 * sentence, so a screen can set it in bold). Badge tones: good, bad, wait
 * (something is pending), info, neutral.
 *
 * The words are written from what the row itself carries (names and labels as
 * they were at the time), never looked up again. Teams are "organizations"
 * to the people reading this.
 */

const quote = (s) => `“${s}”`;
const possessive = (name) => `${name || 'someone'}'s`;
const lc = (s) => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);

/** "a, b and c" */
function listWords(items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const badge = (text, tone = 'neutral') => ({ text, tone });

// The product's name (product/index.js), read when needed: no load cycle.
const appName = () => require('../../product').name;

/** Who did it, as the sentence names them. The system goes by the product's name (older rows saved another). */
function actorLabel(row) {
  if (row?.meta?.system) return appName();
  return row?.actorName || 'Someone';
}

const PLATFORM_WORDS = { web: 'the web', android: 'Android', ios: 'iPhone' };

/** " on Android (Pixel 7, Karo 1.0.3)", " on the web (Chrome on Windows)", or ''. */
function onDevice(row) {
  const m = row.meta || {};
  const platform = m.platform || row.platform;
  const where = PLATFORM_WORDS[platform];
  const details = platform === 'web' ? [m.deviceName] : [m.deviceName, m.appVersion ? `${appName()} ${m.appVersion}` : ''];
  const detail = details.filter(Boolean).join(', ');
  if (!where) return detail ? ` on ${detail}` : '';
  return ` on ${where}${detail ? ` (${detail})` : ''}`;
}

/** "their" when people act on themselves, else "Priya's". */
function whose(row) {
  const t = row.target;
  if (!t || t.kind !== 'user' || (row.actor && String(row.actor) === String(t.id))) return 'their';
  return possessive(t.label);
}

// ---------------------------------------------------------------- auth

function failedSignIn(row) {
  const m = row.meta || {};
  const name = row.target?.label;
  const as = m.identifier ? (name ? `${name} (${m.identifier})` : m.identifier) : name || 'an account';
  switch (m.reason) {
    case 'disabled':
      return [`${name || 'Someone'} tried to sign in, but the account is switched off.`, badge('Blocked', 'bad')];
    case 'no_account':
      return [`Someone tried to sign in as ${as} — there is no such account.`, badge('Failed sign-in', 'bad')];
    case 'invalid':
      return [`Someone tried to sign in with ${quote(m.identifier || '')}, which is not an email, a mobile number or a username.`, badge('Failed sign-in', 'bad')];
    default:
      return [`Someone tried to sign in as ${as} — wrong password.`, badge('Failed sign-in', 'bad')];
  }
}

// ---------------------------------------------------------------- profile

const PROFILE_FIELDS = { name: 'name', title: 'job title', email: 'email', phone: 'mobile number', username: 'username' };

function profileUpdated(row, who) {
  const changes = Array.isArray(row.meta?.changes) ? row.meta.changes : [];
  const their = whose(row);
  const words = (c) => PROFILE_FIELDS[c.field] || lc(c.label || c.field || 'details');
  if (changes.length === 1) {
    const c = changes[0];
    const f = words(c);
    if (c.before && c.after) return `${who} changed ${their} ${f} from ${quote(c.before)} to ${quote(c.after)}.`;
    if (c.after) return `${who} set ${their} ${f} to ${quote(c.after)}.`;
    return `${who} removed ${their} ${f}${c.before ? ` (it was ${quote(c.before)})` : ''}.`;
  }
  if (changes.length > 1) return `${who} changed ${their} ${listWords(changes.map(words))}.`;
  return `${who} changed ${their} profile.`;
}

// ---------------------------------------------------------------- admin

/** "daily summary: off; default reminders: 1 day before" */
function settingsWords(changes) {
  return (changes || []).map((c) => `${lc(c.label || c.field)}: ${c.after || 'none'}`).join('; ');
}

// ---------------------------------------------------------------- tasks

const STATUS_TONE = { COMPLETED: 'good', CANCELLED: 'bad', SUBMITTED: 'wait', PENDING: 'wait', IN_PROGRESS: 'info' };

/** "Passed to Ravi Kumar: …" → "Ravi Kumar" */
const nameAfter = (note, re) => (re.exec(String(note || '')) || [])[1] || '';

function taskWords(row, who) {
  const m = row.meta || {};
  const kind = String(m.kind || row.action.slice(5)).toUpperCase();
  const task = row.target?.label ? `the task ${quote(row.target.label)}` : 'a task';
  const note = String(m.note || '');
  switch (kind) {
    case 'CREATED': {
      if (m.system) return [`${who} raised ${task}.`, badge('Created', 'info')];
      const forWhom = nameAfter(note, /on behalf of (.+?)\.?$/);
      return [`${who} created ${task}${forWhom ? ` on behalf of ${forWhom}` : ''}.`, badge('Created', 'info')];
    }
    case 'STATUS':
      return [
        `${who} moved ${task}${m.fromLabel ? ` from ${m.fromLabel}` : ''} to ${m.toLabel || 'a new status'}.`,
        badge(m.toLabel || 'Moved', STATUS_TONE[m.to] || 'info'),
      ];
    case 'COMMENT':
      return [`${who} commented on ${task}.`, badge('Comment')];
    case 'EDITED':
      if (/^Removed this task/i.test(note)) return [`${who} removed ${task}.`, badge('Removed', 'bad')];
      return [
        `${who} edited ${task}${m.changes?.length ? ` (${listWords(m.changes.map(lc))})` : ''}.`,
        badge('Edited'),
      ];
    case 'ASSIGNED':
      return [`${who} assigned ${task}.`, badge('Assigned', 'info')];
    case 'REMINDER':
      return [`${who} sent a reminder about ${task}.`, badge('Reminder')];
    case 'ACCEPTED':
      return [`${who} accepted ${task}.`, badge('Accepted', 'good')];
    case 'REJECTED':
      return [`${who} declined ${task}.`, badge('Declined', 'bad')];
    case 'DELEGATED': {
      const to = nameAfter(note, /^Passed to (.+?)(?::|\.$)/);
      return [`${who} passed ${task} on${to ? ` to ${to}` : ''}.`, badge('Passed on', 'info')];
    }
    case 'SUBTASK':
      return [`${who} added a piece to ${task}.`, badge('Piece added', 'info')];
    case 'SUBMITTED':
      return [`${who} handed in ${task} for review.`, badge('In review', 'wait')];
    case 'APPROVED':
      return [`${who} approved ${task}.`, badge('Approved', 'good')];
    case 'SENT_BACK':
      return [`${who} sent ${task} back for more work.`, badge('Sent back', 'wait')];
    case 'PROGRESS': {
      const pct = /→\s*(\d{1,3})%/.exec(note)?.[1];
      return [`${who} updated the progress of ${task}${pct ? ` to ${pct}%` : ''}.`, badge('Progress', 'info')];
    }
    case 'SPLIT':
      return [`${who} split ${task} into pieces.`, badge('Split', 'info')];
    case 'CLAIMED':
      return [`${who} picked up ${task}.`, badge('Picked up', 'good')];
    case 'EXTENSION_ASKED':
      return [`${who} asked for more time on ${task}.`, badge('More time asked', 'wait')];
    case 'EXTENSION_DECIDED':
      if (m.decision === 'APPROVED') return [`${who} gave more time on ${task}.`, badge('More time given', 'good')];
      if (m.decision === 'DECLINED' || m.decision === 'REJECTED') return [`${who} refused more time on ${task}.`, badge('More time refused', 'bad')];
      return [`${who} answered a request for more time on ${task}.`, badge('More time answered', 'info')];
    case 'TRANSFERRED': {
      const to = nameAfter(note, /\bto (.+?):/);
      return [`${who} transferred ${task}${to ? ` to ${to}` : ''}.`, badge('Transferred', 'info')];
    }
    case 'NUDGED':
      return [`${who} sent a reminder about ${task}.`, badge('Nudged')];
    case 'OVERDUE':
      return [`${task.charAt(0).toUpperCase()}${task.slice(1)} is now overdue.`, badge('Overdue', 'bad')];
    default:
      return [`${who} updated ${task}.`, badge('Updated')];
  }
}

// ---------------------------------------------------------------- website

/** "the page /features" (from the row's meta or target). */
const pageName = (row) => `the page ${row.meta?.path || row.target?.label || ''}`.trim();

/** "the blog post “What is a Task Pin?”", or by its address when it has no title yet. */
function postName(row) {
  const title = row.target?.label;
  if (title) return `the blog post ${quote(title)}`;
  return row.meta?.slug ? `the blog post /blog/${row.meta.slug}` : 'a blog post';
}

/** "the image “shop-front.webp”" */
function mediaName(row) {
  const name = row.meta?.name || row.target?.label;
  return name ? `the image ${quote(name)}` : 'an image';
}

// ---------------------------------------------------------------- the table

const SENTENCES = {
  'auth.login': (row, who) => [`${who} signed in${onDevice(row)}.`, badge('Signed in', 'good')],
  'auth.login_failed': (row) => failedSignIn(row),
  'auth.logout': (row, who) => [`${who} signed out${onDevice(row)}.`, badge('Signed out')],
  'auth.signup': (row, who) => [`${who} created an account${onDevice(row)}.`, badge('New account', 'good')],
  'auth.password_changed': (row, who) => [
    row.meta?.forced ? `${who} chose their own password after a reset.` : `${who} changed their password.`,
    badge('Password changed', 'info'),
  ],
  'auth.password_forgot': (row) => [`Someone asked for a password reset link for ${row.target?.label || 'an account'}.`, badge('Reset asked', 'wait')],
  'auth.password_reset': (row, who) => [`${who} set a new password from a reset link.`, badge('Password reset', 'info')],
  'auth.account_deleted': (row, who) => [`${who} deleted their own account.`, badge('Account deleted', 'bad')],

  'profile.updated': (row, who) => [profileUpdated(row, who), badge('Profile edited')],
  'profile.photo_added': (row, who) => [`${who} added ${whose(row) === 'their' ? 'a' : whose(row)} profile photo.`, badge('Photo added')],
  'profile.photo_changed': (row, who) => [`${who} changed ${whose(row)} profile photo.`, badge('Photo changed')],
  'profile.photo_removed': (row, who) => [`${who} removed ${whose(row)} profile photo.`, badge('Photo removed')],
  'profile.settings_changed': (row, who) => [
    `${who} changed ${whose(row)} settings${row.meta?.fields?.length ? ` (${row.meta.fields.join(', ')})` : ''}.`,
    badge('Settings changed', 'info'),
  ],

  'contact.requested': (row, who) => [`${who} asked ${row.target?.label || 'someone'} to be a contact.`, badge('Contact request', 'wait')],
  'contact.accepted': (row, who) => [`${who} accepted ${possessive(row.target?.label)} contact request.`, badge('Contact added', 'good')],
  'contact.declined': (row, who) => [`${who} declined ${possessive(row.target?.label)} contact request.`, badge('Declined')],
  'contact.removed': (row, who) => [`${who} removed ${row.target?.label || 'someone'} from their contacts.`, badge('Contact removed')],
  'contact.cancelled': (row, who) => [`${who} cancelled their contact request to ${row.target?.label || 'someone'}.`, badge('Cancelled')],
  'contact.joined': (row, who) => [
    `${who} joined ${possessive(row.target?.label)} invite link${row.meta?.whatsapp ? ', with WhatsApp reminders' : ''}.`,
    badge('Joined by invite', 'good'),
  ],
  'contact.whatsapp_off': (row, who) => [`${who} switched off WhatsApp reminders with ${row.target?.label || 'someone'}.`, badge('WhatsApp off')],

  'team.created': (row, who) => [`${who} created the organization ${quote(row.target?.label)}.`, badge('Organization created', 'good')],
  'team.updated': (row, who) => {
    const renamed = (row.meta?.changes || []).find((c) => c.field === 'name');
    if (renamed) return [`${who} renamed the organization ${quote(renamed.before)} to ${quote(renamed.after)}.`, badge('Organization edited')];
    return [`${who} changed the description of the organization ${quote(row.target?.label)}.`, badge('Organization edited')];
  },
  'team.invited': (row, who) => [
    `${who} invited ${row.meta?.person?.name || 'someone'} to the organization ${quote(row.target?.label)}${row.meta?.role === 'admin' ? ' as an admin' : ''}.`,
    badge('Invited', 'wait'),
  ],
  'team.joined': (row, who) => [`${who} joined the organization ${quote(row.target?.label)}.`, badge('Joined', 'good')],
  'team.declined': (row, who) => [`${who} declined the invite to the organization ${quote(row.target?.label)}.`, badge('Declined')],
  'team.left': (row, who) => [`${who} left the organization ${quote(row.target?.label)}.`, badge('Left')],
  'team.member_removed': (row, who) => {
    const name = row.meta?.person?.name || 'someone';
    if (row.meta?.invite) return [`${who} cancelled ${possessive(name)} invite to the organization ${quote(row.target?.label)}.`, badge('Invite cancelled')];
    return [`${who} removed ${name} from the organization ${quote(row.target?.label)}.`, badge('Removed')];
  },
  'team.role_changed': (row, who) => [
    `${who} made ${row.meta?.person?.name || 'someone'} ${row.meta?.role === 'admin' ? 'an admin' : 'a member'} of the organization ${quote(row.target?.label)}.`,
    badge('Role changed', 'info'),
  ],
  'team.transferred': (row, who) => [
    `${who} handed the organization ${quote(row.target?.label)} over to ${row.meta?.person?.name || 'someone'}.`,
    badge('Handed over', 'info'),
  ],
  'team.deleted': (row, who) => [`${who} deleted the organization ${quote(row.target?.label)}.`, badge('Organization deleted', 'bad')],

  'admin.user_created': (row, who) => [
    `${who} added ${row.target?.label || 'someone'}${row.meta?.login ? ` (${row.meta.login})` : ''} with a temporary password.`,
    badge('Account added', 'good'),
  ],
  'admin.user_deleted': (row, who) => [`${who} deleted ${possessive(row.target?.label)} account.`, badge('Account deleted', 'bad')],
  'admin.user_disabled': (row, who) => [`${who} switched off ${possessive(row.target?.label)} account.`, badge('Switched off', 'bad')],
  'admin.user_enabled': (row, who) => [`${who} switched ${possessive(row.target?.label)} account back on.`, badge('Switched on', 'good')],
  'admin.password_reset': (row, who) => [`${who} reset ${possessive(row.target?.label)} password.`, badge('Password reset', 'wait')],
  'admin.signed_out': (row, who) => {
    const n = Number(row.meta?.sessions) || 0;
    return [`${who} signed ${row.target?.label || 'someone'} out everywhere${n ? ` (${n === 1 ? '1 device' : `${n} devices`})` : ''}.`, badge('Signed out', 'wait')];
  },
  'admin.session_revoked': (row, who) => [`${who} signed ${row.target?.label || 'someone'} out${onDevice(row)}.`, badge('Signed out', 'wait')],
  'admin.team_deleted': (row, who) => [`${who} deleted the organization ${quote(row.target?.label)}.`, badge('Organization deleted', 'bad')],
  'admin.settings_changed': (row, who) => {
    const what = settingsWords(row.meta?.changes);
    return [`${who} changed ${possessive(row.target?.label)} notification settings${what ? ` (${what})` : ''}.`, badge('Settings changed', 'info')];
  },

  'admin.site_settings_changed': (row, who) => [`${who} changed the website settings.`, badge('Website settings', 'info')],
  'admin.site_page_saved': (row, who) => [`${who} saved a draft of ${pageName(row)}.`, badge('Page saved')],
  'admin.site_page_published': (row, who) => [`${who} published ${pageName(row)}.`, badge('Page published', 'good')],
  'admin.site_page_unpublished': (row, who) => [`${who} took ${pageName(row)} off the website.`, badge('Page unpublished', 'wait')],
  'admin.site_page_deleted': (row, who) => [`${who} deleted ${pageName(row)}.`, badge('Page deleted', 'bad')],
  'admin.site_post_saved': (row, who) => [`${who} saved a draft of ${postName(row)}.`, badge('Post saved')],
  'admin.site_post_published': (row, who) => [`${who} published ${postName(row)}.`, badge('Post published', 'good')],
  'admin.site_post_unpublished': (row, who) => [`${who} took ${postName(row)} off the blog.`, badge('Post unpublished', 'wait')],
  'admin.site_post_deleted': (row, who) => [`${who} deleted ${postName(row)}.`, badge('Post deleted', 'bad')],
  'admin.site_media_uploaded': (row, who) => [`${who} uploaded ${mediaName(row)} to the website.`, badge('Image uploaded', 'info')],
  'admin.site_media_deleted': (row, who) => [`${who} deleted ${mediaName(row)} from the website.`, badge('Image deleted', 'bad')],
};

/**
 * @param {object} row an ActivityLog row (lean)
 * @returns {{ summary: string, badge: { text: string, tone: string }, actorLabel: string }}
 */
function describe(row) {
  const who = actorLabel(row);
  const action = String(row?.action || '');
  let words;
  try {
    if (SENTENCES[action]) words = SENTENCES[action](row, who);
    else if (action.startsWith('task.')) words = taskWords(row, who);
  } catch {
    words = null;
  }
  if (!words) words = [`${who}: ${action.replace(/[._]/g, ' ')}.`, badge('Activity')];
  return { summary: words[0], badge: words[1], actorLabel: who };
}

module.exports = { describe, actorLabel, onDevice, PROFILE_FIELDS };
