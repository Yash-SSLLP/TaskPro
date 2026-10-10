/**
 * The signed-in frame, laid out as the HRMS portal is: a sidebar in sections
 * on desktop with a slim top bar (the light / dark switch, alerts, me), and
 * on a phone a top bar and bottom tabs.
 *   everyone      WORK Tasks · Calendar · Recurring · Dashboard
 *                 PEOPLE Contacts · Organizations      ACCOUNT Alerts · Settings
 *   Super Admin   CONSOLE Console · All tasks · Website
 *                 WORK Calendar · Recurring · Dashboard   ACCOUNT Alerts · Settings
 * The phone's bottom tabs: Tasks · Calendar · Contacts · Orgs · Settings
 * (Super Admin: Console · All tasks · Calendar · Settings; the Website editor
 * is a desktop job, though it works on a phone). `short` is a row's name on
 * a bottom tab, where five share the width. The sidebar footer shows my Task
 * Pin (click to copy).
 *
 * The row a page belongs to is handed to its PageHeader (platform/place.js).
 */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, Globe, LayoutDashboard, Layers, Settings, UserPlus, Users } from 'lucide-react';
import { product } from '../product/config';
import { api } from './api';
import { isSuperAdmin, useSession } from './session';
import { copyText, pinOf } from './pin';
import { Sidebar, useSidebarRail } from './Sidebar';
import { Avatar } from './ui';
import { signOutEverywhere } from './signOut';
import { ThemeToggle } from './ThemeToggle';
import { PlaceContext } from './place';

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/api/notifications/unread-count'),
    // Live sync (platform/live.js) writes the count every few seconds; this is
    // only the safety net for a server without it.
    refetchInterval: 300_000,
    refetchOnWindowFocus: true,
  });
  return data?.unread || 0;
}

/** Waiting on me: incoming contact requests and organization invites (people only). */
function usePendingCounts(enabled) {
  // Kept fresh by live sync, which refetches them when people change.
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts'), enabled, staleTime: 30_000 });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get('/api/teams'), enabled, staleTime: 30_000 });
  return { contacts: contacts.data?.incoming?.length || 0, teams: teams.data?.invites?.length || 0 };
}

