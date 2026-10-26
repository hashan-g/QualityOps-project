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
    const width = 800;
    const height = 340;
    const padLeft = 60;
    const padRight = 40;
    const padTop = 30;
    const padBottom = 60;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    // Determine Y-axis max: at least 0.1, or 1.15 * max(UCL, observed)
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
          style={{ width: '100%', minWidth: '650px', height: 'auto', display: 'block' }}
          role="img"
          aria-label="p-Chart Statistical Process Monitoring Graph"
        >
          <defs>
            <linearGradient id={`${chartPatternId}-grid`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f7fafc" />
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
                  stroke="#edf2f7"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={yPos + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#718096"
                  fontFamily="system-ui, sans-serif"
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
                stroke="#38a169"
                strokeWidth="2"
              />
              <text
                x={padLeft + chartW + 6}
                y={clY + 4}
                fontSize="10"
                fill="#276749"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
              >
                CL ({((chartData.baseline.pBar ?? 0) * 100).toFixed(2)}%)
              </text>
            </g>
          )}

          {/* Stepped Variable UCL (Red Dashed) */}
          {uclPath && (
            <path d={uclPath} fill="none" stroke="#e53e3e" strokeWidth="2" strokeDasharray="5,4" />
          )}

          {/* Stepped Variable LCL (Red Dashed) */}
          {lclPath && (
            <path d={lclPath} fill="none" stroke="#e53e3e" strokeWidth="2" strokeDasharray="5,4" />
          )}

          {/* Observed Proportion Connecting Line (Blue) */}
          {observedPath && <path d={observedPath} fill="none" stroke="#3182ce" strokeWidth="2.5" />}

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
                    points={`${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`}
                    fill="#e53e3e"
                    stroke="#9b1c1c"
                    strokeWidth={isSelected ? '3' : '1.5'}
                  />
                  <circle cx={cx} cy={cy} r="2" fill="#ffffff" />
                  {/* Accessible visual marker label */}
                  <text
                    x={cx}
                    y={cy - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#c53030"
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
                r={isSelected ? 6 : 4}
                fill={isSelected ? '#2b6cb0' : '#4299e1'}
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
                  stroke="#a0aec0"
                />
                <text
                  x={cx}
                  y={padTop + chartH + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#718096"
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
            y={padTop - 10}
            fontSize="11"
            fontWeight="600"
            fill="#4a5568"
            fontFamily="system-ui, sans-serif"
          >
            Fraction Defective (p)
          </text>
          <text
            x={padLeft + chartW / 2}
            y={height - 15}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#4a5568"
            fontFamily="system-ui, sans-serif"
          >
            Completed Inspections (Chronological Subgroups)
          </text>
        </svg>

        {/* Legend */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '12px',
            marginTop: '10px',
            color: '#4a5568',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#4299e1',
              }}
            />
            Observed Proportion (p)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', backgroundColor: '#38a169' }} />
            Center Line (CL = p&#772;)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '16px', height: '2px', borderTop: '2px dashed #e53e3e' }} />
            Variable 3&sigma; Limits (UCL / LCL)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '10px',
                height: '10px',
                transform: 'rotate(45deg)',
                backgroundColor: '#e53e3e',
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
      <div>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '20px', color: '#2d3748' }}>
          Statistical Process Monitoring &mdash; p-Chart Control Limits
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#718096' }}>
          Real-time statistical process monitoring evaluating completed inspection failure
          proportions against sample-size weighted 3-sigma control limits.
        </p>
      </div>

      {/* Statistical Governance Guardrail Banner */}
      <div
        style={{
          backgroundColor: '#ebf8ff',
          border: '1px solid #bee3f8',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '13px',
          color: '#2b6cb0',
          lineHeight: 1.5,
        }}
      >
        <strong>Statistical Control Invariant:</strong> A point outside control limits is a
        statistical signal to investigate potential assignable causes&mdash;it is <em>not</em> proof
        of a product specification violation or automatic permission to halt manufacturing. Control
        limits describe empirical historical process stability, whereas specification limits
        describe product engineering requirements.
      </div>

      {/* Filter Selection Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          padding: '16px',
          backgroundColor: '#f7fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Product *
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
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
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Production Line *
          </label>
          <select
            value={productionLineId}
            onChange={(e) => setProductionLineId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
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
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            From Date *
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            To Date *
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Shift (Optional)
          </label>
          <select
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
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
              color: '#4a5568',
              marginBottom: '4px',
            }}
          >
            Inspection Stage (Optional)
          </label>
          <select
            value={inspectionStage}
            onChange={(e) => setInspectionStage(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e0',
              fontSize: '13px',
            }}
          >
            <option value="">All Inspection Stages</option>
            <option value="IN_PROCESS">In-Process</option>
            <option value="FINAL">Final Inspection</option>
            <option value="RECEIVING">Receiving / Incoming</option>
            <option value="FIRST_ARTICLE">First Article</option>
          </select>
        </div>
      </div>

      {/* Error & Service Unavailable Feedback */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: isServiceUnavailable ? '#fffaf0' : '#fff5f5',
            border: `1px solid ${isServiceUnavailable ? '#feebc8' : '#feb2b2'}`,
            color: isServiceUnavailable ? '#c05621' : '#c53030',
            fontSize: '14px',
          }}
        >
          <strong>
            {isServiceUnavailable
              ? 'Analytics Service Unavailable (HTTP 503):'
              : 'Validation Error:'}
          </strong>{' '}
          {errorMessage}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#718096', fontSize: '14px' }}>
          Evaluating statistical subgroups and calculating 3&sigma; control limits...
        </div>
      )}

      {/* Results Workspace */}
      {!isLoading && chartData && (
        <>
          {/* Status & KPI Summary Ribbon */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Process Status</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  marginTop: '4px',
                  color:
                    chartData.status === 'READY'
                      ? '#276749'
                      : chartData.status === 'INSUFFICIENT_DATA'
                        ? '#c05621'
                        : '#718096',
                }}
              >
                {chartData.status === 'READY'
                  ? 'READY (In Control Baseline)'
                  : chartData.status === 'INSUFFICIENT_DATA'
                    ? 'INSUFFICIENT DATA'
                    : 'DEGENERATE BASELINE'}
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Subgroups Ratio</div>
              <div style={kpiValueStyle}>
                {chartData.baseline.subgroupCount} / {chartData.baseline.minimumRequired}
                <span
                  style={{ fontSize: '11px', fontWeight: 400, color: '#718096', marginLeft: '4px' }}
                >
                  (min)
                </span>
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Pooled p&#772; (CL)</div>
              <div style={{ ...kpiValueStyle, color: '#2b6cb0' }}>
                {chartData.baseline.pBar !== null
                  ? `${(chartData.baseline.pBar * 100).toFixed(2)}%`
                  : 'N/A'}
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Units Inspected / Failed</div>
              <div style={kpiValueStyle}>
                {chartData.baseline.totalSampleSize} / {chartData.baseline.totalFailedUnits}
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={kpiLabelStyle}>Active Signals</div>
              <div
                style={{
                  ...kpiValueStyle,
                  color: chartData.summary.signalCount > 0 ? '#e53e3e' : '#38a169',
                }}
              >
                {chartData.summary.signalCount}
              </div>
            </div>
          </div>

          {/* Plain-Language Statistical Interpretation */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#4a5568',
            }}
          >
            <strong>Interpretation:</strong> {chartData.summary.interpretation}
          </div>

          {/* Warnings List if any */}
          {chartData.warnings.length > 0 && (
            <div
              style={{
                backgroundColor: '#fffaf0',
                border: '1px solid #feebc8',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '13px',
                color: '#c05621',
              }}
            >
              <strong>Data Quality Warning:</strong>
              <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                {chartData.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* P-Chart Graph Card */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '20px',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#2d3748' }}>
              Fraction Nonconforming Control Chart (p-Chart) &mdash; {chartData.filters.productCode}{' '}
              ({chartData.filters.productionLineName})
            </h4>

            {chartData.status === 'INSUFFICIENT_DATA' ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: '#f7fafc',
                  border: '1px dashed #cbd5e0',
                  borderRadius: '6px',
                  color: '#718096',
                }}
              >
                <p
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#4a5568',
                  }}
                >
                  Insufficient Completed Inspection Subgroups
                </p>
                <p style={{ margin: 0, fontSize: '13px' }}>
                  Observed {chartData.baseline.subgroupCount} completed inspection(s). A minimum of{' '}
                  {chartData.baseline.minimumRequired} completed inspections is required to compute
                  reliable 3-sigma control limits without fabricating unscientific baselines.
                </p>
              </div>
            ) : chartData.status === 'DEGENERATE_BASELINE' ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: '#fffaf0',
                  border: '1px dashed #fbd38d',
                  borderRadius: '6px',
                  color: '#c05621',
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

          {/* Subgroup Inspection Detail Table */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h4 style={{ margin: 0, fontSize: '14px', color: '#2d3748' }}>
                Completed Inspection Subgroups Repository ({chartData.points.length})
              </h4>
              <span style={{ fontSize: '12px', color: '#718096' }}>
                Click any row to inspect subgroup details
              </span>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '360px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#edf2f7' }}>
                  <tr style={{ textAlign: 'left', color: '#4a5568' }}>
                    <th style={thStyle}>Date (UTC)</th>
                    <th style={thStyle}>Inspection #</th>
                    <th style={thStyle}>Batch #</th>
                    <th style={thStyle}>Sample (n)</th>
                    <th style={thStyle}>Failed (x)</th>
                    <th style={thStyle}>Observed %</th>
                    <th style={thStyle}>LCL</th>
                    <th style={thStyle}>UCL</th>
                    <th style={thStyle}>Signal Status</th>
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
                          borderBottom: '1px solid #e2e8f0',
                          backgroundColor: isSelected
                            ? '#ebf8ff'
                            : pt.signal
                              ? '#fff5f5'
                              : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={tdStyle}>{new Date(pt.timestamp).toLocaleDateString()}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{pt.inspectionNumber}</td>
                        <td style={tdStyle}>{pt.batchNumber || 'N/A'}</td>
                        <td style={tdStyle}>{pt.sampleSize}</td>
                        <td style={tdStyle}>{pt.failedUnits}</td>
                        <td
                          style={{
                            ...tdStyle,
                            fontWeight: 700,
                            color: pt.signal ? '#e53e3e' : '#2b6cb0',
                          }}
                        >
                          {(pt.observedProportion * 100).toFixed(2)}%
                        </td>
                        <td style={tdStyle}>
                          {pt.lowerControlLimit !== null
                            ? `${(pt.lowerControlLimit * 100).toFixed(2)}%`
                            : 'N/A'}
                        </td>
                        <td style={tdStyle}>
                          {pt.upperControlLimit !== null
                            ? `${(pt.upperControlLimit * 100).toFixed(2)}%`
                            : 'N/A'}
                        </td>
                        <td style={tdStyle}>
                          {pt.signal ? (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#fed7d7',
                                color: '#9b1c1c',
                                border: '1px solid #feb2b2',
                              }}
                            >
                              !{' '}
                              {pt.signalReason === 'ABOVE_UCL'
                                ? 'SIGNAL: Above UCL'
                                : 'SIGNAL: Below LCL'}
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                backgroundColor: '#f0fff4',
                                color: '#276749',
                              }}
                            >
                              In Control
                            </span>
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

// Styles
const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '14px',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#718096',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#2d3748',
  marginTop: '4px',
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '12px',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
};
