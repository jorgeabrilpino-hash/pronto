import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/api/session';

/** Layout guard: signed in and registered. Everything else goes to the public start. */
export function RequireAuth() {
  const session = useSession();
  const { pathname } = useLocation();
  if (!session) return <Navigate to="/" replace state={{ from: pathname }} />;
  if (!session.company) return <Navigate to="/registro" replace />;
  return <Outlet />;
}
