import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  DowntimeCategory,
  DowntimeRecord,
  Machine,
  ProductionBatch,
  ProductionLine,
} from '@qualityops/contracts';

export const DowntimeView: React.FC = () => {
  const { user, accessToken } = useAuth();
  const canOperate =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('SUPERVISOR') ||
    user?.roles.includes('OPERATOR');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Master Data Lookups
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);

  // Downtime state
  const [downtimes, setDowntimes] = useState<DowntimeRecord[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Record Downtime Modal State
  const [isRecordOpen, setIsRecordOpen] = useState(false);
  const [newLineId, setNewLineId] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [newBatchId, setNewBatchId] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newCategory, setNewCategory] = useState<DowntimeCategory>('UNPLANNED');
  const [newStartedAt, setNewStartedAt] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [isSubmittingRecord, setIsSubmittingRecord] = useState(false);

  // Close Downtime Modal State
  const [closingEvent, setClosingEvent] = useState<DowntimeRecord | null>(null);
  const [closeEndedAt, setCloseEndedAt] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Fetch Lookups
  const fetchLookups = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [lineRes, mchRes, batRes] = await Promise.all([
        fetch('/api/v1/master-data/production-lines?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/master-data/machines?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/production/batches?limit=100&status=IN_PROGRESS', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (lineRes.ok) {
        const data = await lineRes.json();
        setLines(data.items);
      }
      if (mchRes.ok) {
        const data = await mchRes.json();
        setMachines(data.items);
      }
      if (batRes.ok) {
        const data = await batRes.json();
        setBatches(data.items);
      }
    } catch {
      // Ignore background lookup errors
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  // Fetch Downtimes
  const fetchDowntimes = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setFeedback(null);

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (search.trim()) query.set('search', search.trim());
    if (categoryFilter !== 'ALL') query.set('category', categoryFilter);
    if (lineFilter !== 'ALL') query.set('productionLineId', lineFilter);

    try {
      const res = await fetch(`/api/v1/production/downtime?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to load downtime events');
      }

      const data = await res.json();
      setDowntimes(data.items);
      setTotalItems(data.total);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error loading downtime events',
      });
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, page, limit, search, categoryFilter, lineFilter]);

  useEffect(() => {
    void fetchDowntimes();
  }, [fetchDowntimes]);

  // Open Record Modal
  const handleOpenRecord = () => {
    setNewLineId(lines[0]?.id || '');
    setNewMachineId('');
    setNewBatchId('');
    setNewReason('');
    setNewCategory('UNPLANNED');
    setNewStartedAt(new Date().toISOString().slice(0, 16)); // YYYY-MM-DDTHH:mm
    setNewNotes('');
    setIsRecordOpen(true);
  };

  // Submit Record Downtime
  const handleRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperate || !accessToken) return;

    setIsSubmittingRecord(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/v1/production/downtime', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          productionLineId: newLineId,
          machineId: newMachineId || null,
          batchId: newBatchId || null,
          reason: newReason.trim(),
          category: newCategory,
          startedAt: new Date(newStartedAt).toISOString(),
          notes: newNotes.trim() || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to record downtime');
      }

      setFeedback({
        type: 'success',
        message: 'Downtime event logged successfully.',
      });
      setIsRecordOpen(false);
      await fetchDowntimes();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error recording downtime',
      });
    } finally {
      setIsSubmittingRecord(false);
    }
  };

  // Open Close Modal
  const handleOpenClose = (event: DowntimeRecord) => {
    setClosingEvent(event);
    setCloseEndedAt(new Date().toISOString().slice(0, 16));
    setCloseNotes(event.notes || '');
  };

  // Submit Close Downtime
  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingEvent || !canOperate || !accessToken) return;

    setIsSubmittingClose(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/production/downtime/${closingEvent.id}/close`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          endedAt: new Date(closeEndedAt).toISOString(),
          notes: closeNotes.trim() || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to close downtime event');
      }

      setFeedback({
        type: 'success',
        message: `Downtime event closed. Duration: ${
          resData.item.durationSeconds !== null
            ? Math.round(resData.item.durationSeconds / 60) + ' min'
            : 'calculated'
        }.`,
      });
      setClosingEvent(null);
      await fetchDowntimes();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error closing downtime event',
      });
    } finally {
      setIsSubmittingClose(false);
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return 'Ongoing';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    return remainingSecs > 0 ? `${mins}m ${remainingSecs}s` : `${mins}m`;
  };

  return (
    <section aria-labelledby="downtime-heading">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3 id="downtime-heading" style={{ margin: 0, fontSize: '20px', color: '#1a202c' }}>
            Production Downtime Events
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>
            Capture and track equipment stoppages, line breakdowns, and planned maintenance
            intervals.
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenRecord}
            disabled={!canOperate}
            title={canOperate ? 'Log equipment or line downtime' : 'Requires operational role'}
            aria-label="Log new downtime event"
            style={{
              backgroundColor: canOperate ? '#e53e3e' : '#cbd5e0',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: canOperate ? 'pointer' : 'not-allowed',
            }}
          >
            + Log Downtime
          </button>
        </div>
      </div>

      {/* Role Notice */}
      {!canOperate && (
        <div
          role="note"
          style={{
            padding: '8px 12px',
            backgroundColor: '#fffaf0',
            border: '1px solid #feebc8',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#c05621',
          }}
        >
          <strong>Read-Only Mode:</strong> Your role ({user?.roles.join(', ')}) permits viewing
          downtime history. Recording or closing downtime events requires <code>ADMIN</code>,{' '}
          <code>SUPERVISOR</code>, or <code>OPERATOR</code>.
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            backgroundColor: feedback.type === 'success' ? '#c6f6d5' : '#fed7d7',
            color: feedback.type === 'success' ? '#22543d' : '#742a2a',
            border: `1px solid ${feedback.type === 'success' ? '#9ae6b4' : '#feb2b2'}`,
          }}
        >
          {feedback.message}
        </div>
      )}

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          backgroundColor: '#f7fafc',
          border: '1px solid #edf2f7',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: '1', minWidth: '180px' }}>
          <label htmlFor="downtime-search" style={{ display: 'none' }}>
            Search Reason
          </label>
          <input
            id="downtime-search"
            type="search"
            placeholder="Search reason..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="downtime-cat-filter"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Category:
          </label>
          <select
            id="downtime-cat-filter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
            }}
          >
            <option value="ALL">All Categories</option>
            <option value="UNPLANNED">UNPLANNED (Breakdowns)</option>
            <option value="PLANNED">PLANNED (Maintenance)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="downtime-line-filter"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Line:
          </label>
          <select
            id="downtime-line-filter"
            value={lineFilter}
            onChange={(e) => {
              setLineFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
            }}
          >
            <option value="ALL">All Lines</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {isLoading && <p style={{ fontSize: '13px', color: '#718096' }}>Loading events...</p>}
        {!isLoading && totalItems === 0 && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              backgroundColor: '#f7fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              color: '#718096',
            }}
          >
            No downtime events logged matching criteria.
          </div>
        )}

        {!isLoading && totalItems > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Reason</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Category</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                  Location / Machine
                </th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Batch</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Started</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Duration</th>
                <th
                  style={{
                    padding: '8px 12px',
                    borderBottom: '2px solid #cbd5e0',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {downtimes.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    <div>{d.reason}</div>
                    {d.notes && (
                      <div style={{ fontSize: '11px', color: '#718096', fontWeight: 400 }}>
                        {d.notes}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span
                      style={{
                        backgroundColor: d.category === 'UNPLANNED' ? '#fed7d7' : '#feebc8',
                        color: d.category === 'UNPLANNED' ? '#742a2a' : '#7b341e',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {d.category}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div>{d.productionLineCode}</div>
                    <div style={{ fontSize: '11px', color: '#718096' }}>
                      {d.machineCode ? d.machineCode : 'Whole Line'}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>{d.batchNumber || '-'}</td>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {new Date(d.startedAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {d.endedAt ? (
                      formatDuration(d.durationSeconds)
                    ) : (
                      <span style={{ color: '#c53030' }}>Ongoing</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    {!d.endedAt && canOperate && (
                      <button
                        onClick={() => handleOpenClose(d)}
                        style={{
                          backgroundColor: '#38a169',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Close Event
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            fontSize: '13px',
          }}
        >
          <span style={{ color: '#718096' }}>
            Page {page} of {totalPages} ({totalItems} records)
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1}
              style={{
                padding: '6px 12px',
                border: '1px solid #cbd5e0',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
              style={{
                padding: '6px 12px',
                border: '1px solid #cbd5e0',
                borderRadius: '4px',
                backgroundColor: '#ffffff',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Record Downtime Modal */}
      {isRecordOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-downtime-title"
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
              maxWidth: '460px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h4 id="record-downtime-title" style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
              Log Equipment / Line Downtime
            </h4>
            <form onSubmit={handleRecordSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-line"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Production Line *
                </label>
                <select
                  id="dt-line"
                  required
                  value={newLineId}
                  onChange={(e) => {
                    setNewLineId(e.target.value);
                    setNewMachineId('');
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} - {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-machine"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Machine (Optional)
                </label>
                <select
                  id="dt-machine"
                  value={newMachineId}
                  onChange={(e) => setNewMachineId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">(Line-level stoppage / No specific machine)</option>
                  {machines
                    .filter((m) => m.productionLineId === newLineId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name}
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-batch"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Active Batch Affected (Optional)
                </label>
                <select
                  id="dt-batch"
                  value={newBatchId}
                  onChange={(e) => setNewBatchId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">(None)</option>
                  {batches
                    .filter((b) => b.productionLineId === newLineId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} ({b.productCode})
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-category"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Category *
                </label>
                <select
                  id="dt-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as DowntimeCategory)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="UNPLANNED">UNPLANNED (Breakdown / Component failure)</option>
                  <option value="PLANNED">
                    PLANNED (Scheduled Tooling / Changeover / Maintenance)
                  </option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-reason"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Reason / Fault Description *
                </label>
                <input
                  id="dt-reason"
                  type="text"
                  required
                  placeholder="e.g. Hydraulic line pressure loss"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
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

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="dt-started"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Started At *
                </label>
                <input
                  id="dt-started"
                  type="datetime-local"
                  required
                  value={newStartedAt}
                  onChange={(e) => setNewStartedAt(e.target.value)}
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

              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="dt-notes"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Notes
                </label>
                <textarea
                  id="dt-notes"
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsRecordOpen(false)}
                  style={{
                    padding: '6px 14px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRecord}
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#e53e3e',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmittingRecord ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {isSubmittingRecord ? 'Logging...' : 'Log Downtime'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Downtime Modal */}
      {closingEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-downtime-title"
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
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h4 id="close-downtime-title" style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
              Close Downtime Event
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#718096' }}>
              {closingEvent.reason} &bull; Started at{' '}
              {new Date(closingEvent.startedAt).toLocaleTimeString()}
            </p>
            <form onSubmit={handleCloseSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="close-ended"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Resolution / End Time *
                </label>
                <input
                  id="close-ended"
                  type="datetime-local"
                  required
                  value={closeEndedAt}
                  onChange={(e) => setCloseEndedAt(e.target.value)}
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

              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="close-notes"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Resolution Notes
                </label>
                <textarea
                  id="close-notes"
                  rows={3}
                  placeholder="e.g. Cleared blockage and performed test run"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setClosingEvent(null)}
                  style={{
                    padding: '6px 14px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClose}
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#38a169',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmittingClose ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {isSubmittingClose ? 'Closing...' : 'Close Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
