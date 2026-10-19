"""Pod-Authentifizierung für server.py (ADR-0005, Stufe 1: Gateway).

Implementiert den CSS Client-Credentials-Flow in Python:
  1. DPoP-Schlüsselpaar (ES256) erzeugen (pro Server-Lauf einmalig)
  2. Access-Token via POST /.oidc/token holen
     - Basic-Auth mit SOLID_CLIENT_ID / SOLID_CLIENT_SECRET
     - DPoP-Header für den Token-Endpunkt
     - grant_type=client_credentials&scope=webid
  3. Pod-Anfragen mit "Authorization: DPoP <token>" + frischem DPoP-Proof
     (jti, htm, htu, iat — signiert mit demselben Schlüssel)

Das Access-Token ist kurzlebig (~600 s) und wird bei 401 automatisch erneuert.
"""
from __future__ import annotations

import base64
import json
import os
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode

import requests
from jwcrypto.jwk import JWK
from jwcrypto.jws import JWS

ENV_FILE = Path(__file__).parent / ".env"

# DPoP-Konstanten (RFC 9449)
_DPOP_TYP = "dpop+jwt"
_DPOP_ALG = "ES256"


def load_env(path: Path = ENV_FILE) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class PodAuth:
    """Client-Credentials + DPoP gegen einen Community Solid Server."""

    def __init__(self, env: dict[str, str] | None = None):
        env = env or {**load_env(), **{k: v for k, v in os.environ.items() if k in (
            "POD_BASE", "SOLID_IDP", "SOLID_CLIENT_ID", "SOLID_CLIENT_SECRET")}}
        self.pod_base = (env.get("POD_BASE") or "").rstrip("/")
        self.idp = (env.get("SOLID_IDP") or "https://solidcommunity.net").rstrip("/")
        self.client_id = env.get("SOLID_CLIENT_ID", "")
        self.client_secret = env.get("SOLID_CLIENT_SECRET", "")
        if not (self.pod_base and self.client_id and self.client_secret):
            raise RuntimeError(
                "POD_BASE / SOLID_CLIENT_ID / SOLID_CLIENT_SECRET fehlen (siehe .env.example).")

        # DPoP-Schlüssel einmalig pro Lauf erzeugen
        self._jwk = JWK.generate(kty="EC", crv="P-256", use="sig")
        self._token: str | None = None
        self._token_expires: float = 0.0
        self._jti_counter = 0

    # ---------- DPoP ----------
    def _dpop_header(self, htm: str, htu: str) -> str:
        self._jti_counter += 1
        header = {"typ": _DPOP_TYP, "alg": _DPOP_ALG, "jwk": {
            "kty": self._jwk.kty,
            "crv": self._jwk.crv,
            "x": self._jwk.x,
            "y": self._jwk.y,
        }}
        now = int(time.time())
        payload = {
            "htm": htm,
            "htu": htu,
            "iat": now,
            "jti": f"{uuid.uuid4().hex}-{self._jti_counter}",
        }
        jws = JWS(json.dumps(payload, separators=(",", ":")))
        jws.add_signature(
            self._jwk, protected=json.dumps(header, separators=(",", ":")),
            alg=_DPOP_ALG,
        )
        return jws.serialize(compact=True)

    # ---------- Token ----------
    def _request_token(self) -> tuple[str, int]:
        token_url = f"{self.idp}/.oidc/token"
        resp = requests.post(
            token_url,
            headers={
                # Basic-Auth mit url-encodierten Werten (wie in der CSS-Doku)
                "Authorization": "Basic " + base64.b64encode(
                    f"{self._enc(self.client_id)}:{self._enc(self.client_secret)}".encode()
                ).decode(),
                "Content-Type": "application/x-www-form-urlencoded",
                "DPoP": self._dpop_header("POST", token_url),
            },
            data=urlencode({"grant_type": "client_credentials", "scope": "webid"}),
            timeout=30,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Token-Request fehlgeschlagen (HTTP {resp.status_code}): {resp.text[:200]}")
        data = resp.json()
        return data["access_token"], int(data.get("expires_in", 600))

    @staticmethod
    def _enc(value: str) -> str:
        from urllib.parse import quote
        return quote(value, safe="")

    def token(self) -> str:
        # 30 s Puffer vor Ablauf
        if self._token is None or time.time() > self._token_expires - 30:
            self._token, expires_in = self._request_token()
            self._token_expires = time.time() + expires_in
        return self._token

    # ---------- Authentifizierte Anfragen ----------
    def request(self, method: str, url: str, *, data: bytes | None = None,
                headers: dict[str, str] | None = None, _retry: bool = True) -> requests.Response:
        merged = dict(headers or {})
        merged["Authorization"] = f"DPoP {self.token()}"
        merged["DPoP"] = self._dpop_header(method, url)
        resp = requests.request(method, url, data=data, headers=merged, timeout=60)
        # Token könnte abgelaufen sein → einmal erneuern und wiederholen
        if resp.status_code == 401 and _retry:
            self._token = None
            return self.request(method, url, data=data, headers=headers, _retry=False)
        return resp

    def get(self, url: str, **kw) -> requests.Response:
        return self.request("GET", url, **kw)

    def put(self, url: str, data: bytes, *, content_type: str = "text/turtle; charset=utf-8",
            headers: dict[str, str] | None = None, if_match: str | None = None) -> requests.Response:
        h = {"Content-Type": content_type}
        if if_match:
            # Optimistische Concurrency: Schreiben nur, wenn der Server-Zustand
            # dem entspricht, den wir gelesen haben (verhindert verlorene Updates).
            h["If-Match"] = if_match
        if headers:
            h.update(headers)
        return self.request("PUT", url, data=data, headers=h)


if __name__ == "__main__":
    # Selbsttest: python3 pod_auth.py
    auth = PodAuth()
    r = auth.get(f"{auth.pod_base}/beete.ttl", headers={"Accept": "text/turtle"})
    print(f"GET beete.ttl → HTTP {r.status_code}, {len(r.content)} Bytes")
    assert r.status_code == 200, r.text[:200]
    print("✅ PodAuth funktioniert.")
