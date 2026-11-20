import { Link } from 'react-router-dom';
import { Logo } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-4xl font-bold text-slate-900">404</h1>
      <p className="text-sm text-slate-600">The page you’re looking for doesn’t exist.</p>
      <Link to="/admin" className="btn-primary">Go to dashboard</Link>
    </div>
  );
}
