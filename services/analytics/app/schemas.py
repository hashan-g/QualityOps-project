from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class SpcSubgroupInput(BaseModel):
    id: str = Field(..., description="Unique inspection identifier")
    inspectionNumber: str = Field(..., description="Human-readable inspection identifier")
    batchId: str = Field(..., description="Associated production batch UUID")
    batchNumber: Optional[str] = Field(None, description="Associated production batch number")
    timestamp: str = Field(..., description="Inspection timestamp in ISO 8601 UTC")
    sampleSize: int = Field(..., ge=1, description="Sample units evaluated (n_i > 0)")
    failedUnits: int = Field(..., ge=0, description="Nonconforming units detected (x_i >= 0)")


class PChartCalculationRequest(BaseModel):
    subgroups: List[SpcSubgroupInput] = Field(..., description="Chronological inspection subgroups")
    minimumRequired: int = Field(default=20, ge=1, le=1000, description="Operational minimum subgroups guardrail")


class PChartPoint(BaseModel):
    inspectionId: str
    inspectionNumber: str
    batchId: str
    batchNumber: Optional[str] = None
    timestamp: str
    sampleSize: int
    failedUnits: int
    observedProportion: float
    centerLine: Optional[float] = None
    upperControlLimit: Optional[float] = None
    lowerControlLimit: Optional[float] = None
    signal: bool = False
    signalReason: Optional[Literal["ABOVE_UCL", "BELOW_LCL"]] = None


class PChartBaseline(BaseModel):
    subgroupCount: int
    minimumRequired: int
    totalSampleSize: int
    totalFailedUnits: int
    pBar: Optional[float] = None


class PChartSummary(BaseModel):
    signalCount: int
    upperSignalCount: int
    lowerSignalCount: int
    interpretation: str


class PChartCalculationResponse(BaseModel):
    status: Literal["READY", "INSUFFICIENT_DATA", "DEGENERATE_BASELINE"]
    baseline: PChartBaseline
    summary: PChartSummary
    points: List[PChartPoint]
    warnings: List[str] = Field(default_factory=list)
