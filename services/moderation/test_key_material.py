import base64
import unittest

from key_material import decode_evidence_key


class EvidenceKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.raw = bytes(range(32))

    def test_accepts_padded_and_unpadded_base64(self) -> None:
        padded = base64.b64encode(self.raw).decode()
        self.assertEqual(decode_evidence_key(padded), self.raw)
        self.assertEqual(decode_evidence_key(padded.rstrip("=")), self.raw)

    def test_accepts_unpadded_base64url_and_hex(self) -> None:
        urlsafe = base64.urlsafe_b64encode(self.raw).decode().rstrip("=")
        self.assertEqual(decode_evidence_key(urlsafe), self.raw)
        self.assertEqual(decode_evidence_key(self.raw.hex()), self.raw)

    def test_rejects_placeholders_and_wrong_length_keys(self) -> None:
        with self.assertRaisesRegex(ValueError, "EVIDENCE_ENCRYPTION_KEY"):
            decode_evidence_key("replace-with-base64-encoded-32-byte-value")
        with self.assertRaises(ValueError):
            decode_evidence_key(base64.b64encode(b"too-short").decode())


if __name__ == "__main__":
    unittest.main()
