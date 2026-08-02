import { Room, RoomEvent, Track, VideoQuality, type RemoteTrack } from "livekit-client";
import { Camera, SpinnerGap, VideoCameraSlash, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type PreviewAccess = {
  accessId: string;
  expiresAt: string;
  livekitUrl: string;
  targetUserId: string;
  token: string;
};

export default function AdminUserPreview(props: {
  locale: "es" | "en";
  previewReady: boolean;
  snapshotCapturedAt: string | null;
  snapshotReady: boolean;
  userId: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [renewal, setRenewal] = useState(0);
  const [state, setState] = useState<"waiting" | "loading" | "playing" | "error">("waiting");

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "160px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !hovering || !props.previewReady) {
      setState("waiting");
      return;
    }
    let active = true;
    let access: PreviewAccess | null = null;
    let room: Room | null = null;
    let renewalTimer = 0;
    let videoTimer = 0;
    let hasVideo = false;

    const closeAccess = (current: PreviewAccess) => {
      void fetch(`/api/admin/live/access/${current.accessId}/end`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endReason: "viewer_closed" })
      });
    };

    void (async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/admin/live/users/${encodeURIComponent(props.userId)}/preview`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: "{}"
        });
        if (!response.ok) throw new Error("preview_unavailable");
        access = await response.json() as PreviewAccess;
        if (!active) {
          closeAccess(access);
          return;
        }
        room = new Room({ adaptiveStream: true, dynacast: false });
        const attach = (track: RemoteTrack, _publication: unknown, participant: { identity: string }) => {
          if (participant.identity !== props.userId || track.kind !== Track.Kind.Video || !videoRef.current) return;
          hasVideo = true;
          window.clearTimeout(videoTimer);
          track.attach(videoRef.current);
          setState("playing");
        };
        room.on(RoomEvent.TrackSubscribed, attach);
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind !== Track.Kind.Video || !videoRef.current) return;
          track.detach(videoRef.current);
          videoRef.current.srcObject = null;
          if (active) setState("waiting");
        });
        room.on(RoomEvent.TrackPublished, (publication, participant) => {
          if (participant.identity === props.userId && publication.kind === Track.Kind.Video) {
            publication.setVideoQuality(VideoQuality.LOW);
          }
        });
        await room.connect(access.livekitUrl, access.token, { autoSubscribe: true });
        for (const participant of room.remoteParticipants.values()) {
          if (participant.identity !== props.userId) continue;
          for (const publication of participant.videoTrackPublications.values()) {
            publication.setVideoQuality(VideoQuality.LOW);
            if (publication.track) attach(publication.track, publication, participant);
          }
        }
        if (!hasVideo) {
          videoTimer = window.setTimeout(() => {
            if (active && !hasVideo) setState("error");
          }, 12_000);
        }
        const remaining = Math.max(5_000, new Date(access.expiresAt).getTime() - Date.now() - 5_000);
        renewalTimer = window.setTimeout(() => {
          if (active) setRenewal((value) => value + 1);
        }, remaining);
      } catch {
        if (active) setState("error");
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(renewalTimer);
      window.clearTimeout(videoTimer);
      if (room) void room.disconnect(false);
      if (access) closeAccess(access);
    };
  }, [hovering, props.previewReady, props.userId, renewal, visible]);

  const copy = props.locale === "es"
    ? {
        error: "Vista en vivo no disponible",
        hint: "Pasa el mouse para ver en vivo",
        live: "EN VIVO",
        loading: "Abriendo video en vivo…",
        snapshot: "FOTO · 10 S",
        waiting: props.snapshotReady ? "Cargando captura…" : "Esperando la primera captura…"
      }
    : {
        error: "Live preview unavailable",
        hint: "Hover to view live video",
        live: "LIVE",
        loading: "Opening live video…",
        snapshot: "PHOTO · 10 S",
        waiting: props.snapshotReady ? "Loading snapshot…" : "Waiting for the first snapshot…"
      };
  const snapshotUrl = props.snapshotReady && props.snapshotCapturedAt
    ? `/api/admin/live/users/${encodeURIComponent(props.userId)}/snapshot?v=${encodeURIComponent(props.snapshotCapturedAt)}`
    : null;

  return (
    <div
      aria-label={copy.hint}
      className="connected-user-preview"
      data-live-state={hovering ? state : "snapshot"}
      onBlur={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      ref={hostRef}
      tabIndex={0}
      title={copy.hint}
    >
      {snapshotUrl ? (
        <img
          alt={props.locale === "es" ? "Captura reciente de la cámara" : "Recent camera snapshot"}
          onError={() => setSnapshotLoaded(false)}
          onLoad={() => setSnapshotLoaded(true)}
          src={snapshotUrl}
        />
      ) : null}
      <video
        aria-hidden={state !== "playing"}
        aria-label={state === "playing" ? copy.live : undefined}
        autoPlay
        className={state === "playing" ? "is-playing" : ""}
        muted
        playsInline
        ref={videoRef}
      />
      {hovering && state !== "playing" ? (
        <div className="connected-user-preview__state">
          {state === "loading" ? <SpinnerGap className="spin" /> : state === "error" ? <Warning /> : <VideoCameraSlash />}
          <span>{state === "loading" ? copy.loading : state === "error" ? copy.error : copy.waiting}</span>
        </div>
      ) : !snapshotLoaded ? (
        <div className="connected-user-preview__state">
          <Camera />
          <span>{copy.waiting}</span>
        </div>
      ) : null}
      {state === "playing" ? (
        <span className="connected-user-preview__live"><i />{copy.live}</span>
      ) : (
        <>
          <span className="connected-user-preview__live is-snapshot"><Camera />{copy.snapshot}</span>
          {snapshotLoaded && !hovering ? <span className="connected-user-preview__hint">{copy.hint}</span> : null}
        </>
      )}
    </div>
  );
}
