"""CPU-only LiveKit participant for incident-triggered NexoCam moderation."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import signal
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass

import aiohttp
import boto3
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from livekit import api, rtc
from opennsfw_onnx import NSFWClassifier
from PIL import Image
from prometheus_client import Counter, Gauge, start_http_server
from key_material import decode_evidence_key

FRAMES_CLASSIFIED = Counter("nexocam_frames_classified_total", "Frames classified")
INCIDENTS = Counter("nexocam_moderation_incidents_total", "Moderation incidents", ["label"])
INFLIGHT = Gauge("nexocam_moderation_inflight", "Frames currently queued for classification")

SAMPLE_SECONDS = float(os.getenv("SAMPLE_SECONDS", "3"))
STRONG_THRESHOLD = float(os.getenv("NSFW_STRONG_THRESHOLD", "0.88"))
WARNING_THRESHOLD = float(os.getenv("NSFW_WARNING_THRESHOLD", "0.68"))
MAX_CONCURRENT_INFERENCE = int(os.getenv("MAX_CONCURRENT_INFERENCE", "2"))


@dataclass
class Sample:
    captured_at: float
    image: Image.Image
    score: float | None = None


class EvidenceStore:
    def __init__(self) -> None:
        self.bucket = os.environ["S3_BUCKET"]
        self.client = boto3.client(
            "s3",
            endpoint_url=os.environ["S3_ENDPOINT"],
            aws_access_key_id=os.environ["S3_ACCESS_KEY"],
            aws_secret_access_key=os.environ["S3_SECRET_KEY"],
            region_name=os.getenv("S3_REGION", "us-east-1"),
        )
        key = decode_evidence_key(os.environ["EVIDENCE_ENCRYPTION_KEY"])
        self.cipher = AESGCM(key)

    def put(self, session_id: str, sample: Sample) -> dict[str, str]:
        output = io.BytesIO()
        sample.image.save(output, format="JPEG", quality=82, optimize=True)
        nonce = os.urandom(12)
        sealed = self.cipher.encrypt(nonce, output.getvalue(), session_id.encode())
        encrypted = nonce + sealed[-16:] + sealed[:-16]
        object_key = f"incidents/{session_id}/{uuid.uuid4()}.jpg.enc"
        self.client.put_object(
            Bucket=self.bucket,
            Key=object_key,
            Body=encrypted,
            ContentType="application/octet-stream",
            Metadata={"retention": "30-days", "encryption": "aes-256-gcm"},
        )
        return {"objectKey": object_key, "sha256": hashlib.sha256(encrypted).hexdigest()}


class Runtime:
    def __init__(self) -> None:
        self.classifier = NSFWClassifier(
            providers=["CPUExecutionProvider"],
            intra_op_num_threads=max(1, int(os.getenv("ONNX_THREADS", "2"))),
        )
        self.classifier.warmup()
        self.evidence = EvidenceStore()
        self.inference = asyncio.Semaphore(MAX_CONCURRENT_INFERENCE)
        self.inflight = 0


class Moderator:
    def __init__(self, session_id: str, room_name: str, runtime: Runtime, http: aiohttp.ClientSession) -> None:
        self.session_id = session_id
        self.room_name = room_name
        self.runtime = runtime
        self.http = http
        self.windows: dict[str, deque[Sample]] = defaultdict(lambda: deque(maxlen=5))
        self.processed_report_ids: set[str] = set()
        self.room = rtc.Room()
        self.room.on("track_subscribed", self.on_track_subscribed)

    async def start(self) -> None:
        token = (
            api.AccessToken(os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"])
            .with_identity(f"moderator-{self.session_id}")
            .with_name("NexoCam Safety")
            .with_metadata(json.dumps({"service": "moderation", "invisible": True}))
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=self.room_name,
                    can_subscribe=True,
                    can_publish=False,
                    hidden=True,
                )
            )
            .to_jwt()
        )
        await self.room.connect(
            os.environ["LIVEKIT_URL"],
            token,
            options=rtc.RoomOptions(auto_subscribe=True),
        )

    def on_track_subscribed(
        self,
        track: rtc.Track,
        _publication: rtc.RemoteTrackPublication,
        participant: rtc.RemoteParticipant,
    ) -> None:
        if track.kind == rtc.TrackKind.KIND_VIDEO:
            asyncio.create_task(self.consume_video(track, participant.identity))

    async def consume_video(self, track: rtc.RemoteVideoTrack, identity: str) -> None:
        stream = rtc.VideoStream(track)
        last_sample = 0.0
        try:
            async for event in stream:
                now = time.monotonic()
                if now - last_sample < SAMPLE_SECONDS or self.runtime.inference.locked():
                    continue
                last_sample = now
                frame = event.frame.convert(rtc.VideoBufferType.RGBA)
                image = Image.frombytes("RGBA", (frame.width, frame.height), bytes(frame.data)).convert("RGB")
                asyncio.create_task(self.classify(identity, Sample(now, image)))
        finally:
            await stream.aclose()

    async def classify(self, identity: str, sample: Sample) -> None:
        async with self.runtime.inference:
            INFLIGHT.inc()
            self.runtime.inflight += 1
            try:
                prediction = await asyncio.to_thread(self.runtime.classifier.classify, sample.image)
                sample.score = float(prediction.nsfw)
                self.windows[identity].append(sample)
                FRAMES_CLASSIFIED.inc()
                if sample.score >= WARNING_THRESHOLD:
                    await self.incident(identity, sample.score)
            finally:
                self.runtime.inflight = max(0, self.runtime.inflight - 1)
                INFLIGHT.dec()

    async def incident(self, identity: str, score: float) -> None:
        label = "nudity"
        INCIDENTS.labels(label=label).inc()
        samples = sorted(
            self.windows[identity],
            key=lambda item: item.score or 0,
            reverse=True,
        )[:3]
        evidence = await asyncio.gather(
            *(asyncio.to_thread(self.runtime.evidence.put, self.session_id, item) for item in samples)
        )
        async with self.http.post(
            f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/api/internal/moderation/event",
            headers={"Authorization": f"Bearer {os.environ['MODERATION_SERVICE_TOKEN']}"},
            json={
                "sessionId": self.session_id,
                "userId": identity,
                "label": label,
                "confidence": score,
                "strong": score >= STRONG_THRESHOLD,
                "evidence": evidence,
            },
        ) as response:
            response.raise_for_status()

    async def capture_report(self, identity: str, report_id: str) -> None:
        if report_id in self.processed_report_ids:
            return
        samples = sorted(
            self.windows[identity],
            key=lambda item: item.captured_at,
            reverse=True,
        )[:3]
        evidence = await asyncio.gather(
            *(asyncio.to_thread(self.runtime.evidence.put, self.session_id, item) for item in samples)
        )
        async with self.http.post(
            f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/api/internal/moderation/report-evidence",
            headers={"Authorization": f"Bearer {os.environ['MODERATION_SERVICE_TOKEN']}"},
            json={
                "reportId": report_id,
                "sessionId": self.session_id,
                "evidence": evidence,
            },
        ) as response:
            response.raise_for_status()
        self.processed_report_ids.add(report_id)

    async def close(self) -> None:
        await self.room.disconnect()


async def main() -> None:
    start_http_server(int(os.getenv("HEALTH_PORT", "8081")))
    runtime = Runtime()
    http = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
    monitors: dict[str, Moderator] = {}
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(name, stop.set)
    endpoint = f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/api/internal/moderation/sessions"
    heartbeat_endpoint = f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/api/internal/moderation/heartbeat"
    headers = {"Authorization": f"Bearer {os.environ['MODERATION_SERVICE_TOKEN']}"}
    last_success = time.monotonic()
    try:
        while not stop.is_set():
            try:
                async with http.get(endpoint, headers=headers) as response:
                    response.raise_for_status()
                    active = {item["sessionId"]: item for item in await response.json()}
                last_success = time.monotonic()
                for session_id, item in active.items():
                    if session_id not in monitors:
                        monitor = Moderator(session_id, item["roomName"], runtime, http)
                        await monitor.start()
                        monitors[session_id] = monitor
                    evidence_request = item.get("evidenceRequest")
                    if evidence_request:
                        await monitors[session_id].capture_report(
                            evidence_request["userId"],
                            evidence_request["reportId"],
                        )
                for session_id in set(monitors) - set(active):
                    await monitors.pop(session_id).close()
                async with http.post(
                    heartbeat_endpoint,
                    headers=headers,
                    json={
                        "status": "healthy",
                        "activeSessions": len(monitors),
                        "inflight": runtime.inflight,
                        "lagSeconds": max(0, time.monotonic() - last_success),
                    },
                ) as response:
                    response.raise_for_status()
            except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                print(f"moderation control loop unavailable: {error}", flush=True)
            except Exception as error:
                print(f"moderation control loop failed: {error}", flush=True)
            try:
                await asyncio.wait_for(stop.wait(), timeout=3)
            except asyncio.TimeoutError:
                pass
    finally:
        await asyncio.gather(*(monitor.close() for monitor in monitors.values()), return_exceptions=True)
        await http.close()


if __name__ == "__main__":
    asyncio.run(main())
