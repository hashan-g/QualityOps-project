import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  ProductionBatch,
  QualityInspection,
  DefectRecord,
  CapaCase,
  OperationalAlert,
} from '@qualityops/contracts';
import {
  IconDashboard,
  IconBatches,
  IconInspections,
  IconDefects,
  IconCapa,
  IconSpc,
  IconReports,
  IconAlerts,
  IconRefresh,
  IconPlus,
  IconChevronRight,
  IconCheck,
} from './icons';

export type ActiveSection =
  | 'overview'
  | 'reports'
  | 'alerts'
  | 'spc'
  | 'capa'
  | 'defects'
  | 'inspections'
  | 'batches'
  | 'downtime'
  | 'master-data'
  | 'users';

interface OverviewDashboardProps {
  onNavigate: (section: ActiveSection) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onNavigate }) => {
  const { accessToken } = useAuth();

  // Loading and error state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Real data state
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [totalBatches, setTotalBatches] = useState<number>(0);

  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [totalInspections, setTotalInspections] = useState<number>(0);

  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [totalDefects, setTotalDefects] = useState<number>(0);

  const [capaCases, setCapaCases] = useState<CapaCase[]>([]);
  const [totalCapaCases, setTotalCapaCases] = useState<number>(0);

  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);

  // Fetch all operational summaries in parallel
  const fetchDashboardData = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${accessToken}` };

      const [batchRes, inspRes, defRes, capaRes, alertRes] = await Promise.all([
        fetch('/api/v1/production/batches?limit=5', { headers }),
        fetch('/api/v1/quality/inspections?limit=5', { headers }),
        fetch('/api/v1/quality/defects?limit=5', { headers }),
        fetch('/api/v1/quality/capa?limit=5', { headers }),
        fetch('/api/v1/alerts?limit=50', { headers }),
      ]);

      if (batchRes.ok) {
        const data = await batchRes.json();
        setBatches(data.items || []);
        setTotalBatches(data.total || (data.items ? data.items.length : 0));
      }

      if (inspRes.ok) {
        const data = await inspRes.json();
        setInspections(data.items || []);
        setTotalInspections(data.total || (data.items ? data.items.length : 0));
      }

      if (defRes.ok) {
        const data = await defRes.json();
        setDefects(data.items || []);
        setTotalDefects(data.total || (data.items ? data.items.length : 0));
      }

      if (capaRes.ok) {
        const data = await capaRes.json();
        setCapaCases(data.items || []);
        setTotalCapaCases(data.total || (data.items ? data.items.length : 0));
      }

      if (alertRes.ok) {
        const data = await alertRes.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching dashboard operational summary');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchDashboardData();
  }, [fetchDashboardData]);

  // Derived real metrics
  const activeAlerts = alerts.filter((a) => a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
  const criticalHighAlerts = activeAlerts.filter(
    (a) => a.severity === 'CRITICAL' || a.severity === 'HIGH',
  );

  const passedInspections = inspections.filter((i) => i.result === 'PASS').length;
  const inspectionPassRate =
    inspections.length > 0 ? Math.round((passedInspections / inspections.length) * 100) : null;

  const openCapa = capaCases.filter((c) => c.status !== 'CLOSED').length;
  const overdueCapa = capaCases.filter((c) => c.status !== 'CLOSED' && c.isOverdue).length;

  const inProgressBatches = batches.filter((b) => b.status === 'IN_PROGRESS').length;
  const completedBatches = batches.filter((b) => b.status === 'COMPLETED').length;

  const criticalDefects = defects.filter((d) => d.defectTypeSeverity === 'CRITICAL').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Dashboard Page Header */}
      <div className="qo-page-header">
        <div>
          <div className="qo-page-header-title-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconDashboard size={22} style={{ color: 'var(--qo-primary)', flexShrink: 0 }} />
              <h1 className="qo-page-title" style={{ margin: 0 }}>
                Overview &amp; Operational Dashboard
              </h1>
            </div>
            <span className="qo-badge qo-badge-neutral" style={{ alignSelf: 'flex-start' }}>
              Plant 01 &bull; Production
            </span>
          </div>
          <p className="qo-page-subtitle">
            Executive manufacturing overview, real-time quality control exceptions, and shop-floor
            activity summary.
          </p>
        </div>

        <div>
          <button
            onClick={() => void fetchDashboardData()}
            disabled={isLoading}
            className="qo-btn qo-btn-secondary"
            title="Refresh operational telemetry"
          >
            <IconRefresh
              size={15}
              style={{
                animation: isLoading ? 'qo-spin 1s linear infinite' : 'none',
              }}
            />
            <span>{isLoading ? 'Updating...' : 'Refresh Telemetry'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="qo-alert-banner qo-alert-danger">
          <strong>Dashboard Sync Notice:</strong> {error}
        </div>
      )}

      {/* KPI Summary Cards Grid */}
      <section aria-label="Operational Key Performance Indicators">
        <div className="qo-kpi-grid">
          {/* Batches KPI */}
          <div className="qo-kpi-card" style={{ borderTopColor: 'var(--qo-primary)' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span className="qo-kpi-label">Production Batches</span>
              <IconBatches size={18} style={{ color: 'var(--qo-primary)', opacity: 0.8 }} />
            </div>
            <div className="qo-kpi-val">{totalBatches}</div>
            <div className="qo-kpi-subtext">
              {totalBatches > 0 ? (
                <span>
                  <strong>{inProgressBatches}</strong> in progress &bull;{' '}
                  <strong>{completedBatches}</strong> completed
                </span>
              ) : (
                'No production batches recorded'
              )}
            </div>
          </div>

          {/* Quality Inspections KPI */}
          <div className="qo-kpi-card" style={{ borderTopColor: 'var(--qo-success)' }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span className="qo-kpi-label">Quality Inspections</span>
              <IconInspections size={18} style={{ color: 'var(--qo-success)', opacity: 0.8 }} />
            </div>
            <div className="qo-kpi-val">
              {inspectionPassRate !== null ? `${inspectionPassRate}%` : totalInspections}
            </div>
            <div className="qo-kpi-subtext">
              {inspections.length > 0 ? (
                <span>
                  <strong>{passedInspections}</strong> of {inspections.length} sampled lots passed
                </span>
              ) : (
                'Zero stage-gate inspections'
              )}
            </div>
          </div>

          {/* Defect Findings KPI */}
          <div
            className="qo-kpi-card"
            style={{
              borderTopColor: criticalDefects > 0 ? 'var(--qo-danger)' : 'var(--qo-slate-400)',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span className="qo-kpi-label">Defect Findings</span>
              <IconDefects size={18} style={{ color: 'var(--qo-danger)', opacity: 0.8 }} />
            </div>
            <div className="qo-kpi-val">{totalDefects}</div>
            <div className="qo-kpi-subtext">
              {criticalDefects > 0 ? (
                <span style={{ color: 'var(--qo-danger)', fontWeight: 600 }}>
                  {criticalDefects} critical severity findings
                </span>
              ) : totalDefects > 0 ? (
                <span>Recorded nonconformances logged</span>
              ) : (
                'Zero defect nonconformances logged'
              )}
            </div>
          </div>

          {/* CAPA Cases KPI */}
          <div
            className="qo-kpi-card"
            style={{ borderTopColor: overdueCapa > 0 ? 'var(--qo-warning)' : 'var(--qo-accent)' }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span className="qo-kpi-label">Active CAPA Cases</span>
              <IconCapa size={18} style={{ color: 'var(--qo-accent)', opacity: 0.8 }} />
            </div>
            <div className="qo-kpi-val">{totalCapaCases}</div>
            <div className="qo-kpi-subtext">
              {overdueCapa > 0 ? (
                <span style={{ color: 'var(--qo-warning)', fontWeight: 600 }}>
                  {overdueCapa} overdue SLA milestones
                </span>
              ) : totalCapaCases > 0 ? (
                <span>{openCapa} ongoing investigations</span>
              ) : (
                'No open corrective action plans'
              )}
            </div>
          </div>

          {/* Operational Alerts KPI */}
          <div
            className="qo-kpi-card"
            style={{
              borderTopColor:
                criticalHighAlerts.length > 0 ? 'var(--qo-danger)' : 'var(--qo-slate-300)',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <span className="qo-kpi-label">Active Alerts</span>
              <IconAlerts
                size={18}
                style={{
                  color: criticalHighAlerts.length > 0 ? 'var(--qo-danger)' : 'var(--qo-slate-500)',
                  opacity: 0.8,
                }}
              />
            </div>
            <div className="qo-kpi-val">{activeAlerts.length}</div>
            <div className="qo-kpi-subtext">
              {criticalHighAlerts.length > 0 ? (
                <span style={{ color: 'var(--qo-danger)', fontWeight: 600 }}>
                  {criticalHighAlerts.length} high/critical exceptions
                </span>
              ) : activeAlerts.length > 0 ? (
                <span>{activeAlerts.length} exceptions under review</span>
              ) : (
                'All operational thresholds nominal'
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Action Shortcuts */}
      <section
        aria-label="Operational Shortcuts"
        className="qo-card"
        style={{ padding: '16px 20px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '14px',
                fontWeight: 700,
                margin: '0 0 2px 0',
                color: 'var(--qo-navy-900)',
              }}
            >
              Operational Quick Actions
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--qo-slate-500)' }}>
              Jump directly into shop-floor data capture, process monitoring, and reporting
              workflows.
            </p>
          </div>

          <div className="qo-quick-actions-container">
            <button
              onClick={() => onNavigate('batches')}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-quick-action-btn"
            >
              <IconPlus size={14} />
              <span>Production Batches</span>
            </button>
            <button
              onClick={() => onNavigate('inspections')}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-quick-action-btn"
            >
              <IconPlus size={14} />
              <span>Quality Inspections</span>
            </button>
            <button
              onClick={() => onNavigate('defects')}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-quick-action-btn"
            >
              <IconPlus size={14} />
              <span>Record Defect</span>
            </button>
            <button
              onClick={() => onNavigate('capa')}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-quick-action-btn"
            >
              <IconPlus size={14} />
              <span>Create CAPA</span>
            </button>
            <button
              onClick={() => onNavigate('spc')}
              className="qo-btn qo-btn-secondary qo-btn-sm qo-quick-action-btn"
            >
              <IconSpc size={14} />
              <span>SPC Monitoring</span>
            </button>
            <button
              onClick={() => onNavigate('reports')}
              className="qo-btn qo-btn-primary qo-btn-sm qo-quick-action-btn"
            >
              <IconReports size={14} />
              <span>Generate Report</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2x2 Activity Grid */}
      <div className="qo-dashboard-activity-grid">
        {/* Recent Production Batches */}
        <div className="qo-card">
          <div className="qo-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconBatches size={16} style={{ color: 'var(--qo-primary)' }} />
              <h2 className="qo-card-title">Recent Production Batches</h2>
            </div>
            <button
              onClick={() => onNavigate('batches')}
              className="qo-btn qo-btn-ghost qo-btn-sm"
              style={{ padding: '2px 8px' }}
            >
              <span>View All</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="qo-card-body" style={{ padding: 0 }}>
            {batches.length === 0 ? (
              <div style={{ padding: '24px' }}>
                <div className="qo-empty-state">
                  <div className="qo-empty-state-icon">
                    <IconBatches size={22} />
                  </div>
                  <h3 className="qo-empty-state-title">No production batches yet</h3>
                  <p className="qo-empty-state-desc">
                    Start production tracking by provisioning work orders and batch records.
                  </p>
                  <button
                    onClick={() => onNavigate('batches')}
                    className="qo-btn qo-btn-primary qo-btn-sm"
                  >
                    <IconPlus size={14} />
                    <span>Create First Batch</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="qo-table-responsive" style={{ border: 'none', borderRadius: 0 }}>
                <table className="qo-table">
                  <thead>
                    <tr>
                      <th>Batch #</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Planned</th>
                      <th style={{ textAlign: 'right' }}>Produced</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: 600 }}>{b.batchNumber}</td>
                        <td>
                          <span
                            className={`qo-badge ${
                              b.status === 'COMPLETED'
                                ? 'qo-badge-success'
                                : b.status === 'IN_PROGRESS'
                                  ? 'qo-badge-medium'
                                  : b.status === 'ON_HOLD'
                                    ? 'qo-badge-high'
                                    : 'qo-badge-neutral'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.plannedQuantity.toLocaleString()}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {b.producedQuantity.toLocaleString()}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Active Operational Alerts */}
        <div className="qo-card">
          <div className="qo-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconAlerts size={16} style={{ color: 'var(--qo-danger)' }} />
              <h2 className="qo-card-title">Operational Exceptions &amp; Alerts</h2>
            </div>
            <button
              onClick={() => onNavigate('alerts')}
              className="qo-btn qo-btn-ghost qo-btn-sm"
              style={{ padding: '2px 8px' }}
            >
              <span>View All</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="qo-card-body" style={{ padding: 0 }}>
            {activeAlerts.length === 0 ? (
              <div style={{ padding: '24px' }}>
                <div className="qo-empty-state">
                  <div
                    className="qo-empty-state-icon"
                    style={{ backgroundColor: 'var(--qo-success-bg)', color: 'var(--qo-success)' }}
                  >
                    <IconCheck size={24} />
                  </div>
                  <h3 className="qo-empty-state-title">All operations nominal</h3>
                  <p className="qo-empty-state-desc">
                    No active exception alerts detected across SPC control limits, defect
                    thresholds, or downtime rules.
                  </p>
                  <button
                    onClick={() => onNavigate('alerts')}
                    className="qo-btn qo-btn-secondary qo-btn-sm"
                  >
                    <span>View Alert Archive</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="qo-table-responsive" style={{ border: 'none', borderRadius: 0 }}>
                <table className="qo-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Title &amp; Rule</th>
                      <th>Status</th>
                      <th>Triggered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeAlerts.slice(0, 5).map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span
                            className={`qo-badge ${
                              a.severity === 'CRITICAL'
                                ? 'qo-badge-critical'
                                : a.severity === 'HIGH'
                                  ? 'qo-badge-high'
                                  : a.severity === 'MEDIUM'
                                    ? 'qo-badge-medium'
                                    : 'qo-badge-low'
                            }`}
                          >
                            {a.severity}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--qo-navy-900)' }}>
                            {a.title}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                            Rule: {a.ruleType}
                          </div>
                        </td>
                        <td>
                          <span className="qo-badge qo-badge-neutral">{a.status}</span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                          {new Date(a.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Recent Quality Inspections */}
        <div className="qo-card">
          <div className="qo-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconInspections size={16} style={{ color: 'var(--qo-success)' }} />
              <h2 className="qo-card-title">Recent Quality Inspections</h2>
            </div>
            <button
              onClick={() => onNavigate('inspections')}
              className="qo-btn qo-btn-ghost qo-btn-sm"
              style={{ padding: '2px 8px' }}
            >
              <span>View All</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="qo-card-body" style={{ padding: 0 }}>
            {inspections.length === 0 ? (
              <div style={{ padding: '24px' }}>
                <div className="qo-empty-state">
                  <div className="qo-empty-state-icon">
                    <IconInspections size={22} />
                  </div>
                  <h3 className="qo-empty-state-title">No quality inspections logged</h3>
                  <p className="qo-empty-state-desc">
                    Conduct incoming, in-process, or final lot quality sampling to record defect
                    rates.
                  </p>
                  <button
                    onClick={() => onNavigate('inspections')}
                    className="qo-btn qo-btn-primary qo-btn-sm"
                  >
                    <IconPlus size={14} />
                    <span>Log First Inspection</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="qo-table-responsive" style={{ border: 'none', borderRadius: 0 }}>
                <table className="qo-table">
                  <thead>
                    <tr>
                      <th>Sample #</th>
                      <th>Stage</th>
                      <th>Result</th>
                      <th style={{ textAlign: 'right' }}>Defects</th>
                      <th>Inspected At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((i) => (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.sampleSize} units</td>
                        <td>
                          <span className="qo-badge qo-badge-neutral">{i.stage}</span>
                        </td>
                        <td>
                          <span
                            className={`qo-badge ${
                              i.result === 'PASS'
                                ? 'qo-badge-success'
                                : i.result === 'FAIL'
                                  ? 'qo-badge-critical'
                                  : 'qo-badge-high'
                            }`}
                          >
                            {i.result}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {i.failedUnits}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                          {new Date(i.inspectedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Open CAPA Action Items */}
        <div className="qo-card">
          <div className="qo-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconCapa size={16} style={{ color: 'var(--qo-accent)' }} />
              <h2 className="qo-card-title">Corrective &amp; Preventive Actions (CAPA)</h2>
            </div>
            <button
              onClick={() => onNavigate('capa')}
              className="qo-btn qo-btn-ghost qo-btn-sm"
              style={{ padding: '2px 8px' }}
            >
              <span>View All</span>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="qo-card-body" style={{ padding: 0 }}>
            {capaCases.length === 0 ? (
              <div style={{ padding: '24px' }}>
                <div className="qo-empty-state">
                  <div
                    className="qo-empty-state-icon"
                    style={{ backgroundColor: 'var(--qo-success-bg)', color: 'var(--qo-success)' }}
                  >
                    <IconCheck size={24} />
                  </div>
                  <h3 className="qo-empty-state-title">No active CAPA cases</h3>
                  <p className="qo-empty-state-desc">
                    Closed-loop nonconformance tracking is clear. No open investigations or overdue
                    corrective actions.
                  </p>
                  <button
                    onClick={() => onNavigate('capa')}
                    className="qo-btn qo-btn-secondary qo-btn-sm"
                  >
                    <span>Open CAPA Repository</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="qo-table-responsive" style={{ border: 'none', borderRadius: 0 }}>
                <table className="qo-table">
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Title</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Target Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capaCases.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.caseNumber}</td>
                        <td
                          style={{
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.title}
                        </td>
                        <td>
                          <span
                            className={`qo-badge ${
                              c.priority === 'CRITICAL'
                                ? 'qo-badge-critical'
                                : c.priority === 'HIGH'
                                  ? 'qo-badge-high'
                                  : 'qo-badge-medium'
                            }`}
                          >
                            {c.priority}
                          </span>
                        </td>
                        <td>
                          <span className="qo-badge qo-badge-neutral">{c.status}</span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                          {c.dueDate ? new Date(c.dueDate).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
