import {
  ArrowClockwise,
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  Check,
  CheckCircle,
  ClipboardText,
  Eye,
  Flag,
  Gauge,
  House,
  List,
  LockKey,
  MagnifyingGlass,
  Pulse,
  ShieldCheck,
  ShieldWarning,
  SignOut,
  SlidersHorizontal,
  UserCircle,
  UsersThree,
  VideoCamera,
  Warning,
  X
} from "@phosphor-icons/react";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate
} from "react-router-dom";

export type AdminLocale = "es" | "en";
type Role = "user" | "moderator" | "admin" | "superuser";
type FeatureKey =
  | "registration"
  | "guest_access"
  | "email_verification"
  | "reporting"
  | "moderation"
  | "monitoring";
type Features = Record<FeatureKey, boolean>;

type AdminIdentity = {
  user: { id: string; email: string; role: Role; isGuest: boolean };
  permissions: string[];
};

type Overview = {
  generatedAt: string;
  capacity: number;
  connectedUsers: number;
  queuedUsers: number;
  activeSessions: number;
  counts: {
    openReports: number;
    urgentReports: number;
    activeSanctions: number;
    registeredUsers: number;
  };
  features: Features;
  recentAudit: AuditEntry[];
};

type Monitoring = {
  generatedAt: string;
  current: {
    connectedUsers: number;
    queuedUsers: number;
    activeSessions: number;
    capacity: number;
  };
  services: Record<string, {
    healthy?: boolean;
    configured?: boolean;
    status?: string;
    latencyMs?: number | null;
    updated_at?: string | null;
    details?: Record<string, unknown>;
  }>;
  history: Array<{
    id: number;
    connected_users: number;
    queued_users: number;
    active_sessions: number;
    open_reports: number;
    moderation_lag_seconds: number | null;
    recorded_at: string;
  }>;
};

type AuditEntry = {
  id: number;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  role: Role;
  is_guest: boolean;
  created_at: string;
  sanctioned?: boolean;
  report_count?: number;
  session_count?: number;
  sanctions?: Sanction[];
};

type ReportItem = {
  id: string;
  reason: string;
  details?: string | null;
  priority: "normal" | "high" | "urgent";
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  reporter_id: string;
  reported_id: string;
  session_id: string;
  reporter_email?: string | null;
  reported_email?: string | null;
  evidence_count?: number;
  evidence?: Array<{
    id: string;
    mediaType: "image" | "chat";
    createdAt: string;
    expiresAt: string;
  }>;
  sanctions?: Sanction[];
};

type Sanction = {
  id: string;
  user_id: string;
  user_email?: string | null;
  user_role?: Role;
  type: "temporary_hold" | "suspension";
  status: "active" | "expired" | "revoked";
  reason: string;
  automatic: boolean;
  created_at: string;
  expires_at?: string | null;
};

class AdminApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function adminRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    },
    ...init
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "request_failed" })) as { error?: string };
    throw new AdminApiError(response.status, data.error ?? "request_failed");
  }
  return response.json() as Promise<T>;
}

