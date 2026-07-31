import {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  type LocalTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import {
  Microphone,
  MicrophoneSlash,
  SpinnerGap,
  VideoCamera,
  VideoCameraSlash
} from "@phosphor-icons/react";

type ReviewTrack = {
  key: string;
  identity: string;
  kind: Track.Kind;
  track: RemoteTrack;
};

export type LiveReviewConnection = {
  reviewId: string;
  sessionId: string;
  token: string;
  livekitUrl: string;
  expiresAt: string;
  mode: "observe" | "connect";
  targetUserId: string;
};

function VideoTrack({ item }: { item: ReviewTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!(item.track instanceof RemoteVideoTrack) || !element) return;
    item.track.attach(element);
    return () => { item.track.detach(element); };
  }, [item.track]);
  return (
    <article className="live-review-video">
      <video ref={ref} autoPlay playsInline />
      <span>{item.identity}</span>
    </article>
  );
}

function AudioTrack({ item }: { item: ReviewTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!(item.track instanceof RemoteAudioTrack) || !element) return;
    item.track.attach(element);
    return () => { item.track.detach(element); };
  }, [item.track]);
  return <audio ref={ref} autoPlay />;
}

function LocalPreview({ track }: { track: LocalVideoTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    track.attach(element);
    return () => { track.detach(element); };
  }, [track]);
  return <video ref={ref} autoPlay muted playsInline />;
}

export default function AdminLiveReviewViewer(props: {
  connection: LiveReviewConnection;
  locale: "es" | "en";
  onEnded: (reason: "viewer_disconnected" | "token_expired") => void;
}) {
  const [tracks, setTracks] = useState<ReviewTrack[]>([]);
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraMuted, setCameraMuted] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "error">("connecting");
  const endedRef = useRef(false);
  const localTracksRef = useRef<LocalTrack[]>([]);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: false });
    const addTrack = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      setTracks((current) => [
        ...current.filter((item) => item.key !== publication.trackSid),
        {
          key: publication.trackSid,
          identity: participant.identity,
          kind: track.kind,
          track
        }
      ]);
    };
    const removeTrack = (_track: RemoteTrack, publication: RemoteTrackPublication) => {
      setTracks((current) => current.filter((item) => item.key !== publication.trackSid));
    };
    const disconnected = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      props.onEnded("viewer_disconnected");
    };

    room
      .on(RoomEvent.TrackSubscribed, addTrack)
      .on(RoomEvent.TrackUnsubscribed, removeTrack)
      .on(RoomEvent.Reconnecting, () => setStatus("reconnecting"))
      .on(RoomEvent.Reconnected, () => setStatus("connected"))
      .on(RoomEvent.Disconnected, disconnected);

    void (async () => {
      try {
        await room.connect(props.connection.livekitUrl, props.connection.token, {
          autoSubscribe: true
        });
        if (props.connection.mode === "connect") {
          try {
            const created = await createLocalTracks({ audio: true, video: true });
            if (endedRef.current) {
              created.forEach((track) => track.stop());
              return;
            }
            await Promise.all(created.map((track) => room.localParticipant.publishTrack(track)));
            localTracksRef.current = created;
            setLocalTracks(created);
          } catch {
            setMediaError(true);
          }
        }
        if (!endedRef.current) setStatus("connected");
      } catch {
        if (!endedRef.current) setStatus("error");
      }
    })();

    const remainingMs = Math.max(0, new Date(props.connection.expiresAt).getTime() - Date.now());
    const expiryTimer = window.setTimeout(() => {
      if (endedRef.current) return;
      endedRef.current = true;
      props.onEnded("token_expired");
    }, remainingMs);

    return () => {
      endedRef.current = true;
      window.clearTimeout(expiryTimer);
      localTracksRef.current.forEach((track) => track.stop());
      localTracksRef.current = [];
      room.removeAllListeners();
      void room.disconnect();
    };
  }, [props.connection, props.onEnded]);

  const toggleLocalTrack = async (kind: Track.Kind) => {
    const track = localTracksRef.current.find((item) => item.kind === kind);
    if (!track) return;
    if (track.isMuted) await track.unmute();
    else await track.mute();
    if (kind === Track.Kind.Audio) setMicrophoneMuted(track.isMuted);
    if (kind === Track.Kind.Video) setCameraMuted(track.isMuted);
  };

  const targetTracks = tracks.filter((item) => item.identity === props.connection.targetUserId);
  const videos = targetTracks.filter((item) => item.kind === Track.Kind.Video);
  const audios = targetTracks.filter((item) => item.kind === Track.Kind.Audio);
  const localVideo = localTracks.find((item): item is LocalVideoTrack => item instanceof LocalVideoTrack);
  const copy = props.locale === "es"
    ? {
        connecting: props.connection.mode === "connect" ? "Entrando a la sala…" : "Abriendo vista previa…",
        reconnecting: "Reconectando la transmisión…",
        error: "No se pudo abrir la transmisión.",
        empty: "El usuario está conectado, pero todavía no publica video.",
        mediaError: "Entraste a la sala, pero no se pudo activar tu cámara o micrófono.",
        microphone: "Micrófono",
        camera: "Cámara",
        you: "Tú · Superadmin"
      }
    : {
        connecting: props.connection.mode === "connect" ? "Joining the room…" : "Opening preview…",
        reconnecting: "Reconnecting the stream…",
        error: "The stream could not be opened.",
        empty: "The user is connected, but is not publishing video yet.",
        mediaError: "You joined the room, but your camera or microphone could not be enabled.",
        microphone: "Microphone",
        camera: "Camera",
        you: "You · Super admin"
      };

  return (
    <div className={`live-review-stage live-review-stage--${props.connection.mode}`}>
      {audios.map((item) => <AudioTrack key={item.key} item={item} />)}
      {status === "connecting" || status === "reconnecting" ? (
        <div className="live-review-stage__state">
          <SpinnerGap className="spin" />
          <strong>{status === "connecting" ? copy.connecting : copy.reconnecting}</strong>
        </div>
      ) : status === "error" ? (
        <div className="live-review-stage__state live-review-stage__state--error">
          <VideoCameraSlash />
          <strong>{copy.error}</strong>
        </div>
      ) : videos.length === 0 ? (
        <div className="live-review-stage__state">
          <VideoCameraSlash />
          <strong>{copy.empty}</strong>
        </div>
      ) : (
        <div className="live-review-grid is-single">
          {videos.map((item) => <VideoTrack key={item.key} item={item} />)}
        </div>
      )}

      {props.connection.mode === "connect" ? (
        <aside className="live-review-local">
          <div className="live-review-local__video">
            {localVideo && !cameraMuted ? <LocalPreview track={localVideo} /> : <VideoCameraSlash />}
            <span>{copy.you}</span>
          </div>
          <div className="live-review-local__controls">
            <button
              type="button"
              className={microphoneMuted ? "is-muted" : ""}
              onClick={() => void toggleLocalTrack(Track.Kind.Audio)}
              aria-label={copy.microphone}
            >
              {microphoneMuted ? <MicrophoneSlash /> : <Microphone />}
              <span>{copy.microphone}</span>
            </button>
            <button
              type="button"
              className={cameraMuted ? "is-muted" : ""}
              onClick={() => void toggleLocalTrack(Track.Kind.Video)}
              aria-label={copy.camera}
            >
              {cameraMuted ? <VideoCameraSlash /> : <VideoCamera />}
              <span>{copy.camera}</span>
            </button>
          </div>
          {mediaError ? <p role="alert">{copy.mediaError}</p> : null}
        </aside>
      ) : null}
    </div>
  );
}
