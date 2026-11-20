import { lazy, Suspense, useEffect, useState } from 'react';
import StaffRequest from './components/shared/StaffRequest';
import SignIn from './components/shared/SignIn';
import ResetPassword from './components/shared/ResetPassword';
import LoadingScreen from './components/shared/LoadingScreen';
import { useAuthStore } from './stores/authStore';

const Workspace = lazy(() => import('./pages/checkout/Workspace'));

export default function App() {
  const { user, role, isAuthenticated, checkSession, login, logout, isLoading, recovery } = useAuthStore();
  const [screen, setScreen] = useState<'signin' | 'signup' | 'reset'>(window.location.pathname === '/reset-password' ? 'reset' : 'signin');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    void checkSession().finally(() => setCheckingSession(false));
  }, [checkSession]);

  function backToSignIn() {
    if (recovery) void logout().catch(() => {});
    if (window.location.pathname === '/reset-password') window.history.replaceState(null, '', '/');
    setScreen('signin');
  }

  if (checkingSession) return <LoadingScreen />;
  if (recovery) return <ResetPassword change onBack={backToSignIn} />;
  if (!isAuthenticated || !user) {
    if (screen === 'signup') return <StaffRequest onBack={backToSignIn} />;
    if (screen === 'reset') return <ResetPassword onBack={backToSignIn} />;
    return <SignIn login={login} isLoading={isLoading} onReset={() => setScreen('reset')} onRequestAccess={() => setScreen('signup')} />;
  }
  return <Suspense fallback={<LoadingScreen />}>
    <Workspace key={user.id} user={user} role={role} logout={logout} />
  </Suspense>;
}
