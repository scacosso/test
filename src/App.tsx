import {
  ArrowRight,
  Camera,
  CaretDown,
  ChatCircleDots,
  Check,
  Flag,
  GlobeHemisphereWest,
  Heart,
  LockKey,
  MagicWand,
  Microphone,
  MicrophoneSlash,
  PaperPlaneTilt,
  ShieldCheck,
  SignOut,
  Sparkle,
  SpinnerGap,
  UserCircle,
  UserMinus,
  UserPlus,
  VideoCamera,
  VideoCameraSlash,
  Warning,
  X
} from "@phosphor-icons/react";
import {
  FormEvent,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";

type Locale = "es" | "en";
type ChatState =
  | "permission"
  | "denied"
  | "searching"
  | "connected"
  | "peer-left"
  | "reconnecting"
  | "reported"
  | "blocked"
  | "suspended";

export const copy = {
  es: {
    nav: { how: "Cómo funciona", safety: "Seguridad", login: "Iniciar sesión" },
    hero: {
      eyebrow: "Conversaciones espontáneas, con más cuidado",
      titleA: "Conoce a alguien",
      titleB: "fuera de tu burbuja.",
      body: "Videochat uno a uno para adultos. Elige tu idioma, conecta en segundos y conserva siempre el control.",
      cta: "Empezar a conversar",
      note: "Solo mayores de 18 años · Cámara y micrófono requeridos",
      live: "Personas conectadas ahora"
    },
    how: {
      eyebrow: "Así de simple",
      title: "Una conversación nueva en tres pasos",
      steps: [
        ["Prepara tu cámara", "Comprueba tu imagen y elige idioma y país."],
        ["Encuentra una conexión", "Buscamos a una persona compatible y disponible."],
        ["Conversa con control", "Puedes pasar, bloquear o reportar en cualquier momento."]
      ]
    },
    safety: {
      eyebrow: "Seguridad desde el diseño",
      title: "Tu tranquilidad forma parte de la conversación.",
      body: "Moderación preventiva, reportes rápidos y bloqueos permanentes entre cuentas. No grabamos tus llamadas.",
      cards: [
        ["Moderación activa", "La IA analiza señales de seguridad; solo guarda evidencia cuando existe un incidente."],
        ["Tú decides", "Finaliza, bloquea o reporta sin dar explicaciones."],
        ["Privacidad clara", "Transporte cifrado y evidencia de incidentes eliminada a los 30 días."]
      ]
    },
    auth: {
      title: "Tu próxima conversación empieza aquí",
      subtitle: "Crea una cuenta verificada para entrar a NexoCam.",
      name: "Nombre visible",
      email: "Correo electrónico",
      password: "Contraseña",
      birth: "Fecha de nacimiento",
      consent: "Confirmo que tengo 18 años o más y acepto los términos.",
      create: "Crear cuenta",
      google: "Continuar con Google",
      account: "¿Ya tienes cuenta?",
      verify: "Te enviamos un enlace. Verifica tu correo antes de comenzar.",
      signIn: "Ingresar"
    },
    chat: {
      title: "Nueva conexión",
      searching: "Buscando una persona…",
      connected: "Conectado con Sofía",
      secure: "Conexión protegida",
      next: "Siguiente",
      report: "Reportar",
      block: "Bloquear",
      placeholder: "Escribe un mensaje…",
      send: "Enviar",
      permissionTitle: "Activa cámara y micrófono",
      permissionBody: "Necesitamos acceso para que la otra persona pueda verte y escucharte.",
      allow: "Permitir acceso",
      denied: "No pudimos acceder a tu cámara. Revisa los permisos del navegador.",
      messages: ["¡Hola! ¿Cómo estás?", "Muy bien 😊 ¿Desde dónde te conectas?"],
      you: "Tú",
      peer: "Sofía · Argentina",
      reason: "¿Qué ocurrió?",
      reported: "Reporte enviado. La sesión terminó y nuestro equipo lo revisará.",
      blocked: "Usuario bloqueado. No volveremos a emparejarlos."
    },
    footer: "Conversaciones reales. Límites claros.",
    adults: "NexoCam es exclusivamente para personas mayores de 18 años."
  },
  en: {
    nav: { how: "How it works", safety: "Safety", login: "Sign in" },
    hero: {
      eyebrow: "Spontaneous conversations, with more care",
      titleA: "Meet someone",
      titleB: "outside your bubble.",
      body: "One-to-one video chat for adults. Choose your language, connect in seconds, and stay in control.",
      cta: "Start a conversation",
      note: "Adults 18+ only · Camera and microphone required",
      live: "People online now"
    },
    how: {
      eyebrow: "That simple",
      title: "A new conversation in three steps",
      steps: [
        ["Set up your camera", "Check your image and choose a language and country."],
        ["Find a connection", "We look for a compatible person who is available."],
        ["Talk with control", "Skip, block, or report at any time."]
      ]
    },
    safety: {
      eyebrow: "Safety by design",
      title: "Peace of mind belongs in every conversation.",
      body: "Preventive moderation, fast reports, and permanent account-to-account blocks. We do not record calls.",
      cards: [
        ["Active moderation", "AI reviews safety signals; evidence is stored only when an incident occurs."],
        ["You decide", "End, block, or report without having to explain."],
        ["Clear privacy", "Encrypted transport and incident evidence deleted after 30 days."]
      ]
    },
    auth: {
      title: "Your next conversation starts here",
      subtitle: "Create a verified account to enter NexoCam.",
      name: "Display name",
      email: "Email",
      password: "Password",
      birth: "Date of birth",
      consent: "I confirm I am 18 or older and accept the terms.",
      create: "Create account",
      google: "Continue with Google",
      account: "Already have an account?",
      verify: "We sent you a link. Verify your email before you start.",
      signIn: "Sign in"
    },
    chat: {
      title: "New connection",
      searching: "Looking for someone…",
      connected: "Connected with Sofia",
      secure: "Protected connection",
      next: "Next",
      report: "Report",
      block: "Block",
      placeholder: "Write a message…",
      send: "Send",
      permissionTitle: "Enable camera and microphone",
      permissionBody: "We need access so the other person can see and hear you.",
      allow: "Allow access",
      denied: "We could not access your camera. Check your browser permissions.",
      messages: ["Hi! How are you?", "Great 😊 Where are you connecting from?"],
      you: "You",
      peer: "Sofia · Argentina",
      reason: "What happened?",
      reported: "Report sent. The session ended and our team will review it.",
      blocked: "User blocked. We will not match you again."
    },
    footer: "Real conversations. Clear boundaries.",
    adults: "NexoCam is exclusively for people aged 18 and over."
  }
} as const;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (typeof copy)[Locale];
};

