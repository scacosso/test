import {
  RemoteAudioTrack,
  RemoteVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { SpinnerGap, VideoCameraSlash } from "@phosphor-icons/react";

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

export default function AdminLiveReviewViewer(props: {
  connection: LiveReviewConnection;
  locale: "es" | "en";
  onEnded: (reason: "viewer_disconnected" | "token_expired") => void;
}) {
  const [tracks, setTracks] = useState<ReviewTrack[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "error">("connecting");
  const endedRef = useRef(false);

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

    void room.connect(props.connection.livekitUrl, props.connection.token, {
      autoSubscribe: true
    }).then(() => setStatus("connected")).catch(() => setStatus("error"));

    const remainingMs = Math.max(0, new Date(props.connection.expiresAt).getTime() - Date.now());
    const expiryTimer = window.setTimeout(() => {
      if (endedRef.current) return;
      endedRef.current = true;
      props.onEnded("token_expired");
    }, remainingMs);

    return () => {
      endedRef.current = true;
      window.clearTimeout(expiryTimer);
      room.removeAllListeners();
      void room.disconnect();
    };
  }, [props.connection, props.onEnded]);

  const videos = tracks.filter((item) => item.kind === Track.Kind.Video);
  const audios = tracks.filter((item) => item.kind === Track.Kind.Audio);
  const copy = props.locale === "es"
    ? {
        connecting: "Conectando a la sala…",
        reconnecting: "Reconectando la revisión…",
        error: "No se pudo abrir la transmisión.",
        empty: "La sala está conectada, pero todavía no publica video."
      }
    : {
        connecting: "Connecting to the room…",
        reconnecting: "Reconnecting the review…",
        error: "The stream could not be opened.",
        empty: "The room is connected, but no video is being published yet."
      };

  return (
    <div className="live-review-stage">
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
        <div className={`live-review-grid${videos.length === 1 ? " is-single" : ""}`}>
          {videos.map((item) => <VideoTrack key={item.key} item={item} />)}
        </div>
      )}
    </div>
  );
}
