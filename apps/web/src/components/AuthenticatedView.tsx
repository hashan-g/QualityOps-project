import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserResponse, CanonicalRole } from '@qualityops/contracts';
import { OverviewDashboard, type ActiveSection } from './OverviewDashboard';
import { MasterDataView } from './MasterDataView';
import { ProductionBatchesView } from './ProductionBatchesView';
import { DowntimeView } from './DowntimeView';
import { QualityInspectionsView } from './QualityInspectionsView';
import { QualityDefectsView } from './QualityDefectsView';
import { CapaManagementView } from './CapaManagementView';
import { SpcMonitoringView } from './SpcMonitoringView';
import { ReportsView } from './ReportsView';
import { AlertsView } from './AlertsView';
import { NotificationCenter } from './NotificationCenter';
import {
  IconDashboard,
  IconBatches,
  IconDowntime,
  IconInspections,
  IconDefects,
  IconCapa,
  IconSpc,
  IconReports,
  IconAlerts,
  IconBell,
  IconMasterData,
  IconUsers,
  IconLogout,
  IconMenu,
  IconClose,
} from './icons';

export const AuthenticatedView: React.FC = () => {
  const { user, accessToken, logout } = useAuth();
  const isAdmin = user?.roles.includes('ADMIN');

  // Default active landing view: Overview Dashboard
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState<boolean>(false);

  // Close menus on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) setMobileMenuOpen(false);
        if (isProfileMenuOpen) setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, isProfileMenuOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.qo-user-chip-container')) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [isProfileMenuOpen]);

  // Notification Center state
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState<boolean>(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  useEffect(() => {
    if (accessToken) {
      void fetchUnreadCount();
    }
  }, [accessToken]);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch('/api/v1/notifications?limit=1&unreadOnly=true', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadNotificationCount(data.unreadCount ?? 0);
      }
    } catch {
      // Graceful fallback
    }
  };

  // Admin user list state
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState<boolean>(false);
  const [userError, setUserError] = useState<string | null>(null);

  // New user form state (admin provision)
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<CanonicalRole>('VIEWER');
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);

  useEffect(() => {
    if (isAdmin && accessToken) {
      void fetchUsers();
    }
  }, [isAdmin, accessToken]);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUserError(null);
    try {
      const res = await fetch('/api/v1/users?limit=10', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load users: ${res.statusText}`);
      }

      const data = (await res.json()) as { users: UserResponse[] };
      setUsers(data.users);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Failed to load user list');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionMessage(null);
    setIsProvisioning(true);

    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          username: newUsername,
          email: newEmail,
          fullName: newFullName,
          password: newPassword,
          roles: [newRole],
        }),
      });

      const data = (await res.json()) as { user?: UserResponse; error?: { message: string } };

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create user');
      }

      setProvisionMessage(`User ${newUsername} created successfully.`);
      setNewUsername('');
      setNewEmail('');
      setNewFullName('');
      setNewPassword('');
      await fetchUsers();
    } catch (err) {
      setProvisionMessage(err instanceof Error ? err.message : 'Error creating user');
    } finally {
      setIsProvisioning(false);
    }
  };

  if (!user) return null;

  const initials = user.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user.username.slice(0, 2).toUpperCase();

  const handleNavClick = (section: ActiveSection) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  // Human-readable titles for topbar breadcrumb
  const sectionLabels: Record<ActiveSection, { category: string; title: string }> = {
    overview: { category: 'OVERVIEW', title: 'Executive Dashboard' },
    batches: { category: 'OPERATIONS', title: 'Production Batches' },
    downtime: { category: 'OPERATIONS', title: 'Downtime Tracking' },
    inspections: { category: 'QUALITY MANAGEMENT', title: 'Quality Inspections' },
    defects: { category: 'QUALITY MANAGEMENT', title: 'Defect Analytics & Pareto' },
    capa: { category: 'QUALITY MANAGEMENT', title: 'CAPA Closed-Loop' },
    spc: { category: 'INSIGHTS', title: 'SPC Control Charts' },
    reports: { category: 'INSIGHTS', title: 'Reports & Safe Exports' },
    alerts: { category: 'INSIGHTS', title: 'Operational Alerts' },
    'master-data': { category: 'ADMINISTRATION', title: 'Master Data Repository' },
    users: { category: 'ADMINISTRATION', title: 'User Administration' },
  };

  const currentLabel = sectionLabels[activeSection] || {
    category: 'QUALITYOPS',
    title: 'Platform',
  };

  return (
    <div className="qo-app-layout">
      {/* Enterprise Left Sidebar */}
      <aside className={`qo-sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Main Navigation">
        <div className="qo-sidebar-brand">
          <div className="qo-sidebar-brand-left">
            <div className="qo-sidebar-brand-icon" aria-hidden="true">
              Q
            </div>
            <div>
              <div className="qo-sidebar-brand-name">QualityOps</div>
              <div style={{ fontSize: '11px', color: 'var(--qo-slate-400)' }}>
                Industrial Analytics
              </div>
            </div>
          </div>
          <span className="qo-sidebar-brand-badge">Plant 01</span>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="qo-drawer-close-btn"
            aria-label="Close navigation menu"
          >
            <IconClose size={20} />
          </button>
        </div>

        <nav className="qo-sidebar-nav">
          {/* Group 1: Overview */}
          <div className="qo-sidebar-group">
            <span className="qo-sidebar-group-title">Overview</span>
            <button
              onClick={() => handleNavClick('overview')}
              className={`qo-sidebar-link ${activeSection === 'overview' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconDashboard size={18} />
              </span>
              <span>Dashboard</span>
            </button>
          </div>

          {/* Group 2: Operations */}
          <div className="qo-sidebar-group">
            <span className="qo-sidebar-group-title">Operations</span>
            <button
              onClick={() => handleNavClick('batches')}
              className={`qo-sidebar-link ${activeSection === 'batches' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconBatches size={18} />
              </span>
              <span>Production Batches</span>
            </button>
            <button
              onClick={() => handleNavClick('downtime')}
              className={`qo-sidebar-link ${activeSection === 'downtime' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconDowntime size={18} />
              </span>
              <span>Downtime Events</span>
            </button>
          </div>

          {/* Group 3: Quality Management */}
          <div className="qo-sidebar-group">
            <span className="qo-sidebar-group-title">Quality Management</span>
            <button
              onClick={() => handleNavClick('inspections')}
              className={`qo-sidebar-link ${activeSection === 'inspections' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconInspections size={18} />
              </span>
              <span>Quality Inspections</span>
            </button>
            <button
              onClick={() => handleNavClick('defects')}
              className={`qo-sidebar-link ${activeSection === 'defects' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconDefects size={18} />
              </span>
              <span>Defect Management</span>
            </button>
            <button
              onClick={() => handleNavClick('capa')}
              className={`qo-sidebar-link ${activeSection === 'capa' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconCapa size={18} />
              </span>
              <span>CAPA Management</span>
            </button>
          </div>

          {/* Group 4: Insights */}
          <div className="qo-sidebar-group">
            <span className="qo-sidebar-group-title">Insights</span>
            <button
              onClick={() => handleNavClick('spc')}
              className={`qo-sidebar-link ${activeSection === 'spc' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconSpc size={18} />
              </span>
              <span>SPC Monitoring</span>
            </button>
            <button
              onClick={() => handleNavClick('reports')}
              className={`qo-sidebar-link ${activeSection === 'reports' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconReports size={18} />
              </span>
              <span>Reports &amp; Exports</span>
            </button>
            <button
              onClick={() => handleNavClick('alerts')}
              className={`qo-sidebar-link ${activeSection === 'alerts' ? 'active' : ''}`}
            >
              <span className="qo-sidebar-link-icon">
                <IconAlerts size={18} />
              </span>
              <span>Operational Alerts</span>
            </button>
          </div>

          {/* Group 5: Administration */}
          {isAdmin && (
            <div className="qo-sidebar-group">
              <span className="qo-sidebar-group-title">Administration</span>
              <button
                onClick={() => handleNavClick('master-data')}
                className={`qo-sidebar-link ${activeSection === 'master-data' ? 'active' : ''}`}
              >
                <span className="qo-sidebar-link-icon">
                  <IconMasterData size={18} />
                </span>
                <span>Master Data</span>
              </button>
              <button
                onClick={() => handleNavClick('users')}
                className={`qo-sidebar-link ${activeSection === 'users' ? 'active' : ''}`}
              >
                <span className="qo-sidebar-link-icon">
                  <IconUsers size={18} />
                </span>
                <span>User Administration</span>
              </button>
            </div>
          )}
        </nav>

        {/* Sidebar Footer — Security Telemetry & Session Actions */}
        <div className="qo-sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600, color: 'var(--qo-slate-200)', fontSize: '11.5px' }}>
              Session Active ({user.username})
            </span>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--qo-slate-400)',
              lineHeight: '1.4',
              marginBottom: '10px',
            }}
          >
            Argon2id + Secure HttpOnly Token Handling
          </div>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              void logout();
            }}
            className="qo-logout-btn qo-drawer-logout-btn"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <IconLogout size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Backdrop for mobile drawer */}
      <div
        className={`qo-sidebar-backdrop ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Main Content Area & Topbar */}
      <div className="qo-main-wrapper">
        <header className="qo-topbar">
          <div className="qo-topbar-left">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="qo-topbar-menu-btn"
              aria-label="Toggle navigation menu"
            >
              <IconMenu size={18} />
            </button>
            <div className="qo-topbar-breadcrumb">
              <span className="qo-breadcrumb-category">{currentLabel.category}</span>
              <span className="qo-breadcrumb-separator">/</span>
              <span className="qo-topbar-section-title">{currentLabel.title}</span>
            </div>
          </div>

          <div className="qo-topbar-right">
            {/* Notification Center Trigger */}
            <button
              onClick={() => setIsNotificationCenterOpen(true)}
              aria-label={`Notifications (${unreadNotificationCount} unread)`}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-topbar-notif-btn"
              style={{ position: 'relative' }}
            >
              <IconBell size={16} />
              <span className="qo-btn-text-desktop">Notifications</span>
              {unreadNotificationCount > 0 && (
                <span className="qo-badge qo-badge-critical qo-topbar-badge">
                  {unreadNotificationCount}
                </span>
              )}
            </button>

            {/* User Profile Chip / Menu */}
            <div className="qo-user-chip-container">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className="qo-user-chip"
                aria-label={`User profile menu for ${user.fullName || user.username}`}
                aria-expanded={isProfileMenuOpen}
              >
                <div className="qo-user-avatar">{initials}</div>
                <div className="qo-user-meta">
                  <span className="qo-user-name">{user.fullName || user.username}</span>
                  <span className="qo-user-role">{user.roles[0] || 'VIEWER'}</span>
                </div>
              </button>

              {isProfileMenuOpen && (
                <div className="qo-user-menu-dropdown">
                  <div className="qo-user-menu-header">
                    <div className="qo-user-avatar" style={{ width: '34px', height: '34px' }}>
                      {initials}
                    </div>
                    <div className="qo-user-menu-info">
                      <div className="qo-user-menu-name">{user.fullName || user.username}</div>
                      <div className="qo-user-menu-email">{user.email || user.username}</div>
                      <div style={{ marginTop: '4px' }}>
                        <span className="qo-badge qo-badge-neutral" style={{ fontSize: '10px' }}>
                          {user.roles.join(', ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="qo-user-menu-divider" />
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      void logout();
                    }}
                    className="qo-user-menu-logout-btn"
                  >
                    <IconLogout size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Standalone Desktop Logout Action */}
            <button
              onClick={() => void logout()}
              className="qo-logout-btn qo-topbar-logout-desktop"
              title="Sign out of QualityOps"
            >
              <IconLogout size={15} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Main View Port */}
        <main className="qo-main-content">
          {activeSection === 'overview' ? (
            <OverviewDashboard onNavigate={(sec) => handleNavClick(sec)} />
          ) : activeSection === 'batches' ? (
            <ProductionBatchesView />
          ) : activeSection === 'downtime' ? (
            <DowntimeView />
          ) : activeSection === 'inspections' ? (
            <QualityInspectionsView />
          ) : activeSection === 'defects' ? (
            <QualityDefectsView />
          ) : activeSection === 'capa' ? (
            <CapaManagementView />
          ) : activeSection === 'spc' ? (
            <SpcMonitoringView />
          ) : activeSection === 'reports' ? (
            <ReportsView />
          ) : activeSection === 'alerts' ? (
            <AlertsView />
          ) : activeSection === 'master-data' ? (
            <MasterDataView />
          ) : isAdmin ? (
            <section aria-labelledby="admin-panel-heading" className="qo-card">
              <div className="qo-card-header">
                <div>
                  <h2 id="admin-panel-heading" className="qo-card-title">
                    User Administration &amp; Identity Provisioning
                  </h2>
                  <p
                    style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--qo-slate-500)' }}
                  >
                    Manage authorized users, role assignments, and authentication status.
                  </p>
                </div>
              </div>

              <div className="qo-card-body">
                {/* Provision New User Form with strict autofill protection */}
                <form
                  onSubmit={handleCreateUser}
                  autoComplete="off"
                  style={{
                    backgroundColor: 'var(--qo-slate-50)',
                    border: '1px solid var(--qo-slate-200)',
                    borderRadius: 'var(--qo-radius-lg)',
                    padding: '20px',
                    marginBottom: '24px',
                  }}
                >
                  <h3
                    style={{
                      margin: '0 0 14px 0',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: 'var(--qo-navy-900)',
                    }}
                  >
                    Provision New User Account
                  </h3>
                  {provisionMessage && (
                    <div
                      role="status"
                      className={`qo-alert-banner ${
                        provisionMessage.includes('successfully')
                          ? 'qo-alert-success'
                          : 'qo-alert-danger'
                      }`}
                    >
                      {provisionMessage}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '14px',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <label htmlFor="admin-new-username" className="qo-form-label">
                        Username *
                      </label>
                      <input
                        id="admin-new-username"
                        name="new-username-field"
                        type="text"
                        required
                        autoComplete="off"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="qo-form-control"
                        placeholder="e.g. jdoe"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-new-email" className="qo-form-label">
                        Email Address *
                      </label>
                      <input
                        id="admin-new-email"
                        name="new-email-field"
                        type="email"
                        required
                        autoComplete="off"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="qo-form-control"
                        placeholder="e.g. jdoe@factory.local"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-new-fullname" className="qo-form-label">
                        Full Name *
                      </label>
                      <input
                        id="admin-new-fullname"
                        name="new-fullname-field"
                        type="text"
                        required
                        autoComplete="off"
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        className="qo-form-control"
                        placeholder="e.g. Jane Doe"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-new-password" className="qo-form-label">
                        Temporary Password (min 8 chars) *
                      </label>
                      <input
                        id="admin-new-password"
                        name="new-user-temporary-password"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="qo-form-control"
                        placeholder="Min 8 characters"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-new-role" className="qo-form-label">
                        Initial Role Assignment *
                      </label>
                      <select
                        id="admin-new-role"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as CanonicalRole)}
                        className="qo-form-control"
                      >
                        <option value="VIEWER">VIEWER</option>
                        <option value="OPERATOR">OPERATOR</option>
                        <option value="INSPECTOR">INSPECTOR</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="QUALITY_MANAGER">QUALITY_MANAGER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" disabled={isProvisioning} className="qo-btn qo-btn-primary">
                    {isProvisioning ? 'Creating Account...' : 'Provision User'}
                  </button>
                </form>

                {/* User List Table */}
                <h3
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--qo-navy-900)',
                  }}
                >
                  Authorized Users Repository
                </h3>
                {isLoadingUsers && (
                  <p style={{ fontSize: '13px', color: 'var(--qo-slate-500)' }}>Loading users...</p>
                )}
                {userError && (
                  <div role="alert" className="qo-alert-banner qo-alert-danger">
                    {userError}
                  </div>
                )}
                {!isLoadingUsers && (
                  <div className="qo-table-responsive">
                    <table className="qo-table">
                      <thead>
                        <tr>
                          <th>Username</th>
                          <th>Full Name</th>
                          <th>Email Address</th>
                          <th>Assigned Roles</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td style={{ fontWeight: 600 }}>{u.username}</td>
                            <td>{u.fullName}</td>
                            <td>{u.email}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {u.roles.map((r) => (
                                  <span key={r} className="qo-badge qo-badge-neutral">
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span
                                className={`qo-badge ${
                                  u.isActive ? 'qo-badge-success' : 'qo-badge-critical'
                                }`}
                              >
                                {u.isActive ? 'ACTIVE' : 'DISABLED'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="qo-card" style={{ padding: '24px' }}>
              <h2 style={{ marginTop: 0, fontSize: '16px', color: 'var(--qo-navy-900)' }}>
                Standard User Access
              </h2>
              <p style={{ margin: 0, color: 'var(--qo-slate-600)' }}>
                You are logged in with role(s): <strong>{user.roles.join(', ')}</strong>. Access to
                user administration is restricted to users with the <code>ADMIN</code> role.
              </p>
            </div>
          )}

          {/* Clean Enterprise Footer */}
          <footer
            style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '1px solid var(--qo-slate-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              fontSize: '12.5px',
              color: 'var(--qo-slate-500)',
            }}
          >
            <div>
              &copy; {new Date().getFullYear()} QualityOps &bull; Manufacturing Quality &amp;
              Process Analytics
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span>Protected with Argon2id</span>
              <span>Secure Session Token Handling</span>
            </div>
          </footer>
        </main>
      </div>

      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onNavigate={(sec) => handleNavClick(sec)}
        onUnreadCountChange={(cnt) => setUnreadNotificationCount(cnt)}
      />
    </div>
  );
};

export default AuthenticatedView;
