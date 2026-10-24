import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  ProductionBatch,
  Product,
  ProductionLine,
  Machine,
  Shift,
  BatchStatus,
} from '@qualityops/contracts';

export const ProductionBatchesView: React.FC = () => {
  const { user, accessToken } = useAuth();
  const canOperate =
    user?.roles.includes('ADMIN') ||
    user?.roles.includes('SUPERVISOR') ||
    user?.roles.includes('OPERATOR');
  const canElevate = user?.roles.includes('ADMIN') || user?.roles.includes('SUPERVISOR');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [lineFilter, setLineFilter] = useState<string>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Master Data Lookups
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  // Batches state
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Create Batch Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [newProductId, setNewProductId] = useState('');
  const [newLineId, setNewLineId] = useState('');
  const [newShiftId, setNewShiftId] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [newPlannedQty, setNewPlannedQty] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit / Update Batch Modal State
  const [editingBatch, setEditingBatch] = useState<ProductionBatch | null>(null);
  const [editProduced, setEditProduced] = useState<number>(0);
  const [editAccepted, setEditAccepted] = useState<number>(0);
  const [editScrap, setEditScrap] = useState<number>(0);
  const [editRework, setEditRework] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<BatchStatus>('PLANNED');
  const [editMachineId, setEditMachineId] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Fetch Master Data Lookups
  const fetchLookups = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [prodRes, lineRes, shiftRes, mchRes] = await Promise.all([
        fetch('/api/v1/master-data/products?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/master-data/production-lines?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/master-data/shifts?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch('/api/v1/master-data/machines?limit=100&isActive=true', {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (prodRes.ok) {
        const data = await prodRes.json();
        setProducts(data.items);
      }
      if (lineRes.ok) {
        const data = await lineRes.json();
        setLines(data.items);
      }
      if (shiftRes.ok) {
        const data = await shiftRes.json();
        setShifts(data.items);
      }
      if (mchRes.ok) {
        const data = await mchRes.json();
        setMachines(data.items);
      }
    } catch {
      // Ignore background lookup errors
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  // Fetch Batches
  const fetchBatches = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setFeedback(null);

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (search.trim()) query.set('search', search.trim());
    if (statusFilter !== 'ALL') query.set('status', statusFilter);
    if (lineFilter !== 'ALL') query.set('productionLineId', lineFilter);
    if (productFilter !== 'ALL') query.set('productId', productFilter);

    try {
      const res = await fetch(`/api/v1/production/batches?${query.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Failed to load batches');
      }

      const data = await res.json();
      setBatches(data.items);
      setTotalItems(data.total);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error loading batches',
      });
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, page, limit, search, statusFilter, lineFilter, productFilter]);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setNewBatchNumber(`BAT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setNewProductId(products[0]?.id || '');
    setNewLineId(lines[0]?.id || '');
    setNewShiftId(shifts[0]?.id || '');
    setNewMachineId('');
    setNewPlannedQty('100');
    setIsCreateOpen(true);
  };

  // Submit Create Batch
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperate || !accessToken) return;

    setIsSubmittingCreate(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/v1/production/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          batchNumber: newBatchNumber.trim(),
          productId: newProductId,
          productionLineId: newLineId,
          shiftId: newShiftId,
          machineId: newMachineId || null,
          plannedQuantity: parseInt(newPlannedQty, 10),
          status: 'PLANNED',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to create batch');
      }

      setFeedback({
        type: 'success',
        message: `Batch ${newBatchNumber} created successfully.`,
      });
      setIsCreateOpen(false);
      await fetchBatches();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error creating batch',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Open Edit Batch
  const handleOpenEdit = (batch: ProductionBatch) => {
    setEditingBatch(batch);
    setEditProduced(batch.producedQuantity);
    setEditAccepted(batch.acceptedQuantity);
    setEditScrap(batch.scrapQuantity);
    setEditRework(batch.reworkPendingQuantity);
    setEditStatus(batch.status);
    setEditMachineId(batch.machineId || '');
  };

  // Submit Edit Batch
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch || !canOperate || !accessToken) return;

    setIsSubmittingEdit(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/v1/production/batches/${editingBatch.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          machineId: editMachineId || null,
          producedQuantity: editProduced,
          acceptedQuantity: editAccepted,
          scrapQuantity: editScrap,
          reworkPendingQuantity: editRework,
          status: editStatus,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to update batch');
      }

      setFeedback({
        type: 'success',
        message: `Batch ${editingBatch.batchNumber} updated successfully.`,
      });
      setEditingBatch(null);
      await fetchBatches();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error updating batch',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Machines available for selected line in create/edit form
  const availableMachinesForLine = (selectedLineId: string) => {
    return machines.filter((m) => m.productionLineId === selectedLineId);
  };

  const dispositionSum = editAccepted + editScrap + editRework;
  const isDispositionExceeded = dispositionSum > editProduced;
  const isReconciled = dispositionSum === editProduced;

  return (
    <section aria-labelledby="batches-heading">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h3 id="batches-heading" style={{ margin: 0, fontSize: '20px', color: '#1a202c' }}>
            Production Batches
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#718096' }}>
            Manage manufacturing batch lifecycle: planning, execution, quantity disposition, and
            reconciliation.
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenCreate}
            disabled={!canOperate}
            title={
              canOperate
                ? 'Schedule new production batch'
                : 'Creation restricted to ADMIN, SUPERVISOR, or OPERATOR'
            }
            aria-label="Create new production batch"
            style={{
              backgroundColor: canOperate ? '#3182ce' : '#cbd5e0',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: canOperate ? 'pointer' : 'not-allowed',
            }}
          >
            + New Batch
          </button>
        </div>
      </div>

      {/* Role permission notice */}
      {!canOperate ? (
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
          production records only. Batch creation and execution requires <code>ADMIN</code>,{' '}
          <code>SUPERVISOR</code>, or <code>OPERATOR</code>.
        </div>
      ) : !canElevate ? (
        <div
          role="note"
          style={{
            padding: '8px 12px',
            backgroundColor: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#2b6cb0',
          }}
        >
          <strong>Operator Mode:</strong> You can create batches and record in-progress quantities.
          Marking batches as <code>COMPLETED</code> or <code>CANCELLED</code> requires{' '}
          <code>ADMIN</code> or <code>SUPERVISOR</code> approval.
        </div>
      ) : null}

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
          <label htmlFor="batch-search" style={{ display: 'none' }}>
            Search Batch
          </label>
          <input
            id="batch-search"
            type="search"
            placeholder="Search batch number..."
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
            htmlFor="batch-status-filter"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Status:
          </label>
          <select
            id="batch-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="PLANNED">PLANNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="ON_HOLD">ON_HOLD</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="batch-line-filter"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Line:
          </label>
          <select
            id="batch-line-filter"
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

        <div>
          <label
            htmlFor="batch-product-filter"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Product:
          </label>
          <select
            id="batch-product-filter"
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
            }}
          >
            <option value="ALL">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Data */}
      <div style={{ overflowX: 'auto' }}>
        {isLoading && <p style={{ fontSize: '13px', color: '#718096' }}>Loading batches...</p>}
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
            No production batches found matching criteria.
          </div>
        )}

        {!isLoading && totalItems > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Batch #</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Product</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                  Line / Shift
                </th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Status</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Planned</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Produced</th>
                <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                  Disposition
                </th>
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
              {batches.map((b) => {
                const statusColor =
                  b.status === 'COMPLETED'
                    ? '#22543d'
                    : b.status === 'IN_PROGRESS'
                      ? '#2b6cb0'
                      : b.status === 'ON_HOLD'
                        ? '#7b341e'
                        : b.status === 'CANCELLED'
                          ? '#742a2a'
                          : '#4a5568';
                const statusBg =
                  b.status === 'COMPLETED'
                    ? '#c6f6d5'
                    : b.status === 'IN_PROGRESS'
                      ? '#ebf8ff'
                      : b.status === 'ON_HOLD'
                        ? '#feebc8'
                        : b.status === 'CANCELLED'
                          ? '#fed7d7'
                          : '#edf2f7';

                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.batchNumber}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div>{b.productCode}</div>
                      <div style={{ fontSize: '11px', color: '#718096' }}>{b.productName}</div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div>{b.productionLineCode}</div>
                      <div style={{ fontSize: '11px', color: '#718096' }}>
                        {b.shiftName} {b.machineCode ? `/ ${b.machineCode}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span
                        style={{
                          backgroundColor: statusBg,
                          color: statusColor,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{b.plannedQuantity}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.producedQuantity}</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px' }}>
                      <span style={{ color: '#276749' }}>Acc: {b.acceptedQuantity}</span>{' '}
                      <span style={{ color: '#c53030' }}>Scrap: {b.scrapQuantity}</span>{' '}
                      <span style={{ color: '#d69e2e' }}>Rew: {b.reworkPendingQuantity}</span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleOpenEdit(b)}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#3182ce',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '13px',
                        }}
                      >
                        {canOperate && b.status !== 'CANCELLED' ? 'Manage' : 'View'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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
            Page {page} of {totalPages} ({totalItems} batches)
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

      {/* Create Batch Modal */}
      {isCreateOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-batch-title"
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
              maxWidth: '480px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h4 id="create-batch-title" style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
              Schedule Production Batch
            </h4>
            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="create-batch-number"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Batch Number *
                </label>
                <input
                  id="create-batch-number"
                  type="text"
                  required
                  value={newBatchNumber}
                  onChange={(e) => setNewBatchNumber(e.target.value)}
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
                  htmlFor="create-batch-product"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Product *
                </label>
                <select
                  id="create-batch-product"
                  required
                  value={newProductId}
                  onChange={(e) => setNewProductId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="create-batch-line"
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
                  id="create-batch-line"
                  required
                  value={newLineId}
                  onChange={(e) => {
                    setNewLineId(e.target.value);
                    setNewMachineId(''); // Reset machine when line changes
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
                  htmlFor="create-batch-machine"
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
                  id="create-batch-machine"
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
                  <option value="">(None assigned)</option>
                  {availableMachinesForLine(newLineId).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} - {m.name} ({m.status})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="create-batch-shift"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Shift *
                </label>
                <select
                  id="create-batch-shift"
                  required
                  value={newShiftId}
                  onChange={(e) => setNewShiftId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="create-batch-qty"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Planned Quantity *
                </label>
                <input
                  id="create-batch-qty"
                  type="number"
                  min="1"
                  required
                  value={newPlannedQty}
                  onChange={(e) => setNewPlannedQty(e.target.value)}
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
                  onClick={() => setIsCreateOpen(false)}
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
                  disabled={isSubmittingCreate}
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#3182ce',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmittingCreate ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {isSubmittingCreate ? 'Scheduling...' : 'Schedule Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Manage Batch Modal */}
      {editingBatch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-batch-title"
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
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h4 id="manage-batch-title" style={{ margin: '0 0 8px 0', fontSize: '17px' }}>
              Manage Batch: {editingBatch.batchNumber}
            </h4>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#718096' }}>
              {editingBatch.productName} ({editingBatch.productCode}) &bull; Line:{' '}
              {editingBatch.productionLineCode} &bull; Planned: {editingBatch.plannedQuantity} units
            </p>

            <form onSubmit={handleEditSubmit}>
              {/* Machine Assignment */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="edit-batch-machine"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Assigned Machine
                </label>
                <select
                  id="edit-batch-machine"
                  disabled={!canOperate || editingBatch.status === 'COMPLETED'}
                  value={editMachineId}
                  onChange={(e) => setEditMachineId(e.target.value)}
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
                  {availableMachinesForLine(editingBatch.productionLineId).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Transition */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="edit-batch-status"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Status
                </label>
                <select
                  id="edit-batch-status"
                  disabled={
                    !canOperate ||
                    editingBatch.status === 'COMPLETED' ||
                    editingBatch.status === 'CANCELLED'
                  }
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as BatchStatus)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value={editingBatch.status}>{editingBatch.status} (Current)</option>
                  {editingBatch.status === 'PLANNED' && (
                    <>
                      <option value="IN_PROGRESS">IN_PROGRESS (Start production)</option>
                      {canElevate && <option value="CANCELLED">CANCELLED</option>}
                    </>
                  )}
                  {editingBatch.status === 'IN_PROGRESS' && (
                    <>
                      <option value="ON_HOLD">ON_HOLD</option>
                      {canElevate && (
                        <option value="COMPLETED">COMPLETED (Finish & Reconcile)</option>
                      )}
                      {canElevate && <option value="CANCELLED">CANCELLED</option>}
                    </>
                  )}
                  {editingBatch.status === 'ON_HOLD' && (
                    <>
                      <option value="IN_PROGRESS">IN_PROGRESS (Resume)</option>
                      {canElevate && <option value="CANCELLED">CANCELLED</option>}
                    </>
                  )}
                </select>
              </div>

              {/* Quantities Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  backgroundColor: '#f7fafc',
                  border: '1px solid #edf2f7',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <label
                    htmlFor="edit-produced"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Produced Quantity
                  </label>
                  <input
                    id="edit-produced"
                    type="number"
                    min="0"
                    disabled={!canOperate || editingBatch.status === 'COMPLETED'}
                    value={editProduced}
                    onChange={(e) =>
                      setEditProduced(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
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
                    htmlFor="edit-accepted"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Accepted Quantity
                  </label>
                  <input
                    id="edit-accepted"
                    type="number"
                    min="0"
                    disabled={!canOperate || editingBatch.status === 'COMPLETED'}
                    value={editAccepted}
                    onChange={(e) =>
                      setEditAccepted(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
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
                    htmlFor="edit-scrap"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Scrap Quantity
                  </label>
                  <input
                    id="edit-scrap"
                    type="number"
                    min="0"
                    disabled={!canOperate || editingBatch.status === 'COMPLETED'}
                    value={editScrap}
                    onChange={(e) => setEditScrap(Math.max(0, parseInt(e.target.value, 10) || 0))}
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
                    htmlFor="edit-rework"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Rework Pending Quantity
                  </label>
                  <input
                    id="edit-rework"
                    type="number"
                    min="0"
                    disabled={!canOperate || editingBatch.status === 'COMPLETED'}
                    value={editRework}
                    onChange={(e) => setEditRework(Math.max(0, parseInt(e.target.value, 10) || 0))}
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
              </div>

              {/* Disposition Reconciliation Status */}
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  marginBottom: '16px',
                  backgroundColor: isDispositionExceeded
                    ? '#fed7d7'
                    : editStatus === 'COMPLETED' && !isReconciled
                      ? '#feebc8'
                      : '#edf2f7',
                  color: isDispositionExceeded
                    ? '#742a2a'
                    : editStatus === 'COMPLETED' && !isReconciled
                      ? '#7b341e'
                      : '#4a5568',
                }}
              >
                <div>
                  <strong>Disposition Total:</strong> {dispositionSum} / {editProduced} produced
                  units
                </div>
                {isDispositionExceeded && (
                  <div style={{ marginTop: '4px', fontWeight: 600 }}>
                    Warning: Disposition sum exceeds produced quantity! You must reduce accepted,
                    scrap, or rework counts.
                  </div>
                )}
                {editStatus === 'COMPLETED' && !isReconciled && (
                  <div style={{ marginTop: '4px', fontWeight: 600 }}>
                    Warning: Batch cannot be completed until fully reconciled (Sum must exactly
                    equal Produced: {dispositionSum} != {editProduced}).
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  style={{
                    padding: '6px 14px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    backgroundColor: '#ffffff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Close
                </button>
                {canOperate && editingBatch.status !== 'CANCELLED' && (
                  <button
                    type="submit"
                    disabled={
                      isSubmittingEdit ||
                      isDispositionExceeded ||
                      (editStatus === 'COMPLETED' && !isReconciled)
                    }
                    style={{
                      padding: '6px 14px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor:
                        isDispositionExceeded || (editStatus === 'COMPLETED' && !isReconciled)
                          ? '#cbd5e0'
                          : '#3182ce',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor:
                        isSubmittingEdit ||
                        isDispositionExceeded ||
                        (editStatus === 'COMPLETED' && !isReconciled)
                          ? 'not-allowed'
                          : 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
