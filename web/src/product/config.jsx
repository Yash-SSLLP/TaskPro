/**
 * Karo, as the shared web shell sees it: its name, pitch, navigation and
 * routes.
 */
import { BarChart3, CalendarDays, CheckSquare, Repeat } from 'lucide-react';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { RecurringPage } from './pages/RecurringPage';
import { DashboardPage } from './pages/DashboardPage';
import { CalendarPage } from './pages/CalendarPage';

export const product = {
  key: 'taskpro',
  name: 'Karo',
  tagline: 'In Karo, you give tasks to anyone by their Task Pin.',
  pitch: [
    'You get your own Task Pin: share it, and people add you in a tap',
    'Give tasks to yourself, your contacts and your organizations',
    'Reminders, reviews and repeating jobs on autopilot',
  ],
  homePath: '/tasks',
  adminHomePath: '/console',
  // `mobileHidden`: off the phone's bottom tabs (the phone's top bar carries it).
  nav: [
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/recurring', label: 'Recurring', icon: Repeat, mobileHidden: true },
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3, mobileHidden: true },
  ],
  routes: [
    { path: '/tasks', element: <TasksPage /> },
    { path: '/tasks/:id', element: <TaskDetailPage /> },
    { path: '/calendar', element: <CalendarPage /> },
    { path: '/recurring', element: <RecurringPage /> },
    { path: '/dashboard', element: <DashboardPage /> },
  ],
};
