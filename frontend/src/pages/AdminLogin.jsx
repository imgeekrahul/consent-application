import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import { Alert, FullPageSpinner, Logo } from '../components/ui.jsx';
import { errorMessage } from '../services/api.js';

export default function AdminLogin() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/admin') ? location.state.from : '/admin/documents';

  if (status === 'checking') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to={from} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo className="scale-110" /></div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6 sm:p-8">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Admin sign in</h1>
            <p className="mt-1 text-sm text-slate-500">Manage documents and collect signatures.</p>
          </div>
          {error && <Alert type="error">{error}</Alert>}
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <div className="relative">
              <input id="password" className="input pr-10" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !username || !password}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">Signers don’t need an account — they use the shared document link.</p>
      </div>
    </div>
  );
}