const adminCopy = {
  es: {
    nav: {
      overview: "Resumen",
      features: "Funciones",
      users: "Usuarios",
      reports: "Reportes",
      sanctions: "Sanciones",
      monitoring: "Monitoreo",
      audit: "Auditoría"
    },
    header: {
      overview: "Gobernanza de la plataforma",
      features: "Funciones de la plataforma",
      users: "Usuarios y permisos",
      reports: "Reportes e incidentes",
      sanctions: "Sanciones",
      monitoring: "Monitoreo operativo",
      audit: "Auditoría",
      subtitle: "Controla NexoCam de forma segura y con trazabilidad total.",
      live: "En vivo",
      secure: "Conexión segura",
      superadmin: "Super admin"
    },
    common: {
      loading: "Cargando información…",
      retry: "Reintentar",
      save: "Guardar",
      cancel: "Cancelar",
      empty: "No hay información para mostrar.",
      reason: "Motivo obligatorio",
      search: "Buscar",
      all: "Todos",
      active: "Activo",
      apply: "Aplicar cambios",
      discard: "Descartar cambios",
      pending: "cambios pendientes",
      updated: "Actualizado",
      success: "Cambios guardados correctamente.",
      error: "No pudimos completar la operación.",
      accessDenied: "No tienes permisos para acceder a esta sección.",
      backToChat: "Volver al chat",
      logout: "Cerrar sesión",
      previous: "Anterior",
      next: "Siguiente",
      details: "Ver detalle"
    },
    overview: {
      degraded: "Servicio degradado: moderación automática",
      degradedBody: "El worker de moderación no informó actividad recientemente. Revisa Monitoreo antes de cambiar las políticas.",
      goMonitoring: "Ir a Monitoreo",
      realtime: "Resumen en tiempo real",
      connected: "Usuarios conectados",
      rooms: "Salas activas",
      reports: "Reportes abiertos",
      lag: "Rezago de moderación",
      featureControl: "Control de funciones de la plataforma",
      impact: "Los cambios afectan a todos los usuarios.",
      usage: "Uso / Salud actual",
      lastChange: "Estado operativo",
      audit: "Bitácora de cambios recientes",
      fullAudit: "Ver auditoría completa"
    },
    featureNames: {
      registration: "Registro",
      guest_access: "Acceso invitado",
      email_verification: "Verificación por email",
      reporting: "Reportes",
      moderation: "Moderación automática",
      monitoring: "Monitoreo"
    },
    featureDescriptions: {
      registration: "Permite crear nuevas cuentas registradas.",
      guest_access: "Permite ingresar como adulto sin crear una cuenta.",
      email_verification: "Exige confirmar el correo para usar funciones completas.",
      reporting: "Permite reportar una conversación activa.",
      moderation: "Procesa cuadros y eventos para detectar incidentes.",
      monitoring: "Conserva métricas operativas durante siete días."
    },
    users: {
      title: "Cuentas registradas e invitadas",
      placeholder: "Buscar por nombre o email",
      role: "Rol",
      status: "Estado",
      reports: "Reportes",
      joined: "Alta",
      sanctioned: "Sancionado",
      select: "Selecciona una cuenta para ver su historial.",
      changeRole: "Cambiar rol",
      confirmEmail: "Confirma escribiendo el email del superusuario",
      sessions: "Sesiones",
      verified: "Email verificado",
      guest: "Invitado"
    },
    reports: {
      queue: "Cola de revisión",
      reporter: "Reportante",
      reported: "Cuenta reportada",
      evidence: "Evidencia cifrada",
      noEvidence: "Este reporte no contiene evidencia conservada.",
      messages: "Mensajes conservados",
      start: "Tomar revisión",
      resolve: "Resolver",
      dismiss: "Descartar",
      hold: "Retención 24 h",
      select: "Selecciona un reporte para revisar el incidente.",
      evidenceNotice: "Cada acceso queda registrado y la evidencia vence a los 30 días."
    },
    sanctions: {
      title: "Historial de sanciones",
      create: "Crear sanción",
      userId: "ID de usuario",
      type: "Tipo",
      temporary: "Retención temporal",
      suspension: "Suspensión",
      expires: "Vencimiento opcional",
      revoke: "Revocar",
      automatic: "Automática",
      manual: "Manual"
    },
    monitoring: {
      services: "Salud de servicios",
      database: "PostgreSQL",
      redis: "Redis",
      livekit: "LiveKit",
      storage: "MinIO",
      moderation: "Moderación",
      healthy: "Operativo",
      degraded: "Degradado",
      offline: "Sin señal",
      history: "Actividad de las últimas 24 horas",
      noHistory: "Las métricas aparecerán después del primer intervalo de 30 segundos.",
      capacity: "Capacidad",
      queue: "En espera"
    },
    audit: {
      action: "Acción",
      actor: "Actor",
      target: "Objetivo",
      when: "Fecha y hora",
      reason: "Motivo"
    }
  },
  en: {
    nav: {
      overview: "Overview",
      features: "Features",
      users: "Users",
      reports: "Reports",
      sanctions: "Sanctions",
      monitoring: "Monitoring",
      audit: "Audit"
    },
    header: {
      overview: "Platform governance",
      features: "Platform features",
      users: "Users and permissions",
      reports: "Reports and incidents",
      sanctions: "Sanctions",
      monitoring: "Operational monitoring",
      audit: "Audit",
      subtitle: "Control NexoCam safely with complete traceability.",
      live: "Live",
      secure: "Secure connection",
      superadmin: "Super admin"
    },
    common: {
      loading: "Loading information…",
      retry: "Retry",
      save: "Save",
      cancel: "Cancel",
      empty: "There is no information to display.",
      reason: "Required reason",
      search: "Search",
      all: "All",
      active: "Active",
      apply: "Apply changes",
      discard: "Discard changes",
      pending: "pending changes",
      updated: "Updated",
      success: "Changes saved successfully.",
      error: "We couldn't complete the operation.",
      accessDenied: "You do not have permission to access this section.",
      backToChat: "Back to chat",
      logout: "Sign out",
      previous: "Previous",
      next: "Next",
      details: "View details"
    },
    overview: {
      degraded: "Degraded service: automated moderation",
      degradedBody: "The moderation worker has not reported activity recently. Check Monitoring before changing policies.",
      goMonitoring: "Go to Monitoring",
      realtime: "Real-time overview",
      connected: "Connected users",
      rooms: "Active rooms",
      reports: "Open reports",
      lag: "Moderation lag",
      featureControl: "Platform feature controls",
      impact: "Changes affect every user.",
      usage: "Usage / Current health",
      lastChange: "Operational state",
      audit: "Recent change log",
      fullAudit: "View full audit"
    },
    featureNames: {
      registration: "Registration",
      guest_access: "Guest access",
      email_verification: "Email verification",
      reporting: "Reporting",
      moderation: "Automated moderation",
      monitoring: "Monitoring"
    },
    featureDescriptions: {
      registration: "Allows new registered accounts.",
      guest_access: "Allows adults to enter without creating an account.",
      email_verification: "Requires email confirmation for complete access.",
      reporting: "Allows reporting an active conversation.",
      moderation: "Processes frames and events to detect incidents.",
      monitoring: "Stores operational metrics for seven days."
    },
    users: {
      title: "Registered and guest accounts",
      placeholder: "Search by name or email",
      role: "Role",
      status: "Status",
      reports: "Reports",
      joined: "Joined",
      sanctioned: "Sanctioned",
      select: "Select an account to view its history.",
      changeRole: "Change role",
      confirmEmail: "Confirm by entering the superuser email",
      sessions: "Sessions",
      verified: "Email verified",
      guest: "Guest"
    },
    reports: {
      queue: "Review queue",
      reporter: "Reporter",
      reported: "Reported account",
      evidence: "Encrypted evidence",
      noEvidence: "This report has no retained evidence.",
      messages: "Retained messages",
      start: "Start review",
      resolve: "Resolve",
      dismiss: "Dismiss",
      hold: "24 h hold",
      select: "Select a report to review the incident.",
      evidenceNotice: "Every access is audited and evidence expires after 30 days."
    },
    sanctions: {
      title: "Sanction history",
      create: "Create sanction",
      userId: "User ID",
      type: "Type",
      temporary: "Temporary hold",
      suspension: "Suspension",
      expires: "Optional expiry",
      revoke: "Revoke",
      automatic: "Automatic",
      manual: "Manual"
    },
    monitoring: {
      services: "Service health",
      database: "PostgreSQL",
      redis: "Redis",
      livekit: "LiveKit",
      storage: "MinIO",
      moderation: "Moderation",
      healthy: "Operational",
      degraded: "Degraded",
      offline: "No signal",
      history: "Activity over the last 24 hours",
      noHistory: "Metrics will appear after the first 30-second interval.",
      capacity: "Capacity",
      queue: "Waiting"
    },
    audit: {
      action: "Action",
      actor: "Actor",
      target: "Target",
      when: "Date and time",
      reason: "Reason"
    }
  }
} as const;

const featureKeys: FeatureKey[] = [
  "registration",
  "guest_access",
  "email_verification",
  "reporting",
  "moderation",
  "monitoring"
];

const featureIcons = {
  registration: UserCircle,
  guest_access: UsersThree,
  email_verification: LockKey,
  reporting: Flag,
  moderation: ShieldCheck,
  monitoring: Pulse
};

function formatDate(value: string | null | undefined, locale: AdminLocale, withTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {})
  }).format(new Date(value));
}

