import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App.js';

describe('QualityOps Web — Phase 3 Authentication Shell', () => {
  it('renders the authentication platform screen with title and phase tag', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 3: Authentication &amp; RBAC Baseline');
    expect(html).toContain('PostgreSQL 18');
    expect(html).toContain('Manufacturing Quality &amp; Process Analytics Platform');
  });
});
