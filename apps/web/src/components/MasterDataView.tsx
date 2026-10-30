import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  Product,
  ProductionLine,
  Machine,
  Shift,
  DefectType,
  MachineStatus,
  DefectSeverity,
} from '@qualityops/contracts';

type MasterDataTab = 'products' | 'lines' | 'machines' | 'shifts' | 'defects';

export const MasterDataView: React.FC = () => {
  const { user, accessToken } = useAuth();
  const canWrite = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');

  const [activeTab, setActiveTab] = useState<MasterDataTab>('products');

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Additional entity-specific filters
  const [machineStatusFilter, setMachineStatusFilter] = useState<string>('ALL');
  const [machineLineFilter, setMachineLineFilter] = useState<string>('ALL');
  const [defectSeverityFilter, setDefectSeverityFilter] = useState<string>('ALL');

  // Data state
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [defects, setDefects] = useState<DefectType[]>([]);

  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  // Form Fields
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCycleTime, setFormCycleTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formLineId, setFormLineId] = useState('');
  const [formMachineStatus, setFormMachineStatus] = useState<MachineStatus>('IDLE');
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('16:00');
  const [formCategory, setFormCategory] = useState('');
  const [formSeverity, setFormSeverity] = useState<DefectSeverity>('MINOR');
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load auxiliary lines for machine form dropdown
  const [availableLines, setAvailableLines] = useState<ProductionLine[]>([]);

  const fetchAuxiliaryLines = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/v1/master-data/production-lines?limit=100', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { items: ProductionLine[] };
        setAvailableLines(data.items);
      }
    } catch {
      // Ignore aux line fetch failures
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === 'machines') {
      void fetchAuxiliaryLines();
    }
  }, [activeTab, fetchAuxiliaryLines]);

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setFeedback(null);

    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('limit', String(limit));
    if (search.trim()) query.set('search', search.trim());
    if (statusFilter === 'ACTIVE') query.set('isActive', 'true');
    if (statusFilter === 'INACTIVE') query.set('isActive', 'false');

    let endpoint = '';
    switch (activeTab) {
      case 'products':
        endpoint = `/api/v1/master-data/products?${query.toString()}`;
        break;
      case 'lines':
        endpoint = `/api/v1/master-data/production-lines?${query.toString()}`;
        break;
      case 'machines':
        if (machineStatusFilter !== 'ALL') query.set('status', machineStatusFilter);
        if (machineLineFilter !== 'ALL') query.set('productionLineId', machineLineFilter);
        endpoint = `/api/v1/master-data/machines?${query.toString()}`;
        break;
      case 'shifts':
        endpoint = `/api/v1/master-data/shifts?${query.toString()}`;
        break;
      case 'defects':
        if (defectSeverityFilter !== 'ALL') query.set('severity', defectSeverityFilter);
        endpoint = `/api/v1/master-data/defect-types?${query.toString()}`;
        break;
    }

    try {
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: { message: string } };
        throw new Error(errorData.error?.message || `Failed to fetch: ${res.statusText}`);
      }

      const data = await res.json();
      setTotalItems(data.total);
      setTotalPages(data.totalPages || 1);

      switch (activeTab) {
        case 'products':
          setProducts(data.items);
          break;
        case 'lines':
          setLines(data.items);
          break;
        case 'machines':
          setMachines(data.items);
          break;
        case 'shifts':
          setShifts(data.items);
          break;
        case 'defects':
          setDefects(data.items);
          break;
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'An error occurred loading data',
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    activeTab,
    page,
    limit,
    search,
    statusFilter,
    machineStatusFilter,
    machineLineFilter,
    defectSeverityFilter,
  ]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Handle Tab Change
  const handleTabChange = (newTab: MasterDataTab) => {
    setActiveTab(newTab);
    setPage(1);
    setSearch('');
    setStatusFilter('ALL');
    setFeedback(null);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingId(null);
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormCycleTime('');
    setFormLocation('');
    setFormLineId(availableLines[0]?.id || '');
    setFormMachineStatus('IDLE');
    setFormStartTime('08:00');
    setFormEndTime('16:00');
    setFormCategory('');
    setFormSeverity('MINOR');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: Product | ProductionLine | Machine | Shift | DefectType) => {
    setEditingId(item.id);
    setFormCode(item.code);
    setFormName(item.name);
    setFormIsActive(item.isActive);

    if (activeTab === 'products') {
      const p = item as Product;
      setFormDescription(p.description ?? '');
      setFormCycleTime(p.targetCycleTimeSeconds !== null ? String(p.targetCycleTimeSeconds) : '');
    } else if (activeTab === 'lines') {
      const l = item as ProductionLine;
      setFormLocation(l.location ?? '');
    } else if (activeTab === 'machines') {
      const m = item as Machine;
      setFormLineId(m.productionLineId);
      setFormMachineStatus(m.status);
    } else if (activeTab === 'shifts') {
      const s = item as Shift;
      setFormStartTime(s.startTime);
      setFormEndTime(s.endTime);
    } else if (activeTab === 'defects') {
      const d = item as DefectType;
      setFormCategory(d.category);
      setFormSeverity(d.severity);
    }

    setIsModalOpen(true);
  };

  // Form Submit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite || !accessToken) return;

    setIsSubmitting(true);
    setFeedback(null);

    const isEdit = !!editingId;
    let endpoint = '';
    let payload: Record<string, unknown> = {};

    switch (activeTab) {
      case 'products':
        endpoint = isEdit
          ? `/api/v1/master-data/products/${editingId}`
          : '/api/v1/master-data/products';
        payload = {
          code: formCode.trim(),
          name: formName.trim(),
          description: formDescription.trim() || null,
          targetCycleTimeSeconds: formCycleTime ? parseFloat(formCycleTime) : null,
          isActive: formIsActive,
        };
        break;
      case 'lines':
        endpoint = isEdit
          ? `/api/v1/master-data/production-lines/${editingId}`
          : '/api/v1/master-data/production-lines';
        payload = {
          code: formCode.trim(),
          name: formName.trim(),
          location: formLocation.trim() || null,
          isActive: formIsActive,
        };
        break;
      case 'machines':
        endpoint = isEdit
          ? `/api/v1/master-data/machines/${editingId}`
          : '/api/v1/master-data/machines';
        payload = {
          code: formCode.trim(),
          name: formName.trim(),
          productionLineId: formLineId,
          status: formMachineStatus,
          isActive: formIsActive,
        };
        break;
      case 'shifts':
        endpoint = isEdit
          ? `/api/v1/master-data/shifts/${editingId}`
          : '/api/v1/master-data/shifts';
        payload = {
          code: formCode.trim(),
          name: formName.trim(),
          startTime: formStartTime,
          endTime: formEndTime,
          isActive: formIsActive,
        };
        break;
      case 'defects':
        endpoint = isEdit
          ? `/api/v1/master-data/defect-types/${editingId}`
          : '/api/v1/master-data/defect-types';
        payload = {
          code: formCode.trim(),
          name: formName.trim(),
          category: formCategory.trim(),
          severity: formSeverity,
          isActive: formIsActive,
        };
        break;
    }

    try {
      const res = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Operation failed');
      }

      setFeedback({
        type: 'success',
        message: `${formCode} ${isEdit ? 'updated' : 'created'} successfully.`,
      });
      setIsModalOpen(false);
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save entity',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Active / Deactivate
  const handleToggleActive = async (id: string, currentStatus: boolean, code: string) => {
    if (!canWrite || !accessToken) return;

    if (currentStatus) {
      // Prompt confirmation before deactivation
      setConfirmDeactivateId(id);
      return;
    }

    // Direct reactivate
    await executeToggle(id, true, code);
  };

  const executeToggle = async (id: string, newActiveState: boolean, code: string) => {
    if (!accessToken) return;
    setFeedback(null);
    let entityPath = '';
    switch (activeTab) {
      case 'products':
        entityPath = 'products';
        break;
      case 'lines':
        entityPath = 'production-lines';
        break;
      case 'machines':
        entityPath = 'machines';
        break;
      case 'shifts':
        entityPath = 'shifts';
        break;
      case 'defects':
        entityPath = 'defect-types';
        break;
    }

    try {
      const res = await fetch(`/api/v1/master-data/${entityPath}/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ isActive: newActiveState }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Status update failed');
      }

      setFeedback({
        type: 'success',
        message: `${code} ${newActiveState ? 'activated' : 'deactivated'} successfully.`,
      });
      setConfirmDeactivateId(null);
      await fetchData();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error changing status',
      });
    }
  };

  return (
    <section aria-labelledby="master-data-heading">
      <div className="qo-page-header">
        <div>
          <h3 id="master-data-heading" className="qo-page-title">
            Master Data Management
          </h3>
          <p className="qo-page-subtitle">
            Manage core operational entities: Products, Production Lines, Machines, Shifts, and
            Defect Types.
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenCreate}
            disabled={!canWrite}
            title={
              canWrite ? 'Create new record' : 'Requires ADMIN or QUALITY_MANAGER role to create'
            }
            aria-label={`Create new ${activeTab.slice(0, -1)}`}
            style={{
              backgroundColor: canWrite ? '#3182ce' : '#cbd5e0',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: canWrite ? 'pointer' : 'not-allowed',
            }}
          >
            + New{' '}
            {activeTab === 'products'
              ? 'Product'
              : activeTab === 'lines'
                ? 'Line'
                : activeTab === 'machines'
                  ? 'Machine'
                  : activeTab === 'shifts'
                    ? 'Shift'
                    : 'Defect Type'}
          </button>
        </div>
      </div>

      {/* Role permission alert banner */}
      {!canWrite && (
        <div role="note" className="qo-alert-banner warning">
          <div className="qo-alert-banner-icon">&#9888;</div>
          <div className="qo-alert-banner-content">
            <strong>Read-Only Mode:</strong> Your current role(s) (
            <code>{user?.roles.join(', ')}</code>) grant view-only access. Only <code>ADMIN</code>{' '}
            and <code>QUALITY_MANAGER</code> users can create, update, or deactivate master-data.
          </div>
        </div>
      )}

      {/* Feedback Alert */}
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

      {/* Entity Tabs */}
      <div
        role="tablist"
        aria-label="Master Data Categories"
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '16px',
        }}
      >
        {(
          [
            ['products', 'Products'],
            ['lines', 'Production Lines'],
            ['machines', 'Machines'],
            ['shifts', 'Shifts'],
            ['defects', 'Defect Types'],
          ] as const
        ).map(([tabId, label]) => {
          const isActive = activeTab === tabId;
          return (
            <button
              key={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${tabId}`}
              id={`tab-${tabId}`}
              onClick={() => handleTabChange(tabId)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: isActive ? '3px solid #3182ce' : '3px solid transparent',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#3182ce' : '#718096',
                cursor: 'pointer',
                marginBottom: '-2px',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filters Bar */}
      <div
        className="qo-card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          padding: '16px 20px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: '1', minWidth: '200px' }}>
          <label htmlFor="master-data-search" style={{ display: 'none' }}>
            Search
          </label>
          <input
            id="master-data-search"
            type="search"
            placeholder="Search code or name..."
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
            htmlFor="master-data-status"
            style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
          >
            Status:
          </label>
          <select
            id="master-data-status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE');
              setPage(1);
            }}
            style={{
              padding: '6px 8px',
              fontSize: '13px',
              border: '1px solid #cbd5e0',
              borderRadius: '4px',
            }}
          >
            <option value="ALL">All Records</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {/* Machine specific filters */}
        {activeTab === 'machines' && (
          <>
            <div>
              <label
                htmlFor="machine-line-filter"
                style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
              >
                Line:
              </label>
              <select
                id="machine-line-filter"
                value={machineLineFilter}
                onChange={(e) => {
                  setMachineLineFilter(e.target.value);
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
                {availableLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} - {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="machine-status-filter"
                style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
              >
                Machine Status:
              </label>
              <select
                id="machine-status-filter"
                value={machineStatusFilter}
                onChange={(e) => {
                  setMachineStatusFilter(e.target.value);
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
                <option value="IDLE">IDLE</option>
                <option value="RUNNING">RUNNING</option>
                <option value="DOWN">DOWN</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </>
        )}

        {/* Defect specific filters */}
        {activeTab === 'defects' && (
          <div>
            <label
              htmlFor="defect-severity-filter"
              style={{ fontSize: '12px', fontWeight: 600, marginRight: '6px' }}
            >
              Severity:
            </label>
            <select
              id="defect-severity-filter"
              value={defectSeverityFilter}
              onChange={(e) => {
                setDefectSeverityFilter(e.target.value);
                setPage(1);
              }}
              style={{
                padding: '6px 8px',
                fontSize: '13px',
                border: '1px solid #cbd5e0',
                borderRadius: '4px',
              }}
            >
              <option value="ALL">All Severities</option>
              <option value="MINOR">MINOR</option>
              <option value="MAJOR">MAJOR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
        )}
      </div>

      {/* Table Data */}
      <div
        id={`tabpanel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="qo-card"
      >
        <div className="qo-table-responsive">
          {isLoading && (
            <p style={{ fontSize: '13px', color: '#718096' }}>Loading master data...</p>
          )}
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
              No records found matching current criteria.
            </div>
          )}

          {!isLoading && totalItems > 0 && (
            <table className="qo-table">
              <thead>
                <tr style={{ backgroundColor: '#edf2f7', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Code</th>
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Name</th>
                  {activeTab === 'products' && (
                    <>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Description
                      </th>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Target Cycle Time
                      </th>
                    </>
                  )}
                  {activeTab === 'lines' && (
                    <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                      Location
                    </th>
                  )}
                  {activeTab === 'machines' && (
                    <>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Production Line
                      </th>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Operational Status
                      </th>
                    </>
                  )}
                  {activeTab === 'shifts' && (
                    <>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Start Time
                      </th>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        End Time
                      </th>
                    </>
                  )}
                  {activeTab === 'defects' && (
                    <>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Category
                      </th>
                      <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>
                        Severity
                      </th>
                    </>
                  )}
                  <th style={{ padding: '8px 12px', borderBottom: '2px solid #cbd5e0' }}>Status</th>
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
                {/* Products Rows */}
                {activeTab === 'products' &&
                  products.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.code}</td>
                      <td style={{ padding: '8px 12px' }}>{p.name}</td>
                      <td style={{ padding: '8px 12px', color: '#718096' }}>
                        {p.description || 'â€”'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {p.targetCycleTimeSeconds !== null ? `${p.targetCycleTimeSeconds}s` : 'â€”'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor: p.isActive ? '#c6f6d5' : '#fed7d7',
                            color: p.isActive ? '#22543d' : '#742a2a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {p.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          disabled={!canWrite}
                          title={canWrite ? 'Edit product' : 'Requires ADMIN or QUALITY_MANAGER'}
                          style={{
                            marginRight: '8px',
                            backgroundColor: 'transparent',
                            color: canWrite ? '#3182ce' : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(p.id, p.isActive, p.code)}
                          disabled={!canWrite}
                          title={
                            canWrite
                              ? p.isActive
                                ? 'Deactivate'
                                : 'Activate'
                              : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            backgroundColor: 'transparent',
                            color: canWrite ? (p.isActive ? '#e53e3e' : '#38a169') : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}

                {/* Lines Rows */}
                {activeTab === 'lines' &&
                  lines.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.code}</td>
                      <td style={{ padding: '8px 12px' }}>{l.name}</td>
                      <td style={{ padding: '8px 12px', color: '#718096' }}>
                        {l.location || 'â€”'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor: l.isActive ? '#c6f6d5' : '#fed7d7',
                            color: l.isActive ? '#22543d' : '#742a2a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {l.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEdit(l)}
                          disabled={!canWrite}
                          title={
                            canWrite ? 'Edit production line' : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            marginRight: '8px',
                            backgroundColor: 'transparent',
                            color: canWrite ? '#3182ce' : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(l.id, l.isActive, l.code)}
                          disabled={!canWrite}
                          title={
                            canWrite
                              ? l.isActive
                                ? 'Deactivate'
                                : 'Activate'
                              : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            backgroundColor: 'transparent',
                            color: canWrite ? (l.isActive ? '#e53e3e' : '#38a169') : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          {l.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}

                {/* Machines Rows */}
                {activeTab === 'machines' &&
                  machines.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{m.code}</td>
                      <td style={{ padding: '8px 12px' }}>{m.name}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {m.productionLineName || m.productionLineId}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor:
                              m.status === 'RUNNING'
                                ? '#c6f6d5'
                                : m.status === 'DOWN'
                                  ? '#fed7d7'
                                  : m.status === 'MAINTENANCE'
                                    ? '#feebc8'
                                    : '#edf2f7',
                            color:
                              m.status === 'RUNNING'
                                ? '#22543d'
                                : m.status === 'DOWN'
                                  ? '#742a2a'
                                  : m.status === 'MAINTENANCE'
                                    ? '#7b341e'
                                    : '#4a5568',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {m.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor: m.isActive ? '#c6f6d5' : '#fed7d7',
                            color: m.isActive ? '#22543d' : '#742a2a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {m.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEdit(m)}
                          disabled={!canWrite}
                          title={canWrite ? 'Edit machine' : 'Requires ADMIN or QUALITY_MANAGER'}
                          style={{
                            marginRight: '8px',
                            backgroundColor: 'transparent',
                            color: canWrite ? '#3182ce' : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(m.id, m.isActive, m.code)}
                          disabled={!canWrite}
                          title={
                            canWrite
                              ? m.isActive
                                ? 'Deactivate'
                                : 'Activate'
                              : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            backgroundColor: 'transparent',
                            color: canWrite ? (m.isActive ? '#e53e3e' : '#38a169') : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          {m.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}

                {/* Shifts Rows */}
                {activeTab === 'shifts' &&
                  shifts.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.code}</td>
                      <td style={{ padding: '8px 12px' }}>{s.name}</td>
                      <td style={{ padding: '8px 12px' }}>{s.startTime}</td>
                      <td style={{ padding: '8px 12px' }}>{s.endTime}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor: s.isActive ? '#c6f6d5' : '#fed7d7',
                            color: s.isActive ? '#22543d' : '#742a2a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEdit(s)}
                          disabled={!canWrite}
                          title={canWrite ? 'Edit shift' : 'Requires ADMIN or QUALITY_MANAGER'}
                          style={{
                            marginRight: '8px',
                            backgroundColor: 'transparent',
                            color: canWrite ? '#3182ce' : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(s.id, s.isActive, s.code)}
                          disabled={!canWrite}
                          title={
                            canWrite
                              ? s.isActive
                                ? 'Deactivate'
                                : 'Activate'
                              : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            backgroundColor: 'transparent',
                            color: canWrite ? (s.isActive ? '#e53e3e' : '#38a169') : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          {s.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}

                {/* Defect Types Rows */}
                {activeTab === 'defects' &&
                  defects.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{d.code}</td>
                      <td style={{ padding: '8px 12px' }}>{d.name}</td>
                      <td style={{ padding: '8px 12px' }}>{d.category}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor:
                              d.severity === 'CRITICAL'
                                ? '#fed7d7'
                                : d.severity === 'MAJOR'
                                  ? '#feebc8'
                                  : '#e2e8f0',
                            color:
                              d.severity === 'CRITICAL'
                                ? '#742a2a'
                                : d.severity === 'MAJOR'
                                  ? '#7b341e'
                                  : '#4a5568',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {d.severity}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            backgroundColor: d.isActive ? '#c6f6d5' : '#fed7d7',
                            color: d.isActive ? '#22543d' : '#742a2a',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {d.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleOpenEdit(d)}
                          disabled={!canWrite}
                          title={
                            canWrite ? 'Edit defect type' : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            marginRight: '8px',
                            backgroundColor: 'transparent',
                            color: canWrite ? '#3182ce' : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(d.id, d.isActive, d.code)}
                          disabled={!canWrite}
                          title={
                            canWrite
                              ? d.isActive
                                ? 'Deactivate'
                                : 'Activate'
                              : 'Requires ADMIN or QUALITY_MANAGER'
                          }
                          style={{
                            backgroundColor: 'transparent',
                            color: canWrite ? (d.isActive ? '#e53e3e' : '#38a169') : '#a0aec0',
                            border: 'none',
                            cursor: canWrite ? 'pointer' : 'not-allowed',
                            fontWeight: 600,
                          }}
                        >
                          {d.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pagination Bar */}
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

      {/* Deactivation Confirmation Modal */}
      {confirmDeactivateId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-deactivate-title"
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
            <h4
              id="confirm-deactivate-title"
              style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#742a2a' }}
            >
              Confirm Deactivation
            </h4>
            <p
              style={{ fontSize: '13px', color: '#4a5568', margin: '0 0 16px 0', lineHeight: 1.5 }}
            >
              Are you sure you want to deactivate this record? Deactivated master-data entities
              cannot be selected in new production batches or inspection forms, but historical
              records will be preserved safely.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setConfirmDeactivateId(null)}
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
                onClick={() => executeToggle(confirmDeactivateId, false, 'Record')}
                style={{
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#e53e3e',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
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
            <h4 id="modal-title" style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
              {editingId ? 'Edit' : 'Create'}{' '}
              {activeTab === 'products'
                ? 'Product'
                : activeTab === 'lines'
                  ? 'Production Line'
                  : activeTab === 'machines'
                    ? 'Machine'
                    : activeTab === 'shifts'
                      ? 'Shift'
                      : 'Defect Type'}
            </h4>

            <form onSubmit={handleFormSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label
                  htmlFor="form-code"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Code *
                </label>
                <input
                  id="form-code"
                  type="text"
                  required
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
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
                  htmlFor="form-name"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Name *
                </label>
                <input
                  id="form-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
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

              {/* Product specific fields */}
              {activeTab === 'products' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="form-description"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Description
                    </label>
                    <textarea
                      id="form-description"
                      rows={3}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
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
                      htmlFor="form-cycletime"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Target Cycle Time (seconds)
                    </label>
                    <input
                      id="form-cycletime"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formCycleTime}
                      onChange={(e) => setFormCycleTime(e.target.value)}
                      placeholder="e.g. 45.0"
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
                </>
              )}

              {/* Production line specific fields */}
              {activeTab === 'lines' && (
                <div style={{ marginBottom: '12px' }}>
                  <label
                    htmlFor="form-location"
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Location
                  </label>
                  <input
                    id="form-location"
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="e.g. Bay 4, Facility A"
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
              )}

              {/* Machine specific fields */}
              {activeTab === 'machines' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="form-lineid"
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
                      id="form-lineid"
                      required
                      value={formLineId}
                      onChange={(e) => setFormLineId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    >
                      {availableLines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.code} - {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="form-machinestatus"
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
                      id="form-machinestatus"
                      value={formMachineStatus}
                      onChange={(e) => setFormMachineStatus(e.target.value as MachineStatus)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="IDLE">IDLE</option>
                      <option value="RUNNING">RUNNING</option>
                      <option value="DOWN">DOWN</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                    </select>
                  </div>
                </>
              )}

              {/* Shift specific fields */}
              {activeTab === 'shifts' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="form-starttime"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Start Time (HH:mm) *
                    </label>
                    <input
                      id="form-starttime"
                      type="text"
                      required
                      pattern="^([01]\d|2[0-3]):[0-5]\d$"
                      placeholder="08:00"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
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
                      htmlFor="form-endtime"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      End Time (HH:mm) *
                    </label>
                    <input
                      id="form-endtime"
                      type="text"
                      required
                      pattern="^([01]\d|2[0-3]):[0-5]\d$"
                      placeholder="16:00"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
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
                </>
              )}

              {/* Defect type specific fields */}
              {activeTab === 'defects' && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label
                      htmlFor="form-category"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Category *
                    </label>
                    <input
                      id="form-category"
                      type="text"
                      required
                      placeholder="e.g. COSMETIC, DIMENSIONAL"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
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
                      htmlFor="form-severity"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '4px',
                      }}
                    >
                      Severity *
                    </label>
                    <select
                      id="form-severity"
                      value={formSeverity}
                      onChange={(e) => setFormSeverity(e.target.value as DefectSeverity)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        fontSize: '13px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="MINOR">MINOR</option>
                      <option value="MAJOR">MAJOR</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                </>
              )}

              {/* Active Toggle */}
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
                <input
                  id="form-isactive"
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  style={{ marginRight: '8px' }}
                />
                <label htmlFor="form-isactive" style={{ fontSize: '13px', fontWeight: 500 }}>
                  Active (available for production operations)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
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
                  disabled={isSubmitting}
                  style={{
                    padding: '6px 14px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: '#3182ce',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
