import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, } from 'react-router-dom';
import { supabase } from './supabaseClient';
import DashboardPage from './pages/DashboardPage';
import BookingsPage from './pages/BookingsPage';
import CreateBooking from './pages/CreateBookingPage';
import CustomerDepositPage from './pages/CustomerDepositsPage';
import SuppliersInfo from './pages/SuppliersInfo';
import TransactionsPage from './pages/TransactionsPage';
import ProfilePage from './pages/ProfilePage';
import UserManagementPage from './pages/UserManagementPage';
import AuthPage from './components/Auth';
import CreateUserPage from './pages/CreateUserPage';
import NavigationBar from './components/NavigationBar';     
import InternalInvoicingPage from './pages/InternalInvoicingPage';  
import ReportsPage from './pages/ReportsPage';
import AgentCommissions from './pages/AgentCommissions';

const ProtectedRoutes = ({ session }) => {
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return (
    <>
      <NavigationBar />
      <main className="p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </>
  );
};

const PublicRoutes = ({ session }) => {
  return session ? <Navigate to="/" replace /> : <Outlet />;
};

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Memoized handler for auth state changes
  const handleAuthStateChange = useCallback((event, newSession) => {
    // Reset auth redirecting flag when session changes
    window.__authRedirecting = false;
    
    switch (event) {
      case 'SIGNED_IN':
        setSession(newSession);
        break;
      case 'SIGNED_OUT':
        setSession(null);
        break;
      case 'TOKEN_REFRESHED':
        // Session was refreshed, update the session state
        setSession(newSession);
        break;
      case 'USER_UPDATED':
        setSession(newSession);
        break;
      default:
        // For any other event, just update the session
        setSession(newSession);
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (error) {
        console.error('Error getting initial session:', error.message);
        setSession(null);
      } else {
        setSession(initialSession);
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, [handleAuthStateChange]);

  // Handle visibility change to refresh session when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && session) {
        // When tab becomes active, check if session needs refresh
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (currentSession) {
            // Check if session is about to expire (within 5 minutes)
            const expiresAt = currentSession.expires_at * 1000;
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            
            if (expiresAt - now < fiveMinutes) {
              // Refresh the session
              const { data: { session: refreshedSession }, error } = await supabase.auth.refreshSession();
              if (!error && refreshedSession) {
                setSession(refreshedSession);
              }
            }
          }
        } catch (error) {
          console.error('Error refreshing session on visibility change:', error.message);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoutes session={session} />}>
          <Route path="/auth" element={<AuthPage />} />
        </Route>

        <Route element={<ProtectedRoutes session={session} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/customer-deposits" element={<CustomerDepositPage />} />
          <Route path="/suppliers-info" element={<SuppliersInfo />} />
          <Route path="/create-booking" element={<CreateBooking />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/user-management" element={<UserManagementPage />} />
          <Route path="/create-user" element={<CreateUserPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/internal-invoicing" element={<InternalInvoicingPage />} />
          <Route path="/agent-commissions" element={<AgentCommissions />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;