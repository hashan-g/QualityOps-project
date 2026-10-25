import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';
import { MasterDataView } from './components/MasterDataView.js';
import { ProductionBatchesView } from './components/ProductionBatchesView.js';
import { DowntimeView } from './components/DowntimeView.js';
import { QualityInspectionsView } from './components/QualityInspectionsView.js';
import { QualityDefectsView } from './components/QualityDefectsView.js';
import { AuthProvider } from './context/AuthContext.js';

describe('QualityOps Web — Phase 7 Defect Management & Analytics Shell', () => {
  it('renders the platform screen with title and phase 7 tag', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 7: Defect Management &amp; Analytics');
    expect(html).toContain('PostgreSQL 18');
    expect(html).toContain('Manufacturing Quality &amp; Process Analytics Platform');
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
});
