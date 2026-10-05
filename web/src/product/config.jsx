/**
 * Task Pro, as the shared web shell sees it: its name, pitch, navigation and
 * routes.
 */
import { BarChart3, CheckSquare, Repeat } from 'lucide-react';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { RecurringPage } from './pages/RecurringPage';
import { DashboardPage } from './pages/DashboardPage';

export const product = {
  key: 'taskpro',
  name: 'Task Pro',
  tagline: 'Give tasks to anyone — by their Task Pin.',
  pitch: [
    'Your own Task Pin — share it, and people add you in a tap',
    'Give tasks to yourself, your contacts and your teams',
    'Reminders, reviews and repeating jobs on autopilot',
  ],
  homePath: '/tasks',
  adminHomePath: '/console',
  nav: [
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    { to: '/recurring', label: 'Recurring', icon: Repeat, mobileHidden: true },
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3, mobileHidden: true },
  ],
  routes: [
    { path: '/tasks', element: <TasksPage /> },
    { path: '/tasks/:id', element: <TaskDetailPage /> },
    { path: '/recurring', element: <RecurringPage /> },
    { path: '/dashboard', element: <DashboardPage /> },
  ],
};
