/**
 * Routes and the gates in front of them:
 *   signed out            → sign-in pages only
 *   must change password  → the choose-a-password screen only
 *   everyone else         → the app layout: the product, Contacts, Teams,
 *                           Alerts, Settings — and, for the Super Admin, the
 *                           Console (people, teams) with All tasks.
 */
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { product } from './product/config';
import { api } from './platform/api';
import { isSuperAdmin, useSession } from './platform/session';
import { Layout } from './platform/Layout';
import { ForcePasswordPage, ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage } from './platform/pages/auth';
import { AlertsPage } from './platform/pages/AlertsPage';
import { SettingsPage } from './platform/pages/SettingsPage';
import { PlatformPage } from './platform/pages/PlatformPage';
import { ContactsPage } from './platform/pages/ContactsPage';
import { TeamDetailPage, TeamsPage } from './platform/pages/TeamsPage';
import { EmptyState, Button } from './platform/ui';

function NotFound() {
  const user = useSession((s) => s.user);
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      text="The page you were looking for isn't here."
      action={<Button to={isSuperAdmin(user) ? product.adminHomePath : product.homePath}>Go home</Button>}
    />
  );
}

/** Refresh the session from the server once per load (role, pin, settings, …). */
function useSessionRefresh(token) {
  const setSession = useSession((s) => s.setSession);
  const { data } = useQuery({
    queryKey: ['session', token],
    queryFn: () => api.get('/api/auth/me'),
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (data) setSession(data);
  }, [data, setSession]);
}

export default function App() {
  const { token, user } = useSession();
  const location = useLocation();
  useSessionRefresh(token);

  useEffect(() => {
    document.title = product.name;
  }, [location.pathname]);

  if (!token || !user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/sign-in" replace state={{ from: location.pathname }} />} />
      </Routes>
    );
  }

  if (user.mustChangePassword) return <ForcePasswordPage />;

  const admin = isSuperAdmin(user);
  const home = admin ? product.adminHomePath : product.homePath;

  return (
    <Routes>
      <Route element={<Layout />}>
        {product.routes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/teams/:id" element={<TeamDetailPage />} />
        {admin ? (
          <>
            <Route path="/console" element={<PlatformPage />} />
            <Route path="/platform" element={<Navigate to="/console" replace />} />
            <Route path="/contacts" element={<Navigate to="/console" replace />} />
            <Route path="/teams" element={<Navigate to="/console?tab=teams" replace />} />
          </>
        ) : (
          <>
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/console" element={<Navigate to={home} replace />} />
          </>
        )}
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/sign-in" element={<Navigate to={home} replace />} />
        <Route path="/sign-up" element={<Navigate to={home} replace />} />
        <Route path="/team" element={<Navigate to={admin ? '/console?tab=teams' : '/teams'} replace />} />
        <Route path="/report" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
