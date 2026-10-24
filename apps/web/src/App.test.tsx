import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';
import { MasterDataView } from './components/MasterDataView.js';
import { AuthProvider } from './context/AuthContext.js';

describe('QualityOps Web — Phase 4 Master Data Shell', () => {
  it('renders the platform screen with title and phase 4 tag', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 4: Master Data Management');
    expect(html).toContain('PostgreSQL 18');
    expect(html).toContain('Manufacturing Quality &amp; Process Analytics Platform');
  });

  it('renders MasterDataView structure with tablist and entity options', () => {
    // In server-rendering without an active user, MasterDataView renders the read-only notice and tabs
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
});
