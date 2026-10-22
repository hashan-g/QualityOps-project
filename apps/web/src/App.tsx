import React from 'react';
import { HealthStatusSchema } from '@qualityops/contracts';

export const App: React.FC = () => {
  // Validate that shared contracts import works at runtime
  const sampleValidation = HealthStatusSchema.safeParse('ok');

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: '800px',
        margin: '40px auto',
        padding: '24px',
        color: '#1a202c',
        lineHeight: 1.5,
      }}
    >
      <header
        style={{
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '16px',
          marginBottom: '24px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 700,
            color: '#4a5568',
            backgroundColor: '#edf2f7',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
        >
          Phase 1: Foundation Baseline
        </span>
        <h1 style={{ fontSize: '28px', marginTop: '12px', marginBottom: '8px' }}>
          QualityOps Platform
        </h1>
        <p style={{ color: '#718096', margin: 0 }}>
          Manufacturing Quality & Process Analytics Platform — Repository & Architecture Foundation
        </p>
      </header>

      <section
        style={{
          backgroundColor: '#f7fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '12px', color: '#2d3748' }}>
          Foundation Status
        </h2>
        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          <li>
            <strong>Web App:</strong> React 19 + TypeScript + Vite running in <code>apps/web</code>
          </li>
          <li>
            <strong>Backend API:</strong> Express + TypeScript service in <code>apps/api</code> with{' '}
            <code>GET /api/v1/health</code>
          </li>
          <li>
            <strong>Shared Contracts:</strong> <code>@qualityops/contracts</code> schema validation{' '}
            {sampleValidation.success ? (
              <span style={{ color: '#38a169', fontWeight: 600 }}>verified (active)</span>
            ) : (
              <span style={{ color: '#e53e3e', fontWeight: 600 }}>unverified</span>
            )}
          </li>
          <li>
            <strong>Database:</strong> PostgreSQL 18 infrastructure defined in{' '}
            <code>compose.yaml</code>
          </li>
        </ul>
      </section>

      <section
        style={{
          borderLeft: '4px solid #3182ce',
          backgroundColor: '#ebf8ff',
          padding: '16px',
          borderRadius: '4px',
        }}
      >
        <h3 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#2b6cb0' }}>
          Scope Guard Notice
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#2d3748' }}>
          Manufacturing domain features (products, production batches, inspections, defect records,
          CAPA, business dashboards, authentication, and notifications) are intentionally out of
          scope for Phase 1. This starter page serves solely as an architectural proof of frontend
          scaffolding.
        </p>
      </section>
    </main>
  );
};

export default App;
