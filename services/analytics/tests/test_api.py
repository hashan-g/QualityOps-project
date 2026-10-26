import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "qualityops-analytics"


def test_calculate_p_chart_endpoint_ready():
    subgroups = []
    for i in range(1, 21):
        subgroups.append(
            {
                "id": f"00000000-0000-0000-0000-{i:012d}",
                "inspectionNumber": f"INSP-{i}",
                "batchId": f"11111111-1111-1111-1111-{i:012d}",
                "timestamp": "2026-01-01T00:00:00Z",
                "sampleSize": 50,
                "failedUnits": 2,
            }
        )

    res = client.post("/calculate/p-chart", json={"subgroups": subgroups, "minimumRequired": 20})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "READY"
    assert data["baseline"]["subgroupCount"] == 20
    assert data["baseline"]["pBar"] == 40 / 1000  # 0.04
    assert len(data["points"]) == 20


def test_calculate_p_chart_endpoint_insufficient_data():
    subgroups = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "inspectionNumber": "INSP-1",
            "batchId": "11111111-1111-1111-1111-000000000001",
            "timestamp": "2026-01-01T00:00:00Z",
            "sampleSize": 50,
            "failedUnits": 2,
        }
    ]
    res = client.post("/calculate/p-chart", json={"subgroups": subgroups, "minimumRequired": 20})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "INSUFFICIENT_DATA"
    assert data["baseline"]["subgroupCount"] == 1
    assert data["baseline"]["pBar"] is None


def test_calculate_p_chart_endpoint_invalid_input():
    # Failed units > sampleSize
    subgroups = [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "inspectionNumber": "INSP-1",
            "batchId": "11111111-1111-1111-1111-000000000001",
            "timestamp": "2026-01-01T00:00:00Z",
            "sampleSize": 50,
            "failedUnits": 60,
        }
    ]
    res = client.post("/calculate/p-chart", json={"subgroups": subgroups, "minimumRequired": 20})
    assert res.status_code == 400
    assert "exceeding sample size" in res.json()["detail"]
