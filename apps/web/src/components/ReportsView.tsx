import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  ReportType,
  ExportFormat,
  Product,
  ProductionLine,
  ScheduledReportResponse,
  ReportRunResponse,
  ScheduleCadence,
} from '@qualityops/contracts';

interface ReportPayload {
  reportType: ReportType;
  title: string;
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
  spcResponse?: {
    status: string;
    summary?: {
      interpretation?: string;
    };
  };
}

export const ReportsView: React.FC = () => {
  const { accessToken, user } = useAuth();
  const isManagerOrAdmin = user?.roles.includes('ADMIN') || user?.roles.includes('QUALITY_MANAGER');

  // Report Selection & Filters
  const [reportType, setReportType] = useState<ReportType>('production-performance');
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState<string>('');
  const [productionLineId, setProductionLineId] = useState<string>('');

  // Master Data Dropdowns
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);

  // Report Data & States
  const [reportData, setReportData] = useState<ReportPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Scheduled Reports Management State
  const [schedules, setSchedules] = useState<ScheduledReportResponse[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);
  const [showCreateSchedule, setShowCreateSchedule] = useState<boolean>(false);
  const [scheduleName, setScheduleName] = useState<string>('');
  const [scheduleCadence, setScheduleCadence] = useState<ScheduleCadence>('WEEKLY');
  const [scheduleFormat, setScheduleFormat] = useState<ExportFormat>('PDF');
  const [selectedScheduleRuns, setSelectedScheduleRuns] = useState<ReportRunResponse[] | null>(
    null,
  );

  // Fetch Master Data for dropdowns
  useEffect(() => {
    if (!accessToken) return;

    const fetchMasterData = async () => {
      try {
        const [prodRes, lineRes] = await Promise.all([
          fetch('/api/v1/master-data/products', {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch('/api/v1/master-data/production-lines', {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (prodRes.ok) {
          const data = await prodRes.json();
          setProducts(data.products || []);
          if (!productId && data.products?.length > 0) {
            setProductId(data.products[0].id);
          }
        }
        if (lineRes.ok) {
          const data = await lineRes.json();
          setLines(data.productionLines || []);
          if (!productionLineId && data.productionLines?.length > 0) {
            setProductionLineId(data.productionLines[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load master data:', err);
      }
    };

    void fetchMasterData();
  }, [accessToken]);

  // Load Schedules
  useEffect(() => {
    if (isManagerOrAdmin && accessToken) {
      void fetchSchedules();
    }
  }, [isManagerOrAdmin, accessToken]);

  const fetchSchedules = async () => {
    setIsLoadingSchedules(true);
    try {
      const res = await fetch('/api/v1/reports/schedules', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
    } finally {
      setIsLoadingSchedules(false);
    }
  };

  // Fetch Report Data for UI Display
  const handleGenerateReport = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setErrorMessage(null);

    const fromISO = `${fromDate}T00:00:00.000Z`;
    const toISO = `${toDate}T23:59:59.999Z`;

    const params = new URLSearchParams({
      from: fromISO,
      to: toISO,
    });

    if (productId) params.set('productId', productId);
    if (productionLineId) params.set('productionLineId', productionLineId);

    try {
      const res = await fetch(`/api/v1/reports/${reportType}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error?.message || errJson.message || `Failed to fetch report (${res.status})`,
        );
      }

      const data = await res.json();
      setReportData(data.report);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error generating report');
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Download Export (CSV, XLSX, PDF)
  const handleExport = async (format: ExportFormat) => {
    if (!accessToken) return;
    setIsExporting(true);
    setErrorMessage(null);

    const fromISO = `${fromDate}T00:00:00.000Z`;
    const toISO = `${toDate}T23:59:59.999Z`;

    const params = new URLSearchParams({
      format,
      from: fromISO,
      to: toISO,
    });

    if (productId) params.set('productId', productId);
    if (productionLineId) params.set('productionLineId', productionLineId);

    try {
      const res = await fetch(`/api/v1/reports/${reportType}/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.error?.message || errJson.message || `Export failed (${res.status})`,
        );
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qualityops-${reportType}-${fromDate}.${format.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // Create Scheduled Report
  const handleCreateScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleName.trim() || !accessToken) return;

    try {
      const res = await fetch('/api/v1/reports/schedules', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: scheduleName.trim(),
          reportType,
          format: scheduleFormat,
          cadence: scheduleCadence,
          filters: {
            productId: productId || undefined,
            productionLineId: productionLineId || undefined,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || errJson.message || 'Failed to create schedule');
      }

      setShowCreateSchedule(false);
      setScheduleName('');
      void fetchSchedules();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create schedule');
    }
  };

  // View Runs for a Schedule
  const handleViewRuns = async (scheduleId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/v1/reports/schedules/${scheduleId}/runs`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedScheduleRuns(data.runs || []);
      }
    } catch (err) {
      console.error('Failed to load runs:', err);
    }
  };

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1a202c', margin: '0 0 6px 0' }}>
          Manufacturing Reports & Safe Exports
        </h2>
        <p style={{ color: '#4a5568', margin: 0, fontSize: '14px' }}>
          Standardized operational reports, CSV/XLSX/PDF exports, and automated report scheduling.
        </p>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: '6px',
            color: '#c53030',
            marginBottom: '20px',
            fontSize: '14px',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Filter and Selection Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Report Type Selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2d3748',
                marginBottom: '6px',
              }}
            >
              Select Report Type
            </label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ReportType);
                setReportData(null);
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
              <option value="production-performance">Production Performance</option>
              <option value="inspection-summary">Quality Inspection Summary</option>
              <option value="defect-analysis">Defect Analysis & Pareto</option>
              <option value="capa-status">CAPA Status & Tracker</option>
              <option value="spc-summary">SPC p-Chart Summary</option>
            </select>
          </div>

          {/* Date Range: From */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2d3748',
                marginBottom: '6px',
              }}
            >
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Date Range: To */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2d3748',
                marginBottom: '6px',
              }}
            >
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Product Filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2d3748',
                marginBottom: '6px',
              }}
            >
              Product {reportType === 'spc-summary' ? '(Required)' : '(Optional)'}
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
                backgroundColor: '#ffffff',
              }}
            >
              {reportType !== 'spc-summary' && <option value="">All Products</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Line Filter */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#2d3748',
                marginBottom: '6px',
              }}
            >
              Line {reportType === 'spc-summary' ? '(Required)' : '(Optional)'}
            </label>
            <select
              value={productionLineId}
              onChange={(e) => setProductionLineId(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e0',
                fontSize: '14px',
                backgroundColor: '#ffffff',
              }}
            >
              {reportType !== 'spc-summary' && <option value="">All Production Lines</option>}
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons Row */}
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={handleGenerateReport}
            disabled={isLoading}
            style={{
              padding: '9px 20px',
              backgroundColor: '#3182ce',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? 'Generating...' : 'View Report'}
          </button>

          <span style={{ color: '#a0aec0' }}>|</span>

          {/* Export Buttons */}
          <button
            onClick={() => handleExport('CSV')}
            disabled={isExporting}
            style={{
              padding: '9px 16px',
              backgroundColor: '#edf2f7',
              color: '#2d3748',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            Export CSV
          </button>

          <button
            onClick={() => handleExport('XLSX')}
            disabled={isExporting}
            style={{
              padding: '9px 16px',
              backgroundColor: '#edf2f7',
              color: '#2d3748',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            Export XLSX
          </button>

          <button
            onClick={() => handleExport('PDF')}
            disabled={isExporting}
            style={{
              padding: '9px 16px',
              backgroundColor: '#edf2f7',
              color: '#2d3748',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
            }}
          >
            Export PDF
          </button>

          {isManagerOrAdmin && (
            <button
              onClick={() => setShowCreateSchedule(true)}
              style={{
                marginLeft: 'auto',
                padding: '9px 16px',
                backgroundColor: '#2b6cb0',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + Schedule This Report
            </button>
          )}
        </div>
      </div>

      {/* Report Results Section */}
      {reportData && (
        <div style={{ marginBottom: '32px' }}>
          {/* Summary KPIs */}
          {reportData.summary && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              {Object.entries(reportData.summary).map(([key, value]) => {
                if (typeof value === 'object' && value !== null) return null;
                return (
                  <div
                    key={key}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '16px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#718096',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: '#2b6cb0',
                        marginTop: '4px',
                      }}
                    >
                      {String(value)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SPC Special Banner if applicable */}
          {reportData.reportType === 'spc-summary' && reportData.spcResponse && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '8px',
                marginBottom: '16px',
                backgroundColor:
                  reportData.spcResponse.status === 'READY'
                    ? '#f0fff4'
                    : reportData.spcResponse.status === 'INSUFFICIENT_DATA'
                      ? '#fffaf0'
                      : '#fff5f5',
                border: `1px solid ${
                  reportData.spcResponse.status === 'READY'
                    ? '#9ae6b4'
                    : reportData.spcResponse.status === 'INSUFFICIENT_DATA'
                      ? '#fbd38d'
                      : '#feb2b2'
                }`,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                Status: {reportData.spcResponse.status}
              </div>
              <div style={{ fontSize: '13px', marginTop: '4px', color: '#4a5568' }}>
                {reportData.spcResponse.summary?.interpretation}
              </div>
            </div>
          )}

          {/* Tabular Records */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead style={{ backgroundColor: '#edf2f7', borderBottom: '1px solid #cbd5e0' }}>
                  <tr>
                    {reportData.rows?.[0] &&
                      Object.keys(reportData.rows[0]).map((col) => (
                        <th
                          key={col}
                          style={{ padding: '10px 14px', fontWeight: 600, color: '#2d3748' }}
                        >
                          {col.replace(/([A-Z])/g, ' $1')}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows?.map((row: Record<string, unknown>, rIdx: number) => (
                    <tr
                      key={rIdx}
                      style={{
                        backgroundColor: rIdx % 2 === 1 ? '#f7fafc' : '#ffffff',
                        borderBottom: '1px solid #edf2f7',
                      }}
                    >
                      {Object.values(row).map((val: unknown, cIdx: number) => (
                        <td key={cIdx} style={{ padding: '9px 14px', color: '#4a5568' }}>
                          {val === null || val === undefined ? '—' : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(!reportData.rows || reportData.rows.length === 0) && (
                    <tr>
                      <td
                        colSpan={10}
                        style={{ padding: '24px', textAlign: 'center', color: '#a0aec0' }}
                      >
                        No records found for the selected period and filter parameters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Reports Management Section (ADMIN & QUALITY_MANAGER only) */}
      {isManagerOrAdmin && (
        <div
          style={{
            marginTop: '36px',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a202c', margin: 0 }}>
                Scheduled Report Runs
              </h3>
              <p style={{ color: '#718096', fontSize: '13px', margin: '4px 0 0 0' }}>
                Automated periodic report generation. Artifacts are safely stored and downloadable.
              </p>
            </div>
            <button
              onClick={() => setShowCreateSchedule(true)}
              style={{
                padding: '8px 14px',
                backgroundColor: '#3182ce',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              + New Schedule
            </button>
          </div>

          {isLoadingSchedules ? (
            <p style={{ color: '#718096' }}>Loading schedules...</p>
          ) : schedules.length === 0 ? (
            <p style={{ color: '#a0aec0', fontSize: '14px' }}>
              No report schedules configured yet.
            </p>
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
                <thead style={{ backgroundColor: '#edf2f7' }}>
                  <tr>
                    <th style={{ padding: '10px 14px' }}>Schedule Name</th>
                    <th style={{ padding: '10px 14px' }}>Report Type</th>
                    <th style={{ padding: '10px 14px' }}>Format</th>
                    <th style={{ padding: '10px 14px' }}>Cadence</th>
                    <th style={{ padding: '10px 14px' }}>Next Run</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.name}</td>
                      <td style={{ padding: '10px 14px' }}>{s.reportType}</td>
                      <td style={{ padding: '10px 14px' }}>{s.format}</td>
                      <td style={{ padding: '10px 14px' }}>{s.cadence}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {new Date(s.nextRunAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: s.isEnabled ? '#c6f6d5' : '#fed7d7',
                            color: s.isEnabled ? '#22543d' : '#742a2a',
                          }}
                        >
                          {s.isEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => handleViewRuns(s.id)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: '#edf2f7',
                            border: '1px solid #cbd5e0',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Schedule Runs Modal / Detail Box */}
          {selectedScheduleRuns && (
            <div
              style={{
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}
              >
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                  Execution Run History
                </h4>
                <button
                  onClick={() => setSelectedScheduleRuns(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#718096',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  ✕ Close
                </button>
              </div>

              {selectedScheduleRuns.length === 0 ? (
                <p style={{ color: '#718096', fontSize: '13px' }}>
                  No runs recorded for this schedule yet.
                </p>
              ) : (
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #cbd5e0' }}>
                      <th style={{ padding: '6px' }}>Run Time</th>
                      <th style={{ padding: '6px' }}>Status</th>
                      <th style={{ padding: '6px' }}>File Size</th>
                      <th style={{ padding: '6px' }}>Artifact Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedScheduleRuns.map((run) => (
                      <tr key={run.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <td style={{ padding: '6px' }}>
                          {new Date(run.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '6px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor:
                                run.status === 'SUCCEEDED'
                                  ? '#c6f6d5'
                                  : run.status === 'FAILED'
                                    ? '#fed7d7'
                                    : '#feebc8',
                              color:
                                run.status === 'SUCCEEDED'
                                  ? '#22543d'
                                  : run.status === 'FAILED'
                                    ? '#742a2a'
                                    : '#7b341e',
                            }}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td style={{ padding: '6px' }}>
                          {run.fileSizeBytes ? `${(run.fileSizeBytes / 1024).toFixed(1)} KB` : '—'}
                        </td>
                        <td style={{ padding: '6px' }}>
                          {run.artifactId ? (
                            <a
                              href={`/api/v1/reports/artifacts/${run.artifactId}?format=${run.format}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: '#3182ce', fontWeight: 600, textDecoration: 'none' }}
                            >
                              Download {run.format}
                            </a>
                          ) : (
                            <span style={{ color: '#a0aec0' }}>
                              {run.errorMessage || 'No artifact'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create Schedule Modal */}
      {showCreateSchedule && (
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
              width: '450px',
              maxWidth: '90%',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700 }}>
              Create Scheduled Report
            </h3>
            <form onSubmit={handleCreateScheduleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Schedule Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly QA Inspection Digest"
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e0',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    marginBottom: '4px',
                  }}
                >
                  Report Type
                </label>
                <input
                  type="text"
                  disabled
                  value={reportType}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f7fafc',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Cadence
                  </label>
                  <select
                    value={scheduleCadence}
                    onChange={(e) => setScheduleCadence(e.target.value as ScheduleCadence)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                    }}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    Export Format
                  </label>
                  <select
                    value={scheduleFormat}
                    onChange={(e) => setScheduleFormat(e.target.value as ExportFormat)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                    }}
                  >
                    <option value="PDF">PDF</option>
                    <option value="XLSX">XLSX</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateSchedule(false)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#3182ce',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
