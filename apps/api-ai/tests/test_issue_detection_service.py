import os
import sys

# Ensure `apps/api-ai` is importable when pytest runs from repo root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.issue_detection_service import issue_detection_service


def test_detect_text_auth_unauthorized():
    result = issue_detection_service.detect(kind="text", text="401 Unauthorized: invalid API key")
    codes = {i["code"] for i in result["issues"]}
    assert "AUTH_UNAUTHORIZED" in codes


def test_detect_api_error_rate_limited():
    result = issue_detection_service.detect(
        kind="api_error",
        payload={"status": 429, "message": "Rate limit exceeded"},
    )
    codes = {i["code"] for i in result["issues"]}
    assert "RATE_LIMITED" in codes


def test_detect_workflow_run_failed():
    result = issue_detection_service.detect(
        kind="workflow_run",
        payload={"status": "failed", "error_message": "ECONNREFUSED 127.0.0.1:5000"},
    )
    codes = {i["code"] for i in result["issues"]}
    assert "WORKFLOW_FAILED" in codes
    assert "CONNECTION_REFUSED" in codes


def test_detect_severity_threshold_filters():
    result = issue_detection_service.detect(kind="text", text="429 Too Many Requests", severity_threshold="high")
    # RATE_LIMITED is medium, so it should be filtered out
    assert result["count"] == 0


def test_detect_max_issues_limits_output():
    text = "401 Unauthorized. 403 Forbidden. 429 Too Many Requests. timeout. Traceback (most recent call last):"
    result = issue_detection_service.detect(kind="text", text=text, max_issues=2)
    assert result["count"] == 2

