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
        notifications: NotificationResponse[];
        total: number;
        unreadCount: number;
      };

      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      if (onUnreadCountChange) {
        onUnreadCountChange(data.unreadCount);
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

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return { bg: '#fed7d7', text: '#9b2c2c', border: '#feb2b2' };
      case 'HIGH':
        return { bg: '#feebc8', text: '#9c4221', border: '#fbd38d' };
      case 'MEDIUM':
        return { bg: '#fefcbf', text: '#744210', border: '#faf089' };
      case 'LOW':
        return { bg: '#e2e8f0', text: '#4a5568', border: '#cbd5e0' };
      default:
        return { bg: '#ebf8ff', text: '#2b6cb0', border: '#bee3f8' };
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Notification Center"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#1a202c' }}>Notifications</h3>
            <span style={{ fontSize: '13px', color: '#718096' }}>
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button
                onClick={() => void handleMarkAllAsRead()}
                disabled={isMarkingAll}
                style={{
                  fontSize: '12px',
                  padding: '6px 12px',
                  backgroundColor: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  borderRadius: '4px',
                  cursor: isMarkingAll ? 'not-allowed' : 'pointer',
                  color: '#4a5568',
                  fontWeight: 600,
                }}
              >
                {isMarkingAll ? 'Marking...' : 'Mark all as read'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                lineHeight: 1,
                cursor: 'pointer',
                color: '#718096',
                padding: '4px 8px',
              }}
            >
              &times;
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            padding: '8px 20px',
            backgroundColor: '#f7fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            onClick={() => setUnreadOnly(false)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: !unreadOnly ? 600 : 400,
              backgroundColor: !unreadOnly ? '#3182ce' : 'transparent',
              color: !unreadOnly ? '#ffffff' : '#4a5568',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            All
          </button>
          <button
            onClick={() => setUnreadOnly(true)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: unreadOnly ? 600 : 400,
              backgroundColor: unreadOnly ? '#3182ce' : 'transparent',
              color: unreadOnly ? '#ffffff' : '#4a5568',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Unread Only ({unreadCount})
          </button>
        </div>

        {/* Body content */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {isLoading ? (
            <div
              role="status"
              style={{ textAlign: 'center', padding: '32px', color: '#718096', fontSize: '14px' }}
            >
              Loading notifications...
            </div>
          ) : error ? (
            <div
              role="alert"
              style={{
                backgroundColor: '#fff5f5',
                border: '1px solid #feb2b2',
                color: '#c53030',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              {error}
              <button
                onClick={() => void fetchNotifications()}
                style={{
                  display: 'block',
                  marginTop: '8px',
                  backgroundColor: '#c53030',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div
              style={{ textAlign: 'center', padding: '36px', color: '#718096', fontSize: '14px' }}
            >
              No {unreadOnly ? 'unread ' : ''}notifications found.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notifications.map((n) => {
                const isUnread = !n.readAt;
                const style = getSeverityStyle(n.severity);
                return (
                  <li
                    key={n.id}
                    style={{
                      borderBottom: '1px solid #edf2f7',
                      padding: '12px 0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      backgroundColor: isUnread ? '#f7fafc' : 'transparent',
                      paddingLeft: isUnread ? '8px' : '0',
                      borderLeft: isUnread ? '3px solid #3182ce' : 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: style.bg,
                            color: style.text,
                            border: `1px solid ${style.border}`,
                          }}
                        >
                          {n.severity}
                        </span>
                        {n.channel && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#718096',
                              backgroundColor: '#edf2f7',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {n.channel}
                          </span>
                        )}
                        <strong style={{ fontSize: '14px', color: '#2d3748' }}>{n.title}</strong>
                      </div>
                      <span style={{ fontSize: '12px', color: '#a0aec0' }}>
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p style={{ margin: '4px 0', fontSize: '13px', color: '#4a5568' }}>
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
                            color: '#3182ce',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
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
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            cursor: markingId === n.id ? 'not-allowed' : 'pointer',
                            color: '#4a5568',
                          }}
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
