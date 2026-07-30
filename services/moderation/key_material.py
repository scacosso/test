"""Strict, deployment-friendly evidence encryption key decoding."""

from __future__ import annotations

import base64
import binascii
import re

_HEX_KEY = re.compile(r"^[0-9a-fA-F]{64}$")


def decode_evidence_key(value: str) -> bytes:
    encoded = value.strip()
    if _HEX_KEY.fullmatch(encoded):
        key = bytes.fromhex(encoded)
    else:
        unpadded = encoded.rstrip("=")
        if not unpadded or len(unpadded) % 4 == 1 or not re.fullmatch(r"[A-Za-z0-9+/_-]+", unpadded):
            raise ValueError(
                "EVIDENCE_ENCRYPTION_KEY must be a 32-byte key encoded as Base64, Base64url, or 64 hex characters"
            )
        normalized = unpadded.replace("-", "+").replace("_", "/")
        normalized += "=" * (-len(normalized) % 4)
        try:
            key = base64.b64decode(normalized, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError(
                "EVIDENCE_ENCRYPTION_KEY must be a 32-byte key encoded as Base64, Base64url, or 64 hex characters"
            ) from error

    if len(key) != 32:
        raise ValueError(
            "EVIDENCE_ENCRYPTION_KEY must decode to exactly 32 bytes; generate it with npm run easypanel:env"
        )
    return key
