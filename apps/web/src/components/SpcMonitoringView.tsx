import React, { useState, useEffect, useCallback, useId } from 'react';
import { useAuth } from '../context/AuthContext';
import type {
  Product,
  ProductionLine,
  Shift,
  SpcPChartResponse,
  SpcPChartPoint,
} from '@qualityops/contracts';

export const SpcMonitoringView: React.FC = () => {
  const { accessToken } = useAuth();

  // Master Data Dropdown Lists
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // Filter state
  const [productId, setProductId] = useState('');
  const [productionLineId, setProductionLineId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [inspectionStage, setInspectionStage] = useState<string>('');

  // Default to 90 days date window
  const today = new Date().toISOString().split('T')[0] ?? '';
  const ninetyDaysAgo =
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '';
  const [fromDate, setFromDate] = useState(ninetyDaysAgo);
  const [toDate, setToDate] = useState(today);

  // Chart data state
  const [chartData, setChartData] = useState<SpcPChartResponse | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<SpcPChartPoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isServiceUnavailable, setIsServiceUnavailable] = useState(false);

  // Unique IDs for SVG gradient / pattern definitions
  const chartPatternId = useId();

  // Load master data lookups on mount
  useEffect(() => {
    if (!accessToken) return;

    const loadLookups = async () => {
      try {
        const headers = { Authorization: `Bearer ${accessToken}` };
        const [prodRes, lineRes, shiftRes] = await Promise.all([
          fetch('/api/v1/master-data/products?limit=100', { headers }),
          fetch('/api/v1/master-data/production-lines?limit=100', { headers }),
          fetch('/api/v1/master-data/shifts?limit=100', { headers }),
        ]);

        if (prodRes.ok) {
          const pData = await prodRes.json();
          const activeProds = (pData.items || []).filter((p: Product) => p.isActive);
          setProducts(activeProds);
          if (activeProds.length > 0 && !productId) {
            setProductId(activeProds[0].id);
          }
        }

        if (lineRes.ok) {
          const lData = await lineRes.json();
          const activeLines = (lData.items || []).filter((l: ProductionLine) => l.isActive);
          setLines(activeLines);
          if (activeLines.length > 0 && !productionLineId) {
            setProductionLineId(activeLines[0].id);
          }
        }

        if (shiftRes.ok) {
          const sData = await shiftRes.json();
          setShifts(sData.items || []);
        }
      } catch {
        // Lookups fail gracefully
      }
    };

    void loadLookups();
  }, [accessToken]);

  // Fetch p-chart calculation
  const fetchPChart = useCallback(async () => {
    if (!accessToken || !productId || !productionLineId) {
      setChartData(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsServiceUnavailable(false);
    setSelectedPoint(null);

    const fromIso = `${fromDate}T00:00:00.000Z`;
    const toIso = `${toDate}T23:59:59.999Z`;

    const params = new URLSearchParams();
    params.set('productId', productId);
    params.set('productionLineId', productionLineId);
    params.set('from', fromIso);
    params.set('to', toIso);
    if (shiftId) params.set('shiftId', shiftId);
    if (inspectionStage) params.set('inspectionStage', inspectionStage);

    try {
      const res = await fetch(`/api/v1/analytics/quality/spc/p-chart?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await res.json();

      if (res.status === 503) {
        setIsServiceUnavailable(true);
        setErrorMessage(
          data.error?.message || 'Statistical analytics service is currently unavailable.',
        );
        setChartData(null);
        return;
      }

      if (!res.ok) {
        setErrorMessage(
          data.error?.message || 'Failed to calculate statistical process monitoring chart.',
        );
        setChartData(null);
        return;
      }

      setChartData(data);
      if (data.points && data.points.length > 0) {
        // Default selection to the most recent subgroup
        setSelectedPoint(data.points[data.points.length - 1]);
      }
    } catch (err) {
      setIsServiceUnavailable(true);
      setErrorMessage(
        err instanceof Error ? err.message : 'Network error communicating with analytics engine.',
      );
      setChartData(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, productId, productionLineId, fromDate, toDate, shiftId, inspectionStage]);

  // Trigger fetch when primary filters change
  useEffect(() => {
    if (productId && productionLineId) {
      void fetchPChart();
    }
  }, [fetchPChart, productId, productionLineId]);

  // Chart Rendering Helper Calculations
  const renderSvgChart = () => {
    if (!chartData || chartData.points.length === 0) return null;

    const points = chartData.points;
    const width = 840;
    const height = 350;
    const padLeft = 65;
    const padRight = 45;
    const padTop = 32;
    const padBottom = 60;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    // Determine Y-axis max: at least 0.05, or 1.15 * max(UCL, observed)
    let maxY = 0.05;
    for (const pt of points) {
      if (pt.observedProportion > maxY) maxY = pt.observedProportion;
      if (pt.upperControlLimit !== null && pt.upperControlLimit > maxY) {
        maxY = pt.upperControlLimit;
      }
    }
    // Add headroom
    maxY = Math.min(1.0, Math.ceil(maxY * 125) / 100);

    const getX = (idx: number) => {
      if (points.length <= 1) return padLeft + chartW / 2;
      return padLeft + (idx / (points.length - 1)) * chartW;
    };

    const getY = (val: number) => {
      const clamped = Math.max(0, Math.min(maxY, val));
      return padTop + chartH - (clamped / maxY) * chartH;
    };

    // Build SVG paths for observed proportions, UCL, LCL, Center Line
    const observedPath = points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.observedProportion)}`)
      .join(' ');

    const uclPath = points
      .filter((pt) => pt.upperControlLimit !== null)
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.upperControlLimit as number)}`)
      .join(' ');

    const lclPath = points
      .filter((pt) => pt.lowerControlLimit !== null)
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(pt.lowerControlLimit as number)}`)
      .join(' ');

    const clY = chartData.baseline.pBar !== null ? getY(chartData.baseline.pBar) : null;

    // Y-Axis Ticks (5 ticks)
    const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY];

    return (
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', minWidth: '680px', height: 'auto', display: 'block' }}
          role="img"
          aria-label="p-Chart Statistical Process Monitoring Graph"
        >
          <defs>
            <linearGradient id={`${chartPatternId}-grid`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>

          {/* Background area */}
          <rect
            x={padLeft}
            y={padTop}
            width={chartW}
            height={chartH}
            fill={`url(#${chartPatternId}-grid)`}
            stroke="#e2e8f0"
            rx="4"
          />

          {/* Horizontal grid lines & Y labels */}
          {yTicks.map((val) => {
            const yPos = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padLeft}
                  y1={yPos}
                  x2={padLeft + chartW}
                  y2={yPos}
                  stroke="#f1f5f9"
                  strokeWidth="1.5"
                />
                <text
                  x={padLeft - 10}
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#64748b"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="500"
                >
                  {(val * 100).toFixed(1)}%
                </text>
              </g>
            );
          })}

          {/* Center Line (CL) */}
          {clY !== null && (
            <g>
              <line
                x1={padLeft}
                y1={clY}
                x2={padLeft + chartW}
                y2={clY}
                stroke="#15803d"
                strokeWidth="2"
              />
              <text
                x={padLeft + chartW + 6}
                y={clY + 4}
                fontSize="10"
                fill="#14532d"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
              >
                CL ({((chartData.baseline.pBar ?? 0) * 100).toFixed(2)}%)
              </text>
            </g>
          )}

          {/* Stepped Variable UCL (Red Dashed) */}
          {uclPath && (
            <path d={uclPath} fill="none" stroke="#b91c1c" strokeWidth="2" strokeDasharray="5,4" />
          )}

          {/* Stepped Variable LCL (Red Dashed) */}
          {lclPath && (
            <path d={lclPath} fill="none" stroke="#b91c1c" strokeWidth="2" strokeDasharray="5,4" />
          )}

          {/* Observed Proportion Connecting Line (Blue) */}
          {observedPath && <path d={observedPath} fill="none" stroke="#1d4ed8" strokeWidth="2.5" />}

          {/* Data Points */}
          {points.map((pt, i) => {
            const cx = getX(i);
            const cy = getY(pt.observedProportion);
            const isSelected = selectedPoint?.inspectionId === pt.inspectionId;

            if (pt.signal) {
              // Signal: Out of control point (Red diamond with exclamation icon)
              return (
                <g
                  key={pt.inspectionId}
                  onClick={() => setSelectedPoint(pt)}
                  style={{ cursor: 'pointer' }}
                >
                  <polygon
                    points={`${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`}
                    fill="#b91c1c"
                    stroke="#7f1d1d"
                    strokeWidth={isSelected ? '3' : '1.5'}
                  />
                  <circle cx={cx} cy={cy} r="2.5" fill="#ffffff" />
                  {/* Accessible visual marker label */}
                  <text
                    x={cx}
                    y={cy - 13}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#b91c1c"
                    fontWeight="800"
                    fontFamily="system-ui, sans-serif"
                  >
                    !
                  </text>
                </g>
              );
            }

            // Normal In-Control Point (Blue dot)
            return (
              <circle
                key={pt.inspectionId}
                cx={cx}
                cy={cy}
                r={isSelected ? 6.5 : 4.5}
                fill={isSelected ? '#1e40af' : '#2563eb'}
                stroke="#ffffff"
                strokeWidth="2"
                onClick={() => setSelectedPoint(pt)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}

          {/* X-Axis Subgroup Tick Labels */}
          {points.map((pt, i) => {
            // Show tick labels every N points if there are many subgroups
            const step = Math.ceil(points.length / 10);
            if (i % step !== 0 && i !== points.length - 1) return null;

            const cx = getX(i);
            const label = pt.inspectionNumber.replace('INSP-', '');
            return (
              <g key={pt.inspectionId}>
                <line
                  x1={cx}
                  y1={padTop + chartH}
                  x2={cx}
                  y2={padTop + chartH + 5}
                  stroke="#94a3b8"
                />
                <text
                  x={cx}
                  y={padTop + chartH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                  fontFamily="system-ui, sans-serif"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Axis Labels */}
          <text
            x={padLeft}
            y={padTop - 12}
            fontSize="11"
            fontWeight="600"
            fill="#475569"
            fontFamily="system-ui, sans-serif"
          >
            Fraction Defective (p)
          </text>
          <text
            x={padLeft + chartW / 2}
            y={height - 12}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#475569"
            fontFamily="system-ui, sans-serif"
          >
            Completed Inspections (Chronological Subgroups)
          </text>
        </svg>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            marginTop: '12px',
            color: 'var(--qo-slate-600)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
              }}
            />
            Observed Proportion (p)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', backgroundColor: '#15803d' }} />
            Center Line (CL = p&#772;)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', borderTop: '2px dashed #b91c1c' }} />
            Variable 3&sigma; Limits (UCL / LCL)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                transform: 'rotate(45deg)',
                backgroundColor: '#b91c1c',
                display: 'inline-block',
              }}
            />
            Out-of-Control Signal (! text + diamond)
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Platform Header */}
      <div className="qo-page-header">
        <div>
          <h2 className="qo-page-title">
            Statistical Process Monitoring &mdash; p-Chart Control Limits
          </h2>
          <p className="qo-page-subtitle">
            Real-time statistical process monitoring evaluating completed inspection failure
            proportions against sample-size weighted 3-sigma control limits.
          </p>
        </div>
      </div>

      {/* Statistical Governance Guardrail Banner */}
      <div className="qo-alert-banner info">
        <div className="qo-alert-banner-icon">&#9432;</div>
        <div className="qo-alert-banner-content">
          <strong>Statistical Control Invariant:</strong> A point outside control limits is a
          statistical signal to investigate potential assignable causes&mdash;it is <em>not</em>{' '}
          proof of a product specification violation or automatic permission to halt manufacturing.
          Control limits describe empirical historical process stability, whereas specification
          limits describe product engineering requirements.
        </div>
      </div>

      {/* Filter Selection Panel */}
      <div className="qo-card" style={{ padding: '18px 20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              Product *
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="qo-form-control"
            >
              <option value="">-- Select Product --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              Production Line *
            </label>
            <select
              value={productionLineId}
              onChange={(e) => setProductionLineId(e.target.value)}
              className="qo-form-control"
            >
              <option value="">-- Select Line --</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              From Date *
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="qo-form-control"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              To Date *
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="qo-form-control"
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              Shift (Optional)
            </label>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="qo-form-control"
            >
              <option value="">All Operating Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--qo-navy-800)',
                marginBottom: '6px',
              }}
            >
              Inspection Stage (Optional)
            </label>
            <select
              value={inspectionStage}
              onChange={(e) => setInspectionStage(e.target.value)}
              className="qo-form-control"
            >
              <option value="">All Inspection Stages</option>
              <option value="IN_PROCESS">In-Process</option>
              <option value="FINAL">Final Inspection</option>
              <option value="RECEIVING">Receiving / Incoming</option>
              <option value="FIRST_ARTICLE">First Article</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error & Service Unavailable Feedback */}
      {errorMessage && (
        <div
          role="alert"
          className={`qo-alert-banner ${isServiceUnavailable ? 'warning' : 'danger'}`}
        >
          <div className="qo-alert-banner-icon">{isServiceUnavailable ? '&#9888;' : '&#9940;'}</div>
          <div className="qo-alert-banner-content">
            <strong>
              {isServiceUnavailable
                ? 'Analytics Service Unavailable (HTTP 503):'
                : 'Validation Error:'}
            </strong>{' '}
            {errorMessage}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="qo-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div className="qo-spinner" style={{ margin: '0 auto 12px auto' }} />
          <div style={{ color: 'var(--qo-slate-600)', fontSize: '14px', fontWeight: 500 }}>
            Evaluating statistical subgroups and calculating 3&sigma; control limits...
          </div>
        </div>
      )}

      {/* Results Workspace */}
      {!isLoading && chartData && (
        <>
          {/* Status & KPI Summary Ribbon */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            <div className="qo-kpi-card">
              <div className="qo-kpi-title">Process Status</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  marginTop: '6px',
                  color:
                    chartData.status === 'READY'
                      ? 'var(--qo-success)'
                      : chartData.status === 'INSUFFICIENT_DATA'
                        ? 'var(--qo-warning)'
                        : 'var(--qo-slate-500)',
                }}
              >
                {chartData.status === 'READY'
                  ? 'READY (In Control Baseline)'
                  : chartData.status === 'INSUFFICIENT_DATA'
                    ? 'INSUFFICIENT DATA'
                    : 'DEGENERATE BASELINE'}
              </div>
            </div>

            <div className="qo-kpi-card">
              <div className="qo-kpi-title">Subgroups Ratio</div>
              <div className="qo-kpi-value">
                {chartData.baseline.subgroupCount} / {chartData.baseline.minimumRequired}
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    color: 'var(--qo-slate-500)',
                    marginLeft: '6px',
                  }}
                >
                  (min)
                </span>
              </div>
            </div>

            <div className="qo-kpi-card">
              <div className="qo-kpi-title">Pooled p&#772; (CL)</div>
              <div className="qo-kpi-value" style={{ color: 'var(--qo-primary)' }}>
                {chartData.baseline.pBar !== null
                  ? `${(chartData.baseline.pBar * 100).toFixed(2)}%`
                  : 'N/A'}
              </div>
            </div>

            <div className="qo-kpi-card">
              <div className="qo-kpi-title">Units Inspected / Failed</div>
              <div className="qo-kpi-value">
                {chartData.baseline.totalSampleSize.toLocaleString()} /{' '}
                {chartData.baseline.totalFailedUnits.toLocaleString()}
              </div>
            </div>

            <div className="qo-kpi-card">
              <div className="qo-kpi-title">Active Signals</div>
              <div
                className="qo-kpi-value"
                style={{
                  color:
                    chartData.summary.signalCount > 0 ? 'var(--qo-danger)' : 'var(--qo-success)',
                }}
              >
                {chartData.summary.signalCount}
              </div>
            </div>
          </div>

          {/* Plain-Language Statistical Interpretation */}
          <div
            className="qo-card"
            style={{ padding: '14px 18px', backgroundColor: 'var(--qo-slate-50)' }}
          >
            <div style={{ fontSize: '13px', color: 'var(--qo-navy-800)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--qo-navy-900)' }}>Interpretation:</strong>{' '}
              {chartData.summary.interpretation}
            </div>
          </div>

          {/* Warnings List if any */}
          {chartData.warnings.length > 0 && (
            <div className="qo-alert-banner warning">
              <div className="qo-alert-banner-icon">&#9888;</div>
              <div className="qo-alert-banner-content">
                <strong>Data Quality Warning:</strong>
                <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                  {chartData.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* P-Chart Graph Card */}
          <div className="qo-card">
            <div className="qo-card-header">
              <h4 className="qo-card-title">
                Fraction Nonconforming Control Chart (p-Chart) &mdash;{' '}
                {chartData.filters.productCode} ({chartData.filters.productionLineName})
              </h4>
            </div>
            <div className="qo-card-body" style={{ padding: '20px' }}>
              {chartData.status === 'INSUFFICIENT_DATA' ? (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    backgroundColor: 'var(--qo-slate-50)',
                    border: '1px dashed var(--qo-slate-300)',
                    borderRadius: 'var(--qo-radius-lg)',
                    color: 'var(--qo-slate-600)',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '15px',
                      fontWeight: 600,
                      color: 'var(--qo-navy-800)',
                    }}
                  >
                    Insufficient Completed Inspection Subgroups
                  </p>
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    Observed {chartData.baseline.subgroupCount} completed inspection(s). A minimum
                    of {chartData.baseline.minimumRequired} completed inspections is required to
                    compute reliable 3-sigma control limits without fabricating unscientific
                    baselines.
                  </p>
                </div>
              ) : chartData.status === 'DEGENERATE_BASELINE' ? (
                <div
                  style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    backgroundColor: 'var(--qo-warning-bg)',
                    border: '1px dashed var(--qo-warning-border)',
                    borderRadius: 'var(--qo-radius-lg)',
                    color: 'var(--qo-warning-text)',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>
                    Degenerate Process Baseline Detected
                  </p>
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    Pooled failure fraction is exactly{' '}
                    {((chartData.baseline.pBar ?? 0) * 100).toFixed(2)}%. Standard error is zero;
                    3-sigma control limits cannot be meaningfully drawn as a stable baseline.
                  </p>
                </div>
              ) : (
                renderSvgChart()
              )}
            </div>
          </div>

          {/* Selected Subgroup Inspector Panel */}
          {selectedPoint && (
            <div
              className="qo-card"
              style={{
                borderLeft: `4px solid ${selectedPoint.signal ? 'var(--qo-danger)' : 'var(--qo-primary)'}`,
                padding: '16px 20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '14px',
                      color: 'var(--qo-navy-900)',
                    }}
                  >
                    Selected Subgroup: {selectedPoint.inspectionNumber}
                  </span>
                  {selectedPoint.signal ? (
                    <span className="qo-badge qo-badge-danger">
                      ! OUT OF CONTROL ({selectedPoint.signalReason})
                    </span>
                  ) : (
                    <span className="qo-badge qo-badge-success">&#10003; IN CONTROL</span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                  Timestamp: {new Date(selectedPoint.timestamp).toLocaleString()}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '12px',
                  fontSize: '13px',
                }}
              >
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    BATCH
                  </span>
                  <strong>{selectedPoint.batchNumber || 'N/A'}</strong>
                </div>
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    SAMPLE (n)
                  </span>
                  <strong>{selectedPoint.sampleSize}</strong>
                </div>
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    FAILED (x)
                  </span>
                  <strong>{selectedPoint.failedUnits}</strong>
                </div>
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    OBSERVED FRACTION (p)
                  </span>
                  <strong
                    style={{
                      color: selectedPoint.signal ? 'var(--qo-danger)' : 'var(--qo-primary)',
                    }}
                  >
                    {(selectedPoint.observedProportion * 100).toFixed(2)}%
                  </strong>
                </div>
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    LOWER LIMIT (LCL)
                  </span>
                  <strong>
                    {selectedPoint.lowerControlLimit !== null
                      ? `${(selectedPoint.lowerControlLimit * 100).toFixed(2)}%`
                      : 'N/A'}
                  </strong>
                </div>
                <div>
                  <span
                    style={{ color: 'var(--qo-slate-500)', display: 'block', fontSize: '11px' }}
                  >
                    UPPER LIMIT (UCL)
                  </span>
                  <strong>
                    {selectedPoint.upperControlLimit !== null
                      ? `${(selectedPoint.upperControlLimit * 100).toFixed(2)}%`
                      : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Subgroup Inspection Detail Table */}
          <div className="qo-card">
            <div className="qo-card-header">
              <h4 className="qo-card-title">
                Completed Inspection Subgroups Repository ({chartData.points.length})
              </h4>
              <span style={{ fontSize: '12px', color: 'var(--qo-slate-500)' }}>
                Click any row to inspect subgroup details
              </span>
            </div>

            <div className="qo-table-responsive" style={{ maxHeight: '380px' }}>
              <table className="qo-table">
                <thead>
                  <tr>
                    <th>Date (UTC)</th>
                    <th>Inspection #</th>
                    <th>Batch #</th>
                    <th>Sample (n)</th>
                    <th>Failed (x)</th>
                    <th>Observed %</th>
                    <th>LCL</th>
                    <th>UCL</th>
                    <th>Signal Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.points.map((pt) => {
                    const isSelected = selectedPoint?.inspectionId === pt.inspectionId;
                    return (
                      <tr
                        key={pt.inspectionId}
                        onClick={() => setSelectedPoint(pt)}
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--qo-primary-subtle)'
                            : pt.signal
                              ? 'var(--qo-danger-bg)'
                              : undefined,
                          cursor: 'pointer',
                        }}
                      >
                        <td>{new Date(pt.timestamp).toLocaleDateString()}</td>
                        <td style={{ fontWeight: 600 }}>{pt.inspectionNumber}</td>
                        <td>{pt.batchNumber || 'N/A'}</td>
                        <td>{pt.sampleSize}</td>
                        <td>{pt.failedUnits}</td>
                        <td
                          style={{
                            fontWeight: 700,
                            color: pt.signal ? 'var(--qo-danger)' : 'var(--qo-primary)',
                          }}
                        >
                          {(pt.observedProportion * 100).toFixed(2)}%
                        </td>
                        <td>
                          {pt.lowerControlLimit !== null
                            ? `${(pt.lowerControlLimit * 100).toFixed(2)}%`
                            : 'N/A'}
                        </td>
                        <td>
                          {pt.upperControlLimit !== null
                            ? `${(pt.upperControlLimit * 100).toFixed(2)}%`
                            : 'N/A'}
                        </td>
                        <td>
                          {pt.signal ? (
                            <span className="qo-badge qo-badge-danger">
                              !{' '}
                              {pt.signalReason === 'ABOVE_UCL'
                                ? 'SIGNAL: Above UCL'
                                : 'SIGNAL: Below LCL'}
                            </span>
                          ) : (
                            <span className="qo-badge qo-badge-success">In Control</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
