/**
 * Pictures of Karo drawn in HTML and CSS (site.css `.phone`, `.pm-*`,
 * `.mock-*`), so the home page needs no screenshot to download and the
 * drawing follows light and dark. Decorative: aria-hidden, the text around
 * them says what they show.
 *
 *   phone    the Tasks screen as the phone app draws it: the pile cards, the
 *            All · General · <org> tabs, the six figures, task cards tinted by
 *            priority, Assign task and the tab bar
 *   orgTabs  the organization tabs on their own, with their open counts
 *   chat     a task lost in a group chat, beside the same task in Karo
 */
const { html } = require('./html');
const { icon } = require('./icons');

const FIGURES = [
  ['total', 'Total', 14, 'layers'],
  ['pending', 'Not Accepted Yet', 2, 'time'],
  ['overdue', 'Overdue', 1, 'alert'],
  ['progress', 'In Progress', 7, 'play'],
  ['review', 'Under Review', 3, 'review'],
  ['moretime', 'More Time Asked', 1, 'clock'],
];

// label, open count, selected, has something overdue
const TABS = [
  ['All', 14, true],
  ['General', 5],
  ['Sharma Traders', 6, false, true],
  ['Clinic', 3],
];

function tabs() {
  return html`<div class="pm-tabs">${TABS.map(
    ([label, n, on, late]) => html`<span class="pm-tab${on ? ' is-on' : ''}${late ? ' is-late' : ''}">${label}<i>${n}</i></span>`
  )}</div>`;
}

/** A task card: the whole card in its priority's tint, as in the app. */
function task({ serial, title, to, assigned, due, late, priority, status, tone }) {
  return html`<div class="pm-task pm-${priority.toLowerCase()}">
    <span class="pm-task-top"><span class="pm-serial">#${serial}</span>${late ? html`<span class="pm-late">Overdue</span>` : ''}<span class="pm-bell">${icon('bell', { size: 12 })}</span></span>
    <b>${title}</b>
    <span class="pm-who">By <em>you</em> → To <em>${to}</em></span>
    <span class="pm-dates"><span>Assigned <em>${assigned}</em></span><span class="pm-due${late ? ' is-late' : ''}">${due}</span></span>
    <span class="pm-foot"><span class="pm-tag"><i></i>${priority}</span><span class="pm-pill pm-${tone}">${status}</span></span>
  </div>`;
}

const TABBAR = [
  ['check', 'Tasks'],
  ['calendar', 'Calendar'],
  ['repeat', 'Recurring'],
  ['bell', 'Alerts'],
  ['menu', 'More'],
];

function phone() {
  return html`<div class="phone" aria-hidden="true">
  <div class="phone-screen">
    <div class="pm-status"><span>9:41</span><span class="pm-island"></span><span class="pm-sys"><i></i><b></b></span></div>
    <div class="pm-bar"><b>Tasks</b><span class="pm-icons">${icon('search', { size: 14 })}${icon('filter', { size: 14 })}</span></div>
    <div class="pm-piles">
      <div class="pm-pile is-on">
        <span class="pm-pile-ic">${icon('inbox', { size: 13 })}</span>
        <b>Assigned to me</b>
        <span class="pm-pile-n"><em>9</em> open</span>
        <span class="pm-pile-sub"><i class="pm-dot-red"></i>1 overdue</span>
      </div>
      <div class="pm-pile">
        <span class="pm-pile-ic">${icon('send', { size: 13 })}</span>
        <b>Assigned by me</b>
        <span class="pm-pile-n"><em>5</em> open</span>
        <span class="pm-pile-sub"><i class="pm-dot-violet"></i>3 to review</span>
      </div>
    </div>
    <div class="pm-pages"><i class="is-on"></i><i></i></div>
    ${tabs()}
    <div class="pm-figs">${FIGURES.map(
      ([key, label, n, ic], i) => html`<div class="pm-fig pm-${key}${i === 0 ? ' is-on' : ''}"><span class="pm-fig-top"><span class="pm-fig-ic">${icon(ic, { size: 11 })}</span><em>${n}</em></span><span class="pm-fig-name">${label}</span></div>`
    )}</div>
    ${task({ serial: 112, title: 'Send March GST bills to the CA', to: 'Ravi', assigned: '9 Oct', due: 'Today, 6:00 PM', late: true, priority: 'Urgent', status: 'In progress', tone: 'progress' })}
    ${task({ serial: 113, title: 'Restock shelf 4 and share a photo', to: 'Anita', assigned: '10 Oct', due: 'Tomorrow', priority: 'Medium', status: 'Not accepted yet', tone: 'pending' })}
    <span class="pm-fab">${icon('plus', { size: 13 })}Assign task</span>
    <div class="pm-tabbar">${TABBAR.map(
      ([ic, label], i) => html`<span class="pm-tb${i === 0 ? ' is-on' : ''}"><span class="pm-tb-ic">${icon(ic, { size: 14 })}</span>${label}</span>`
    )}</div>
  </div>
</div>`;
}

