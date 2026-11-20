import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { FullPageSpinner } from './ui.jsx';

export default function RequireAdmin({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'checking') return <FullPageSpinner label="Checking your session…" />;
  if (status !== 'authenticated') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