function relativeTime(value: string, locale: AdminLocale) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function PageState(props: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-page-state">
      <span>{props.icon ?? <Pulse />}</span>
      <strong>{props.title}</strong>
      {props.body ? <p>{props.body}</p> : null}
      {props.action}
    </div>
  );
}

function StatusMessage({ kind, children }: { kind: "success" | "error"; children: ReactNode }) {
  return (
    <div className={`admin-status admin-status--${kind}`} role="status">
      {kind === "success" ? <CheckCircle /> : <Warning />}
      <span>{children}</span>
    </div>
  );
}

function Toggle(props: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`admin-toggle${props.checked ? " is-on" : ""}`}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onChange}
    >
      <span />
    </button>
  );
}

function Sparkline({ values, tone = "teal" }: { values: number[]; tone?: "teal" | "coral" | "amber" }) {
  if (values.length < 2) return <div className="admin-sparkline-empty" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const spread = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((value - min) / spread) * 24;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg className={`admin-sparkline admin-sparkline--${tone}`} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function FeatureLedger(props: {
  locale: AdminLocale;
  features: Features;
  overview?: Overview;
  onSaved?: (features: Features) => void;
}) {
  const t = adminCopy[props.locale];
  const [saved, setSaved] = useState(props.features);
  const [draft, setDraft] = useState(props.features);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setSaved(props.features);
    setDraft(props.features);
  }, [props.features]);

  const dirtyKeys = featureKeys.filter((key) => draft[key] !== saved[key]);
  const save = async () => {
    if (reason.trim().length < 3 || dirtyKeys.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const changes = Object.fromEntries(dirtyKeys.map((key) => [key, draft[key]])) as Partial<Features>;
      const response = await adminRequest<{ features: Features }>("/api/admin/features", {
        method: "PATCH",
        body: JSON.stringify({ features: changes, reason: reason.trim() })
      });
      setSaved(response.features);
      setDraft(response.features);
      setReason("");
      setMessage({ kind: "success", text: t.common.success });
      props.onSaved?.(response.features);
    } catch {
      setMessage({ kind: "error", text: t.common.error });
    } finally {
      setSaving(false);
    }
  };

  const usageFor = (key: FeatureKey) => {
    if (!props.overview) return draft[key] ? t.common.active : "—";
    const values: Record<FeatureKey, string> = {
      registration: `${props.overview.counts.registeredUsers} ${t.nav.users.toLowerCase()}`,
      guest_access: `${props.overview.connectedUsers}/${props.overview.capacity} ${t.overview.connected.toLowerCase()}`,
      email_verification: draft.email_verification ? t.common.active : "Opcional",
      reporting: `${props.overview.counts.openReports} ${t.overview.reports.toLowerCase()}`,
      moderation: `${props.overview.counts.urgentReports} urgentes`,
      monitoring: relativeTime(props.overview.generatedAt, props.locale)
    };
    return values[key];
  };

  return (
    <section className="feature-ledger">
      <header className="feature-ledger__header">
        <div>
          <h2>{t.overview.featureControl}</h2>
          <p>{t.overview.impact}</p>
        </div>
        <div className="feature-ledger__commands">
          {dirtyKeys.length > 0 ? <span>{dirtyKeys.length} {t.common.pending}</span> : null}
          <button type="button" className="admin-button admin-button--ghost" disabled={dirtyKeys.length === 0 || saving} onClick={() => {
            setDraft(saved);
            setReason("");
            setMessage(null);
          }}>{t.common.discard}</button>
          <button type="button" className="admin-button admin-button--primary" disabled={dirtyKeys.length === 0 || reason.trim().length < 3 || saving} onClick={save}>
            {saving ? <ArrowClockwise className="spin" /> : <Check />}
            {t.common.apply}{dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ""}
          </button>
        </div>
      </header>
      {dirtyKeys.length > 0 ? (
        <div className="feature-ledger__reason">
          <Warning />
          <label>
            <span>{t.common.reason}</span>
            <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={props.locale === "es" ? "Describe por qué se aplican estos cambios" : "Explain why these changes are being applied"} />
          </label>
        </div>
      ) : null}
      {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
      <div className="feature-ledger__columns" aria-hidden="true">
        <span>{props.locale === "es" ? "Función" : "Feature"}</span>
        <span>{props.locale === "es" ? "Consecuencia principal" : "Primary impact"}</span>
        <span>{t.overview.usage}</span>
        <span>{props.locale === "es" ? "Control" : "Control"}</span>
      </div>
      <div className="feature-ledger__rows">
        {featureKeys.map((key) => {
          const Icon = featureIcons[key];
          const pending = draft[key] !== saved[key];
          return (
            <div className={`feature-row${pending ? " is-pending" : ""}`} key={key}>
              <div className="feature-row__name">
                <Icon />
                <div>
                  <strong>{t.featureNames[key]}</strong>
                  <span className={draft[key] ? "status-enabled" : "status-disabled"}>
                    {draft[key] ? (props.locale === "es" ? "Habilitado" : "Enabled") : (props.locale === "es" ? "Deshabilitado" : "Disabled")}
                    {pending ? ` · ${props.locale === "es" ? "Pendiente" : "Pending"}` : ""}
                  </span>
                </div>
              </div>
              <p>{t.featureDescriptions[key]}</p>
              <div className="feature-row__usage">
                <i className={draft[key] ? "is-healthy" : "is-off"} />
                <span>{usageFor(key)}</span>
              </div>
              <Toggle
                checked={draft[key]}
                label={t.featureNames[key]}
                onChange={() => {
                  setDraft((current) => ({ ...current, [key]: !current[key] }));
                  setMessage(null);
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OverviewPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const [overview, setOverview] = useState<Overview | null>(null);
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextOverview, nextMonitoring] = await Promise.all([
        adminRequest<Overview>("/api/admin/overview"),
        adminRequest<Monitoring>("/api/admin/monitoring?hours=24")
      ]);
      setOverview(nextOverview);
      setMonitoring(nextMonitoring);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!overview && !error) return <PageState title={t.common.loading} icon={<ArrowClockwise className="spin" />} />;
  if (!overview) return <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={() => void load()}>{t.common.retry}</button>} />;

  const moderation = monitoring?.services.moderation;
  const moderationOffline = moderation?.status === "offline";
  const history = monitoring?.history ?? [];
  const metricCards = [
    {
      label: t.overview.connected,
      value: overview.connectedUsers,
      suffix: `/ ${overview.capacity}`,
      icon: UsersThree,
      values: history.map((item) => item.connected_users),
      tone: "teal" as const
    },
    {
      label: t.overview.rooms,
      value: overview.activeSessions,
      suffix: locale === "es" ? "ahora" : "now",
      icon: VideoCamera,
      values: history.map((item) => item.active_sessions),
      tone: "teal" as const
    },
    {
      label: t.overview.reports,
      value: overview.counts.openReports,
      suffix: `${overview.counts.urgentReports} ${locale === "es" ? "urgentes" : "urgent"}`,
      icon: Flag,
      values: history.map((item) => item.open_reports),
      tone: "coral" as const
    },
    {
      label: t.overview.lag,
      value: Math.round(Number(moderation?.details?.lagSeconds ?? 0)),
      suffix: "s",
      icon: ShieldCheck,
      values: history.map((item) => Number(item.moderation_lag_seconds ?? 0)),
      tone: "amber" as const
    }
  ];

  return (
    <>
      {moderationOffline ? (
        <div className="admin-alert">
          <Warning />
          <div><strong>{t.overview.degraded}</strong><p>{t.overview.degradedBody}</p></div>
          <Link to="/admin/monitoring">{t.overview.goMonitoring}</Link>
        </div>
      ) : null}
      <div className="overview-layout">
        <aside className="overview-metrics">
          <header><h2>{t.overview.realtime}</h2><span>{relativeTime(overview.generatedAt, locale)} <i /></span></header>
          {metricCards.map(({ label, value, suffix, icon: Icon, values, tone }) => (
            <article key={label}>
              <div className="overview-metric__head"><Icon /><span>{label}</span></div>
              <strong>{value}<small>{suffix.startsWith("/") ? ` ${suffix}` : ""}</small></strong>
              {!suffix.startsWith("/") ? <p>{suffix}</p> : null}
              <Sparkline values={values.length > 1 ? values : [0, Number(value)]} tone={tone} />
            </article>
          ))}
          <Link to="/admin/monitoring">{t.overview.goMonitoring} <ChartLineUp /></Link>
        </aside>
        <div className="overview-primary">
          <FeatureLedger locale={locale} features={overview.features} overview={overview} onSaved={(features) => setOverview((current) => current ? { ...current, features } : current)} />
          <section className="audit-preview">
            <header><h2>{t.overview.audit}</h2><Link to="/admin/audit">{t.overview.fullAudit}</Link></header>
            <AuditTable entries={overview.recentAudit} locale={locale} compact />
          </section>
        </div>
      </div>
    </>
  );
}

function FeaturesPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const [features, setFeatures] = useState<Features | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    setError(false);
    void adminRequest<{ features: Features }>("/api/admin/features")
      .then((data) => setFeatures(data.features))
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);
  if (!features && !error) return <PageState title={t.common.loading} icon={<ArrowClockwise className="spin" />} />;
  if (!features) return <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={load}>{t.common.retry}</button>} />;
  return <FeatureLedger locale={locale} features={features} onSaved={setFeatures} />;
}

function Pagination(props: {
  locale: AdminLocale;
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  const t = adminCopy[props.locale];
  return (
    <div className="admin-pagination">
      <span>{Math.min(props.offset + 1, props.total)}–{Math.min(props.offset + props.limit, props.total)} / {props.total}</span>
      <button disabled={props.offset === 0} onClick={() => props.onChange(Math.max(0, props.offset - props.limit))}>{t.common.previous}</button>
      <button disabled={props.offset + props.limit >= props.total} onClick={() => props.onChange(props.offset + props.limit)}>{t.common.next}</button>
    </div>
  );
}

function UsersPage({ locale, identity }: { locale: AdminLocale; identity: AdminIdentity }) {
  const t = adminCopy[locale];
  const limit = 25;
  const [query, setQuery] = useState("");
  const deferredQuery = query.trim();
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: AdminUser[]; total: number } | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (deferredQuery) params.set("query", deferredQuery);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    try {
      setData(await adminRequest(`/api/admin/users?${params}`));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [deferredQuery, offset, role, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectUser = async (user: AdminUser) => {
    setSelected(user);
    try {
      setSelected(await adminRequest<AdminUser>(`/api/admin/users/${encodeURIComponent(user.id)}`));
    } catch {
      // Keep the row summary visible if the detail request fails.
    }
  };

  return (
    <div className="admin-split">
      <section className="admin-panel admin-panel--table">
        <header className="admin-panel__toolbar">
          <div><h2>{t.users.title}</h2><p>{data?.total ?? 0} {t.nav.users.toLowerCase()}</p></div>
          <div className="admin-filters">
            <label className="admin-search"><MagnifyingGlass /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder={t.users.placeholder} /></label>
            <select value={role} onChange={(event) => { setRole(event.target.value); setOffset(0); }} aria-label={t.users.role}>
              <option value="">{t.common.all}</option>
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
              <option value="superuser">Super admin</option>
            </select>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} aria-label={t.users.status}>
              <option value="">{t.common.all}</option>
              <option value="active">{t.common.active}</option>
              <option value="sanctioned">{t.users.sanctioned}</option>
            </select>
          </div>
        </header>
        {error ? <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={() => void load()}>{t.common.retry}</button>} /> : (
          <>
            <div className={`admin-table-wrap${loading ? " is-loading" : ""}`}>
              <table className="admin-table">
                <thead><tr><th>{t.nav.users}</th><th>{t.users.role}</th><th>{t.users.status}</th><th>{t.users.reports}</th><th>{t.users.joined}</th></tr></thead>
                <tbody>
                  {(data?.items ?? []).map((user) => (
                    <tr key={user.id} className={selected?.id === user.id ? "is-selected" : ""} onClick={() => void selectUser(user)}>
                      <td data-label={t.nav.users}><strong>{user.name || user.email}</strong><small>{user.email}</small></td>
                      <td data-label={t.users.role}><span className={`role-badge role-badge--${user.role}`}>{user.role}</span></td>
                      <td data-label={t.users.status}>{user.sanctioned ? <span className="risk-badge">{t.users.sanctioned}</span> : <span className="healthy-badge">{t.common.active}</span>}</td>
                      <td data-label={t.users.reports}>{user.report_count ?? 0}</td>
                      <td data-label={t.users.joined}>{formatDate(user.created_at, locale, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && data?.items.length === 0 ? <PageState title={t.common.empty} /> : null}
            </div>
            <Pagination locale={locale} offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset} />
          </>
        )}
      </section>
      <UserDetail locale={locale} identity={identity} user={selected} onUpdated={() => {
        void load();
        if (selected) void selectUser(selected);
      }} />
    </div>
  );
}

function UserDetail(props: {
  locale: AdminLocale;
  identity: AdminIdentity;
  user: AdminUser | null;
  onUpdated: () => void;
}) {
  const t = adminCopy[props.locale];
  const [role, setRole] = useState<Role>("user");
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canEdit = props.identity.permissions.includes("users:roles");

  useEffect(() => {
    setRole(props.user?.role ?? "user");
    setReason("");
    setConfirmEmail("");
    setMessage(null);
  }, [props.user]);

  if (!props.user) return <aside className="admin-panel admin-detail"><PageState title={t.users.select} icon={<UserCircle />} /></aside>;
  const requiresConfirmation = props.user.role === "superuser" && role !== "superuser";
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await adminRequest(`/api/admin/users/${encodeURIComponent(props.user!.id)}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role, reason, confirmEmail: confirmEmail || undefined })
      });
      setMessage({ kind: "success", text: t.common.success });
      props.onUpdated();
    } catch (error) {
      const code = error instanceof AdminApiError ? error.code : "";
      setMessage({
        kind: "error",
        text: code === "last_superuser"
          ? (props.locale === "es" ? "Debe permanecer al menos un superusuario." : "At least one superuser must remain.")
          : t.common.error
      });
    }
  };

  return (
    <aside className="admin-panel admin-detail">
      <header><div className="admin-user-avatar"><UserCircle weight="fill" /></div><div><h2>{props.user.name || props.user.email}</h2><p>{props.user.email}</p></div></header>
      <dl className="admin-detail-list">
        <div><dt>ID</dt><dd>{props.user.id}</dd></div>
        <div><dt>{t.users.role}</dt><dd><span className={`role-badge role-badge--${props.user.role}`}>{props.user.role}</span></dd></div>
        <div><dt>{t.users.sessions}</dt><dd>{props.user.session_count ?? "—"}</dd></div>
        <div><dt>{t.users.reports}</dt><dd>{props.user.report_count ?? "—"}</dd></div>
        <div><dt>{t.users.verified}</dt><dd>{props.user.email_verified ? <CheckCircle className="text-success" /> : <X className="text-danger" />}</dd></div>
      </dl>
      {props.user.sanctions && props.user.sanctions.length > 0 ? (
        <div className="admin-detail-history"><h3>{t.sanctions.title}</h3>{props.user.sanctions.slice(0, 4).map((sanction) => <div key={sanction.id}><strong>{sanction.type}</strong><span>{sanction.reason}</span><small>{formatDate(sanction.created_at, props.locale)}</small></div>)}</div>
      ) : null}
      {canEdit ? (
        <form className="admin-action-form" onSubmit={save}>
          <h3>{t.users.changeRole}</h3>
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="user">User</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="superuser">Super admin</option>
          </select>
          <textarea value={reason} minLength={3} maxLength={500} required onChange={(event) => setReason(event.target.value)} placeholder={t.common.reason} />
          {requiresConfirmation ? <input type="email" required value={confirmEmail} onChange={(event) => setConfirmEmail(event.target.value)} placeholder={t.users.confirmEmail} /> : null}
          {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
          <button className="admin-button admin-button--primary" disabled={role === props.user.role || reason.trim().length < 3}>{t.common.save}</button>
        </form>
      ) : null}
    </aside>
  );
}

function ReportsPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState<{ items: ReportItem[]; total: number } | null>(null);
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [error, setError] = useState(false);
  const selectedId = selected?.id;
  const load = useCallback(async () => {
    try {
      const result = await adminRequest<{ items: ReportItem[]; total: number }>(`/api/admin/reports?limit=100&status=${status}`);
      setData(result);
      setError(false);
      if (selectedId) {
        const refreshed = result.items.find((item) => item.id === selectedId);
        if (!refreshed) setSelected(null);
      }
    } catch {
      setError(true);
    }
  }, [selectedId, status]);

  useEffect(() => { void load(); }, [load]);

  const select = async (item: ReportItem) => {
    setSelected(item);
    try {
      setSelected(await adminRequest<ReportItem>(`/api/admin/reports/${item.id}`));
    } catch {
      // Preserve list data.
    }
  };

  return (
    <div className="reports-layout">
      <section className="admin-panel report-queue">
        <header>
          <div><h2>{t.reports.queue}</h2><p>{data?.total ?? 0}</p></div>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setSelected(null); }}>
            <option value="pending">{locale === "es" ? "Pendientes" : "Pending"}</option>
            <option value="reviewing">{locale === "es" ? "En revisión" : "Reviewing"}</option>
            <option value="resolved">{locale === "es" ? "Resueltos" : "Resolved"}</option>
            <option value="dismissed">{locale === "es" ? "Descartados" : "Dismissed"}</option>
          </select>
        </header>
        {error ? <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={() => void load()}>{t.common.retry}</button>} /> : (
          <div className="report-queue__rows">
            {(data?.items ?? []).map((item) => (
              <button key={item.id} className={selected?.id === item.id ? "is-selected" : ""} onClick={() => void select(item)}>
                <span className={`priority priority--${item.priority}`}>{item.priority}</span>
                <strong>{item.reason.replaceAll("_", " ")}</strong>
                <small>{item.reported_email ?? item.reported_id}</small>
                <time>{relativeTime(item.created_at, locale)}</time>
                <em>{item.evidence_count ?? 0} {t.reports.evidence.toLowerCase()}</em>
              </button>
            ))}
            {data?.items.length === 0 ? <PageState title={t.common.empty} /> : null}
          </div>
        )}
      </section>
      <ReportDetail locale={locale} report={selected} onUpdated={load} />
    </div>
  );
}

function EvidenceItem({ id, mediaType, locale }: { id: string; mediaType: "image" | "chat"; locale: AdminLocale }) {
  const [url, setUrl] = useState("");
  const [messages, setMessages] = useState<Array<{ userId: string; text: string; at: string }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void fetch(`/api/admin/evidence/${id}`, { credentials: "include", headers: { accept: mediaType === "image" ? "image/jpeg" : "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Evidence unavailable");
        if (mediaType === "chat") {
          const data = await response.json() as Array<{ userId: string; text: string; at: string }>;
          if (active) setMessages(data);
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, mediaType]);
  if (error) return <div className="evidence-error"><Warning />{locale === "es" ? "No disponible" : "Unavailable"}</div>;
  if (mediaType === "chat") {
    return <div className="evidence-chat">{messages ? messages.map((message, index) => <p key={`${message.at}-${index}`}><strong>{message.userId.slice(0, 8)}</strong>{message.text}</p>) : <ArrowClockwise className="spin" />}</div>;
  }
  return url ? <img src={url} alt={locale === "es" ? "Captura de evidencia" : "Evidence capture"} /> : <ArrowClockwise className="spin" />;
}

function ReportDetail(props: { locale: AdminLocale; report: ReportItem | null; onUpdated: () => void }) {
  const t = adminCopy[props.locale];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const report = props.report;

  useEffect(() => {
    setReason("");
    setMessage(null);
  }, [report?.id]);

  if (!report) return <section className="admin-panel report-detail-real"><PageState title={t.reports.select} icon={<Flag />} /></section>;
  const act = async (action: "start_review" | "resolve" | "dismiss" | "temporary_hold") => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    setMessage(null);
    try {
      await adminRequest(`/api/admin/reports/${report.id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, reason, durationHours: action === "temporary_hold" ? 24 : undefined })
      });
      setMessage({ kind: "success", text: t.common.success });
      props.onUpdated();
    } catch {
      setMessage({ kind: "error", text: t.common.error });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-panel report-detail-real">
      <header>
        <div><span>{report.id}</span><h2>{report.reason.replaceAll("_", " ")}</h2><p>{formatDate(report.created_at, props.locale)}</p></div>
        <span className={`priority priority--${report.priority}`}>{report.priority}</span>
      </header>
      <dl className="report-context">
        <div><dt>{t.reports.reporter}</dt><dd>{report.reporter_email ?? report.reporter_id}</dd></div>
        <div><dt>{t.reports.reported}</dt><dd>{report.reported_email ?? report.reported_id}</dd></div>
        <div><dt>Session</dt><dd>{report.session_id}</dd></div>
        <div><dt>Status</dt><dd>{report.status}</dd></div>
      </dl>
      {report.details ? <div className="report-note">{report.details}</div> : null}
      <div className="report-evidence-head"><h3>{t.reports.evidence}</h3><span><LockKey />{t.reports.evidenceNotice}</span></div>
      {report.evidence && report.evidence.length > 0 ? (
        <div className="evidence-real-grid">
          {report.evidence.map((item) => <div key={item.id} className={item.mediaType === "chat" ? "is-chat" : ""}><EvidenceItem id={item.id} mediaType={item.mediaType} locale={props.locale} /><small>{item.mediaType} · {formatDate(item.expiresAt, props.locale, false)}</small></div>)}
        </div>
      ) : <div className="report-empty-evidence"><Eye />{t.reports.noEvidence}</div>}
      <div className="report-actions">
        <textarea value={reason} minLength={3} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t.common.reason} />
        {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
        <div>
          <button disabled={busy || reason.trim().length < 3} onClick={() => void act("dismiss")}>{t.reports.dismiss}</button>
          <button disabled={busy || reason.trim().length < 3} onClick={() => void act("start_review")}>{t.reports.start}</button>
          <button disabled={busy || reason.trim().length < 3} onClick={() => void act("temporary_hold")}>{t.reports.hold}</button>
          <button className="admin-button--primary" disabled={busy || reason.trim().length < 3} onClick={() => void act("resolve")}>{t.reports.resolve}</button>
        </div>
      </div>
    </section>
  );
}

function SanctionsPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const [status, setStatus] = useState("");
  const [data, setData] = useState<{ items: Sanction[]; total: number } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: "100", offset: "0" });
    if (status) params.set("status", status);
    void adminRequest<{ items: Sanction[]; total: number }>(`/api/admin/sanctions?${params}`)
      .then(setData)
      .catch(() => setMessage({ kind: "error", text: t.common.error }));
  }, [status, t.common.error]);
  useEffect(load, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    try {
      await adminRequest("/api/admin/sanctions", {
        method: "POST",
        body: JSON.stringify({
          userId: form.get("userId"),
          type: form.get("type"),
          reason: form.get("reason"),
          expiresAt: form.get("expiresAt") ? new Date(String(form.get("expiresAt"))).toISOString() : undefined
        })
      });
      event.currentTarget.reset();
      setMessage({ kind: "success", text: t.common.success });
      load();
    } catch {
      setMessage({ kind: "error", text: t.common.error });
    }
  };

  const revoke = async (sanction: Sanction) => {
    const reason = locale === "es" ? "Revocación manual desde la consola" : "Manual revocation from the console";
    try {
      await adminRequest(`/api/admin/sanctions/${sanction.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      setMessage({ kind: "success", text: t.common.success });
      load();
    } catch {
      setMessage({ kind: "error", text: t.common.error });
    }
  };

  return (
    <div className="sanctions-layout">
      <section className="admin-panel admin-panel--table">
        <header className="admin-panel__toolbar"><div><h2>{t.sanctions.title}</h2><p>{data?.total ?? 0}</p></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t.common.all}</option><option value="active">{t.common.active}</option><option value="revoked">{locale === "es" ? "Revocadas" : "Revoked"}</option><option value="expired">{locale === "es" ? "Vencidas" : "Expired"}</option></select></header>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>{t.nav.users}</th><th>{t.sanctions.type}</th><th>{t.users.status}</th><th>{t.common.reason}</th><th>{t.sanctions.expires}</th><th /></tr></thead>
            <tbody>{(data?.items ?? []).map((sanction) => <tr key={sanction.id}>
              <td data-label={t.nav.users}><strong>{sanction.user_email ?? sanction.user_id}</strong><small>{sanction.user_id}</small></td>
              <td data-label={t.sanctions.type}>{sanction.type}</td>
              <td data-label={t.users.status}><span className={sanction.status === "active" ? "risk-badge" : "role-badge"}>{sanction.status}</span></td>
              <td data-label={t.common.reason}>{sanction.reason}</td>
              <td data-label={t.sanctions.expires}>{formatDate(sanction.expires_at, locale)}</td>
              <td>{sanction.status === "active" ? <button className="table-action" onClick={() => void revoke(sanction)}>{t.sanctions.revoke}</button> : null}</td>
            </tr>)}</tbody>
          </table>
          {data?.items.length === 0 ? <PageState title={t.common.empty} /> : null}
        </div>
      </section>
      <aside className="admin-panel admin-detail">
        <h2>{t.sanctions.create}</h2>
        <p>{locale === "es" ? "Las suspensiones permanentes nunca se aplican automáticamente." : "Permanent suspensions are never applied automatically."}</p>
        <form className="admin-action-form" onSubmit={create}>
          <label><span>{t.sanctions.userId}</span><input name="userId" required maxLength={128} /></label>
          <label><span>{t.sanctions.type}</span><select name="type"><option value="temporary_hold">{t.sanctions.temporary}</option><option value="suspension">{t.sanctions.suspension}</option></select></label>
          <label><span>{t.sanctions.expires}</span><input name="expiresAt" type="datetime-local" /></label>
          <label><span>{t.common.reason}</span><textarea name="reason" required minLength={3} maxLength={500} /></label>
          {message ? <StatusMessage kind={message.kind}>{message.text}</StatusMessage> : null}
          <button className="admin-button admin-button--primary">{t.sanctions.create}</button>
        </form>
      </aside>
    </div>
  );
}

function serviceStatus(service: Monitoring["services"][string]) {
  if (service.status) return service.status;
  return service.healthy ? "healthy" : "offline";
}

function MonitoringPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const [data, setData] = useState<Monitoring | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await adminRequest("/api/admin/monitoring?hours=24"));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [load]);
  if (!data && !error) return <PageState title={t.common.loading} icon={<ArrowClockwise className="spin" />} />;
  if (!data) return <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={() => void load()}>{t.common.retry}</button>} />;
  const services = [
    ["database", t.monitoring.database],
    ["redis", t.monitoring.redis],
    ["livekit", t.monitoring.livekit],
    ["storage", t.monitoring.storage],
    ["moderation", t.monitoring.moderation]
  ] as const;
  const connected = data.history.map((item) => item.connected_users);
  const queue = data.history.map((item) => item.queued_users);
  return (
    <div className="monitoring-page">
      <section className="monitoring-current">
        <div><UsersThree /><span>{t.overview.connected}</span><strong>{data.current.connectedUsers}<small>/ {data.current.capacity}</small></strong></div>
        <div><VideoCamera /><span>{t.overview.rooms}</span><strong>{data.current.activeSessions}</strong></div>
        <div><Gauge /><span>{t.monitoring.queue}</span><strong>{data.current.queuedUsers}</strong></div>
        <div><ArrowClockwise /><span>{t.common.updated}</span><strong className="monitoring-time">{relativeTime(data.generatedAt, locale)}</strong></div>
      </section>
      <section className="admin-panel service-health">
        <header><h2>{t.monitoring.services}</h2><button className="icon-button" onClick={() => void load()} aria-label={t.common.retry}><ArrowClockwise /></button></header>
        <div>{services.map(([key, label]) => {
          const service = data.services[key];
          const status = serviceStatus(service);
          return <article key={key}><span className={`service-icon service-icon--${status}`}>{status === "healthy" ? <CheckCircle /> : <Warning />}</span><div><strong>{label}</strong><p>{status === "healthy" ? t.monitoring.healthy : status === "degraded" ? t.monitoring.degraded : t.monitoring.offline}</p></div><small>{service.latencyMs != null ? `${service.latencyMs} ms` : service.updated_at ? relativeTime(service.updated_at, locale) : "—"}</small></article>;
        })}</div>
      </section>
      <section className="admin-panel monitoring-history">
        <header><div><h2>{t.monitoring.history}</h2><p>{data.history.length} samples</p></div><div className="chart-legend"><span><i className="is-connected" />{t.overview.connected}</span><span><i className="is-queue" />{t.monitoring.queue}</span></div></header>
        {data.history.length > 1 ? (
          <div className="monitoring-chart">
            <Sparkline values={connected} />
            <Sparkline values={queue} tone="amber" />
            <div className="monitoring-chart__axis"><span>{formatDate(data.history[0]?.recorded_at, locale)}</span><span>{formatDate(data.history.at(-1)?.recorded_at, locale)}</span></div>
          </div>
        ) : <PageState title={t.monitoring.noHistory} icon={<ChartLineUp />} />}
      </section>
    </div>
  );
}

function AuditTable({ entries, locale, compact = false }: { entries: AuditEntry[]; locale: AdminLocale; compact?: boolean }) {
  const t = adminCopy[locale];
  if (entries.length === 0) return <PageState title={t.common.empty} icon={<ClipboardText />} />;
  return (
    <div className="admin-table-wrap">
      <table className={`admin-table audit-table${compact ? " is-compact" : ""}`}>
        <thead><tr><th>{t.audit.when}</th><th>{t.audit.actor}</th><th>{t.audit.action}</th><th>{t.audit.target}</th><th>{t.audit.reason}</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id}>
          <td data-label={t.audit.when}>{formatDate(entry.created_at, locale)}</td>
          <td data-label={t.audit.actor}>{entry.actor_email ?? (locale === "es" ? "Sistema" : "System")}</td>
          <td data-label={t.audit.action}><code>{entry.action}</code></td>
          <td data-label={t.audit.target}>{entry.target_type}{entry.target_id ? ` · ${entry.target_id.slice(0, 8)}` : ""}</td>
          <td data-label={t.audit.reason}>{entry.reason ?? "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function AuditPage({ locale }: { locale: AdminLocale }) {
  const t = adminCopy[locale];
  const limit = 50;
  const [action, setAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: AuditEntry[]; total: number } | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action.trim()) params.set("action", action.trim());
    try {
      setData(await adminRequest(`/api/admin/audit?${params}`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [action, offset]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  return (
    <section className="admin-panel admin-panel--table">
      <header className="admin-panel__toolbar"><div><h2>{t.header.audit}</h2><p>{data?.total ?? 0}</p></div><label className="admin-search"><MagnifyingGlass /><input value={action} onChange={(event) => { setAction(event.target.value); setOffset(0); }} placeholder={locale === "es" ? "Filtrar por acción exacta" : "Filter by exact action"} /></label></header>
      {error ? <PageState title={t.common.error} action={<button className="admin-button admin-button--primary" onClick={() => void load()}>{t.common.retry}</button>} /> : <AuditTable entries={data?.items ?? []} locale={locale} />}
      <Pagination locale={locale} offset={offset} limit={limit} total={data?.total ?? 0} onChange={setOffset} />
    </section>
  );
}

const navItems = [
  { key: "overview", to: "/admin", icon: House, permission: "overview:read", end: true },
  { key: "features", to: "/admin/features", icon: SlidersHorizontal, permission: "features:read" },
  { key: "users", to: "/admin/users", icon: UsersThree, permission: "users:read" },
  { key: "reports", to: "/admin/reports", icon: Flag, permission: "reports:read" },
  { key: "sanctions", to: "/admin/sanctions", icon: ShieldWarning, permission: "sanctions:read" },
  { key: "monitoring", to: "/admin/monitoring", icon: Pulse, permission: "monitoring:read" },
  { key: "audit", to: "/admin/audit", icon: ClipboardText, permission: "audit:read" }
] as const;

function AdminShell(props: {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  identity: AdminIdentity;
  children: ReactNode;
}) {
  const t = adminCopy[props.locale];
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const section = location.pathname.split("/")[2] || "overview";
  const title = t.header[section as keyof typeof t.header] ?? t.header.overview;
  const availableNav = navItems.filter((item) => props.identity.permissions.includes(item.permission));
  const currentDate = new Intl.DateTimeFormat(props.locale === "es" ? "es-AR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const logout = async () => {
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => undefined);
    navigate("/auth", { replace: true });
  };

  return (
    <main className="superadmin-shell">
      <aside className={`superadmin-sidebar${mobileOpen ? " is-open" : ""}`}>
        <div className="superadmin-sidebar__top">
          <Link to="/admin" className="admin-brand">Nexo<span>Cam</span></Link>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label={t.common.cancel}><X /></button>
        </div>
        <nav>{availableNav.map(({ key, to, icon: Icon, ...item }) => <NavLink key={key} to={to} end={"end" in item ? item.end : false}><Icon /><span>{t.nav[key]}</span></NavLink>)}</nav>
        <div className="superadmin-sidebar__access"><ShieldCheck /><div><strong>{t.header.superadmin}</strong><span>{props.identity.user.role}</span></div></div>
        <button className="sidebar-logout" onClick={() => void logout()}><SignOut />{t.common.logout}</button>
      </aside>
      {mobileOpen ? <button className="sidebar-backdrop" aria-label={t.common.cancel} onClick={() => setMobileOpen(false)} /> : null}
      <section className="superadmin-main">
        <header className="superadmin-header">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Menu"><List /></button>
          <div className="superadmin-title"><h1>{title}</h1><p>{t.header.subtitle}</p></div>
          <div className="superadmin-status">
            <span><i />{t.header.live}</span>
            <span><ShieldCheck />{t.header.secure}</span>
            <span className="superadmin-status__date"><CalendarBlank />{currentDate}</span>
          </div>
          <div className="admin-languages"><button className={props.locale === "es" ? "active" : ""} onClick={() => props.setLocale("es")}>ES</button><button className={props.locale === "en" ? "active" : ""} onClick={() => props.setLocale("en")}>EN</button></div>
          <div className="superadmin-identity"><UserCircle /><span><strong>{t.header.superadmin}</strong><small>{props.identity.user.email}</small></span><CaretDown /></div>
        </header>
        <div className="superadmin-content">{props.children}</div>
      </section>
    </main>
  );
}

export function AdminConsole(props: {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
}) {
  const t = adminCopy[props.locale];
  const location = useLocation();
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "forbidden" | "error">("loading");
  const requestedPath = useRef(location.pathname);

  useEffect(() => {
    let active = true;
    void adminRequest<AdminIdentity>("/api/admin/me")
      .then((data) => {
        if (!active) return;
        setIdentity(data);
        setState("ready");
      })
      .catch((error) => {
        if (!active) return;
        if (error instanceof AdminApiError && error.status === 401) setState("unauthorized");
        else if (error instanceof AdminApiError && error.status === 403) setState("forbidden");
        else setState("error");
      });
    return () => { active = false; };
  }, []);

  if (state === "unauthorized") {
    return <Navigate to={`/auth?next=${encodeURIComponent(requestedPath.current)}`} replace />;
  }
  if (state === "loading") return <div className="admin-auth-state"><PageState title={t.common.loading} icon={<ArrowClockwise className="spin" />} /></div>;
  if (state === "forbidden") return <div className="admin-auth-state"><PageState title={t.common.accessDenied} icon={<ShieldWarning />} action={<Link className="admin-button admin-button--primary" to="/chat">{t.common.backToChat}</Link>} /></div>;
  if (state === "error" || !identity) return <div className="admin-auth-state"><PageState title={t.common.error} icon={<Warning />} action={<button className="admin-button admin-button--primary" onClick={() => window.location.reload()}>{t.common.retry}</button>} /></div>;

  return (
    <AdminShell locale={props.locale} setLocale={props.setLocale} identity={identity}>
      <Routes>
        <Route index element={identity.permissions.includes("overview:read") ? <OverviewPage locale={props.locale} /> : <Navigate to="/admin/reports" replace />} />
        <Route path="features" element={identity.permissions.includes("features:read") ? <FeaturesPage locale={props.locale} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="users" element={identity.permissions.includes("users:read") ? <UsersPage locale={props.locale} identity={identity} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="reports" element={identity.permissions.includes("reports:read") ? <ReportsPage locale={props.locale} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="sanctions" element={identity.permissions.includes("sanctions:read") ? <SanctionsPage locale={props.locale} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="monitoring" element={identity.permissions.includes("monitoring:read") ? <MonitoringPage locale={props.locale} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="audit" element={identity.permissions.includes("audit:read") ? <AuditPage locale={props.locale} /> : <PageState title={t.common.accessDenied} icon={<ShieldWarning />} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminShell>
  );
}
