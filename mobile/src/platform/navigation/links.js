/**
 * Opening in-app links ("/tasks/<id>", "/contacts", "/teams/<id>") from
 * alerts, push taps and deep links. The product config maps a link to a
 * screen; if the app is not ready yet (still signing in), the link waits and
 * opens once it is.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import productConfig from '../../product/config';
import { useSession } from '../session';

export const navigationRef = createNavigationContainerRef();

let pending = null;

const mainReady = () =>
  navigationRef.isReady() && (navigationRef.getRootState()?.routeNames || []).includes('Main');

function go(route) {
  navigationRef.navigate(route.name, route.params);
}

/** "/join/7KQ4-M9XA?w=…" → the invite screen (not for the Super Admin, who has no contacts). */
function joinRoute(link, user) {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/]*)?\/?join\/([^/?#]+)(?:\?([^#]*))?/i.exec(String(link || ''));
  if (!m) return null;
  if (user?.role === 'superadmin') return { name: 'Main', params: { screen: productConfig.alertsTab } };
  const w = /(?:^|&)w=([^&]+)/.exec(m[2] || '')?.[1];
  return { name: 'Join', params: { pin: decodeURIComponent(m[1]), ...(w ? { w: decodeURIComponent(w) } : {}) } };
}

function routeOf(link) {
  const user = useSession.getState().user;
  return joinRoute(link, user) || productConfig.routeForLink(link, user) || { name: 'Main', params: { screen: productConfig.alertsTab } };
}

/** Open a link now, or as soon as the signed-in app is showing. */
export function openLink(link) {
  if (!mainReady()) {
    pending = link;
    return;
  }
  go(routeOf(link));
}

/** Called when the signed-in app appears. */
export function flushPendingLink() {
  if (!pending || !mainReady()) return;
  const link = pending;
  pending = null;
  go(routeOf(link));
}

export function clearPendingLink() {
  pending = null;
}
