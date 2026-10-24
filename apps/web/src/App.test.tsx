import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';
import { MasterDataView } from './components/MasterDataView.js';
import { ProductionBatchesView } from './components/ProductionBatchesView.js';
import { DowntimeView } from './components/DowntimeView.js';
import { AuthProvider } from './context/AuthContext.js';

describe('QualityOps Web — Phase 5 Production Management Shell', () => {
  it('renders the platform screen with title and phase 5 tag', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 5: Production Management');
    expect(html).toContain('PostgreSQL 18');
    expect(html).toContain('Manufacturing Quality &amp; Process Analytics Platform');
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
