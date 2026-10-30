import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  DefectAnalyticsResponse,
  DefectRecord,
  DefectType,
  QualityInspection,
} from '@qualityops/contracts';

export const QualityDefectsView: React.FC = () => {
  const { user, accessToken } = useAuth();

  const canCreate =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('QUALITY_MANAGER') ||
    user?.roles.includes('INSPECTOR');

  const canCorrect = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');

  // Search & Filter state for Findings table
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Findings list state
  const [findings, setFindings] = useState<DefectRecord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoadingFindings, setIsLoadingFindings] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Analytics state
  const [analytics, setAnalytics] = useState<DefectAnalyticsResponse | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsEntityTab, setAnalyticsEntityTab] = useState<
    'type' | 'severity' | 'product' | 'line' | 'shift'
  >('type');

  // Lookups for creation
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createInspectionId, setCreateInspectionId] = useState('');
  const [createDefectTypeId, setCreateDefectTypeId] = useState('');
  const [createOccurrenceCount, setCreateOccurrenceCount] = useState('1');
  const [createAffectedUnitCount, setCreateAffectedUnitCount] = useState('1');
  const [createNotes, setCreateNotes] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Detail Modal State
  const [selectedFinding, setSelectedFinding] = useState<DefectRecord | null>(null);

  // Correction Modal State
  const [editingFinding, setEditingFinding] = useState<DefectRecord | null>(null);
  const [editOccurrenceCount, setEditOccurrenceCount] = useState('');
  const [editAffectedUnitCount, setEditAffectedUnitCount] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Fetch Lookups (inspections & defect types)
  const fetchLookups = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [inspRes, dtRes] = await Promise.all([
        fetch('/api/v1/quality/inspections?limit=100', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/master-data/defect-types?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (inspRes.ok) {
        const data = await inspRes.json();
        // Filter out cancelled inspections
        const eligible = (data.items || []).filter(
          (i: QualityInspection) => i.status !== 'CANCELLED',
        );
        setInspections(eligible);
      }

      if (dtRes.ok) {
        const data = await dtRes.json();
        setDefectTypes(data.items || []);
      }
    } catch {
      // Background lookup loading error
    }
  }, [accessToken]);

  // Fetch Analytics
  const fetchAnalytics = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch('/api/v1/quality/defects/analytics', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as DefectAnalyticsResponse;
        setAnalytics(data);
      }
    } catch {
      // Background analytics error
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [accessToken]);

  // Fetch Findings List
  const fetchFindings = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingFindings(true);
    setFeedback(null);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (search.trim()) params.set('search', search.trim());
    if (severityFilter !== 'ALL') params.set('severity', severityFilter);

    try {
      const res = await fetch(`/api/v1/quality/defects?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load defect findings');
      }

      setFindings(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error fetching defect findings',
      });
    } finally {
      setIsLoadingFindings(false);
    }
  }, [accessToken, page, limit, search, severityFilter]);

  useEffect(() => {
    void fetchFindings();
  }, [fetchFindings]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    if (canCreate) {
      void fetchLookups();
    }
  }, [canCreate, fetchLookups]);

  // Selected inspection for create modal
  const selectedInspForCreate = inspections.find((i) => i.id === createInspectionId);
  const occNum = parseInt(createOccurrenceCount, 10) || 0;
  const affNum = parseInt(createAffectedUnitCount, 10) || 0;

  // Selected inspection for edit modal
  const editOccNum = parseInt(editOccurrenceCount, 10) || 0;
  const editAffNum = parseInt(editAffectedUnitCount, 10) || 0;

  // Submit create finding
  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate || !accessToken) return;

    if (!createInspectionId) {
      setFeedback({ type: 'error', message: 'Please select a quality inspection.' });
      return;
    }
    if (!createDefectTypeId) {
      setFeedback({ type: 'error', message: 'Please select a defect type.' });
      return;
    }
    if (occNum < 1 || affNum < 1) {
      setFeedback({ type: 'error', message: 'Counts must be positive integers.' });
      return;
    }
    if (affNum > occNum) {
      setFeedback({
        type: 'error',
        message: `Affected unit count (${affNum}) cannot exceed occurrence count (${occNum}).`,
      });
      return;
    }
    if (selectedInspForCreate && affNum > selectedInspForCreate.sampleSize) {
      setFeedback({
        type: 'error',
        message: `Affected unit count (${affNum}) cannot exceed inspection sample size (${selectedInspForCreate.sampleSize}).`,
      });
      return;
    }
    if (
      selectedInspForCreate &&
      selectedInspForCreate.status === 'COMPLETED' &&
      affNum > selectedInspForCreate.failedUnits
    ) {
      setFeedback({
        type: 'error',
        message: `Affected unit count (${affNum}) cannot exceed inspection classified failed units (${selectedInspForCreate.failedUnits}).`,
      });
      return;
    }

    setIsSubmittingCreate(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/v1/quality/defects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          inspectionId: createInspectionId,
          defectTypeId: createDefectTypeId,
          occurrenceCount: occNum,
          affectedUnitCount: affNum,
          notes: createNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record defect finding');
      }

      setFeedback({
        type: 'success',
        message: 'Defect finding recorded and audited successfully.',
      });

      setIsCreateOpen(false);
      setCreateInspectionId('');
      setCreateDefectTypeId('');
      setCreateOccurrenceCount('1');
      setCreateAffectedUnitCount('1');
      setCreateNotes('');
      void fetchFindings();
      void fetchAnalytics();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error creating defect finding',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit / Correction modal
  const openCorrectionModal = (record: DefectRecord) => {
    setEditingFinding(record);
    setEditOccurrenceCount(String(record.occurrenceCount));
    setEditAffectedUnitCount(String(record.affectedUnitCount));
    setEditNotes(record.notes || '');
    setEditReason('');
  };

  // Submit correction
  const handleCorrectFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCorrect || !accessToken || !editingFinding) return;

    if (!editReason.trim()) {
      setFeedback({
        type: 'error',
        message: 'Reason for correction is required for the audit trail.',
      });
      return;
    }
    if (editOccNum < 1 || editAffNum < 1) {
      setFeedback({ type: 'error', message: 'Counts must be positive integers.' });
      return;
    }
    if (editAffNum > editOccNum) {
      setFeedback({
        type: 'error',
        message: `Affected unit count (${editAffNum}) cannot exceed occurrence count (${editOccNum}).`,
      });
      return;
    }

    setIsSubmittingEdit(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/quality/defects/${editingFinding.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          occurrenceCount: editOccNum,
          affectedUnitCount: editAffNum,
          notes: editNotes.trim() || undefined,
          reasonForCorrection: editReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update defect finding');
      }

      setFeedback({
        type: 'success',
        message: 'Defect finding corrected and audited successfully.',
      });

      setEditingFinding(null);
      void fetchFindings();
      void fetchAnalytics();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error correcting defect finding',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <section aria-labelledby="defects-management-heading">
      {/* Header & Controls */}
      <div className="qo-page-header">
        <div>
          <h3 id="defects-management-heading" className="qo-page-title">
            Defect Management & Descriptive Analytics
          </h3>
          <p className="qo-page-subtitle">
            Auditable quality findings, standardized defect classifications, and Pareto analytics
          </p>
        </div>

        {canCreate ? (
          <button
            onClick={() => setIsCreateOpen(true)}
            style={{
              backgroundColor: '#3182ce',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            + Record Defect Finding
          </button>
        ) : (
          <span
            style={{
              fontSize: '12px',
              backgroundColor: '#edf2f7',
              color: '#4a5568',
              padding: '6px 12px',
              borderRadius: '4px',
              fontWeight: 500,
            }}
          >
            Read-Only Mode
          </span>
        )}
      </div>

      {/* Domain Rule Guidance Banner */}
      <div className="qo-alert-banner warning">
        <div className="qo-alert-banner-icon">&#9888;</div>
        <div className="qo-alert-banner-content">
          <strong>Defect Accounting Semantics:</strong> Defect findings record discrete quality
          observations evaluated during inspections. <em>Occurrence count</em> represents defect
          instances; <em>affected-unit count</em> represents inspected units exhibiting that defect.
          Sums across defect findings may overlap (a single physical unit can possess multiple
          defects) and never alter production batch disposition quantities.
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
            backgroundColor: feedback.type === 'success' ? '#def7ec' : '#fde8e8',
            color: feedback.type === 'success' ? '#03543f' : '#9b1c1c',
            border: `1px solid ${feedback.type === 'success' ? '#84e1bc' : '#f8b4b4'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* DESCRIPTIVE ANALYTICS SECTION */}
      <div className="qo-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid #edf2f7',
            paddingBottom: '10px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>
            Descriptive Analytics & Pareto Distribution
          </h4>
          <span style={{ fontSize: '12px', color: '#718096' }}>
            PostgreSQL-backed real-time aggregation
          </span>
        </div>

        {isLoadingAnalytics ? (
          <p style={{ textAlign: 'center', color: '#718096', padding: '20px 0' }}>
            Loading quality analytics...
          </p>
        ) : analytics ? (
          <>
            {/* Overview KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  backgroundColor: '#ebf8ff',
                  border: '1px solid #bee3f8',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#2b6cb0' }}>
                  DEFECT FINDINGS (ROWS)
                </div>
                <div
                  style={{ fontSize: '24px', fontWeight: 700, color: '#2b6cb0', marginTop: '4px' }}
                >
                  {analytics.overview.totalFindings}
                </div>
                <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>
                  Total finding records stored
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#feebc8',
                  border: '1px solid #fbd38d',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#c05621' }}>
                  TOTAL OCCURRENCES
                </div>
                <div
                  style={{ fontSize: '24px', fontWeight: 700, color: '#c05621', marginTop: '4px' }}
                >
                  {analytics.overview.totalOccurrences}
                </div>
                <div style={{ fontSize: '11px', color: '#4a5568', marginTop: '4px' }}>
                  Cumulative defect instances detected
                </div>
              </div>

              <div
                style={{
                  backgroundColor: '#fed7d7',
                  border: '1px solid #feb2b2',
                  borderRadius: '6px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#9b1c1c' }}>
                  AFFECTED UNITS ACROSS FINDINGS
                </div>
                <div
                  style={{ fontSize: '24px', fontWeight: 700, color: '#9b1c1c', marginTop: '4px' }}
                >
                  {analytics.overview.totalAffectedUnitsAcrossFindings}
                </div>
                <div style={{ fontSize: '11px', color: '#742a2a', marginTop: '4px' }}>
                  Overlapping across defect types (non-unique)
                </div>
              </div>
            </div>

            {/* Pareto Ranking Chart & Breakdown */}
            <div style={{ marginBottom: '20px' }}>
              <h5 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#4a5568' }}>
                Pareto Analysis of Defect Types (Ranked by Affected Units Across Findings)
              </h5>
              {analytics.pareto.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#718096' }}>No defect findings to analyze.</p>
              ) : (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    padding: '16px',
                  }}
                >
                  {analytics.pareto.map((item) => (
                    <div key={item.defectTypeId} style={{ marginBottom: '12px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '13px',
                          marginBottom: '4px',
                        }}
                      >
                        <span>
                          <strong>{item.code}</strong> &bull; {item.name}{' '}
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor:
                                item.severity === 'CRITICAL'
                                  ? '#fed7d7'
                                  : item.severity === 'MAJOR'
                                    ? '#feebc8'
                                    : '#edf2f7',
                              color:
                                item.severity === 'CRITICAL'
                                  ? '#9b1c1c'
                                  : item.severity === 'MAJOR'
                                    ? '#c05621'
                                    : '#4a5568',
                            }}
                          >
                            {item.severity}
                          </span>
                        </span>
                        <span>
                          <strong>{item.value} units</strong> ({item.percentage}% &bull; Cum:{' '}
                          <strong>{item.cumulativePercentage}%</strong>)
                        </span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '8px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${item.cumulativePercentage}%`,
                            height: '100%',
                            backgroundColor:
                              item.cumulativePercentage <= 80 ? '#3182ce' : '#dd6b20',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Entity Breakdown Navigation */}
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {(
                  [
                    { id: 'type', label: 'By Defect Type' },
                    { id: 'severity', label: 'By Severity' },
                    { id: 'product', label: 'By Product' },
                    { id: 'line', label: 'By Line' },
                    { id: 'shift', label: 'By Shift' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAnalyticsEntityTab(tab.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '4px',
                      border:
                        analyticsEntityTab === tab.id ? '2px solid #3182ce' : '1px solid #cbd5e0',
                      backgroundColor: analyticsEntityTab === tab.id ? '#ebf8ff' : '#ffffff',
                      color: analyticsEntityTab === tab.id ? '#2b6cb0' : '#4a5568',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  overflowX: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#4a5568' }}>
                        Dimension
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#4a5568' }}>
                        Findings
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#4a5568' }}>
                        Occurrences
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', color: '#4a5568' }}>
                        Affected Units Across Findings
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsEntityTab === 'severity' &&
                      analytics.bySeverity.map((s) => (
                        <tr key={s.severity} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.severity}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.findingCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.occurrenceCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.affectedUnitCount}
                          </td>
                        </tr>
                      ))}

                    {analyticsEntityTab === 'type' &&
                      analytics.byType.map((t) => (
                        <tr key={t.defectTypeId} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{t.code}</strong> &bull; {t.name} ({t.category})
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {t.findingCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {t.occurrenceCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {t.affectedUnitCount}
                          </td>
                        </tr>
                      ))}

                    {analyticsEntityTab === 'product' &&
                      analytics.byProduct.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{p.code}</strong> &bull; {p.name}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {p.findingCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {p.occurrenceCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {p.affectedUnitCount}
                          </td>
                        </tr>
                      ))}

                    {analyticsEntityTab === 'line' &&
                      analytics.byProductionLine.map((l) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{l.code}</strong> &bull; {l.name}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {l.findingCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {l.occurrenceCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {l.affectedUnitCount}
                          </td>
                        </tr>
                      ))}

                    {analyticsEntityTab === 'shift' &&
                      analytics.byShift.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{s.code}</strong> &bull; {s.name}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.findingCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.occurrenceCount}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {s.affectedUnitCount}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* DEFECT FINDINGS LOG TABLE */}
      <div className="qo-card" style={{ padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h4 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>
            Defect Findings Repository
          </h4>

          {/* Search & Filter Controls */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search code, inspection, batch..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e0',
                fontSize: '13px',
              }}
            />

            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e0',
                fontSize: '13px',
              }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="MAJOR">Major</option>
              <option value="MINOR">Minor</option>
            </select>
          </div>
        </div>

        <div className="qo-table-responsive">
          <table className="qo-table">
            <thead>
              <tr style={{ backgroundColor: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>Defect</th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Severity
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Inspection #
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Batch #
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Product
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Occurrences
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Affected Units
                </th>
                <th style={{ padding: '10px 12px', fontSize: '12px', color: '#4a5568' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoadingFindings ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ textAlign: 'center', padding: '24px', color: '#718096' }}
                  >
                    Loading findings...
                  </td>
                </tr>
              ) : findings.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ textAlign: 'center', padding: '24px', color: '#718096' }}
                  >
                    No defect findings found.
                  </td>
                </tr>
              ) : (
                findings.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #edf2f7', fontSize: '13px' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <strong>{f.defectTypeCode}</strong>
                      <br />
                      <small style={{ color: '#718096' }}>{f.defectTypeName}</small>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            f.defectTypeSeverity === 'CRITICAL'
                              ? '#fed7d7'
                              : f.defectTypeSeverity === 'MAJOR'
                                ? '#feebc8'
                                : '#def7ec',
                          color:
                            f.defectTypeSeverity === 'CRITICAL'
                              ? '#9b1c1c'
                              : f.defectTypeSeverity === 'MAJOR'
                                ? '#c05621'
                                : '#03543f',
                        }}
                      >
                        {f.defectTypeSeverity}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#2b6cb0', fontWeight: 600 }}>
                      {f.inspectionNumber}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#4a5568' }}>
                      {f.batchNumber || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#4a5568' }}>
                      {f.productCode ? `${f.productCode} - ${f.productName}` : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>
                      {f.occurrenceCount}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#c53030',
                      }}
                    >
                      {f.affectedUnitCount}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setSelectedFinding(f)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e0',
                            backgroundColor: '#ffffff',
                            color: '#2b6cb0',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Details
                        </button>
                        {canCorrect && (
                          <button
                            onClick={() => openCorrectionModal(f)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #cbd5e0',
                              backgroundColor: '#fffaf0',
                              color: '#c05621',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Correct
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            fontSize: '13px',
            color: '#718096',
          }}
        >
          <div>
            Showing {findings.length > 0 ? (page - 1) * limit + 1 : 0} &ndash;{' '}
            {Math.min(page * limit, totalItems)} of {totalItems} findings
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e0',
                backgroundColor: page <= 1 ? '#f7fafc' : '#ffffff',
                color: page <= 1 ? '#a0aec0' : '#4a5568',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              Previous
            </button>
            <span style={{ alignSelf: 'center', fontWeight: 600, color: '#2d3748' }}>
              Page {page} of {totalPages || 1}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e0',
                backgroundColor: page >= totalPages ? '#f7fafc' : '#ffffff',
                color: page >= totalPages ? '#a0aec0' : '#4a5568',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 500,
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* CREATE FINDING MODAL */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-labelledby="create-defect-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '550px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
              }}
            >
              <h4
                id="create-defect-title"
                style={{ margin: 0, fontSize: '18px', color: '#2d3748' }}
              >
                Record Quality Defect Finding
              </h4>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#718096',
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateFinding}>
              {/* Inspection Selection */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="create-defect-inspection"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Quality Inspection *
                </label>
                <select
                  id="create-defect-inspection"
                  required
                  value={createInspectionId}
                  onChange={(e) => setCreateInspectionId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                  }}
                >
                  <option value="">-- Select Active Inspection --</option>
                  {inspections.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.inspectionNumber} &bull; {i.batchNumber} ({i.stage}, Sample: {i.sampleSize}
                      , Failed: {i.failedUnits})
                    </option>
                  ))}
                </select>
                {selectedInspForCreate && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#2b6cb0' }}>
                    Inspection Status: <strong>{selectedInspForCreate.status}</strong> &bull; Sample
                    Size: <strong>{selectedInspForCreate.sampleSize}</strong> &bull; Classified
                    Failed: <strong>{selectedInspForCreate.failedUnits}</strong>
                  </p>
                )}
              </div>

              {/* Defect Type Selection */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="create-defect-type"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Standardized Defect Type *
                </label>
                <select
                  id="create-defect-type"
                  required
                  value={createDefectTypeId}
                  onChange={(e) => setCreateDefectTypeId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                  }}
                >
                  <option value="">-- Select Defect Type --</option>
                  {defectTypes.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.code} &bull; {dt.name} [{dt.severity}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Counts: Occurrence and Affected Units */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-defect-occurrences"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Occurrence Count *
                  </label>
                  <input
                    id="create-defect-occurrences"
                    type="number"
                    min="1"
                    required
                    value={createOccurrenceCount}
                    onChange={(e) => setCreateOccurrenceCount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-defect-affected"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#c53030',
                      marginBottom: '4px',
                    }}
                  >
                    Affected Units *
                  </label>
                  <input
                    id="create-defect-affected"
                    type="number"
                    min="1"
                    required
                    value={createAffectedUnitCount}
                    onChange={(e) => setCreateAffectedUnitCount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Validation Warnings */}
              {affNum > occNum && (
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#c53030' }}>
                  &bull; Warning: Affected units ({affNum}) cannot exceed occurrence count ({occNum}
                  ).
                </p>
              )}
              {selectedInspForCreate && affNum > selectedInspForCreate.sampleSize && (
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#c53030' }}>
                  &bull; Warning: Affected units ({affNum}) exceeds inspection sample size (
                  {selectedInspForCreate.sampleSize}).
                </p>
              )}

              {/* Notes */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="create-defect-notes"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Notes & Findings Context
                </label>
                <textarea
                  id="create-defect-notes"
                  rows={3}
                  placeholder="Describe location on part, defect severity notes, tool wear, etc."
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#3182ce',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmittingCreate ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmittingCreate ? 'Recording...' : 'Record Finding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedFinding && (
        <div
          role="dialog"
          aria-labelledby="detail-defect-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '550px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
              }}
            >
              <h4
                id="detail-defect-title"
                style={{ margin: 0, fontSize: '18px', color: '#2d3748' }}
              >
                Defect Finding Details
              </h4>
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#718096',
                }}
              >
                &times;
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>
                  Defect Classification
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '14px', fontWeight: 600 }}>
                  {selectedFinding.defectTypeCode} &bull; {selectedFinding.defectTypeName}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#718096' }}>
                  Category: {selectedFinding.defectTypeCategory} &bull; Severity:{' '}
                  {selectedFinding.defectTypeSeverity}
                </p>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                <span style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase' }}>
                  Inspection Context
                </span>
                <p
                  style={{
                    margin: '2px 0 0 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#2b6cb0',
                  }}
                >
                  {selectedFinding.inspectionNumber}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#718096' }}>
                  Batch: {selectedFinding.batchNumber} &bull; Product: {selectedFinding.productCode}
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '16px',
                backgroundColor: '#f7fafc',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: '#718096' }}>Occurrences</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#2d3748' }}>
                  {selectedFinding.occurrenceCount}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: '#718096' }}>Affected Units</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#c53030' }}>
                  {selectedFinding.affectedUnitCount}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#4a5568' }}>Notes:</span>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '13px',
                  backgroundColor: '#f8fafc',
                  padding: '8px',
                  borderRadius: '4px',
                  color: '#4a5568',
                }}
              >
                {selectedFinding.notes || 'No notes provided.'}
              </p>
            </div>

            <div
              style={{
                fontSize: '11px',
                color: '#718096',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '10px',
              }}
            >
              Created: {new Date(selectedFinding.createdAt).toLocaleString()} &bull; Updated:{' '}
              {new Date(selectedFinding.updatedAt).toLocaleString()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setSelectedFinding(null)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e0',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORRECTION / EDIT MODAL */}
      {editingFinding && canCorrect && (
        <div
          role="dialog"
          aria-labelledby="correct-defect-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '550px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
              }}
            >
              <div>
                <h4
                  id="correct-defect-title"
                  style={{ margin: 0, fontSize: '18px', color: '#c05621' }}
                >
                  Authorized Correction: {editingFinding.defectTypeCode}
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#718096' }}>
                  Restricted to ADMIN and QUALITY_MANAGER. An immutable audit record will be
                  produced.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFinding(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#718096',
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCorrectFinding}>
              {/* Reason for Correction */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="edit-defect-reason"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#c05621',
                    marginBottom: '4px',
                  }}
                >
                  Reason for Correction (Audit Requirement) *
                </label>
                <input
                  id="edit-defect-reason"
                  type="text"
                  required
                  placeholder="e.g. Recounted defects after verification check"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Counts */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="edit-defect-occ"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Occurrence Count *
                  </label>
                  <input
                    id="edit-defect-occ"
                    type="number"
                    min="1"
                    required
                    value={editOccurrenceCount}
                    onChange={(e) => setEditOccurrenceCount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="edit-defect-aff"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#c53030',
                      marginBottom: '4px',
                    }}
                  >
                    Affected Units *
                  </label>
                  <input
                    id="edit-defect-aff"
                    type="number"
                    min="1"
                    required
                    value={editAffectedUnitCount}
                    onChange={(e) => setEditAffectedUnitCount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="edit-defect-notes"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Notes
                </label>
                <textarea
                  id="edit-defect-notes"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingFinding(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    backgroundColor: '#ffffff',
                    color: '#4a5568',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#c05621',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmittingEdit ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmittingEdit ? 'Saving Correction...' : 'Save & Audit Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
