import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserResponse, CanonicalRole } from '@qualityops/contracts';
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

export const AuthenticatedView: React.FC = () => {
  const { user, accessToken, logout } = useAuth();
  const isAdmin = user?.roles.includes('ADMIN');

  const [activeSection, setActiveSection] = useState<
    | 'reports'
    | 'alerts'
    | 'spc'
    | 'capa'
    | 'defects'
    | 'inspections'
    | 'batches'
    | 'downtime'
    | 'master-data'
    | 'users'
  >('reports');

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

  return (
    <section
      aria-labelledby="authenticated-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* Top Session Control Header */}
      <div
        className="qo-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          backgroundColor: 'var(--qo-white)',
          borderLeft: '4px solid var(--qo-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: 'var(--qo-navy-900)',
              color: 'var(--qo-white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: 'var(--qo-shadow-xs)',
            }}
          >
            {initials}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2
                id="authenticated-heading"
                style={{
                  fontSize: '16px',
                  margin: 0,
                  fontWeight: 700,
                  color: 'var(--qo-navy-900)',
                }}
              >
                Authenticated Session Active
              </h2>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                }}
                title="Active Session"
              />
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--qo-slate-600)' }}>
              Signed in as <strong>{user.fullName}</strong> ({user.username}) &bull; Roles:{' '}
              <strong>{user.roles.join(', ')}</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={() => setIsNotificationCenterOpen(true)}
            aria-label={`Notifications (${unreadNotificationCount} unread)`}
            className="qo-btn qo-btn-secondary"
            style={{
              position: 'relative',
              padding: '8px 14px',
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '14px' }}>
              🔔
            </span>
            <span>Notifications</span>
            {unreadNotificationCount > 0 && (
              <span
                className="qo-badge qo-badge-critical"
                style={{
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  borderRadius: 'var(--qo-radius-pill)',
                }}
              >
                {unreadNotificationCount}
              </span>
            )}
          </button>
          <button
            onClick={() => void logout()}
            className="qo-btn qo-btn-danger"
            style={{
              padding: '8px 14px',
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Security Architecture Summary */}
      <div
        className="qo-alert-banner qo-alert-info"
        style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
      >
        <span aria-hidden="true" style={{ fontSize: '15px' }}>
          🔒
        </span>
        <div style={{ fontSize: '12px' }}>
          <strong>Security Architecture:</strong> JWT access token is kept in-memory only (React
          state). Refresh credentials are saved in HttpOnly, SameSite=Lax/Strict cookies and rotated
          on every use. Local/session storage is not used for credentials.
        </div>
      </div>

      {/* Top Section Navigation */}
      <nav
        aria-label="Application Sections"
        className="qo-card"
        style={{
          padding: '8px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          backgroundColor: 'var(--qo-white)',
        }}
      >
        <button
          onClick={() => setActiveSection('reports')}
          className={`qo-nav-item-btn ${activeSection === 'reports' ? 'active' : ''}`}
        >
          <span>📊</span>
          <span>Reports &amp; Exports</span>
        </button>

        <button
          onClick={() => setActiveSection('alerts')}
          className={`qo-nav-item-btn ${activeSection === 'alerts' ? 'active' : ''}`}
        >
          <span>⚡</span>
          <span>Operational Alerts</span>
        </button>

        <button
          onClick={() => setActiveSection('spc')}
          className={`qo-nav-item-btn ${activeSection === 'spc' ? 'active' : ''}`}
        >
          <span>📈</span>
          <span>SPC Monitoring</span>
        </button>

        <button
          onClick={() => setActiveSection('capa')}
          className={`qo-nav-item-btn ${activeSection === 'capa' ? 'active' : ''}`}
        >
          <span>🎯</span>
          <span>CAPA Management</span>
        </button>

        <button
          onClick={() => setActiveSection('defects')}
          className={`qo-nav-item-btn ${activeSection === 'defects' ? 'active' : ''}`}
        >
          <span>🔍</span>
          <span>Defect Management</span>
        </button>

        <button
          onClick={() => setActiveSection('inspections')}
          className={`qo-nav-item-btn ${activeSection === 'inspections' ? 'active' : ''}`}
        >
          <span>📋</span>
          <span>Quality Inspections</span>
        </button>

        <button
          onClick={() => setActiveSection('batches')}
          className={`qo-nav-item-btn ${activeSection === 'batches' ? 'active' : ''}`}
        >
          <span>📦</span>
          <span>Production Batches</span>
        </button>

        <button
          onClick={() => setActiveSection('downtime')}
          className={`qo-nav-item-btn ${activeSection === 'downtime' ? 'active' : ''}`}
        >
          <span>⏱️</span>
          <span>Downtime Events</span>
        </button>

        <button
          onClick={() => setActiveSection('master-data')}
          className={`qo-nav-item-btn ${activeSection === 'master-data' ? 'active' : ''}`}
        >
          <span>⚙️</span>
          <span>Master Data</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveSection('users')}
            className={`qo-nav-item-btn ${activeSection === 'users' ? 'active' : ''}`}
          >
            <span>👥</span>
            <span>User Administration</span>
          </button>
        )}
      </nav>

      {/* Main Section Content View */}
      <div style={{ minHeight: '400px' }}>
        {activeSection === 'reports' ? (
          <ReportsView />
        ) : activeSection === 'alerts' ? (
          <AlertsView />
        ) : activeSection === 'spc' ? (
          <SpcMonitoringView />
        ) : activeSection === 'capa' ? (
          <CapaManagementView />
        ) : activeSection === 'defects' ? (
          <QualityDefectsView />
        ) : activeSection === 'inspections' ? (
          <QualityInspectionsView />
        ) : activeSection === 'batches' ? (
          <ProductionBatchesView />
        ) : activeSection === 'downtime' ? (
          <DowntimeView />
        ) : activeSection === 'master-data' ? (
          <MasterDataView />
        ) : isAdmin ? (
          <section aria-labelledby="admin-panel-heading" className="qo-card">
            <div className="qo-card-header">
              <h3 id="admin-panel-heading" className="qo-card-title">
                Admin User Administration (Role: ADMIN)
              </h3>
            </div>

            <div className="qo-card-body">
              {/* New User Provisioning Form */}
              <form
                onSubmit={handleCreateUser}
                style={{
                  backgroundColor: 'var(--qo-slate-50)',
                  border: '1px solid var(--qo-slate-200)',
                  borderRadius: 'var(--qo-radius-lg)',
                  padding: '20px',
                  marginBottom: '24px',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 14px 0',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--qo-navy-900)',
                  }}
                >
                  Provision New User
                </h4>
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
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '14px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <label htmlFor="admin-username" className="qo-form-label">
                      Username
                    </label>
                    <input
                      id="admin-username"
                      type="text"
                      required
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      className="qo-form-control"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-email" className="qo-form-label">
                      Email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="qo-form-control"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-fullname" className="qo-form-label">
                      Full Name
                    </label>
                    <input
                      id="admin-fullname"
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      className="qo-form-control"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-password" className="qo-form-label">
                      Temporary Password (min 8 chars)
                    </label>
                    <input
                      id="admin-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="qo-form-control"
                    />
                  </div>
                  <div>
                    <label htmlFor="admin-role" className="qo-form-label">
                      Initial Role
                    </label>
                    <select
                      id="admin-role"
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
                  {isProvisioning ? 'Creating...' : 'Create User'}
                </button>
              </form>

              {/* User Table */}
              <h4
                style={{
                  margin: '0 0 12px 0',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--qo-navy-900)',
                }}
              >
                Existing Users
              </h4>
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
                        <th>Name</th>
                        <th>Email</th>
                        <th>Roles</th>
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
            <h3 style={{ marginTop: 0, fontSize: '16px', color: 'var(--qo-navy-900)' }}>
              Standard User Access
            </h3>
            <p style={{ margin: 0, color: 'var(--qo-slate-600)' }}>
              You are logged in with role(s): <strong>{user.roles.join(', ')}</strong>. Access to
              user administration is restricted to users with the <code>ADMIN</code> role.
            </p>
          </div>
        )}
      </div>

      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onNavigate={(sec) => setActiveSection(sec)}
        onUnreadCountChange={(cnt) => setUnreadNotificationCount(cnt)}
      />
    </section>
  );
};

export default AuthenticatedView;
