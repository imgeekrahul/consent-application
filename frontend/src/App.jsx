import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import NotFound from './pages/NotFound.jsx';
import { FullPageSpinner } from './components/ui.jsx';

// The signing page pulls in pdf.js — load it (and admin pages) on demand.
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const AdminUpload = lazy(() => import('./pages/AdminUpload.jsx'));
const DocumentSigning = lazy(() => import('./pages/DocumentSigning.jsx'));

// Session state is only needed (and only checked) on admin routes.
function AdminRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminRoot />}>
          <Route path="login" element={<AdminLogin />} />
          <Route
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="documents" replace />} />
            <Route path="documents" element={<AdminDashboard />} />
            <Route path="upload/file" element={<AdminUpload />} />
            <Route path="upload" element={<Navigate to="file" replace />} />
          </Route>
        </Route>
        <Route path="/document/:documentId" element={<DocumentSigning />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
