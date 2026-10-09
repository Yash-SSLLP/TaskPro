/**
 * KARO's navigation: the bottom tabs (by role) and the product's stack
 * screens. The platform's RootNavigator mounts these and adds the shared
 * screens (contacts, teams, profile, password, the console's person page).
 *
 *   everyone      Tasks · Calendar · Recurring · Alerts · More
 *   Super Admin   Console · All tasks · Calendar · Alerts · More
 * Labels are English keys, translated where the tab bar draws them.
 * Calendar is the month of my tasks (due, and finished) and my reminders.
 */
import AlertsScreen from '../platform/screens/AlertsScreen';
import ConsoleScreen from '../platform/screens/ConsoleScreen';
import MoreScreen from '../platform/screens/MoreScreen';
import { Bell, CalendarDays, Layers, Menu, Repeat, Shield, SquareCheckBig } from './icons';
import AssignTaskScreen from './screens/AssignTaskScreen';
import CalendarScreen from './screens/CalendarScreen';
import DashboardScreen from './screens/DashboardScreen';
import RecurringScreen from './screens/RecurringScreen';
import SettingsScreen from './screens/SettingsScreen';
import TaskDetailScreen from './screens/TaskDetailScreen';
import TasksScreen from './screens/TasksScreen';

/** `badge: 'unread'` shows the unread alert count. */
export function tabsFor(user) {
  if (user?.role === 'superadmin') {
    return [
      { name: 'Console', label: 'Console', icon: Shield, component: ConsoleScreen },
      { name: 'AllTasks', label: 'All tasks', icon: Layers, component: TasksScreen, initialParams: { pile: 'all' } },
      { name: 'Calendar', label: 'Calendar', icon: CalendarDays, component: CalendarScreen },
      { name: 'Alerts', label: 'Alerts', icon: Bell, component: AlertsScreen, badge: 'unread' },
      { name: 'More', label: 'More', icon: Menu, component: MoreScreen },
    ];
  }
  return [
    { name: 'Tasks', label: 'Tasks', icon: SquareCheckBig, component: TasksScreen },
    { name: 'Calendar', label: 'Calendar', icon: CalendarDays, component: CalendarScreen },
    { name: 'Recurring', label: 'Recurring', icon: Repeat, component: RecurringScreen },
    { name: 'Alerts', label: 'Alerts', icon: Bell, component: AlertsScreen, badge: 'unread' },
    { name: 'More', label: 'More', icon: Menu, component: MoreScreen },
  ];
}

const modal = { presentation: 'fullScreenModal', animation: 'slide_from_bottom' };

export const productScreens = [
  { name: 'TaskDetail', component: TaskDetailScreen },
  { name: 'AssignTask', component: AssignTaskScreen, options: modal },
  { name: 'RecurringList', component: RecurringScreen },
  { name: 'Dashboard', component: DashboardScreen },
  { name: 'Settings', component: SettingsScreen },
];
