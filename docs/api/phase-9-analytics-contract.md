# Phase 9 — Statistical Analytics API Contract (Proposal)

Adapt the exact route prefix to the repository's current API conventions after inspection. Do not introduce duplicate endpoints.

## Endpoint

`GET /api/v1/analytics/quality/spc/p-chart`

Authenticated access only. Apply the existing role policy for read-only analytics; do not bypass authentication.

### Required query parameters

- `productId`: valid product UUID
- `productionLineId`: valid production-line UUID
- `from`: start date/time
- `to`: end date/time

### Optional query parameters

- `shiftId`: valid shift UUID, if supported by schema
- `inspectionStage`: allowed current inspection-stage enum, if supported

Validate the date range and enforce a documented maximum window. Do not accept unbounded queries.

## Ready response shape

```json
{
  "status": "READY",
  "filters": {
    "productId": "<uuid>",
    "productionLineId": "<uuid>",
    "from": "2026-01-01",
    "to": "2026-06-30"
  },
  "baseline": {
    "subgroupCount": 24,
    "minimumRequired": 20,
    "totalSampleSize": 1200,
    "totalFailedUnits": 36,
    "pBar": 0.03
  },
  "summary": {
    "signalCount": 1
  },
  "points": [
    {
      "inspectionId": "<uuid>",
      "inspectionNumber": "INSP-20260102-0001",
      "batchId": "<uuid>",
      "timestamp": "2026-01-02T08:00:00Z",
      "sampleSize": 50,
      "failedUnits": 5,
      "observedProportion": 0.1,
      "centerLine": 0.03,
      "upperControlLimit": 0.1035,
      "lowerControlLimit": 0,
      "signal": false,
      "signalReason": null
    }
  ],
  "warnings": []
}
```

The values above are illustrative only; tests/production responses must use actual queried values and correct computed limits. Do not hardcode this example.

## Non-ready outcomes

`INSUFFICIENT_DATA`: return subgroup count, required count and an explanation; do not fabricate control limits.

`DEGENERATE_BASELINE`: pooled baseline is exactly 0 or 1, or another mathematically documented condition makes conventional limits uninformative; include explanation and no misleading signal claims.

Use the shared Zod contracts pattern already used by the repository. If service calculation fails or times out, return a safe service-unavailable response with request ID; do not leak stack traces or internal URLs.
