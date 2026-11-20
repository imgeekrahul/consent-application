import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { FileText, LogOut, Upload } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { Logo } from './ui.jsx';

const navClass = ({ isActive }) =>
  `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-6 sm:px-6">
          <NavLink to="/admin/documents" aria-label="SignDesk home"><Logo /></NavLink>
          <nav className="flex items-center gap-1" aria-label="Admin">
            <NavLink to="/admin/documents" className={navClass}>
              <FileText className="h-4 w-4" /><span className="hidden sm:inline">Documents</span>
            </NavLink>
            <NavLink to="/admin/upload/file" className={navClass}>
              <Upload className="h-4 w-4" /><span className="hidden sm:inline">Upload</span>
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-slate-500 md:inline">Signed in as <b className="font-medium text-slate-700">{user?.username}</b></span>
            <button type="button" onClick={onLogout} className="btn-ghost px-3" title="Sign out">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
