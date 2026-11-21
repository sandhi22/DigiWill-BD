import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider } from './context/VaultContext';
import { I18nProvider } from './i18n';
import Shell from './components/Shell';
import { Spinner, ToastProvider } from './components/ui';
import Landing from './pages/Landing';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/Auth';

const Overview = lazy(() => import('./pages/Overview'));
const Vault = lazy(() => import('./pages/Vault'));
const Nominees = lazy(() => import('./pages/Nominees'));
const Settings = lazy(() => import('./pages/Settings'));
const CheckInLink = lazy(() => import('./pages/Public').then((m) => ({ default: m.CheckInLink })));
const NomineeInvite = lazy(() => import('./pages/Public').then((m) => ({ default: m.NomineeInvite })));
const Release = lazy(() => import('./pages/Public').then((m) => ({ default: m.Release })));

const Loading = () => <div className="loading-screen"><Spinner /></div>;

function Private({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Navigate to="/app" replace /> : children;
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <VaultProvider>
            <BrowserRouter>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<GuestOnly><Landing /></GuestOnly>} />
                  <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
                  <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
                  <Route path="/checkin/:token" element={<CheckInLink />} />
                  <Route path="/nominee/:token" element={<NomineeInvite />} />
                  <Route path="/release/:token" element={<Release />} />
                  <Route path="/app" element={<Private><Shell /></Private>}>
                    <Route index element={<Overview />} />
                    <Route path="vault" element={<Vault />} />
                    <Route path="nominees" element={<Nominees />} />
                    <Route path="settings" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </VaultProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
