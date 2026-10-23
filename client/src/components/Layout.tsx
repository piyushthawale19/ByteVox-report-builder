import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="app-container">
      <header className="top-bar">
        <div className="top-bar-left">
          <NavLink to="/datasets" className="brand-logo">
            <span>ByteVox</span>
            <span className="brand-badge">Report Builder</span>
          </NavLink>

          <nav className="nav-links" aria-label="Main Navigation">
            <NavLink
              to="/datasets"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Datasets
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              Reports
            </NavLink>
          </nav>
        </div>

        <div className="top-bar-right">
          {user && (
            <>
              <span className="user-email">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="btn btn-outline btn-sm"
                aria-label="Log out of account"
              >
                Log Out
              </button>
            </>
          )}
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
