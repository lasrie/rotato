"""Tests für die Pod-Authentifizierung (pod_auth.py) — offline, ohne echten Pod.

Geprüft wird die DPoP-Header-Form (RFC 9449): typ, alg, jwk-Form,
htm/htu/iat/jti-Claims und die Signatur-Verifizierbarkeit.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def fake_env(tmp_path, monkeypatch):
    """PodAuth mit Fake-Credentials initialisieren (kein Netz!)."""
    monkeypatch.setenv("POD_BASE", "https://example.org/garten/")
    monkeypatch.setenv("SOLID_IDP", "https://example.org/idp")
    monkeypatch.setenv("SOLID_CLIENT_ID", "test-id")
    monkeypatch.setenv("SOLID_CLIENT_SECRET", "test-secret")
    from pod_auth import PodAuth
    return PodAuth()


def _b64url_decode(seg: str) -> bytes:
    return base64.urlsafe_b64decode(seg + "=" * (-len(seg) % 4))


def test_dpop_header_structure(fake_env):
    header = fake_env._dpop_header("GET", "https://example.org/garten/beete.ttl")
    parts = header.split(".")
    assert len(parts) == 3, "DPoP-Proof muss ein JWT (3 Segmente) sein"

    h = json.loads(_b64url_decode(parts[0]))
    assert h["typ"] == "dpop+jwt"
    assert h["alg"] == "ES256"
    # JWK nur mit kty/crv/x/y (kein use/alg — verursachte 'invalid DPoP key binding')
    assert set(h["jwk"]) == {"kty", "crv", "x", "y"}, \
        f"jwk-Header soll minimal sein, hat: {sorted(h['jwk'])}"

    payload = json.loads(_b64url_decode(parts[1]))
    assert payload["htm"] == "GET"
    assert payload["htu"] == "https://example.org/garten/beete.ttl"
    assert "iat" in payload and "jti" in payload


def test_dpop_jti_unique_per_call(fake_env):
    a = json.loads(_b64url_decode(fake_env._dpop_header("GET", "https://x/").split(".")[1]))
    b = json.loads(_b64url_decode(fake_env._dpop_header("GET", "https://x/").split(".")[1]))
    assert a["jti"] != b["jti"], "jti muss pro Proof eindeutig sein"


def test_dpop_signature_verifiable(fake_env):
    """Der Proof muss mit dem angegebenen JWK verifizierbar sein."""
    from jwcrypto.jwk import JWK
    from jwcrypto.jws import JWS
    proof = fake_env._dpop_header("POST", "https://example.org/garten/x")
    jws = JWS()
    jws.deserialize(proof)
    # jose_header liefert das jwk als dict (nicht String)
    jwk = jws.jose_header["jwk"]
    jwk_dict = jwk if isinstance(jwk, dict) else json.loads(jwk)
    verifier = JWK(**jwk_dict)
    jws.verify(verifier)  # wirft bei ungültiger Signatur
    payload = json.loads(jws.payload.decode() if isinstance(jws.payload, bytes) else jws.payload)
    assert payload["htm"] == "POST"


def test_missing_env_raises(tmp_path, monkeypatch):
    """Fehlende Credentials → RuntimeError. Wichtig: ohne .env-File in cwd,
    damit der echte .env-Import den Test nicht überlebt."""
    # load_env liest ENV_FILE relativ zur Modul-Datei — wir können das File nicht
    # verschieben, also simulieren wir fehlende Credentials über leere Env.
    monkeypatch.delenv("POD_BASE", raising=False)
    monkeypatch.delenv("SOLID_CLIENT_ID", raising=False)
    monkeypatch.delenv("SOLID_CLIENT_SECRET", raising=False)
    from pod_auth import PodAuth, load_env, ENV_FILE
    # ENV_FILE existiert evtl. (lokales .env) — dann enthält load_env die Werte.
    env = load_env(ENV_FILE)
    if env.get("SOLID_CLIENT_ID") and env.get("SOLID_CLIENT_SECRET") and env.get("POD_BASE"):
        # Mit echter .env kann der Test nicht sinnvoll prüfen — wir überschreiben:
        pass
    # PodAuth nutzt os.environ-Merge; ohne Env-Variablen bleibt nur .env. Um den
    # RuntimeError zuverlässig zu prüfen, testen wir die Bedingung direkt:
    auth_env = {k: v for k, v in env.items() if k not in ("POD_BASE", "SOLID_CLIENT_ID", "SOLID_CLIENT_SECRET")}
    with pytest.raises(RuntimeError):
        PodAuth(env=auth_env)


def test_env_precedence_shell_overrides_dotenv(monkeypatch):
    """Shell-Umgebung überschreibt .env — dokumentiertes Verhalten."""
    monkeypatch.setenv("POD_BASE", "https://override.example/")
    monkeypatch.setenv("SOLID_CLIENT_ID", "override-id")
    monkeypatch.setenv("SOLID_CLIENT_SECRET", "override-secret")
    from pod_auth import PodAuth
    auth = PodAuth()
    assert auth.pod_base == "https://override.example"
