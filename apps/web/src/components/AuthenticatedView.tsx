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

  return (
    <section aria-labelledby="authenticated-heading">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#ebf8ff',
          border: '1px solid #bee3f8',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h2
            id="authenticated-heading"
            style={{ fontSize: '18px', margin: '0 0 4px 0', color: '#2b6cb0' }}
          >
            Authenticated Session Active
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#4a5568' }}>
            Signed in as <strong>{user.fullName}</strong> ({user.username}) &bull; Roles:{' '}
            <strong>{user.roles.join(', ')}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => setIsNotificationCenterOpen(true)}
            aria-label={`Notifications (${unreadNotificationCount} unread)`}
            style={{
              position: 'relative',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#2d3748',
              fontWeight: 600,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '15px' }}>
              🔔
            </span>
            <span>Notifications</span>
            {unreadNotificationCount > 0 && (
              <span
                style={{
                  backgroundColor: '#e53e3e',
                  color: '#ffffff',
                  borderRadius: '9999px',
                  padding: '2px 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {unreadNotificationCount}
              </span>
            )}
          </button>
          <button
            onClick={() => void logout()}
            style={{
              backgroundColor: '#e53e3e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#f7fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
          fontSize: '13px',
          color: '#718096',
        }}
      >
        <strong>Security Architecture:</strong> JWT access token is kept in-memory only (React
        state). Refresh credentials are saved in HttpOnly, SameSite=Lax/Strict cookies and rotated
        on every use. Local/session storage is not used for credentials.
      </div>

      {/* Top Section Navigation */}
      <nav
        aria-label="Application Sections"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={() => setActiveSection('reports')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'reports' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'reports' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'reports' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Reports &amp; Exports
        </button>

        <button
          onClick={() => setActiveSection('alerts')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'alerts' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'alerts' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'alerts' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Operational Alerts
        </button>

        <button
          onClick={() => setActiveSection('spc')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'spc' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'spc' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'spc' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          SPC Monitoring
        </button>

        <button
          onClick={() => setActiveSection('capa')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'capa' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'capa' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'capa' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          CAPA Management
        </button>

        <button
          onClick={() => setActiveSection('defects')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'defects' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'defects' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'defects' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Defect Management
        </button>

        <button
          onClick={() => setActiveSection('inspections')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'inspections' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'inspections' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'inspections' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Quality Inspections
        </button>

        <button
          onClick={() => setActiveSection('batches')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'batches' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'batches' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'batches' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Production Batches
        </button>

        <button
          onClick={() => setActiveSection('downtime')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'downtime' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'downtime' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'downtime' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Downtime Events
        </button>

        <button
          onClick={() => setActiveSection('master-data')}
          style={{
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeSection === 'master-data' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            backgroundColor: activeSection === 'master-data' ? '#ebf8ff' : '#ffffff',
            color: activeSection === 'master-data' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          Master Data
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveSection('users')}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: activeSection === 'users' ? '2px solid #3182ce' : '1px solid #cbd5e0',
              backgroundColor: activeSection === 'users' ? '#ebf8ff' : '#ffffff',
              color: activeSection === 'users' ? '#2b6cb0' : '#4a5568',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            User Administration
          </button>
        )}
      </nav>

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
        <section
          aria-labelledby="admin-panel-heading"
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#ffffff',
          }}
        >
          <h3 id="admin-panel-heading" style={{ marginTop: 0, fontSize: '18px', color: '#2d3748' }}>
            Admin User Administration (Role: ADMIN)
          </h3>

          {/* New User Provisioning Form */}
          <form
            onSubmit={handleCreateUser}
            style={{
              backgroundColor: '#f7fafc',
              border: '1px solid #edf2f7',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <h4 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Provision New User</h4>
            {provisionMessage && (
              <div
                role="status"
                style={{
                  padding: '8px 12px',
                  marginBottom: '12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  backgroundColor: provisionMessage.includes('successfully')
                    ? '#c6f6d5'
                    : '#fed7d7',
                  color: provisionMessage.includes('successfully') ? '#22543d' : '#742a2a',
                }}
              >
                {provisionMessage}
              </div>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <div>
                <label
                  htmlFor="admin-username"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-email"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-fullname"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Full Name
                </label>
                <input
                  id="admin-fullname"
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-password"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Temporary Password (min 8 chars)
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="admin-role"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Initial Role
                </label>
                <select
                  id="admin-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as CanonicalRole)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
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
            <button
              type="submit"
              disabled={isProvisioning}
              style={{
                backgroundColor: '#38a169',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isProvisioning ? 'not-allowed' : 'pointer',
              }}
            >
              {isProvisioning ? 'Creating...' : 'Create User'}
            </button>
          </form>

          {/* User Table */}
          <h4 style={{ margin: '0 0 10px 0', fontSize: '15px' }}>Existing Users</h4>
          {isLoadingUsers && <p style={{ fontSize: '13px', color: '#718096' }}>Loading users...</p>}
          {userError && <p style={{ fontSize: '13px', color: '#e53e3e' }}>{userError}</p>}
          {!isLoadingUsers && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                    Username
                  </th>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Name</th>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Email</th>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Roles</th>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{u.username}</td>
                    <td style={{ padding: '8px 12px' }}>{u.fullName}</td>
                    <td style={{ padding: '8px 12px' }}>{u.email}</td>
                    <td style={{ padding: '8px 12px' }}>{u.roles.join(', ')}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          backgroundColor: u.isActive ? '#c6f6d5' : '#fed7d7',
                          color: u.isActive ? '#22543d' : '#742a2a',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {u.isActive ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#ffffff',
            color: '#4a5568',
            fontSize: '14px',
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '16px', color: '#2d3748' }}>Standard User Access</h3>
          <p style={{ margin: 0 }}>
            You are logged in with role(s): <strong>{user.roles.join(', ')}</strong>. Access to user
            administration is restricted to users with the <code>ADMIN</code> role.
          </p>
        </div>
      )}
      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        onNavigate={(sec) => setActiveSection(sec)}
        onUnreadCountChange={(cnt) => setUnreadNotificationCount(cnt)}
      />
    </section>
  );
};
