import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  CapaActionType,
  CapaCase,
  CapaCaseDetailResponse,
  CapaPriority,
  CapaSource,
  CapaStatus,
  DefectRecord,
  ProductionBatch,
  UserResponse,
} from '@qualityops/contracts';

export const CapaManagementView: React.FC = () => {
  const { user, accessToken } = useAuth();

  const canCreate =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('QUALITY_MANAGER') ||
    user?.roles.includes('SUPERVISOR');

  const canVerifyOrClose = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');

  // Query & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [isOverdueOnly, setIsOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 10;

  // Data state
  const [cases, setCases] = useState<CapaCase[]>([]);
  const [totalCases, setTotalCases] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Lookups for dropdowns
  const [usersList, setUsersList] = useState<UserResponse[]>([]);
  const [defectsList, setDefectsList] = useState<DefectRecord[]>([]);
  const [batchesList, setBatchesList] = useState<ProductionBatch[]>([]);

  // Selected Detail Modal State
  const [selectedCaseDetail, setSelectedCaseDetail] = useState<CapaCaseDetailResponse | null>(null);

  // Create Case Modal
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSource, setCreateSource] = useState<CapaSource>('INSPECTION_FAILURE');
  const [createPriority, setCreatePriority] = useState<CapaPriority>('MEDIUM');
  const [createBatchId, setCreateBatchId] = useState('');
  const [createDefectRecordId, setCreateDefectRecordId] = useState('');
  const [createAssignedTo, setCreateAssignedTo] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');
  const [createRootCause, setCreateRootCause] = useState('');
  const [isSubmittingCase, setIsSubmittingCase] = useState(false);

  // Add Action Modal
  const [isAddActionOpen, setIsAddActionOpen] = useState(false);
  const [actionCaseId, setActionCaseId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<CapaActionType>('CORRECTIVE');
  const [actionDescription, setActionDescription] = useState('');
  const [actionAssignedTo, setActionAssignedTo] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Complete Action Modal
  const [completeActionTarget, setCompleteActionTarget] = useState<{
    caseId: string;
    actionId: string;
    description: string;
  } | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [isSubmittingComplete, setIsSubmittingComplete] = useState(false);

  // Verification Modal
  const [verifyTargetCase, setVerifyTargetCase] = useState<CapaCase | null>(null);
  const [verificationResult, setVerificationResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);

  // Closure Modal
  const [closeTargetCase, setCloseTargetCase] = useState<CapaCase | null>(null);
  const [closureNotes, setClosureNotes] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Fetch Lookups (users, defect findings, batches)
  const fetchLookups = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [uRes, defRes, bRes] = await Promise.all([
        fetch('/api/v1/users?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/v1/quality/defects?limit=50', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/production/batches?limit=50', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (uRes.ok) {
        const uData = await uRes.json();
        setUsersList((uData.users || []).filter((u: UserResponse) => u.isActive));
      }
      if (defRes.ok) {
        const dData = await defRes.json();
        setDefectsList(dData.items || []);
      }
      if (bRes.ok) {
        const bData = await bRes.json();
        setBatchesList(bData.items || []);
      }
    } catch {
      // Lookups fail gracefully
    }
  }, [accessToken]);

  // Fetch CAPA cases list
  const fetchCases = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setFeedback(null);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
    if (sourceFilter !== 'ALL') params.set('source', sourceFilter);
    if (isOverdueOnly) params.set('overdue', 'true');

    try {
      const res = await fetch(`/api/v1/quality/capa?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load CAPA cases');
      }

      setCases(data.items || []);
      setTotalCases(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error fetching CAPA cases',
      });
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, page, limit, search, statusFilter, priorityFilter, sourceFilter, isOverdueOnly]);

  // Load single case detail
  const loadCaseDetail = async (caseId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/v1/quality/capa/${caseId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load case detail');
      }
      setSelectedCaseDetail(data);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error loading case details',
      });
    }
  };

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  // Create Case Submit Handler
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setIsSubmittingCase(true);
    setFeedback(null);

    try {
      const body: Record<string, unknown> = {
        title: createTitle.trim(),
        description: createDescription.trim(),
        source: createSource,
        priority: createPriority,
      };
      if (createBatchId) body.batchId = createBatchId;
      if (createDefectRecordId) body.defectRecordId = createDefectRecordId;
      if (createAssignedTo) body.assignedTo = createAssignedTo;
      if (createDueDate) body.dueDate = createDueDate;
      if (createRootCause.trim()) body.rootCause = createRootCause.trim();

      const res = await fetch('/api/v1/quality/capa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create CAPA case');
      }

      setFeedback({
        type: 'success',
        message: `CAPA case "${data.caseNumber}" opened successfully.`,
      });

      setIsCreateCaseOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      setCreateRootCause('');
      setCreateDueDate('');
      setCreateDefectRecordId('');
      setCreateBatchId('');
      setCreateAssignedTo('');

      await fetchCases();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error submitting CAPA case',
      });
    } finally {
      setIsSubmittingCase(false);
    }
  };

  // Add Action Submit Handler
  const handleAddAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !actionCaseId) return;
    setIsSubmittingAction(true);
    setFeedback(null);

    try {
      const body: Record<string, unknown> = {
        actionType,
        description: actionDescription.trim(),
      };
      if (actionAssignedTo) body.assignedTo = actionAssignedTo;
      if (actionDueDate) body.dueDate = actionDueDate;

      const res = await fetch(`/api/v1/quality/capa/${actionCaseId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to add action');
      }

      setFeedback({
        type: 'success',
        message: `Action added to CAPA case successfully.`,
      });

      setIsAddActionOpen(false);
      setActionDescription('');
      setActionDueDate('');
      setActionAssignedTo('');

      await fetchCases();
      if (selectedCaseDetail && selectedCaseDetail.case.id === actionCaseId) {
        await loadCaseDetail(actionCaseId);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error adding action',
      });
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Complete Action Submit Handler
  const handleCompleteAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !completeActionTarget) return;
    setIsSubmittingComplete(true);
    setFeedback(null);

    try {
      const res = await fetch(
        `/api/v1/quality/capa/${completeActionTarget.caseId}/actions/${completeActionTarget.actionId}/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ completionNotes: completionNotes.trim() }),
        },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to complete action');
      }

      setFeedback({
        type: 'success',
        message: `Action marked as COMPLETED.`,
      });

      setCompleteActionTarget(null);
      setCompletionNotes('');

      await fetchCases();
      if (selectedCaseDetail) {
        await loadCaseDetail(selectedCaseDetail.case.id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error completing action',
      });
    } finally {
      setIsSubmittingComplete(false);
    }
  };

  // Verify Case Submit Handler
  const handleVerifyCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !verifyTargetCase) return;
    setIsSubmittingVerify(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/quality/capa/${verifyTargetCase.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          result: verificationResult,
          notes: verificationNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record verification');
      }

      setFeedback({
        type: 'success',
        message:
          verificationResult === 'PASS'
            ? `Verification recorded: PASSED. Case is eligible for closure.`
            : `Verification recorded: FAILED. Case reverted to IN_PROGRESS.`,
      });

      setVerifyTargetCase(null);
      setVerificationNotes('');

      await fetchCases();
      if (selectedCaseDetail && selectedCaseDetail.case.id === verifyTargetCase.id) {
        await loadCaseDetail(verifyTargetCase.id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error verifying case',
      });
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  // Close Case Submit Handler
  const handleCloseCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !closeTargetCase) return;
    setIsSubmittingClose(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/quality/capa/${closeTargetCase.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ closureNotes: closureNotes.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to close CAPA case');
      }

      setFeedback({
        type: 'success',
        message: `CAPA case "${data.caseNumber}" closed successfully.`,
      });

      setCloseTargetCase(null);
      setClosureNotes('');

      await fetchCases();
      if (selectedCaseDetail && selectedCaseDetail.case.id === closeTargetCase.id) {
        await loadCaseDetail(closeTargetCase.id);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error closing case',
      });
    } finally {
      setIsSubmittingClose(false);
    }
  };

  // Metric aggregates
  const openCount = cases.filter((c) => c.status === 'OPEN').length;
  const inProgressCount = cases.filter((c) => c.status === 'IN_PROGRESS').length;
  const underReviewCount = cases.filter((c) => c.status === 'UNDER_REVIEW').length;
  const closedCount = cases.filter((c) => c.status === 'CLOSED').length;
  const overdueCount = cases.filter((c) => c.isOverdue).length;

  // Badge helpers
  const getPriorityStyle = (priority: CapaPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return { backgroundColor: '#fed7d7', color: '#9b2c2c', border: '1px solid #feb2b2' };
      case 'HIGH':
        return { backgroundColor: '#feebc8', color: '#9c4221', border: '1px solid #fbd38d' };
      case 'MEDIUM':
        return { backgroundColor: '#fefcbf', color: '#744210', border: '1px solid #faf089' };
      case 'LOW':
        return { backgroundColor: '#e2e8f0', color: '#4a5568', border: '1px solid #cbd5e0' };
    }
  };

  const getStatusStyle = (status: CapaStatus) => {
    switch (status) {
      case 'OPEN':
        return { backgroundColor: '#ebf8ff', color: '#2b6cb0', border: '1px solid #bee3f8' };
      case 'IN_PROGRESS':
        return { backgroundColor: '#faf5ff', color: '#6b46c1', border: '1px solid #e9d8fd' };
      case 'UNDER_REVIEW':
        return { backgroundColor: '#fffaf0', color: '#c05621', border: '1px solid #feebc8' };
      case 'CLOSED':
        return { backgroundColor: '#f0fff4', color: '#276749', border: '1px solid #c6f6d5' };
      case 'CANCELLED':
        return { backgroundColor: '#edf2f7', color: '#718096', border: '1px solid #e2e8f0' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Platform Header */}
      <div className="qo-page-header">
        <div>
          <h2 className="qo-page-title">Corrective and Preventive Action (CAPA) Management</h2>
          <p className="qo-page-subtitle">
            Closed-loop nonconformance resolution: containment, root-cause investigation,
            corrective/preventive action tracking, independent verification, and auditable closure.
          </p>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            fontSize: '14px',
            backgroundColor: feedback.type === 'success' ? '#f0fff4' : '#fff5f5',
            color: feedback.type === 'success' ? '#276749' : '#c53030',
            border: `1px solid ${feedback.type === 'success' ? '#c6f6d5' : '#feb2b2'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Total Cases</div>
          <div style={kpiValueStyle}>{totalCases}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Open / In Progress</div>
          <div style={{ ...kpiValueStyle, color: '#3182ce' }}>{openCount + inProgressCount}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Pending Verification</div>
          <div style={{ ...kpiValueStyle, color: '#dd6b20' }}>{underReviewCount}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Closed (Resolved)</div>
          <div style={{ ...kpiValueStyle, color: '#38a169' }}>{closedCount}</div>
        </div>
        <div style={kpiCardStyle}>
          <div style={kpiLabelStyle}>Overdue SLA</div>
          <div style={{ ...kpiValueStyle, color: overdueCount > 0 ? '#e53e3e' : '#718096' }}>
            {overdueCount}
          </div>
        </div>
      </div>

      {/* Filters & Actions Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--qo-white)',
          padding: '18px 20px',
          borderRadius: 'var(--qo-radius-lg)',
          border: '1px solid var(--qo-slate-200)',
          boxShadow: 'var(--qo-shadow-xs)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search by case # or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
              minWidth: '220px',
            }}
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            style={selectStyle}
          >
            <option value="ALL">All Sources</option>
            <option value="INSPECTION_FAILURE">Inspection Failure</option>
            <option value="INTERNAL_AUDIT">Internal Audit</option>
            <option value="CUSTOMER_COMPLAINT">Customer Complaint</option>
            <option value="RECURRING_DEFECT">Recurring Defect</option>
            <option value="PROCESS_DEVIATION">Process Deviation</option>
          </select>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: '#4a5568',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={isOverdueOnly}
              onChange={(e) => {
                setIsOverdueOnly(e.target.checked);
                setPage(1);
              }}
            />
            Overdue Only
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => void fetchCases()}
            style={{
              padding: '8px 14px',
              backgroundColor: '#edf2f7',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Refresh
          </button>

          {canCreate && (
            <button
              onClick={() => setIsCreateCaseOpen(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3182ce',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Open CAPA Case
            </button>
          )}
        </div>
      </div>

      {/* Cases Table */}
      <div className="qo-card">
        <div className="qo-table-responsive">
          <table className="qo-table">
            <thead>
              <tr>
                <th style={thStyle}>Case #</th>
                <th style={thStyle}>Title &amp; Source</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Assignee</th>
                <th style={thStyle}>Actions Progress</th>
                <th style={thStyle}>Due Date</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Operations</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: '24px', textAlign: 'center', color: '#718096' }}
                  >
                    Loading CAPA cases...
                  </td>
                </tr>
              ) : cases.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: '24px', textAlign: 'center', color: '#718096' }}
                  >
                    No CAPA cases found matching the criteria.
                  </td>
                </tr>
              ) : (
                cases.map((c) => {
                  const priorityBadge = getPriorityStyle(c.priority);
                  const statusBadge = getStatusStyle(c.status);

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#2b6cb0' }}>
                        {c.caseNumber}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#2d3748' }}>{c.title}</div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>
                          Source: {c.source.replace(/_/g, ' ')}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...priorityBadge,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {c.priority}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            ...statusBadge,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={tdStyle}>{c.assignedToName || 'Unassigned'}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>
                          {c.completedActionCount} / {c.actionCount} done
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: '4px',
                            backgroundColor: '#edf2f7',
                            borderRadius: '2px',
                            marginTop: '4px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              backgroundColor:
                                c.completedActionCount === c.actionCount && c.actionCount > 0
                                  ? '#38a169'
                                  : '#3182ce',
                              width: `${
                                c.actionCount > 0
                                  ? Math.round((c.completedActionCount / c.actionCount) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div>{c.dueDate || 'No due date'}</div>
                        {c.isOverdue && (
                          <span
                            style={{
                              backgroundColor: '#fed7d7',
                              color: '#9b2c2c',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                            }}
                          >
                            OVERDUE
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                          }}
                        >
                          <button
                            onClick={() => void loadCaseDetail(c.id)}
                            style={btnSmallSecondary}
                          >
                            View Details
                          </button>

                          {canCreate && c.status !== 'CLOSED' && c.status !== 'CANCELLED' && (
                            <button
                              onClick={() => {
                                setActionCaseId(c.id);
                                setIsAddActionOpen(true);
                              }}
                              style={btnSmallAction}
                            >
                              + Action
                            </button>
                          )}

                          {canVerifyOrClose &&
                            (c.status === 'IN_PROGRESS' || c.status === 'UNDER_REVIEW') &&
                            c.actionCount > 0 &&
                            c.completedActionCount === c.actionCount && (
                              <button onClick={() => setVerifyTargetCase(c)} style={btnSmallVerify}>
                                Verify
                              </button>
                            )}

                          {canVerifyOrClose && c.status === 'UNDER_REVIEW' && c.verifiedBy && (
                            <button onClick={() => setCloseTargetCase(c)} style={btnSmallClose}>
                              Close Case
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
          color: '#718096',
        }}
      >
        <div>
          Showing page {page} of {totalPages} ({totalCases} total records)
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={btnPageStyle}
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={btnPageStyle}
          >
            Next
          </button>
        </div>
      </div>

      {/* Case Detail Modal / Panel */}
      {selectedCaseDetail && (
        <div style={modalBackdropStyle}>
          <div
            style={{
              ...modalContentStyle,
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '12px',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#718096',
                  }}
                >
                  CAPA Case Detail
                </span>
                <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#2b6cb0' }}>
                  {selectedCaseDetail.case.caseNumber}: {selectedCaseDetail.case.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCaseDetail(null)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#a0aec0',
                }}
              >
                &times;
              </button>
            </div>

            {/* Case Badges & Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
                backgroundColor: '#f7fafc',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <div>
                <strong>Status:</strong>{' '}
                <span
                  style={{
                    ...getStatusStyle(selectedCaseDetail.case.status),
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {selectedCaseDetail.case.status}
                </span>
              </div>
              <div>
                <strong>Priority:</strong>{' '}
                <span
                  style={{
                    ...getPriorityStyle(selectedCaseDetail.case.priority),
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {selectedCaseDetail.case.priority}
                </span>
              </div>
              <div>
                <strong>Source:</strong> {selectedCaseDetail.case.source}
              </div>
              <div>
                <strong>Assignee:</strong> {selectedCaseDetail.case.assignedToName || 'Unassigned'}
              </div>
              <div>
                <strong>Target Date:</strong> {selectedCaseDetail.case.dueDate || 'None'}
              </div>
              <div>
                <strong>Created By:</strong> {selectedCaseDetail.case.createdByName || 'System'}
              </div>
            </div>

            {/* Linked Context (Defect & Batch) */}
            {(selectedCaseDetail.case.defectCode || selectedCaseDetail.case.batchNumber) && (
              <div
                style={{
                  backgroundColor: '#ebf8ff',
                  border: '1px solid #bee3f8',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#2b6cb0', marginBottom: '6px' }}>
                  Linked Quality Context
                </div>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  {selectedCaseDetail.case.defectCode && (
                    <div>
                      Defect: <strong>{selectedCaseDetail.case.defectCode}</strong> (
                      {selectedCaseDetail.case.defectName}) &bull; Severity:{' '}
                      <span style={{ fontWeight: 700 }}>
                        {selectedCaseDetail.case.defectSeverity}
                      </span>
                    </div>
                  )}
                  {selectedCaseDetail.case.inspectionNumber && (
                    <div>
                      Inspection: <strong>{selectedCaseDetail.case.inspectionNumber}</strong>
                    </div>
                  )}
                  {selectedCaseDetail.case.batchNumber && (
                    <div>
                      Batch: <strong>{selectedCaseDetail.case.batchNumber}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description & Root Cause */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#2d3748' }}>
                Problem Statement
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: '#4a5568',
                  backgroundColor: '#ffffff',
                  padding: '10px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                }}
              >
                {selectedCaseDetail.case.description}
              </p>
            </div>

            {selectedCaseDetail.case.rootCause && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#2d3748' }}>
                  Root Cause Analysis (Ishikawa / 5-Why)
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#4a5568',
                    backgroundColor: '#ffffff',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                >
                  {selectedCaseDetail.case.rootCause}
                </p>
              </div>
            )}

            {/* Verification Section */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '20px',
                backgroundColor: selectedCaseDetail.case.verifiedBy ? '#f0fff4' : '#fffaf0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#2d3748' }}>
                  Verification Audit Status
                </div>
                {canVerifyOrClose &&
                  selectedCaseDetail.case.status !== 'CLOSED' &&
                  selectedCaseDetail.case.status !== 'CANCELLED' &&
                  selectedCaseDetail.case.actionCount > 0 &&
                  selectedCaseDetail.case.completedActionCount ===
                    selectedCaseDetail.case.actionCount && (
                    <button
                      onClick={() => setVerifyTargetCase(selectedCaseDetail.case)}
                      style={btnSmallVerify}
                    >
                      Record Verification
                    </button>
                  )}
              </div>

              {selectedCaseDetail.case.verifiedBy ? (
                <div style={{ fontSize: '13px', color: '#276749' }}>
                  <div>
                    Verified by: <strong>{selectedCaseDetail.case.verifiedByName}</strong> on{' '}
                    {selectedCaseDetail.case.verifiedAt
                      ? new Date(selectedCaseDetail.case.verifiedAt).toLocaleString()
                      : 'N/A'}
                  </div>
                  {selectedCaseDetail.case.verificationNotes && (
                    <div style={{ marginTop: '4px' }}>
                      Notes: <em>{selectedCaseDetail.case.verificationNotes}</em>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#744210' }}>
                  {selectedCaseDetail.case.actionCount === 0
                    ? 'No actions defined yet. Add actions to initiate resolution.'
                    : selectedCaseDetail.case.completedActionCount <
                        selectedCaseDetail.case.actionCount
                      ? `${
                          selectedCaseDetail.case.actionCount -
                          selectedCaseDetail.case.completedActionCount
                        } action(s) still in progress. Verification requires 100% action completion.`
                      : 'All actions completed! Ready for independent QA verification.'}
                </div>
              )}
            </div>

            {/* Actions List Panel */}
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '15px', color: '#2d3748' }}>
                  Corrective &amp; Preventive Actions ({selectedCaseDetail.actions.length})
                </h4>
                {canCreate &&
                  selectedCaseDetail.case.status !== 'CLOSED' &&
                  selectedCaseDetail.case.status !== 'CANCELLED' && (
                    <button
                      onClick={() => {
                        setActionCaseId(selectedCaseDetail.case.id);
                        setIsAddActionOpen(true);
                      }}
                      style={btnSmallAction}
                    >
                      + Add Action
                    </button>
                  )}
              </div>

              {selectedCaseDetail.actions.length === 0 ? (
                <div
                  style={{
                    padding: '16px',
                    textAlign: 'center',
                    border: '1px dashed #cbd5e0',
                    borderRadius: '6px',
                    color: '#718096',
                    fontSize: '13px',
                  }}
                >
                  No actions defined yet. Use "+ Add Action" to assign corrective or preventive
                  steps.
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    overflowX: 'auto',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Action Description</th>
                        <th style={thStyle}>Owner</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Due Date</th>
                        <th style={thStyle}>Completion Evidence</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Operation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCaseDetail.actions.map((act) => {
                        const canCompleteThis =
                          (user?.roles.includes('ADMIN') ||
                            user?.roles.includes('QUALITY_MANAGER') ||
                            act.assignedTo === user?.id) &&
                          act.status !== 'COMPLETED' &&
                          act.status !== 'VERIFIED' &&
                          act.status !== 'CANCELLED';

                        return (
                          <tr key={act.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={tdStyle}>
                              <span
                                style={{
                                  backgroundColor:
                                    act.actionType === 'IMMEDIATE_CONTAINMENT'
                                      ? '#fed7d7'
                                      : act.actionType === 'CORRECTIVE'
                                        ? '#feebc8'
                                        : '#e6fffa',
                                  color:
                                    act.actionType === 'IMMEDIATE_CONTAINMENT'
                                      ? '#9b2c2c'
                                      : act.actionType === 'CORRECTIVE'
                                        ? '#9c4221'
                                        : '#234e52',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  fontSize: '10px',
                                }}
                              >
                                {act.actionType.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={tdStyle}>{act.description}</td>
                            <td style={tdStyle}>{act.assignedToName || 'Unassigned'}</td>
                            <td style={tdStyle}>
                              <span
                                style={{
                                  backgroundColor:
                                    act.status === 'COMPLETED'
                                      ? '#f0fff4'
                                      : act.status === 'VERIFIED'
                                        ? '#e6fffa'
                                        : '#ebf8ff',
                                  color:
                                    act.status === 'COMPLETED'
                                      ? '#276749'
                                      : act.status === 'VERIFIED'
                                        ? '#234e52'
                                        : '#2b6cb0',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  fontSize: '10px',
                                }}
                              >
                                {act.status}
                              </span>
                            </td>
                            <td style={tdStyle}>{act.dueDate || 'None'}</td>
                            <td style={tdStyle}>
                              {act.completionNotes ? (
                                <div>
                                  <div style={{ color: '#2d3748' }}>{act.completionNotes}</div>
                                  <div style={{ fontSize: '10px', color: '#718096' }}>
                                    {act.completedAt
                                      ? new Date(act.completedAt).toLocaleDateString()
                                      : ''}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#a0aec0' }}>Pending</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              {canCompleteThis && (
                                <button
                                  onClick={() =>
                                    setCompleteActionTarget({
                                      caseId: selectedCaseDetail.case.id,
                                      actionId: act.id,
                                      description: act.description,
                                    })
                                  }
                                  style={btnSmallComplete}
                                >
                                  Complete
                                </button>
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

            {/* Bottom Actions Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '16px',
              }}
            >
              {canVerifyOrClose &&
                selectedCaseDetail.case.status === 'UNDER_REVIEW' &&
                selectedCaseDetail.case.verifiedBy && (
                  <button
                    onClick={() => setCloseTargetCase(selectedCaseDetail.case)}
                    style={btnSmallClose}
                  >
                    Formally Close CAPA Case
                  </button>
                )}

              <button onClick={() => setSelectedCaseDetail(null)} style={btnSecondaryStyle}>
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Case Modal */}
      {isCreateCaseOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '600px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#2d3748' }}>
              Open New CAPA Case
            </h3>
            <form onSubmit={handleCreateCase}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Case Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Porosity in cylinder block casting"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Problem Statement / Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed description of the nonconformance or process deviation..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Origin Source *</label>
                  <select
                    value={createSource}
                    onChange={(e) => setCreateSource(e.target.value as CapaSource)}
                    style={selectStyle}
                  >
                    <option value="INSPECTION_FAILURE">Inspection Failure</option>
                    <option value="INTERNAL_AUDIT">Internal Audit</option>
                    <option value="CUSTOMER_COMPLAINT">Customer Complaint</option>
                    <option value="RECURRING_DEFECT">Recurring Defect</option>
                    <option value="PROCESS_DEVIATION">Process Deviation</option>
                  </select>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>Priority Tier *</label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as CapaPriority)}
                    style={selectStyle}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Link Defect Finding (Optional)</label>
                  <select
                    value={createDefectRecordId}
                    onChange={(e) => setCreateDefectRecordId(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">-- No Defect Finding --</option>
                    {defectsList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.defectTypeCode || 'Defect'} ({d.defectTypeName || d.id.slice(0, 8)}) -
                        Insp: {d.inspectionNumber || d.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>Link Production Batch (Optional)</label>
                  <select
                    value={createBatchId}
                    onChange={(e) => setCreateBatchId(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">-- No Batch Link --</option>
                    {batchesList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} ({b.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Responsible Owner</label>
                  <select
                    value={createAssignedTo}
                    onChange={(e) => setCreateAssignedTo(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">-- Unassigned --</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.roles.join(', ')})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={formGroupStyle}>
                  <label style={labelStyle}>Target Due Date</label>
                  <input
                    type="date"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Root Cause Analysis (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Initial 5-Why or Ishikawa observations..."
                  value={createRootCause}
                  onChange={(e) => setCreateRootCause(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsCreateCaseOpen(false)}
                  style={btnSecondaryStyle}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingCase} style={btnPrimaryStyle}>
                  {isSubmittingCase ? 'Opening...' : 'Open Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Action Modal */}
      {isAddActionOpen && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', color: '#2d3748' }}>
              Add Corrective / Preventive Action
            </h3>
            <form onSubmit={handleAddAction}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Action Type *</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as CapaActionType)}
                  style={selectStyle}
                >
                  <option value="IMMEDIATE_CONTAINMENT">
                    Immediate Containment (Quarantine / Stop)
                  </option>
                  <option value="CORRECTIVE">Corrective Action (Eliminate Cause)</option>
                  <option value="PREVENTIVE">Preventive Action (Recurrence Prevention)</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Action Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Specific actions to be executed..."
                  value={actionDescription}
                  onChange={(e) => setActionDescription(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Action Owner</label>
                <select
                  value={actionAssignedTo}
                  onChange={(e) => setActionAssignedTo(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">-- Unassigned --</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.roles.join(', ')})
                    </option>
                  ))}
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Target Completion Date</label>
                <input
                  type="date"
                  value={actionDueDate}
                  onChange={(e) => setActionDueDate(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsAddActionOpen(false)}
                  style={btnSecondaryStyle}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingAction} style={btnPrimaryStyle}>
                  {isSubmittingAction ? 'Adding...' : 'Add Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Action Modal */}
      {completeActionTarget && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#2d3748' }}>
              Mark Action Complete
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#718096' }}>
              Action: <strong>{completeActionTarget.description}</strong>
            </p>
            <form onSubmit={handleCompleteAction}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Completion Notes / Evidence *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Document physical evidence, inspection result, or procedure update..."
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setCompleteActionTarget(null)}
                  style={btnSecondaryStyle}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingComplete} style={btnPrimaryStyle}>
                  {isSubmittingComplete ? 'Completing...' : 'Mark Complete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {verifyTargetCase && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#2d3748' }}>
              Independent QA Verification
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#718096' }}>
              Case: <strong>{verifyTargetCase.caseNumber}</strong> ({verifyTargetCase.title})
            </p>

            <form onSubmit={handleVerifyCase}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Verification Outcome *</label>
                <select
                  value={verificationResult}
                  onChange={(e) => setVerificationResult(e.target.value as 'PASS' | 'FAIL')}
                  style={selectStyle}
                >
                  <option value="PASS">PASS — Actions Verified Effective</option>
                  <option value="FAIL">FAIL — Defect Recurred / Ineffective</option>
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Verification Audit Notes *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe verification testing, sample audits, or evidence confirming effectiveness..."
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div
                style={{
                  backgroundColor: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '12px',
                  color: '#718096',
                  marginBottom: '16px',
                }}
              >
                <strong>Audit Rule:</strong> Only an authorized Quality Manager or Admin may verify.
                Passing verification enables formal closure. Failing verification returns the case
                to IN_PROGRESS.
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setVerifyTargetCase(null)}
                  style={btnSecondaryStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVerify}
                  style={verificationResult === 'PASS' ? btnPrimaryStyle : btnDangerStyle}
                >
                  {isSubmittingVerify ? 'Recording...' : 'Submit Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Closure Modal */}
      {closeTargetCase && (
        <div style={modalBackdropStyle}>
          <div style={{ ...modalContentStyle, maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#2d3748' }}>
              Formally Close CAPA Case
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#718096' }}>
              Case: <strong>{closeTargetCase.caseNumber}</strong> ({closeTargetCase.title})
            </p>

            <form onSubmit={handleCloseCase}>
              <div
                style={{
                  backgroundColor: '#f0fff4',
                  border: '1px solid #c6f6d5',
                  borderRadius: '6px',
                  padding: '12px',
                  fontSize: '13px',
                  color: '#276749',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  Closure Preconditions Satisfied:
                </div>
                <div>&bull; All corrective/preventive actions completed</div>
                <div>&bull; Independent QA verification recorded (PASSED)</div>
                <div>&bull; Historical records are immutable once closed</div>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Final Closure Notes (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Summary sign-off comments or archive reference..."
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  style={textareaStyle}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setCloseTargetCase(null)}
                  style={btnSecondaryStyle}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingClose} style={btnSuccessStyle}>
                  {isSubmittingClose ? 'Closing...' : 'Confirm Case Closure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Inline Styles
const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid #cbd5e0',
  fontWeight: 700,
  color: '#4a5568',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  verticalAlign: 'middle',
};

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '12px 16px',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  fontWeight: 700,
  color: 'var(--qo-slate-500)',
  marginBottom: '6px',
  letterSpacing: '0.05em',
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: 'var(--qo-navy-900)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#4a5568',
  marginBottom: '4px',
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: '12px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e0',
  fontSize: '13px',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e0',
  fontSize: '13px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e0',
  fontSize: '13px',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.65)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
  padding: '16px',
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'var(--qo-white)',
  borderRadius: 'var(--qo-radius-xl)',
  padding: '24px',
  width: '100%',
  boxShadow: 'var(--qo-shadow-xl)',
  border: '1px solid var(--qo-slate-200)',
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: 'var(--qo-primary)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 150ms ease',
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: '8px 14px',
  backgroundColor: 'var(--qo-white)',
  color: 'var(--qo-slate-700, #334155)',
  border: '1px solid var(--qo-slate-300)',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnDangerStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#e53e3e',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSuccessStyle: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#38a169',
  color: '#ffffff',
  border: 'none',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSmallSecondary: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#edf2f7',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSmallAction: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#ebf8ff',
  color: '#2b6cb0',
  border: '1px solid #bee3f8',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSmallVerify: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#fefcbf',
  color: '#744210',
  border: '1px solid #faf089',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSmallClose: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#f0fff4',
  color: '#276749',
  border: '1px solid #c6f6d5',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 700,
  cursor: 'pointer',
};

const btnSmallComplete: React.CSSProperties = {
  padding: '3px 8px',
  backgroundColor: '#e6fffa',
  color: '#234e52',
  border: '1px solid #b2f5ea',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnPageStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#edf2f7',
  border: '1px solid #cbd5e0',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
};