const I18nContext = createContext<I18nContextValue | null>(null);
const useI18n = () => useContext(I18nContext)!;

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`logo ${compact ? "logo--compact" : ""}`} aria-label="NexoCam">
      <span className="logo__mark"><VideoCamera weight="fill" /></span>
      <span>Nexo<span>Cam</span></span>
    </Link>
  );
}

function LanguageButton() {
  const { locale, setLocale } = useI18n();
  return (
    <button className="language-button" onClick={() => setLocale(locale === "es" ? "en" : "es")} aria-label="Change language">
      <GlobeHemisphereWest size={19} />
      {locale.toUpperCase()}
      <CaretDown size={13} weight="bold" />
    </button>
  );
}

function Header() {
  const { t } = useI18n();
  return (
    <header className="site-header">
      <Logo />
      <nav aria-label="Primary navigation">
        <a href="/#how">{t.nav.how}</a>
        <Link to="/safety">{t.nav.safety}</Link>
      </nav>
      <div className="header-actions">
        <LanguageButton />
        <Link className="button button--ghost" to="/auth">{t.nav.login}</Link>
      </div>
    </header>
  );
}

function Landing() {
  const { t } = useI18n();
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero__copy">
            <div className="eyebrow"><Sparkle weight="fill" /> {t.hero.eyebrow}</div>
            <h1>{t.hero.titleA}<br /><em>{t.hero.titleB}</em></h1>
            <p>{t.hero.body}</p>
            <div className="hero__actions">
              <Link className="button button--primary button--large" to="/auth">
                {t.hero.cta}<ArrowRight weight="bold" />
              </Link>
              <span><ShieldCheck weight="fill" />{t.hero.note}</span>
            </div>
          </div>
          <div className="hero__visual" aria-label="NexoCam video conversation preview">
            <div className="video-card video-card--hero">
              <img src="/assets/remote-participant.png" alt="Woman smiling during a video conversation" />
              <div className="video-card__top"><span><i /> En línea</span><button aria-label="More options">•••</button></div>
              <div className="video-card__name">Sofía <span>· Argentina</span></div>
            </div>
            <div className="hero__self">
              <img src="/assets/local-participant.png" alt="Your local camera preview" />
              <span>Tu cámara</span>
            </div>
            <div className="hero__chat">
              <ChatCircleDots weight="fill" />
              <span>¡Hola! 👋<small>Recién ahora</small></span>
            </div>
            <div className="hero__live"><i /><strong>2.348</strong><span>{t.hero.live}</span></div>
          </div>
        </section>

        <section className="how" id="how">
          <div className="section-heading">
            <span>{t.how.eyebrow}</span>
            <h2>{t.how.title}</h2>
          </div>
          <div className="steps">
            {t.how.steps.map(([title, body], index) => {
              const StepIcon = [Camera, UserPlus, Heart][index];
              return <article key={title}>
                <span className="step-number">0{index + 1}</span>
                <StepIcon size={28} weight="duotone" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>;
            })}
          </div>
        </section>

        <section className="safety-band">
          <div className="safety-band__intro">
            <span className="eyebrow eyebrow--light"><ShieldCheck weight="fill" />{t.safety.eyebrow}</span>
            <h2>{t.safety.title}</h2>
            <p>{t.safety.body}</p>
            <Link to="/safety">Conoce nuestras normas <ArrowRight /></Link>
          </div>
          <div className="safety-band__cards">
            {t.safety.cards.map(([title, body], index) => {
              const SafetyIcon = [ShieldCheck, LockKey, Flag][index];
              return <article key={title}>
                <SafetyIcon size={25} weight="duotone" />
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>;
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => setGoogleEnabled(Boolean(data.googleOAuth)))
      .catch(() => setGoogleEnabled(false));
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${mode === "signup" ? "sign-up" : "sign-in"}/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          ...(mode === "signup" ? { dateOfBirth: form.get("birth") } : {})
        })
      });
      if (response.ok) mode === "signup" ? setSubmitted(true) : navigate("/chat");
      else navigate("/chat");
    } catch {
      navigate("/chat");
    }
  };
  const googleSignIn = async () => {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: `${location.origin}/chat` })
    });
    const data = await response.json() as { url?: string };
    if (data.url) location.href = data.url;
  };
  return (
    <main className="auth-shell">
      <div className="auth-brand">
        <Logo />
        <div>
          <span className="eyebrow eyebrow--light"><Sparkle weight="fill" />18+ community</span>
          <h1>{t.auth.title}</h1>
          <p>{t.auth.subtitle}</p>
        </div>
        <blockquote>“La mejor conversación puede ser la que todavía no esperabas.”</blockquote>
      </div>
      <section className="auth-card">
        <div className="auth-card__top"><LanguageButton /><Link to="/"><X /></Link></div>
        {submitted ? (
          <div className="verification">
            <span><Check weight="bold" /></span>
            <h2>Revisa tu correo</h2>
            <p>{t.auth.verify}</p>
            <button className="button button--primary" onClick={() => navigate("/chat")}>Vista previa</button>
          </div>
        ) : (
          <>
            <h2>{mode === "signup" ? t.auth.create : t.auth.signIn}</h2>
            {googleEnabled && <button className="button button--google" type="button" onClick={googleSignIn}><strong>G</strong>{t.auth.google}</button>}
            {googleEnabled && <div className="divider"><span>o con tu correo</span></div>}
            <form onSubmit={submit}>
              {mode === "signup" && <label>{t.auth.name}<input name="name" required autoComplete="name" placeholder="Alex" /></label>}
              <label>{t.auth.email}<input name="email" required type="email" autoComplete="email" placeholder="alex@email.com" /></label>
              <label>{t.auth.password}<input name="password" required type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="8+ caracteres" /></label>
              {mode === "signup" && <label>{t.auth.birth}<input name="birth" required type="date" max="2008-07-29" /></label>}
              {mode === "signup" && <label className="checkbox"><input type="checkbox" required /><span>{t.auth.consent}</span></label>}
              <button className="button button--primary button--full">{mode === "signup" ? t.auth.create : t.auth.signIn}<ArrowRight /></button>
            </form>
            <p className="auth-switch">
              {mode === "signup" ? t.auth.account : "¿Aún no tienes cuenta?"}
              <button onClick={() => setMode((value) => value === "signup" ? "signin" : "signup")}>
                {mode === "signup" ? t.auth.signIn : t.auth.create}
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const request = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(media);
      setError(false);
    } catch {
      setError(true);
    }
  };
  useEffect(() => {
    if (enabled && stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [enabled, stream]);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  return { videoRef, stream, request, error };
}

function ChatPage() {
  const { t, locale, setLocale } = useI18n();
  const visualDemo = new URLSearchParams(location.search).get("demo") === "connected";
  const [state, setState] = useState<ChatState>(visualDemo ? "connected" : "permission");
  const [messages, setMessages] = useState<{ mine: boolean; text: string; time?: string }[]>(
    visualDemo
      ? [
          { mine: true, text: "¡Hola! ¿Cómo estás?", time: "15:42" },
          { mine: false, text: "¡Hola! Bien, gracias 😊", time: "15:43" },
          { mine: true, text: "¿De dónde eres?", time: "15:43" },
          { mine: false, text: "Soy de México, ¿y tú?", time: "15:44" },
          { mine: true, text: "De España", time: "15:44" },
          { mine: false, text: "¡Qué bien! ¿Qué tal tu día?", time: "15:45" }
        ]
      : []
  );
  const [draft, setDraft] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const camera = useCamera(state !== "permission");
  const remoteRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const roomRef = useRef<import("livekit-client").Room | null>(null);

  const sendEnvelope = (type: string, payload: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, requestId: crypto.randomUUID(), payload, version: 1 }));
    }
  };

  const connectLiveKit = async (url: string, token: string) => {
    const { Room, RoomEvent, Track } = await import("livekit-client");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && remoteRef.current) track.attach(remoteRef.current);
    });
    room.on(RoomEvent.Reconnecting, () => setState("reconnecting"));
    room.on(RoomEvent.Reconnected, () => setState("connected"));
    room.on(RoomEvent.Disconnected, () => setState("peer-left"));
    await room.connect(url, token);
  };

  const enterQueue = async () => {
    await camera.request();
    setState("searching");
    setElapsed(0);
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    try {
      const socket = new WebSocket(`${protocol}://${location.host}/ws/v1`);
      socketRef.current = socket;
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          type: "queue.join",
          requestId: crypto.randomUUID(),
          payload: { language: locale, country: "AR" },
          version: 1
        }));
        const heartbeat = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat", requestId: crypto.randomUUID(), payload: {}, version: 1 }));
          }
        }, 5_000);
        socket.addEventListener("close", () => window.clearInterval(heartbeat), { once: true });
      });
      socket.addEventListener("message", async (event) => {
        const message = JSON.parse(String(event.data));
        if (message.type === "match.found") {
          setState("connected");
          setMessages([{ mine: false, text: t.chat.messages[0] }]);
          if (message.payload.livekitUrl && message.payload.token) {
            await connectLiveKit(message.payload.livekitUrl, message.payload.token);
          }
        }
        if (message.type === "chat.message") setMessages((items) => [...items, { mine: false, text: message.payload.text }]);
        if (message.type === "session.peerLeft") setState("peer-left");
        if (message.type === "account.sanctioned") setState("suspended");
      });
      socket.addEventListener("error", () => undefined);
    } catch {
      // The local showcase continues in demo mode when the API is not running.
    }
    window.setTimeout(() => {
      setState((current) => current === "searching" ? "connected" : current);
      setMessages((items) => items.length ? items : [{ mine: false, text: t.chat.messages[0] }]);
    }, 1600);
  };

  useEffect(() => {
    if (state !== "searching") return;
    const interval = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(() => {
    camera.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
  }, [camera.stream, muted]);
  useEffect(() => {
    camera.stream?.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
  }, [camera.stream, cameraOff]);
  useEffect(() => () => {
    socketRef.current?.close();
    void roomRef.current?.disconnect();
  }, []);

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setMessages((items) => [...items, { mine: true, text: value }]);
    sendEnvelope("chat.send", { text: value });
    setDraft("");
  };

  const next = () => {
    sendEnvelope("match.next", { language: locale, country: "AR" });
    void roomRef.current?.disconnect();
    setMessages([]);
    setState("searching");
    setTimeout(() => setState("connected"), 1300);
  };

  const finishIncident = (kind: "reported" | "blocked", reason?: string) => {
    sendEnvelope(kind === "reported" ? "session.report" : "session.block", {
      sessionId: "00000000-0000-4000-8000-000000000001",
      reportedUserId: "00000000-0000-4000-8000-000000000002",
      reason
    });
    setReportOpen(false);
    setState(kind);
  };

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <Logo compact />
        <div className="chat-header__status">
          <strong><span className={`status-dot ${state === "connected" ? "status-dot--online" : ""}`} />{state === "connected" ? "En vivo" : t.chat.title}</strong>
          <small><ShieldCheck weight="duotone" />{t.chat.secure}</small>
        </div>
        <div className="chat-header__tools">
          <div className="chat-languages" aria-label="Language">
            <button className={locale === "es" ? "active" : ""} onClick={() => setLocale("es")}>ES</button>
            <button className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>EN</button>
          </div>
          <button className="avatar avatar--photo" aria-label="Account"><img src="/assets/local-participant.png" alt="" /></button>
          <CaretDown size={14} />
        </div>
      </header>

      <div className="chat-workspace">
        <section className="stage">
          <div className="remote-video">
            {state === "connected" || state === "reconnecting" ? (
              <>
                <img src="/assets/remote-participant.png" alt="" />
                <video ref={remoteRef} autoPlay playsInline />
                <div className="video-tools">
                  <button aria-label="Video effects"><MagicWand weight="duotone" /></button>
                  <button aria-label="Safety controls"><ShieldCheck weight="duotone" /></button>
                </div>
              </>
            ) : null}
            {state === "permission" && (
              <StateCard icon={<Camera />} title={t.chat.permissionTitle} body={t.chat.permissionBody}>
                <button className="button button--primary" onClick={enterQueue}>{t.chat.allow}</button>
              </StateCard>
            )}
            {camera.error && state !== "connected" && (
              <StateCard icon={<VideoCameraSlash />} title={t.chat.denied} body="">
                <button className="button button--primary" onClick={enterQueue}>{t.chat.allow}</button>
              </StateCard>
            )}
            {state === "searching" && (
              <StateCard icon={<SpinnerGap className="spin" />} title={t.chat.searching} body={`${elapsed}s · ${elapsed < 10 ? "Idioma + país" : "Mismo idioma"}`} />
            )}
            {state === "peer-left" && <StateCard icon={<SignOut />} title="La otra persona se desconectó" body="Puedes buscar una nueva conexión."><button className="button button--primary" onClick={next}>{t.chat.next}</button></StateCard>}
            {state === "reconnecting" && <StateCard icon={<SpinnerGap className="spin" />} title="Reconectando…" body="Conservamos tu lugar en la conversación." />}
            {(state === "reported" || state === "blocked") && <StateCard icon={<ShieldCheck />} title={state === "reported" ? t.chat.reported : t.chat.blocked} body=""><button className="button button--primary" onClick={next}>{t.chat.next}</button></StateCard>}
            {state === "suspended" && <StateCard icon={<Warning />} title="Cuenta suspendida" body="Revisa tu correo para conocer el motivo y cómo apelar." />}
          </div>
          <div className="self-video">
            {!cameraOff && camera.stream ? <video ref={camera.videoRef} autoPlay muted playsInline /> : <img src="/assets/local-participant.png" alt="Your camera preview" />}
            {cameraOff && <VideoCameraSlash size={28} />}
            <span>{t.chat.you}</span>
          </div>
          <div className="stage-controls">
            <button className={muted ? "is-off" : ""} onClick={() => setMuted((value) => !value)} aria-label="Toggle microphone">
              {muted ? <MicrophoneSlash weight="fill" /> : <Microphone weight="fill" />}<span>Micrófono</span><CaretDown />
            </button>
            <button className={cameraOff ? "is-off" : ""} onClick={() => setCameraOff((value) => !value)} aria-label="Toggle camera">
              {cameraOff ? <VideoCameraSlash weight="fill" /> : <VideoCamera weight="fill" />}<span>Cámara</span><CaretDown />
            </button>
            <button className="next-button" onClick={next} disabled={state === "permission"}><PaperPlaneTilt weight="duotone" />{t.chat.next}</button>
            <button onClick={() => setReportOpen(true)}><Flag weight="fill" /><span>{t.chat.report}</span></button>
            <button onClick={() => finishIncident("blocked")}><UserMinus weight="fill" /><span>{t.chat.block}</span></button>
          </div>
        </section>

        <aside className="chat-panel">
          <div className="chat-panel__head">
            <div><strong>Chat</strong><UserPlus /></div>
            <button className="chat-menu" aria-label="Chat menu" onClick={() => setChatActionsOpen((value) => !value)}>•••</button>
            {chatActionsOpen && (
              <div className="chat-actions">
                <button onClick={() => { setChatActionsOpen(false); setReportOpen(true); }}><Flag />{t.chat.report}</button>
                <button onClick={() => { setChatActionsOpen(false); finishIncident("blocked"); }}><LockKey />{t.chat.block}</button>
              </div>
            )}
          </div>
          <div className="messages" aria-live="polite">
            <div className="conversation-note">
              <ShieldCheck weight="duotone" />
              <div>
                <strong>{locale === "es" ? "Tu seguridad es nuestra prioridad." : "Your safety is our priority."}</strong>
                <span>
                  {locale === "es" ? "Por favor, sé respetuoso y sigue nuestras " : "Please be respectful and follow our "}
                  <Link to="/safety">{locale === "es" ? "pautas comunitarias." : "community guidelines."}</Link>
                </span>
              </div>
            </div>
            {messages.map((message, index) => (
              <div className={`message ${message.mine ? "message--mine" : ""}`} key={`${message.text}-${index}`}>
                <p>{message.text}<time>{message.time ?? "ahora"}{message.mine && <Check weight="bold" />}</time></p>
              </div>
            ))}
            {state === "connected" && <div className="typing"><i /><i /><i /></div>}
          </div>
          <form className="message-form" onSubmit={submitMessage}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.chat.placeholder} maxLength={500} disabled={state !== "connected"} />
            <button aria-label={t.chat.send} disabled={state !== "connected"}><PaperPlaneTilt weight="duotone" /></button>
          </form>
          <div className="connection-footer"><ShieldCheck weight="duotone" />Conexión estable</div>
        </aside>
      </div>

      {reportOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReportOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal__close" onClick={() => setReportOpen(false)}><X /></button>
            <span className="modal__icon"><Flag weight="fill" /></span>
            <h2 id="report-title">{t.chat.reason}</h2>
            <p>El reporte finaliza esta conversación y puede conservar evidencia del incidente por 30 días.</p>
            <div className="reason-list">
              {[
                ["nudity", "Desnudez o contenido sexual"],
                ["harassment", "Acoso o amenazas"],
                ["violence", "Violencia"],
                ["spam", "Spam o estafa"],
                ["possible_minor", "Posible menor de edad"]
              ].map(([value, label]) => <button key={value} onClick={() => finishIncident("reported", value)}>{label}<ArrowRight /></button>)}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function StateCard({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return <div className="state-card"><span>{icon}</span><h2>{title}</h2>{body && <p>{body}</p>}{children}</div>;
}

const legalContent = {
  safety: {
    es: ["Centro de seguridad", "NexoCam es para adultos. No permitimos desnudez, acoso, violencia, spam ni participación de menores. Puedes finalizar, reportar y bloquear desde cada conversación."],
    en: ["Safety center", "NexoCam is for adults. We do not allow nudity, harassment, violence, spam, or minors. You can end, report, and block from every conversation."]
  },
  terms: {
    es: ["Términos de uso", "Debes tener 18 años o más, usar una cuenta propia y respetar a otras personas. Las infracciones pueden generar retenciones temporales o sanciones revisadas por moderadores."],
    en: ["Terms of use", "You must be 18 or older, use your own account, and respect others. Violations can lead to temporary holds or sanctions reviewed by moderators."]
  },
  privacy: {
    es: ["Privacidad", "No grabamos llamadas. El transporte usa WebRTC/TLS, pero la moderación preventiva requiere acceso al contenido y por eso no ofrecemos cifrado de extremo a extremo. Solo ante una detección o reporte se conservan hasta tres capturas y veinte mensajes, cifrados y eliminados a los 30 días."],
    en: ["Privacy", "We do not record calls. Transport uses WebRTC/TLS, but preventive moderation requires content access, so end-to-end encryption is not available. Only after a detection or report may up to three screenshots and twenty messages be encrypted and retained for 30 days."]
  }
} as const;

function LegalPage({ type }: { type: keyof typeof legalContent }) {
  const { locale } = useI18n();
  const [title, intro] = legalContent[type][locale];
  return (
    <>
      <Header />
      <main className="legal-page">
        <span className="eyebrow"><ShieldCheck weight="fill" />NexoCam</span>
        <h1>{title}</h1>
        <p className="legal-page__lead">{intro}</p>
        <div className="legal-grid">
          {[
            ["01", locale === "es" ? "Principios" : "Principles", locale === "es" ? "Respeto, consentimiento, control y transparencia." : "Respect, consent, control, and transparency."],
            ["02", locale === "es" ? "Respuesta" : "Response", locale === "es" ? "Los reportes urgentes terminan la sesión. Ninguna suspensión permanente es automática." : "Urgent reports end the session. Permanent suspensions are never automatic."],
            ["03", locale === "es" ? "Ayuda" : "Help", "safety@nexocam.example"]
          ].map(([n, heading, body]) => <article key={n}><span>{n}</span><h2>{heading}</h2><p>{body}</p></article>)}
        </div>
      </main>
      <Footer />
    </>
  );
}

function AdminReports() {
  const [selected, setSelected] = useState(0);
  const reports = [
    { id: "NC-0421", reason: "Posible menor", risk: "Urgente", time: "Hace 3 min", evidence: 3 },
    { id: "NC-0420", reason: "Acoso", risk: "Alto", time: "Hace 12 min", evidence: 2 },
    { id: "NC-0419", reason: "Spam", risk: "Medio", time: "Hace 28 min", evidence: 0 }
  ];
  const report = reports[selected];
  return (
    <main className="admin-shell">
      <aside className="admin-nav"><Logo compact /><nav><a className="active"><Flag />Reportes</a><a><UserCircle />Usuarios</a><a><ShieldCheck />Sanciones</a></nav><small>Moderador · turno activo</small></aside>
      <section className="admin-main">
        <header><div><span>Moderación</span><h1>Incidentes recientes</h1></div><button className="avatar"><UserCircle weight="fill" /></button></header>
        <div className="admin-grid">
          <div className="report-list">
            <div className="report-filters"><button className="active">Pendientes 3</button><button>Revisados</button></div>
            {reports.map((item, index) => (
              <button className={selected === index ? "selected" : ""} onClick={() => setSelected(index)} key={item.id}>
                <span className={`risk risk--${item.risk.toLowerCase()}`}>{item.risk}</span>
                <strong>{item.reason}</strong><small>{item.id} · {item.time}</small>
                <em>{item.evidence} evidencias</em>
              </button>
            ))}
          </div>
          <article className="report-detail">
            <header><div><span>{report.id}</span><h2>{report.reason}</h2></div><span className="risk">{report.risk}</span></header>
            <div className="evidence-grid">
              {[0, 1, 2].map((item) => <div key={item}>{item < report.evidence ? <img src="/assets/remote-participant.png" alt={`Evidence ${item + 1}`} /> : <span>Sin captura</span>}</div>)}
            </div>
            <div className="audit-note"><LockKey weight="fill" /><p><strong>Acceso registrado</strong>Las evidencias están cifradas y se eliminarán automáticamente a los 30 días.</p></div>
            <h3>Últimos mensajes</h3>
            <div className="message-log"><p><b>Reportado</b> Hola, ¿cuántos años tienes?</p><p><b>Reportante</b> Prefiero terminar la conversación.</p></div>
            <div className="moderation-actions"><button>Descartar</button><button>Retención 24 h</button><button className="danger">Suspender cuenta</button></div>
          </article>
        </div>
      </section>
    </main>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div><Logo compact /><p>{t.footer}</p></div>
      <nav><Link to="/safety">Seguridad</Link><Link to="/terms">Términos</Link><Link to="/privacy">Privacidad</Link></nav>
      <small>© 2026 NexoCam · {t.adults}</small>
    </footer>
  );
}

export default function App() {
  const detected = navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
  const [locale, setLocaleState] = useState<Locale>(() => (localStorage.getItem("nexocam.locale") as Locale) || detected);
  const context = useMemo(() => ({
    locale,
    setLocale: (next: Locale) => {
      localStorage.setItem("nexocam.locale", next);
      setLocaleState(next);
    },
    t: copy[locale]
  }), [locale]);
  return (
    <I18nContext.Provider value={context}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/safety" element={<LegalPage type="safety" />} />
        <Route path="/terms" element={<LegalPage type="terms" />} />
        <Route path="/privacy" element={<LegalPage type="privacy" />} />
        <Route path="/admin/reports" element={<AdminReports />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </I18nContext.Provider>
  );
}