/** The hero's stage: the phone on a navy panel, with two notes floating beside it. */
function stage() {
  return html`<div class="stage">
  <span class="stage-bg" aria-hidden="true"></span>
  ${phone()}
  <div class="float float-a" aria-hidden="true">
    <span class="float-ic is-done">${icon('check', { size: 16 })}</span>
    <span><b>Ravi accepted</b><span>Send March GST bills to the CA</span></span>
  </div>
  <div class="float float-b" aria-hidden="true">
    <span class="float-ic is-review">${icon('review', { size: 16 })}</span>
    <span><b>Ready for your review</b><span>Anita · Restock shelf 4</span></span>
  </div>
</div>`;
}

function orgTabs() {
  return html`<div class="mock mock-orgs" aria-hidden="true">
  <div class="mock-card">
    <div class="mock-head"><span class="mock-label">Your tabs, in your order</span><span class="mock-badge">All opens first</span></div>
    ${tabs()}
    <ul class="mock-list">
      <li><span class="mock-dot pm-progress"></span><span>Open the billing counter at 9</span><em>Sharma Traders</em></li>
      <li><span class="mock-dot pm-pending"></span><span>Book the AC service</span><em>General</em></li>
      <li><span class="mock-dot pm-review"></span><span>Patient files for Dr. Rao</span><em>Clinic</em></li>
      <li><span class="mock-dot pm-overdue"></span><span>Pay the electricity bill</span><em>Sharma Traders</em></li>
    </ul>
  </div>
  <div class="mock-card mock-mini">
    <span class="mock-ic">${icon('building', { size: 18 })}</span>
    <span><b>Clinic</b><span>Invite by Task Pin or from your connections</span></span>
    <span class="mock-chip">Invited</span>
  </div>
</div>`;
}

const CHAT = [
  ['Suresh', 's1', 'Good morning all 🙏', '9:02'],
  ['Meena', 's2', 'Forwarded: Diwali offer!! 🎉', '9:15'],
  ['You', '', 'Someone please send the March bills to the CA today', '10:04', true],
  ['Ravi', 's3', 'Ok sir', '10:31'],
  ['Meena', 's2', 'Forwarded: video', '11:48'],
];

function chat({ brand = 'Karo' } = {}) {
  return html`<div class="mock mock-chat" aria-hidden="true">
  <div class="mock-card mock-group">
    <div class="chat-head"><span class="chat-av">${icon('users', { size: 16 })}</span><span><b>Shop staff</b><span>Ravi, Anita, Suresh, Meena +10</span></span><span class="chat-unread">214</span></div>
    <div class="chat-body">${CHAT.map(
      ([who, cls, text, at, lost]) => html`<p class="bubble${who === 'You' ? ' is-me' : ''}${lost ? ' is-lost' : ''}">${who === 'You' ? '' : html`<b class="${cls}">${who}</b>`}${text}<time>${at}</time></p>`
    )}</div>
    <span class="chat-tag">${icon('alert', { size: 14 })}Who owns it? When is it due? Is it done?</span>
  </div>
  <div class="mock-card mock-task">
    <span class="mock-label">The same work in ${brand}</span>
    <b>Send March GST bills to the CA</b>
    <span class="pm-who">By <em>you</em> → To <em>Ravi</em> · Due today, 6:00 PM</span>
    <span class="mock-bar"><i></i></span>
    <span class="mock-row"><span class="pm-pill pm-progress">In progress · 60%</span><span class="mock-nudge">${icon('whatsapp', { size: 14 })}Nudge on WhatsApp</span></span>
    <span class="mock-foot">${brand} writes the message. You press send.</span>
  </div>
</div>`;
}

const MOCKS = { phone, orgTabs, chat };

module.exports = { MOCKS, phone, stage, orgTabs, chat };
