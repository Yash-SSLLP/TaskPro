/**
 * The signed-in frame: a slim sidebar on desktop, a top bar and bottom tabs
 * on a phone.
 *   everyone      Tasks · Recurring · Dashboard · Contacts · Teams · Alerts · Settings
 *   Super Admin   Console · All tasks · Recurring · Dashboard · Alerts · Settings
 * The sidebar footer shows my Task Pin (click to copy).
 */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, Copy, LayoutDashboard, Layers, LogOut, Settings, Smartphone, UserPlus, Users } from 'lucide-react';
import { product } from '../product/config';
import { api } from './api';
import { isSuperAdmin, useSession } from './session';
import { copyText, pinOf } from './pin';
import { Logo } from './Logo';
import { Avatar } from './ui';
import { signOutEverywhere } from './signOut';

export function useUnreadCount() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/api/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return data?.unread || 0;
}

/** Waiting on me: incoming contact requests and team invites (people only). */
function usePendingCounts(enabled) {
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api.get('/api/contacts'), enabled, refetchInterval: 120_000, staleTime: 30_000 });
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api.get('/api/teams'), enabled, refetchInterval: 120_000, staleTime: 30_000 });
  return { contacts: contacts.data?.incoming?.length || 0, teams: teams.data?.invites?.length || 0 };
}

function navItems(admin) {
  if (admin) {
    return [
      { to: '/console', label: 'Console', icon: LayoutDashboard },
      { to: '/tasks?scope=all', label: 'All tasks', icon: Layers, match: '/tasks' },
      ...product.nav.filter((n) => n.to !== '/tasks'),
      { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'unread' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ];
  }
  return [
    ...product.nav,
    { to: '/contacts', label: 'Contacts', icon: UserPlus, badge: 'contacts' },
    { to: '/teams', label: 'Teams', icon: Users, badge: 'teams' },
    { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'unread' },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
}

function CountBadge({ n, className }) {
  if (!n) return null;
  return (
    <span className={clsx('min-w-[20px] rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white', className)}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function Layout() {
  const { user } = useSession();
  const admin = isSuperAdmin(user);
  const unread = useUnreadCount();
  const pending = usePendingCounts(!admin);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = navItems(admin);
  const pin = pinOf(user);
  const badgeOf = (item) => (item.badge === 'unread' ? unread : item.badge === 'contacts' ? pending.contacts : item.badge === 'teams' ? pending.teams : 0);
  const active = (item, isActive) => (item.match ? pathname.startsWith(item.match) : isActive);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="px-5 pb-5 pt-5">
          <Logo />
          {admin && <p className="mt-3 inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">Super Admin</p>}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/tasks'}
              className={({ isActive }) =>
                clsx(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors',
                  active(item, isActive) || (item.to === '/tasks' && pathname.startsWith('/tasks/')) ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-slate-50 hover:text-ink'
                )
              }
            >
              <item.icon className="h-5 w-5" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <CountBadge n={badgeOf(item)} />
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <NavLink
            to="/get-app"
            className="mb-1 flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-slate-50 hover:text-ink"
          >
            <Smartphone className="h-[18px] w-[18px]" aria-hidden />
            Get the Android app
          </NavLink>
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar name={user?.name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
              {pin ? (
                <button
                  type="button"
                  onClick={() => copyText(pin, 'Task Pin copied')}
                  className="group inline-flex items-center gap-1 font-mono text-xs tracking-wider text-ink-soft hover:text-brand"
                  title="Copy my Task Pin"
                >
                  {pin}
                  <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" aria-hidden />
                </button>
              ) : (
                <p className="text-xs text-ink-soft">{admin ? 'Super Admin' : ''}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => signOutEverywhere().then(() => navigate('/sign-in'))}
              className="rounded-lg p-2 text-ink-faint hover:bg-slate-100 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/logo.svg" width={28} height={28} alt="" className="rounded-[22%]" />
          <span className="truncate text-[15px] font-semibold text-ink">{product.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {pin && (
            <button
              type="button"
              onClick={() => copyText(pin, 'Task Pin copied')}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-soft px-2 font-mono text-xs font-semibold tracking-wider text-brand"
              title="Copy my Task Pin"
            >
              {pin}
            </button>
          )}
          <>
              <NavLink to="/recurring" className="rounded-lg p-2 text-ink-soft" aria-label="Recurring">
                {(() => {
                  const Icon = product.nav.find((n) => n.to === '/recurring')?.icon;
                  return Icon ? <Icon className="h-5 w-5" /> : null;
                })()}
              </NavLink>
              <NavLink to="/dashboard" className="rounded-lg p-2 text-ink-soft" aria-label="Dashboard">
                {(() => {
                  const Icon = product.nav.find((n) => n.to === '/dashboard')?.icon;
                  return Icon ? <Icon className="h-5 w-5" /> : null;
                })()}
              </NavLink>
          </>
          <NavLink to="/alerts" className="relative rounded-lg p-2 text-ink-soft" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-600" />}
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <Outlet />
      </main>

      {/* Phone bottom tabs */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white lg:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md">
          {items
            .filter((item) => !item.mobileHidden && item.badge !== 'unread')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/tasks'}
                className={({ isActive }) =>
                  clsx(
                    'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                    active(item, isActive) || (item.to === '/tasks' && pathname.startsWith('/tasks/')) ? 'text-brand' : 'text-ink-faint'
                  )
                }
              >
                <item.icon className="h-[22px] w-[22px]" aria-hidden />
                {item.label}
                <CountBadge n={badgeOf(item)} className="absolute left-1/2 top-1.5 ml-1.5" />
              </NavLink>
            ))}
        </div>
      </nav>
    </div>
  );
}
