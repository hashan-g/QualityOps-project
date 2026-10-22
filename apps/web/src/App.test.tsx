import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App.js';

describe('QualityOps Web — Foundation Smoke Tests', () => {
  it('renders the foundation screen with title and scope guard notice', () => {
    const html = renderToString(<App />);

    expect(html).toContain('QualityOps Platform');
    expect(html).toContain('Phase 1: Foundation Baseline');
    expect(html).toContain('Scope Guard Notice');
    expect(html).toContain('Manufacturing domain features');
    expect(html).toContain('verified (active)');
  });
});
