import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  QualityInspection,
  InspectionStage,
  InspectionStatus,
  ProductionBatch,
} from '@qualityops/contracts';

export const QualityInspectionsView: React.FC = () => {
  const { user, accessToken } = useAuth();

  const canInspect =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('QUALITY_MANAGER') ||
    user?.roles.includes('INSPECTOR');

  const canCorrect = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Inspections state
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Available batches for inspection creation
  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  // Create Inspection Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createBatchId, setCreateBatchId] = useState('');
  const [createStage, setCreateStage] = useState<InspectionStage>('FINAL');
  const [createAttemptNumber, setCreateAttemptNumber] = useState('');
  const [createStatus, setCreateStatus] = useState<InspectionStatus>('COMPLETED');
  const [createSampleSize, setCreateSampleSize] = useState('');
  const [createPassedUnits, setCreatePassedUnits] = useState('0');
  const [createFailedUnits, setCreateFailedUnits] = useState('0');
  const [createResult, setCreateResult] = useState<string>('AUTO');
  const [createNotes, setCreateNotes] = useState('');
  const [createInspectedAt, setCreateInspectedAt] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Detail Modal State
  const [selectedInspection, setSelectedInspection] = useState<QualityInspection | null>(null);

  // Correction Modal State
  const [editingInspection, setEditingInspection] = useState<QualityInspection | null>(null);
  const [editSampleSize, setEditSampleSize] = useState('');
  const [editPassedUnits, setEditPassedUnits] = useState('');
  const [editFailedUnits, setEditFailedUnits] = useState('');
  const [editStatus, setEditStatus] = useState<InspectionStatus>('COMPLETED');
  const [editResult, setEditResult] = useState<string>('AUTO');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Fetch batches for selection (filtering to eligible statuses)
  const fetchBatches = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/v1/production/batches?limit=100', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Eligible batch statuses: IN_PROGRESS, ON_HOLD, COMPLETED
        const eligible = (data.items || []).filter(
          (b: ProductionBatch) =>
            b.status === 'IN_PROGRESS' || b.status === 'ON_HOLD' || b.status === 'COMPLETED',
        );
        setBatches(eligible);
      }
    } catch {
      // Ignore background batch loading errors
    }
  }, [accessToken]);

  // Fetch inspections list
  const fetchInspections = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setFeedback(null);

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));

    if (search.trim()) params.set('search', search.trim());
    if (stageFilter !== 'ALL') params.set('stage', stageFilter);
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (resultFilter !== 'ALL') params.set('result', resultFilter);

    try {
      const res = await fetch(`/api/v1/quality/inspections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to load quality inspections');
      }

      setInspections(data.items || []);
      setTotalItems(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error fetching inspections',
      });
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, page, limit, search, stageFilter, statusFilter, resultFilter]);

  useEffect(() => {
    void fetchInspections();
  }, [fetchInspections]);

  useEffect(() => {
    if (canInspect) {
      void fetchBatches();
    }
  }, [canInspect, fetchBatches]);

  // Selected batch for creation form
  const selectedBatchForCreate = batches.find((b) => b.id === createBatchId);

  // Derived validation calculations for create modal
  const sampleNum = parseInt(createSampleSize, 10) || 0;
  const passedNum = parseInt(createPassedUnits, 10) || 0;
  const failedNum = parseInt(createFailedUnits, 10) || 0;
  const sumUnits = passedNum + failedNum;
  const derivedAutoResult = failedNum === 0 ? 'PASS' : 'FAIL';

  // Derived validation calculations for edit modal
  const editSampleNum = parseInt(editSampleSize, 10) || 0;
  const editPassedNum = parseInt(editPassedUnits, 10) || 0;
  const editFailedNum = parseInt(editFailedUnits, 10) || 0;
  const editSumUnits = editPassedNum + editFailedNum;
  const editDerivedAutoResult = editFailedNum === 0 ? 'PASS' : 'FAIL';

  // Submit create inspection
  const handleCreateInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canInspect || !accessToken) return;

    if (!createBatchId) {
      setFeedback({ type: 'error', message: 'Please select an eligible production batch.' });
      return;
    }

    if (sampleNum <= 0) {
      setFeedback({ type: 'error', message: 'Sample size must be greater than 0.' });
      return;
    }

    if (selectedBatchForCreate && sampleNum > selectedBatchForCreate.producedQuantity) {
      setFeedback({
        type: 'error',
        message: `Sample size (${sampleNum}) cannot exceed batch produced quantity (${selectedBatchForCreate.producedQuantity}).`,
      });
      return;
    }

    if (sumUnits > sampleNum) {
      setFeedback({
        type: 'error',
        message: `Sum of passed (${passedNum}) and failed (${failedNum}) units cannot exceed sample size (${sampleNum}).`,
      });
      return;
    }

    if (createStatus === 'COMPLETED' && sumUnits !== sampleNum) {
      setFeedback({
        type: 'error',
        message: `Completed inspection must be fully reconciled: passed + failed (${sumUnits}) must equal sample size (${sampleNum}).`,
      });
      return;
    }

    setIsSubmittingCreate(true);
    setFeedback(null);

    const payload: Record<string, unknown> = {
      batchId: createBatchId,
      stage: createStage,
      status: createStatus,
      sampleSize: sampleNum,
      passedUnits: passedNum,
      failedUnits: failedNum,
      notes: createNotes.trim() || undefined,
    };

    if (createAttemptNumber.trim()) {
      payload.attemptNumber = parseInt(createAttemptNumber, 10);
    }

    if (createResult !== 'AUTO') {
      payload.result = createResult;
    }

    if (createInspectedAt.trim()) {
      payload.inspectedAt = new Date(createInspectedAt).toISOString();
    }

    try {
      const res = await fetch('/api/v1/quality/inspections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to create quality inspection');
      }

      setFeedback({
        type: 'success',
        message: `Inspection ${data.item.inspectionNumber} recorded successfully.`,
      });

      setIsCreateOpen(false);
      setCreateBatchId('');
      setCreateSampleSize('');
      setCreatePassedUnits('0');
      setCreateFailedUnits('0');
      setCreateResult('AUTO');
      setCreateNotes('');
      setCreateAttemptNumber('');
      setCreateInspectedAt('');
      void fetchInspections();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error creating inspection',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit / Correction Modal
  const openCorrectionModal = (inspection: QualityInspection) => {
    setEditingInspection(inspection);
    setEditSampleSize(String(inspection.sampleSize));
    setEditPassedUnits(String(inspection.passedUnits));
    setEditFailedUnits(String(inspection.failedUnits));
    setEditStatus(inspection.status);
    setEditResult(inspection.result || 'AUTO');
    setEditNotes(inspection.notes || '');
    setEditReason('');
  };

  // Submit correction
  const handleCorrectInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCorrect || !accessToken || !editingInspection) return;

    if (!editReason.trim()) {
      setFeedback({
        type: 'error',
        message: 'Reason for correction is required for the audit trail.',
      });
      return;
    }

    if (editSampleNum <= 0) {
      setFeedback({ type: 'error', message: 'Sample size must be greater than 0.' });
      return;
    }

    if (editSumUnits > editSampleNum) {
      setFeedback({
        type: 'error',
        message: `Sum of passed (${editPassedNum}) and failed (${editFailedNum}) units cannot exceed sample size (${editSampleNum}).`,
      });
      return;
    }

    if (editStatus === 'COMPLETED' && editSumUnits !== editSampleNum) {
      setFeedback({
        type: 'error',
        message: `Completed inspection must be fully reconciled: passed + failed (${editSumUnits}) must equal sample size (${editSampleNum}).`,
      });
      return;
    }

    setIsSubmittingEdit(true);
    setFeedback(null);

    const payload: Record<string, unknown> = {
      sampleSize: editSampleNum,
      passedUnits: editPassedNum,
      failedUnits: editFailedNum,
      status: editStatus,
      notes: editNotes.trim() || undefined,
      reasonForCorrection: editReason.trim(),
    };

    if (editResult !== 'AUTO') {
      payload.result = editResult;
    }

    try {
      const res = await fetch(`/api/v1/quality/inspections/${editingInspection.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to update inspection');
      }

      setFeedback({
        type: 'success',
        message: `Inspection ${editingInspection.inspectionNumber} corrected and audited successfully.`,
      });

      setEditingInspection(null);
      void fetchInspections();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error correcting inspection',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <section aria-labelledby="quality-inspections-heading">
      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3
            id="quality-inspections-heading"
            style={{ fontSize: '20px', margin: '0 0 4px 0', color: '#2d3748' }}
          >
            Quality Inspection Management
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#718096' }}>
            Stage-gate quality sampling, disposition metrics, and immutable inspection history
          </p>
        </div>

        {canInspect ? (
          <button
            onClick={() => {
              setIsCreateOpen(true);
              setCreateInspectedAt(new Date().toISOString().slice(0, 16));
            }}
            style={{
              backgroundColor: '#3182ce',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            + Record Inspection
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

      {/* Info notice about sample isolation */}
      <div
        style={{
          backgroundColor: '#f7fafc',
          borderLeft: '4px solid #3182ce',
          padding: '12px 16px',
          marginBottom: '20px',
          fontSize: '13px',
          color: '#4a5568',
          borderRadius: '0 4px 4px 0',
        }}
      >
        <strong>Inspection Data Rule:</strong> Quality inspections verify representative batch
        samples at designated lifecycle stages. Sample results record pass/fail compliance and do
        not directly mutate production batch disposition quantities. Submitted inspection records
        are immutable; corrections require supervisor/manager authorization and produce audit trail
        logs.
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

      {/* Filters & Search Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#f8fafc',
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
        }}
      >
        <div style={{ flex: '1 1 200px' }}>
          <label
            htmlFor="filter-search"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Search
          </label>
          <input
            id="filter-search"
            type="text"
            placeholder="Inspection #, batch #, product..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
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

        <div style={{ flex: '0 1 140px' }}>
          <label
            htmlFor="filter-stage"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Stage
          </label>
          <select
            id="filter-stage"
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '14px',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">All Stages</option>
            <option value="RECEIVING">Receiving</option>
            <option value="FIRST_ARTICLE">First Article</option>
            <option value="IN_PROCESS">In Process</option>
            <option value="FINAL">Final</option>
          </select>
        </div>

        <div style={{ flex: '0 1 140px' }}>
          <label
            htmlFor="filter-status"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Status
          </label>
          <select
            id="filter-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '14px',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div style={{ flex: '0 1 140px' }}>
          <label
            htmlFor="filter-result"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Result
          </label>
          <select
            id="filter-result"
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '14px',
              backgroundColor: '#ffffff',
            }}
          >
            <option value="ALL">All Results</option>
            <option value="PASS">Pass</option>
            <option value="FAIL">Fail</option>
            <option value="CONDITIONAL">Conditional</option>
          </select>
        </div>
      </div>

      {/* Inspections Table */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflowX: 'auto',
          backgroundColor: '#ffffff',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>
                Inspection #
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Batch #</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Product</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Stage</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Attempt</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>
                Sample / Pass / Fail
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>
                Pass Rate
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Result</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Status</th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>
                Inspector
              </th>
              <th style={{ padding: '12px 14px', fontSize: '12px', color: '#4a5568' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: '#718096' }}>
                  Loading inspections...
                </td>
              </tr>
            ) : inspections.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: '#718096' }}>
                  No quality inspections found matching criteria.
                </td>
              </tr>
            ) : (
              inspections.map((insp) => {
                const passRate =
                  insp.sampleSize > 0
                    ? ((insp.passedUnits / insp.sampleSize) * 100).toFixed(1)
                    : '0.0';

                return (
                  <tr key={insp.id} style={{ borderBottom: '1px solid #edf2f7', fontSize: '13px' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#2d3748' }}>
                      {insp.inspectionNumber}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568' }}>
                      {insp.batchNumber || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568' }}>
                      {insp.productCode ? (
                        <span>
                          <strong>{insp.productCode}</strong>
                          <br />
                          <small style={{ color: '#718096' }}>{insp.productName}</small>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568' }}>
                      <span
                        style={{
                          backgroundColor: '#edf2f7',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {insp.stage}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568', textAlign: 'center' }}>
                      #{insp.attemptNumber}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568' }}>
                      <strong>{insp.sampleSize}</strong> /{' '}
                      <span style={{ color: '#276749' }}>{insp.passedUnits}</span> /{' '}
                      <span style={{ color: insp.failedUnits > 0 ? '#c53030' : '#718096' }}>
                        {insp.failedUnits}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#2d3748' }}>
                      {passRate}%
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor:
                            insp.result === 'PASS'
                              ? '#def7ec'
                              : insp.result === 'FAIL'
                                ? '#fde8e8'
                                : insp.result === 'CONDITIONAL'
                                  ? '#fef08a'
                                  : '#f3f4f6',
                          color:
                            insp.result === 'PASS'
                              ? '#03543f'
                              : insp.result === 'FAIL'
                                ? '#9b1c1c'
                                : insp.result === 'CONDITIONAL'
                                  ? '#713f12'
                                  : '#374151',
                        }}
                      >
                        {insp.result || 'PENDING'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor:
                            insp.status === 'COMPLETED'
                              ? '#ebf8ff'
                              : insp.status === 'IN_PROGRESS'
                                ? '#fefcbf'
                                : '#edf2f7',
                          color:
                            insp.status === 'COMPLETED'
                              ? '#2b6cb0'
                              : insp.status === 'IN_PROGRESS'
                                ? '#744210'
                                : '#4a5568',
                        }}
                      >
                        {insp.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4a5568' }}>
                      {insp.inspectorFullName || insp.inspectorUsername || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setSelectedInspection(insp)}
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
                            onClick={() => openCorrectionModal(insp)}
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
                );
              })
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
          Showing {inspections.length > 0 ? (page - 1) * limit + 1 : 0} &ndash;{' '}
          {Math.min(page * limit, totalItems)} of {totalItems} inspections
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

      {/* CREATE INSPECTION MODAL */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-labelledby="create-inspection-title"
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
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
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
                id="create-inspection-title"
                style={{ margin: 0, fontSize: '18px', color: '#2d3748' }}
              >
                Record Quality Inspection
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

            <form onSubmit={handleCreateInspection}>
              {/* Batch selection */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="create-batch-select"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Production Batch *
                </label>
                <select
                  id="create-batch-select"
                  required
                  value={createBatchId}
                  onChange={(e) => setCreateBatchId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e0',
                    fontSize: '14px',
                  }}
                >
                  <option value="">-- Select Active / Eligible Batch --</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchNumber} &bull; {b.productCode || 'No Prod'} ({b.status}, Produced:{' '}
                      {b.producedQuantity})
                    </option>
                  ))}
                </select>
                {selectedBatchForCreate && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#2b6cb0' }}>
                    Batch Status: <strong>{selectedBatchForCreate.status}</strong> &bull; Recorded
                    Produced Qty: <strong>{selectedBatchForCreate.producedQuantity}</strong>
                  </p>
                )}
              </div>

              {/* Stage & Attempt */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-stage-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Inspection Stage *
                  </label>
                  <select
                    id="create-stage-select"
                    value={createStage}
                    onChange={(e) => setCreateStage(e.target.value as InspectionStage)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                    }}
                  >
                    <option value="FINAL">Final Inspection</option>
                    <option value="IN_PROCESS">In Process</option>
                    <option value="FIRST_ARTICLE">First Article</option>
                    <option value="RECEIVING">Receiving</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-attempt-input"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Attempt Number (Optional)
                  </label>
                  <input
                    id="create-attempt-input"
                    type="number"
                    min="1"
                    placeholder="Auto (Next available)"
                    value={createAttemptNumber}
                    onChange={(e) => setCreateAttemptNumber(e.target.value)}
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
              </div>

              {/* Sample Metrics: Size, Passed, Failed */}
              <div
                style={{
                  backgroundColor: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      htmlFor="create-sample-size"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#4a5568',
                        marginBottom: '4px',
                      }}
                    >
                      Sample Size *
                    </label>
                    <input
                      id="create-sample-size"
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 10"
                      value={createSampleSize}
                      onChange={(e) => setCreateSampleSize(e.target.value)}
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
                      htmlFor="create-passed-units"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#276749',
                        marginBottom: '4px',
                      }}
                    >
                      Passed Units *
                    </label>
                    <input
                      id="create-passed-units"
                      type="number"
                      min="0"
                      required
                      value={createPassedUnits}
                      onChange={(e) => setCreatePassedUnits(e.target.value)}
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
                      htmlFor="create-failed-units"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#c53030',
                        marginBottom: '4px',
                      }}
                    >
                      Failed Units *
                    </label>
                    <input
                      id="create-failed-units"
                      type="number"
                      min="0"
                      required
                      value={createFailedUnits}
                      onChange={(e) => setCreateFailedUnits(e.target.value)}
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

                {/* Validation Warnings & Feedback */}
                {selectedBatchForCreate && sampleNum > selectedBatchForCreate.producedQuantity && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#c53030' }}>
                    &bull; Warning: Sample size ({sampleNum}) exceeds batch produced quantity (
                    {selectedBatchForCreate.producedQuantity}).
                  </p>
                )}

                {sumUnits > sampleNum && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#c53030' }}>
                    &bull; Warning: Passed ({passedNum}) + Failed ({failedNum}) = {sumUnits} exceeds
                    sample size ({sampleNum}).
                  </p>
                )}

                {createStatus === 'COMPLETED' && sampleNum > 0 && sumUnits !== sampleNum && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#dd6b20' }}>
                    &bull; Notice: Completed inspections must be fully reconciled: passed + failed (
                    {sumUnits}) must equal sample size ({sampleNum}).
                  </p>
                )}

                {sampleNum > 0 && sumUnits <= sampleNum && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#2b6cb0' }}>
                    &bull; Live Derivation: Outcome will automatically resolve to{' '}
                    <strong>{derivedAutoResult}</strong> (
                    {failedNum === 0 ? '0 defects recorded' : `${failedNum} defect(s) detected`}
                    ).
                  </p>
                )}
              </div>

              {/* Status & Result */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-status-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Inspection Status *
                  </label>
                  <select
                    id="create-status-select"
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as InspectionStatus)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                    }}
                  >
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="create-result-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Inspection Result
                  </label>
                  <select
                    id="create-result-select"
                    value={createResult}
                    onChange={(e) => setCreateResult(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                    }}
                  >
                    <option value="AUTO">Auto Derive ({derivedAutoResult})</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="CONDITIONAL">CONDITIONAL</option>
                  </select>
                </div>
              </div>

              {/* Inspected At & Notes */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="create-inspected-at"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Inspected At Date/Time (Defaults to Current Time)
                </label>
                <input
                  id="create-inspected-at"
                  type="datetime-local"
                  value={createInspectedAt}
                  onChange={(e) => setCreateInspectedAt(e.target.value)}
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

              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="create-notes"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#4a5568',
                    marginBottom: '4px',
                  }}
                >
                  Inspection Notes & Observations
                </label>
                <textarea
                  id="create-notes"
                  rows={3}
                  placeholder="Record observations, visual defect notes, instrument calibration IDs..."
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
                  {isSubmittingCreate ? 'Submitting...' : 'Record Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedInspection && (
        <div
          role="dialog"
          aria-labelledby="detail-inspection-title"
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
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
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
                  id="detail-inspection-title"
                  style={{ margin: 0, fontSize: '18px', color: '#2d3748' }}
                >
                  Inspection: {selectedInspection.inspectionNumber}
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>
                  Recorded on {new Date(selectedInspection.inspectedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
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
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#718096',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Batch Reference
                </span>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#2d3748',
                  }}
                >
                  {selectedInspection.batchNumber || selectedInspection.batchId}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#4a5568' }}>
                  {selectedInspection.productCode} &bull; {selectedInspection.productName}
                </p>
              </div>

              <div style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#718096',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  Stage & Attempt
                </span>
                <p
                  style={{
                    margin: '4px 0 0 0',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#2d3748',
                  }}
                >
                  {selectedInspection.stage} (Attempt #{selectedInspection.attemptNumber})
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#4a5568' }}>
                  Status: <strong>{selectedInspection.status}</strong>
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#f8fafc',
                padding: '16px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px',
              }}
            >
              <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#2d3748' }}>
                Sample Metrics & Classification
              </h5>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Sample Size</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#2d3748' }}>
                    {selectedInspection.sampleSize}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Passed</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#276749' }}>
                    {selectedInspection.passedUnits}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Failed</div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: selectedInspection.failedUnits > 0 ? '#c53030' : '#4a5568',
                    }}
                  >
                    {selectedInspection.failedUnits}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Final Result</div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color:
                        selectedInspection.result === 'PASS'
                          ? '#03543f'
                          : selectedInspection.result === 'FAIL'
                            ? '#9b1c1c'
                            : '#713f12',
                    }}
                  >
                    {selectedInspection.result || 'PENDING'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#4a5568' }}>Notes:</span>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '13px',
                  color: '#4a5568',
                  backgroundColor: '#f7fafc',
                  padding: '10px',
                  borderRadius: '6px',
                }}
              >
                {selectedInspection.notes || 'No notes entered for this inspection record.'}
              </p>
            </div>

            <div
              style={{
                fontSize: '12px',
                color: '#718096',
                borderTop: '1px solid #e2e8f0',
                paddingTop: '12px',
              }}
            >
              <p style={{ margin: '0 0 4px 0' }}>
                Inspector:{' '}
                <strong>
                  {selectedInspection.inspectorFullName || selectedInspection.inspectorUsername}
                </strong>{' '}
                (ID: {selectedInspection.inspectorId})
              </p>
              <p style={{ margin: 0 }}>
                Created At: {new Date(selectedInspection.createdAt).toLocaleString()} &bull; Last
                Updated: {new Date(selectedInspection.updatedAt).toLocaleString()}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setSelectedInspection(null)}
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORRECTION / EDIT MODAL */}
      {editingInspection && canCorrect && (
        <div
          role="dialog"
          aria-labelledby="correct-inspection-title"
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
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
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
                  id="correct-inspection-title"
                  style={{ margin: 0, fontSize: '18px', color: '#c05621' }}
                >
                  Authorized Correction: {editingInspection.inspectionNumber}
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#718096' }}>
                  Restricted to ADMIN and QUALITY_MANAGER. All edits generate an audit log record.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingInspection(null)}
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

            <form onSubmit={handleCorrectInspection}>
              {/* Reason for correction (Audit Requirement) */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="edit-reason"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#c05621',
                    marginBottom: '4px',
                  }}
                >
                  Reason for Correction (Audit Log Requirement) *
                </label>
                <input
                  id="edit-reason"
                  type="text"
                  required
                  placeholder="e.g. Correcting typo in sample failed count after verification"
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

              {/* Sample Metrics: Size, Passed, Failed */}
              <div
                style={{
                  backgroundColor: '#fffaf0',
                  border: '1px solid #feebc8',
                  borderRadius: '6px',
                  padding: '12px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label
                      htmlFor="edit-sample-size"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#4a5568',
                        marginBottom: '4px',
                      }}
                    >
                      Sample Size *
                    </label>
                    <input
                      id="edit-sample-size"
                      type="number"
                      min="1"
                      required
                      value={editSampleSize}
                      onChange={(e) => setEditSampleSize(e.target.value)}
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
                      htmlFor="edit-passed-units"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#276749',
                        marginBottom: '4px',
                      }}
                    >
                      Passed Units *
                    </label>
                    <input
                      id="edit-passed-units"
                      type="number"
                      min="0"
                      required
                      value={editPassedUnits}
                      onChange={(e) => setEditPassedUnits(e.target.value)}
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
                      htmlFor="edit-failed-units"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#c53030',
                        marginBottom: '4px',
                      }}
                    >
                      Failed Units *
                    </label>
                    <input
                      id="edit-failed-units"
                      type="number"
                      min="0"
                      required
                      value={editFailedUnits}
                      onChange={(e) => setEditFailedUnits(e.target.value)}
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
                {editSumUnits > editSampleNum && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#c53030' }}>
                    &bull; Warning: Passed ({editPassedNum}) + Failed ({editFailedNum}) ={' '}
                    {editSumUnits} exceeds sample size ({editSampleNum}).
                  </p>
                )}

                {editStatus === 'COMPLETED' &&
                  editSampleNum > 0 &&
                  editSumUnits !== editSampleNum && (
                    <p style={{ margin: '4px 0', fontSize: '12px', color: '#dd6b20' }}>
                      &bull; Notice: Completed inspections must be fully reconciled: passed + failed
                      ({editSumUnits}) must equal sample size ({editSampleNum}).
                    </p>
                  )}

                {editSampleNum > 0 && editSumUnits <= editSampleNum && (
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#2b6cb0' }}>
                    &bull; Live Derivation: Auto result resolves to{' '}
                    <strong>{editDerivedAutoResult}</strong>.
                  </p>
                )}
              </div>

              {/* Status & Result */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="edit-status-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Status *
                  </label>
                  <select
                    id="edit-status-select"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as InspectionStatus)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                    }}
                  >
                    <option value="COMPLETED">Completed</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="edit-result-select"
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#4a5568',
                      marginBottom: '4px',
                    }}
                  >
                    Result
                  </label>
                  <select
                    id="edit-result-select"
                    value={editResult}
                    onChange={(e) => setEditResult(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e0',
                      fontSize: '14px',
                    }}
                  >
                    <option value="AUTO">Auto Derive ({editDerivedAutoResult})</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="CONDITIONAL">CONDITIONAL</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="edit-notes"
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
                  id="edit-notes"
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
                  onClick={() => setEditingInspection(null)}
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
