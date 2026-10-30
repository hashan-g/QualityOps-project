import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type { NotificationResponse } from '@qualityops/contracts';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (
    section:
      | 'reports'
      | 'alerts'
      | 'spc'
      | 'capa'
      | 'defects'
      | 'inspections'
      | 'batches'
      | 'downtime'
      | 'master-data'
      | 'users',
  ) => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onUnreadCountChange,
}) => {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<NotificationResponse[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        limit: '30',
        offset: '0',
      });
      if (unreadOnly) {
        query.set('unreadOnly', 'true');
      }

      const res = await fetch(`/api/v1/notifications?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load notifications: ${res.statusText}`);
      }

      const data = (await res.json()) as {
        items?: NotificationResponse[];
        notifications?: NotificationResponse[];
        total?: number;
        unreadCount?: number;
      };

      const itemsList = data.items || data.notifications || [];
      setNotifications(itemsList);
      const count = data.unreadCount ?? 0;
      setUnreadCount(count);
      if (onUnreadCountChange) {
        onUnreadCountChange(count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error loading notifications');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, unreadOnly, onUnreadCountChange]);

  useEffect(() => {
    if (isOpen) {
      void fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    if (!accessToken) return;
    setMarkingId(id);
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to mark notification as read');
      }

      // Update locally
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        if (onUnreadCountChange) onUnreadCountChange(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification');
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!accessToken) return;
    setIsMarkingAll(true);
    try {
      const res = await fetch('/api/v1/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to mark all notifications as read');
      }

      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      if (onUnreadCountChange) {
        onUnreadCountChange(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark all as read');
    } finally {
      setIsMarkingAll(false);
    }
  };

  const handleNotificationClick = (n: NotificationResponse) => {
    if (!n.readAt) {
      void handleMarkAsRead(n.id);
    }

    if (n.entityType === 'OPERATIONAL_ALERT') {
      onNavigate('alerts');
      onClose();
    } else if (n.entityType === 'REPORT_RUN' || n.entityType === 'SCHEDULED_REPORT') {
      onNavigate('reports');
      onClose();
    } else if (n.entityType === 'CAPA_CASE') {
      onNavigate('capa');
      onClose();
    } else if (n.entityType === 'QUALITY_INSPECTION') {
      onNavigate('inspections');
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'qo-badge-critical';
      case 'HIGH':
        return 'qo-badge-high';
      case 'MEDIUM':
        return 'qo-badge-medium';
      case 'LOW':
        return 'qo-badge-low';
      default:
        return 'qo-badge-neutral';
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Notification Center"
      aria-modal="true"
      className="qo-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="qo-modal-panel"
        style={{
          maxWidth: '580px',
        }}
      >
        {/* Header */}
        <div className="qo-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true" style={{ fontSize: '18px' }}>
              🔔
            </span>
            <div>
              <h3 className="qo-modal-title" style={{ fontSize: '16px' }}>
                Notifications
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllAsRead()}
                disabled={isMarkingAll}
                className="qo-btn qo-btn-secondary qo-btn-sm"
              >
                {isMarkingAll ? 'Marking...' : 'Mark all as read'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="qo-btn qo-btn-ghost qo-btn-sm"
              style={{ fontSize: '18px', padding: '4px 8px', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            padding: '8px 20px',
            backgroundColor: 'var(--qo-slate-50)',
            borderBottom: '1px solid var(--qo-slate-200)',
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setUnreadOnly(false)}
            className={`qo-btn qo-btn-sm ${!unreadOnly ? 'qo-btn-primary' : 'qo-btn-ghost'}`}
          >
            All
          </button>
          <button
            onClick={() => setUnreadOnly(true)}
            className={`qo-btn qo-btn-sm ${unreadOnly ? 'qo-btn-primary' : 'qo-btn-ghost'}`}
          >
            Unread Only ({unreadCount})
          </button>
        </div>

        {/* Body content */}
        <div className="qo-modal-body" style={{ padding: '16px 20px' }}>
          {isLoading ? (
            <div
              role="status"
              style={{
                textAlign: 'center',
                padding: '36px',
                color: 'var(--qo-slate-500)',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid var(--qo-slate-200)',
                  borderTopColor: 'var(--qo-primary)',
                  borderRadius: '50%',
                  animation: 'qo-spin 0.8s linear infinite',
                  margin: '0 auto 8px auto',
                }}
              />
              Loading notifications...
            </div>
          ) : error ? (
            <div role="alert" className="qo-alert-banner qo-alert-danger">
              <div>{error}</div>
              <button
                onClick={() => void fetchNotifications()}
                className="qo-btn qo-btn-danger qo-btn-sm"
                style={{ marginTop: '8px' }}
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--qo-slate-500)',
                fontSize: '13px',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📭</div>
              <div>No {unreadOnly ? 'unread ' : ''}notifications found.</div>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.map((n) => {
                const isUnread = !n.readAt;
                const badgeClass = getSeverityBadgeClass(n.severity);
                return (
                  <li
                    key={n.id}
                    style={{
                      borderBottom: '1px solid var(--qo-slate-100)',
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      backgroundColor: isUnread ? 'var(--qo-primary-subtle)' : 'transparent',
                      borderRadius: 'var(--qo-radius-md)',
                      marginBottom: '6px',
                      borderLeft: isUnread
                        ? '3px solid var(--qo-primary)'
                        : '3px solid transparent',
                      transition: 'background-color var(--qo-transition-fast)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '6px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span className={`qo-badge ${badgeClass}`}>{n.severity}</span>
                        {n.channel && (
                          <span className="qo-badge qo-badge-neutral" style={{ fontSize: '10px' }}>
                            {n.channel}
                          </span>
                        )}
                        <strong style={{ fontSize: '13px', color: 'var(--qo-navy-900)' }}>
                          {n.title}
                        </strong>
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--qo-slate-400)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--qo-slate-700)' }}>
                      {n.message}
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '4px',
                      }}
                    >
                      {n.entityType ? (
                        <button
                          onClick={() => handleNotificationClick(n)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--qo-primary)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          View related {n.entityType.replace(/_/g, ' ').toLowerCase()} &rarr;
                        </button>
                      ) : (
                        <div />
                      )}

                      {isUnread && (
                        <button
                          onClick={() => void handleMarkAsRead(n.id)}
                          disabled={markingId === n.id}
                          className="qo-btn qo-btn-secondary qo-btn-sm"
                          style={{ fontSize: '11px', padding: '3px 8px' }}
                        >
                          {markingId === n.id ? 'Updating...' : 'Mark as read'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
