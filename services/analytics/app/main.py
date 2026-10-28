import os
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from .schemas import PChartCalculationRequest, PChartCalculationResponse
from .spc import calculate_p_chart

app = FastAPI(
    title="QualityOps Analytics Service",
    description="Stateless Statistical Process Control (SPC) calculation engine for manufacturing quality data.",
    version="0.1.0",
)

# Strict internal CORS policy: restricted origins, no wildcard credentials
allowed_origins_env = os.getenv(
    "ALLOWED_ORIGINS", "http://127.0.0.1:4000,http://localhost:4000"
)
allowed_origins = [
    origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "x-request-id"],
)

MAX_SUBGROUPS_LIMIT = int(os.getenv("MAX_SUBGROUPS_LIMIT", "5000"))


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check():
    """Liveness probe for orchestrators and Node API clients."""
    return {"status": "ok", "service": "qualityops-analytics", "version": "0.1.0"}


@app.post(
    "/calculate/p-chart",
    response_model=PChartCalculationResponse,
    status_code=status.HTTP_200_OK,
)
def calculate_p_chart_endpoint(payload: PChartCalculationRequest):
    """
    Computes p-chart control limits, pooled baseline, and 3-sigma signal detection
    for a provided series of completed inspection subgroups.
    """
    if len(payload.subgroups) > MAX_SUBGROUPS_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subgroup count exceeds maximum permitted limit ({len(payload.subgroups)} > {MAX_SUBGROUPS_LIMIT})",
        )

    try:
        response = calculate_p_chart(
            subgroups=payload.subgroups,
            minimum_required=payload.minimumRequired,
        )
        return response
    except ValueError as ex:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ex),
        )
