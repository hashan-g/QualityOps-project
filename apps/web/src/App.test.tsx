import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';
import { MasterDataView } from './components/MasterDataView.js';
import { ProductionBatchesView } from './components/ProductionBatchesView.js';
import { DowntimeView } from './components/DowntimeView.js';
import { QualityInspectionsView } from './components/QualityInspectionsView.js';
import { QualityDefectsView } from './components/QualityDefectsView.js';
import { CapaManagementView } from './components/CapaManagementView.js';
import { SpcMonitoringView } from './components/SpcMonitoringView.js';
import { ReportsView } from './components/ReportsView.js';
import { AlertsView } from './components/AlertsView.js';
import { AuthProvider } from './context/AuthContext.js';

describe('QualityOps Web — Phase 10 Reporting, Exports & Operational Alerts Shell', () => {
  it('renders the platform screen with title and phase 10 tag', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 10: Reporting, Exports &amp; Operational Alerts');
    expect(html).toContain('PostgreSQL 18');
    expect(html).toContain('Manufacturing Quality &amp; Process Analytics Platform');
  });

  it('renders SpcMonitoringView structure with filters, guardrail banner, and controls', () => {
    const html = renderToString(
      <AuthProvider>
        <SpcMonitoringView />
      </AuthProvider>,
    );

    expect(html).toContain('Statistical Process Monitoring — p-Chart Control Limits');
    expect(html).toContain('Statistical Control Invariant:');
    expect(html).toContain('Product *');
    expect(html).toContain('Production Line *');
    expect(html).toContain('From Date *');
    expect(html).toContain('To Date *');
    expect(html).toContain('-- Select Product --');
    expect(html).toContain('-- Select Line --');
  });

  it('renders CapaManagementView structure with KPI cards, filters, and cases repository', () => {
    const html = renderToString(
      <AuthProvider>
        <CapaManagementView />
      </AuthProvider>,
    );

    expect(html).toContain('Corrective and Preventive Action (CAPA) Management');
    expect(html).toContain('Closed-loop nonconformance resolution:');
    expect(html).toContain('Total Cases');
    expect(html).toContain('Open / In Progress');
    expect(html).toContain('Pending Verification');
    expect(html).toContain('Closed (Resolved)');
    expect(html).toContain('Overdue SLA');
    expect(html).toContain('Search by case # or title...');
  });

  it('renders QualityDefectsView structure with analytics, Pareto, and table', () => {
    const html = renderToString(
      <AuthProvider>
        <QualityDefectsView />
      </AuthProvider>,
    );

    expect(html).toContain('Defect Management &amp; Descriptive Analytics');
    expect(html).toContain('Defect Accounting Semantics:');
    expect(html).toContain('Descriptive Analytics &amp; Pareto Distribution');
    expect(html).toContain('Defect Findings Repository');
  });

  it('renders QualityInspectionsView structure with table, filters, and read-only banner', () => {
    const html = renderToString(
      <AuthProvider>
        <QualityInspectionsView />
      </AuthProvider>,
    );

    expect(html).toContain('Quality Inspection Management');
    expect(html).toContain('Stage-gate quality sampling');
    expect(html).toContain('Read-Only Mode');
    expect(html).toContain('Inspection Data Rule:');
    expect(html).toContain('Search');
  });

  it('renders MasterDataView structure with tablist and entity options', () => {
    const html = renderToString(
      <AuthProvider>
        <MasterDataView />
      </AuthProvider>,
    );

    expect(html).toContain('Master Data Management');
    expect(html).toContain('Products');
    expect(html).toContain('Production Lines');
    expect(html).toContain('Machines');
    expect(html).toContain('Shifts');
    expect(html).toContain('Defect Types');
    expect(html).toContain('Read-Only Mode');
  });

  it('renders ProductionBatchesView structure with table, filters, and read-only banner', () => {
    const html = renderToString(
      <AuthProvider>
        <ProductionBatchesView />
      </AuthProvider>,
    );

    expect(html).toContain('Production Batches');
    expect(html).toContain('Manage manufacturing batch lifecycle');
    expect(html).toContain('Read-Only Mode');
    expect(html).toContain('Search batch number...');
  });

  it('renders DowntimeView structure with table, filters, and logging controls', () => {
    const html = renderToString(
      <AuthProvider>
        <DowntimeView />
      </AuthProvider>,
    );

    expect(html).toContain('Production Downtime Events');
    expect(html).toContain('Capture and track equipment stoppages');
    expect(html).toContain('Read-Only Mode');
    expect(html).toContain('Search reason...');
  });

  it('renders ReportsView structure with catalogue tabs, export options, and schedules banner', () => {
    const html = renderToString(
      <AuthProvider>
        <ReportsView />
      </AuthProvider>,
    );

    expect(html).toContain('Manufacturing Reports &amp; Safe Exports');
    expect(html).toContain('Production Performance');
    expect(html).toContain('Quality Inspection Summary');
    expect(html).toContain('Defect Analysis &amp; Pareto');
    expect(html).toContain('CAPA Status &amp; Tracker');
    expect(html).toContain('SPC p-Chart Summary');
    expect(html).toContain('Export CSV');
    expect(html).toContain('Export XLSX');
    expect(html).toContain('Export PDF');
  });

  it('renders AlertsView structure with severity filters, KPI summary, and evaluation trigger', () => {
    const html = renderToString(
      <AuthProvider>
        <AlertsView />
      </AuthProvider>,
    );

    expect(html).toContain('Operational Alerts &amp; Exception Monitoring');
    expect(html).toContain('Active Exceptions');
    expect(html).toContain('Unacknowledged');
    expect(html).toContain('Critical &amp; High');
    expect(html).toContain('Resolved (Archive)');
    expect(html).toContain('All Statuses');
    expect(html).toContain('All Severities');
    expect(html).toContain('All Rule Types');
  });
});
