import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  OperationalAlert,
  AlertStatus,
  AlertSeverity,
  AlertRuleType,
  AlertEvaluationResult,
} from '@qualityops/contracts';

export const AlertsView: React.FC = () => {
  const { accessToken, user } = useAuth();
  const canEvaluate = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');
  const canManageAlerts =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('QUALITY_MANAGER') ||
    user?.roles.includes('OPERATOR');

  // Filters
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'ALL'>('ALL');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<AlertRuleType | 'ALL'>('ALL');

  // Data & State
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Evaluation state
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evalResult, setEvalResult] = useState<AlertEvaluationResult | null>(null);

  // Resolution modal state
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<OperationalAlert | null>(
    null,
  );
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isSubmittingResolve, setIsSubmittingResolve] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Acknowledging state
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (severityFilter !== 'ALL') params.append('severity', severityFilter);
      if (ruleTypeFilter !== 'ALL') params.append('ruleType', ruleTypeFilter);
      params.append('limit', '100');

      const url = `/api/v1/alerts${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load alerts: ${res.statusText}`);
      }

      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error fetching alerts');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, statusFilter, severityFilter, ruleTypeFilter]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  // Evaluate Alerts Now
  const handleEvaluateNow = async () => {
    if (!accessToken || !canEvaluate) return;
    setIsEvaluating(true);
    setEvalResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/alerts/evaluate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to evaluate alerts: ${res.statusText}`);
      }

      const result: AlertEvaluationResult = await res.json();
      setEvalResult(result);
      await fetchAlerts();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error running alert evaluation');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Acknowledge Alert
  const handleAcknowledge = async (alertId: string) => {
    if (!accessToken || !canManageAlerts) return;
    setAcknowledgingId(alertId);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to acknowledge alert: ${res.statusText}`);
      }

      await fetchAlerts();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error acknowledging alert');
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Open Resolve Modal
  const handleOpenResolveModal = (alert: OperationalAlert) => {
    setSelectedAlertForResolve(alert);
    setResolutionNotes('');
    setResolveError(null);
  };

  // Submit Resolution
  const handleSubmitResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlertForResolve || !accessToken || !canManageAlerts) return;

    if (!resolutionNotes.trim()) {
      setResolveError('Resolution notes are mandatory to resolve an alert.');
      return;
    }

    setIsSubmittingResolve(true);
    setResolveError(null);

    try {
      const res = await fetch(`/api/v1/alerts/${selectedAlertForResolve.id}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolutionNotes: resolutionNotes.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || `Failed to resolve alert: ${res.statusText}`);
      }

      setSelectedAlertForResolve(null);
      setResolutionNotes('');
      await fetchAlerts();
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : 'Failed to resolve alert');
    } finally {
      setIsSubmittingResolve(false);
    }
  };

  // KPI Calculations
  const totalActive = alerts.filter(
    (a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED',
  ).length;
  const totalOpen = alerts.filter((a) => a.status === 'OPEN').length;
  const criticalHighCount = alerts.filter(
    (a) => (a.severity === 'CRITICAL' || a.severity === 'HIGH') && a.status !== 'RESOLVED',
  ).length;
  const totalResolved = alerts.filter((a) => a.status === 'RESOLVED').length;

  const getSeverityStyle = (sev: AlertSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return { bg: '#fff5f5', color: '#9b2c2c', border: '#feb2b2' };
      case 'HIGH':
        return { bg: '#fffaf0', color: '#c05621', border: '#fbd38d' };
      case 'MEDIUM':
        return { bg: '#fffff0', color: '#b7791f', border: '#faf089' };
      case 'LOW':
      default:
        return { bg: '#ebf8ff', color: '#2b6cb0', border: '#bee3f8' };
    }
  };

  const getStatusStyle = (status: AlertStatus) => {
    switch (status) {
      case 'OPEN':
        return { bg: '#fed7d7', color: '#9b2c2c' };
      case 'ACKNOWLEDGED':
        return { bg: '#feebc8', color: '#c05621' };
      case 'RESOLVED':
        return { bg: '#c6f6d5', color: '#22543d' };
    }
  };

  const formatRuleName = (rule: AlertRuleType) => {
    switch (rule) {
      case 'HIGH_INSPECTION_FAILURE_RATE':
        return 'Inspection Failure Rate';
      case 'OVERDUE_CAPA':
        return 'Overdue CAPA Action';
      case 'SPC_OUT_OF_CONTROL':
        return 'SPC Out-of-Control Rule 1';
    }
  };

  return (
    <section aria-labelledby="alerts-heading" style={{ marginTop: '12px' }}>
      {/* Title & Description */}
      <div style={{ marginBottom: '20px' }}>
        <h2 id="alerts-heading" style={{ fontSize: '20px', margin: '0 0 6px 0', color: '#2d3748' }}>
          Operational Alerts &amp; Exception Monitoring
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#718096' }}>
          Real-time exception surveillance across quality inspections, overdue CAPA remediation
          SLAs, and SPC statistical process control violations with automated fingerprint
          deduplication.
        </p>
      </div>

      {/* KPI Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#718096',
              textTransform: 'uppercase',
            }}
          >
            Active Exceptions
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#2d3748', marginTop: '4px' }}>
            {totalActive}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>
            Open + Acknowledged
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#e53e3e',
              textTransform: 'uppercase',
            }}
          >
            Unacknowledged
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#e53e3e', marginTop: '4px' }}>
            {totalOpen}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>
            Requires immediate triage
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#dd6b20',
              textTransform: 'uppercase',
            }}
          >
            Critical &amp; High
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#dd6b20', marginTop: '4px' }}>
            {criticalHighCount}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>
            Active high-impact alerts
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#38a169',
              textTransform: 'uppercase',
            }}
          >
            Resolved (Archive)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#38a169', marginTop: '4px' }}>
            {totalResolved}
          </div>
          <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '2px' }}>
            Documented remediation
          </div>
        </div>
      </div>

      {/* Filter and Trigger Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: '#f7fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div>
            <label
              htmlFor="alert-status-filter"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#4a5568',
                marginBottom: '4px',
              }}
            >
              Status:
            </label>
            <select
              id="alert-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AlertStatus | 'ALL')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '13px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open (Unacknowledged)</option>
              <option value="ACKNOWLEDGED">Acknowledged</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="alert-severity-filter"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#4a5568',
                marginBottom: '4px',
              }}
            >
              Severity:
            </label>
            <select
              id="alert-severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | 'ALL')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '13px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="alert-rule-filter"
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: '#4a5568',
                marginBottom: '4px',
              }}
            >
              Rule Type:
            </label>
            <select
              id="alert-rule-filter"
              value={ruleTypeFilter}
              onChange={(e) => setRuleTypeFilter(e.target.value as AlertRuleType | 'ALL')}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '13px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="ALL">All Rule Types</option>
              <option value="HIGH_INSPECTION_FAILURE_RATE">Inspection Failure Rate</option>
              <option value="OVERDUE_CAPA">Overdue CAPA Action</option>
              <option value="SPC_OUT_OF_CONTROL">SPC Out-of-Control</option>
            </select>
          </div>
        </div>

        {canEvaluate && (
          <button
            onClick={() => void handleEvaluateNow()}
            disabled={isEvaluating}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: isEvaluating ? '#a0aec0' : '#805ad5',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isEvaluating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isEvaluating ? 'Evaluating Rules...' : '⚡ Evaluate Alerts Now'}
          </button>
        )}
      </div>

      {/* Evaluation Result Banner */}
      {evalResult && (
        <div
          style={{
            backgroundColor: '#f0fff4',
            border: '1px solid #9ae6b4',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#22543d',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <strong>Evaluation Completed:</strong> Evaluated {evalResult.evaluatedRules} rules
            &bull; <strong>{evalResult.alertsGenerated}</strong> new alerts generated &bull;{' '}
            <strong>{evalResult.alertsSkipped}</strong> active duplicates skipped.
            {evalResult.errors.length > 0 && (
              <span style={{ color: '#c53030', marginLeft: '8px' }}>
                ({evalResult.errors.length} rule evaluation warnings)
              </span>
            )}
          </div>
          <button
            onClick={() => setEvalResult(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#718096',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#fff5f5',
            border: '1px solid #feb2b2',
            color: '#c53030',
            borderRadius: '6px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Alerts Table */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#718096', fontSize: '14px' }}>
            Loading alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#718096' }}>
            <div
              style={{ fontSize: '18px', fontWeight: 600, color: '#4a5568', marginBottom: '8px' }}
            >
              No Operational Alerts Found
            </div>
            <p style={{ margin: 0, fontSize: '14px' }}>
              All quality inspections, CAPA milestones, and statistical process controls are within
              operational tolerances.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: '#f7fafc',
                    borderBottom: '2px solid #edf2f7',
                    color: '#4a5568',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>Severity</th>
                  <th style={{ padding: '12px 16px' }}>Rule Type</th>
                  <th style={{ padding: '12px 16px' }}>Alert Details</th>
                  <th style={{ padding: '12px 16px' }}>Triggered At</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => {
                  const sevStyle = getSeverityStyle(alert.severity);
                  const statStyle = getStatusStyle(alert.status);

                  return (
                    <tr
                      key={alert.id}
                      style={{
                        borderBottom: '1px solid #edf2f7',
                        backgroundColor: alert.status === 'OPEN' ? '#fffdfa' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: sevStyle.bg,
                            color: sevStyle.color,
                            border: `1px solid ${sevStyle.border}`,
                          }}
                        >
                          {alert.severity}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: '#2d3748' }}>
                          {formatRuleName(alert.ruleType)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
                          Entity: {alert.entityType}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top', maxWidth: '380px' }}>
                        <div style={{ fontWeight: 600, color: '#1a202c', marginBottom: '2px' }}>
                          {alert.title}
                        </div>
                        <div style={{ color: '#4a5568', lineHeight: 1.4 }}>{alert.message}</div>
                        {alert.status === 'RESOLVED' && alert.resolutionNotes && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '6px 8px',
                              backgroundColor: '#f0fff4',
                              borderLeft: '3px solid #38a169',
                              fontSize: '11px',
                              color: '#22543d',
                            }}
                          >
                            <strong>Resolution:</strong> {alert.resolutionNotes}
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: '10px',
                            color: '#a0aec0',
                            marginTop: '4px',
                            fontFamily: 'monospace',
                          }}
                        >
                          Fingerprint: {alert.fingerprint.slice(0, 32)}...
                        </div>
                      </td>

                      <td
                        style={{
                          padding: '12px 16px',
                          verticalAlign: 'top',
                          whiteSpace: 'nowrap',
                          color: '#718096',
                        }}
                      >
                        {new Date(alert.createdAt).toLocaleString()}
                      </td>

                      <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: statStyle.bg,
                            color: statStyle.color,
                          }}
                        >
                          {alert.status}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '12px 16px',
                          verticalAlign: 'top',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {canManageAlerts && (
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            {alert.status === 'OPEN' && (
                              <button
                                onClick={() => void handleAcknowledge(alert.id)}
                                disabled={acknowledgingId === alert.id}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  border: '1px solid #cbd5e0',
                                  backgroundColor: '#ffffff',
                                  color: '#2b6cb0',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: acknowledgingId === alert.id ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {acknowledgingId === alert.id ? 'Saving...' : 'Acknowledge'}
                              </button>
                            )}

                            {alert.status !== 'RESOLVED' && (
                              <button
                                onClick={() => handleOpenResolveModal(alert)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  backgroundColor: '#38a169',
                                  color: '#ffffff',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Resolve
                              </button>
                            )}

                            {alert.status === 'RESOLVED' && (
                              <span style={{ fontSize: '12px', color: '#38a169', fontWeight: 600 }}>
                                ✓ Closed
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {selectedAlertForResolve && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
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
              padding: '24px',
              maxWidth: '520px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ fontSize: '18px', margin: '0 0 12px 0', color: '#2d3748' }}>
              Resolve Operational Alert
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#718096' }}>
              Please provide mandatory documented resolution notes explaining root causes
              investigated or corrective actions executed before closing this alert.
            </p>

            <div
              style={{
                backgroundColor: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <div>
                <strong>Alert:</strong> {selectedAlertForResolve.title}
              </div>
              <div style={{ color: '#718096', fontSize: '12px', marginTop: '2px' }}>
                Rule: {formatRuleName(selectedAlertForResolve.ruleType)} &bull; Entity:{' '}
                {selectedAlertForResolve.entityType}
              </div>
            </div>

            {resolveError && (
              <div
                style={{
                  backgroundColor: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '14px',
                  fontSize: '12px',
                }}
              >
                {resolveError}
              </div>
            )}

            <form onSubmit={(e) => void handleSubmitResolve(e)}>
              <label
                htmlFor="resolution-notes-input"
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4a5568',
                  marginBottom: '6px',
                }}
              >
                Resolution Notes (Mandatory) *
              </label>
              <textarea
                id="resolution-notes-input"
                rows={4}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Defect containment completed on Line 1. Maintenance recalibrated sealing heads. Sample defect rate dropped back below threshold."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  marginBottom: '20px',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedAlertForResolve(null)}
                  disabled={isSubmittingResolve}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResolve}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: isSubmittingResolve ? '#a0aec0' : '#38a169',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSubmittingResolve ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmittingResolve ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