const ACCOUNT = [
  { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'unread', phone: false },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** The sidebar, in sections. `phone: false` keeps a row off the bottom tabs. */
function navSections(admin) {
  if (admin) {
    return [
      {
        group: 'Console',
        items: [
          { to: '/console', label: 'Console', icon: LayoutDashboard },
          { to: '/tasks?scope=all', label: 'All tasks', icon: Layers, match: '/tasks' },
          { to: '/website', label: 'Website', icon: Globe, phone: false },
        ],
      },
      { group: 'Work', items: product.nav.filter((n) => n.to !== '/tasks') },
      { group: 'Account', items: ACCOUNT },
    ];
  }
  return [
    { group: 'Work', items: product.nav },
    {
      group: 'People',
      items: [
        { to: '/contacts', label: 'Contacts', icon: UserPlus, badge: 'contacts' },
        { to: '/teams', label: 'Organizations', short: 'Orgs', icon: Users, badge: 'teams' },
      ],
    },
    { group: 'Account', items: ACCOUNT },
  ];
}

function CountBadge({ n, className }) {
  if (!n) return null;
  return (
    <span className={clsx('min-w-[18px] rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function Layout() {
  const { user } = useSession();
  const admin = isSuperAdmin(user);
  const unread = useUnreadCount();
  const pending = usePendingCounts(!admin);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sections = navSections(admin);
  const pin = pinOf(user);
  const badgeOf = (item) => (item.badge === 'unread' ? unread : item.badge === 'contacts' ? pending.contacts : item.badge === 'teams' ? pending.teams : 0);
  const pathOf = (item) => item.match || item.to.split('?')[0];
  const isOn = (item) => {
    const p = pathOf(item);
    return pathname === p || pathname.startsWith(`${p}/`);
  };

  // The row this page belongs to, for its header.
  let place = null;
  for (const s of sections) {
    for (const item of s.items) {
      if (isOn(item) && (!place || pathOf(item).length > pathOf(place).length)) place = { ...item, group: s.group };
    }
  }

  const phoneTabs = sections.flatMap((s) => s.items).filter((item) => item.phone !== false && !item.mobileHidden);
  const firstName = String(user?.name || '').split(' ')[0];
  const [rail, toggleRail] = useSidebarRail();

  return (
    <PlaceContext.Provider value={place}>
      <div className={clsx('app-shell min-h-screen', rail && 'is-rail')}>
        {/* Desktop sidebar: a floating panel that folds into a rail (platform/Sidebar.jsx). */}
        <Sidebar
          rail={rail}
          onToggle={toggleRail}
          sections={sections}
          isOn={isOn}
          badgeOf={badgeOf}
          user={user}
          pin={pin}
          admin={admin}
          avatar={<Avatar person={user} size="sm" />}
          onSignOut={() => signOutEverywhere().then(() => navigate('/sign-in'))}
        />

        {/* Desktop top bar */}
        <header className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-3 border-b border-line/60 bg-page/80 px-6 backdrop-blur-md lg:flex">
          <p className="min-w-0 truncate text-sm text-ink-soft">
            {greeting()}, <span className="font-semibold text-ink">{firstName}</span>
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NavLink
              to="/alerts"
              className={({ isActive }) =>
                clsx('relative grid h-9 w-9 place-items-center rounded-full transition-colors', isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-well hover:text-brand')
              }
              aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}
              title="Alerts"
            >
              <Bell className="h-[18px] w-[18px]" />
              <CountBadge n={unread} className="absolute -right-0.5 -top-0.5" />
            </NavLink>
            <span className="mx-1 h-6 w-px bg-line" aria-hidden />
            <NavLink to="/profile" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-well" title="My profile">
              <Avatar person={user} size="sm" />
              <span className="hidden min-w-0 leading-tight xl:block">
                <span className="block max-w-[160px] truncate text-[13px] font-semibold text-ink">{user?.name}</span>
                <span className="block font-mono text-[10.5px] tracking-wider text-ink-faint">{pin || (admin ? 'Super Admin' : '')}</span>
              </span>
            </NavLink>
          </div>
        </header>

        {/* Phone top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-card/90 px-3 backdrop-blur lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/logo.svg" width={28} height={28} alt="" className="rounded-[22%]" />
            <span className="hidden truncate text-[15px] font-semibold text-ink min-[400px]:inline">{product.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {pin && (
              <button
                type="button"
                onClick={() => copyText(pin, 'Task Pin copied')}
                className="hidden h-7 items-center gap-1 rounded-lg bg-brand-soft px-2 font-mono text-[11px] font-semibold tracking-wider text-brand min-[440px]:inline-flex"
                title="Copy my Task Pin"
              >
                {pin}
              </button>
            )}
            {product.nav
              .filter((n) => n.mobileHidden)
              .map((n) => (
                <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx('rounded-lg p-2', isActive ? 'text-brand' : 'text-ink-soft')} aria-label={n.label} title={n.label}>
                  <n.icon className="h-[18px] w-[18px]" />
                </NavLink>
              ))}
            <ThemeToggle className="mx-1" />
            <NavLink to="/alerts" className="relative rounded-lg p-2 text-ink-soft" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}>
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-red-600" />}
            </NavLink>
            <NavLink to="/profile" className="ml-0.5 shrink-0 rounded-full" aria-label="My profile" title="My profile">
              <Avatar person={user} size="sm" />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-6">
          <Outlet />
        </main>

        {/* Phone bottom tabs (the footer) */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card lg:hidden" aria-label="Main">
          <div className="mx-auto flex max-w-md">
            {phoneTabs.map((item) => {
              const on = isOn(item);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={clsx('relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold', on ? 'text-brand' : 'text-ink-faint')}
                >
                  <span className={clsx('grid h-7 w-11 place-items-center rounded-full transition-colors', on && 'bg-brand-soft')}>
                    <item.icon className="h-[19px] w-[19px]" aria-hidden />
                  </span>
                  {item.short || item.label}
                  <CountBadge n={badgeOf(item)} className="absolute left-1/2 top-1 ml-2" />
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </PlaceContext.Provider>
  );
}
