/**
 * Task Pro, as the shared app shell sees it.
 *
 * This is the one file the platform code reads to learn which product it is
 * running: its name, logo, storage keys, the health check it expects from
 * the server, and how links in alerts map to screens (backend/API.md §4).
 * Words are English here and translated where they are shown.
 */

const productConfig = {
  key: 'taskpro',
  name: 'Task Pro',
  tagline: 'Give tasks to anyone by their Task Pin',
  logo: require('../../assets/logo.png'),

  // GET /api/health must answer { ok: true, service: healthService }.
  healthService: 'taskpro',

  // Tab that opens when an alert has no specific screen.
  alertsTab: 'Alerts',

  /**
   * Turn an alert link into a navigation target:
   *   /tasks/<id>   task detail          /contacts     contacts and requests
   *   /teams/<id>   team detail          /recurring    Recurring
   *   /alerts       Alerts               /tasks        the task list
   * @returns {{ name: string, params?: object } | null}
   */
  routeForLink(link, user) {
    const path = String(link || '')
      .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
      .split(/[?#]/)[0]
      .replace(/\/+$/, '');
    const admin = user?.role === 'superadmin';
    const task = /^\/?tasks\/([^/]+)/i.exec(path);
    if (task) return { name: 'TaskDetail', params: { id: task[1] } };
    if (/^\/?tasks$/i.test(path)) {
      return { name: 'Main', params: { screen: admin ? 'AllTasks' : 'Tasks' } };
    }
    const team = /^\/?teams\/([^/]+)/i.exec(path);
    if (team) return { name: 'TeamDetail', params: { id: team[1] } };
    if (/^\/?teams$/i.test(path)) return admin ? { name: 'Main', params: { screen: 'Console' } } : { name: 'Teams' };
    if (/^\/?contacts\b/i.test(path)) return admin ? null : { name: 'Contacts' };
    if (/^\/?recurring\b/i.test(path)) return admin ? { name: 'RecurringList' } : { name: 'Main', params: { screen: 'Recurring' } };
    if (/^\/?dashboard\b/i.test(path)) return { name: 'Dashboard' };
    if (/^\/?(alerts|notifications)\b/i.test(path)) return { name: 'Main', params: { screen: 'Alerts' } };
    return null;
  },
};

export default productConfig;
