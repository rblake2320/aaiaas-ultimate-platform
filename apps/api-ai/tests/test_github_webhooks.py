import json

from services.github_webhooks import compute_github_signature_256, is_valid_github_signature


def test_github_signature_validation_round_trip():
    body = json.dumps({"hello": "world"}).encode("utf-8")
    secret = "super-secret"
    sig = compute_github_signature_256(body, secret)
    assert sig.startswith("sha256=")
    assert is_valid_github_signature(body, sig, secret) is True
    assert is_valid_github_signature(body, "sha256=deadbeef", secret) is False
    assert is_valid_github_signature(body, None, secret) is False

