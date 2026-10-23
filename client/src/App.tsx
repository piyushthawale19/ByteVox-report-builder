import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ProtectedRoute } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Datasets from './pages/Datasets';
import DatasetDetail from './pages/DatasetDetail';
import Reports from './pages/Reports';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Application Routes inside shared Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/datasets" replace />} />
            <Route path="/datasets" element={<Datasets />} />
            <Route path="/datasets/:id" element={<DatasetDetail />} />
            <Route path="/reports" element={<Reports />} />
            {/* Report editor route placeholder */}
            <Route
              path="/reports/:id"
              element={
                <div className="card state-empty">
                  <div className="state-title">Report Editor</div>
                  <p>Step 2: Ready to build blocks, calculations, and explanations.</p>
                </div>
              }
            />
          </Route>

          {/* Public share view placeholder */}
          <Route
            path="/s/:token"
            element={
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                <h2>Shared Report Viewer</h2>
                <p style={{ color: 'var(--muted)' }}>Public report view (Step 3)</p>
              </div>
            }
          />

          {/* Catch-all 404 */}
          <Route
            path="*"
            element={
              <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>404 - Page Not Found</h1>
                <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
                  The page you requested does not exist.
                </p>
                <a href="/datasets" className="btn btn-primary">
                  Go to Datasets
                </a>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
