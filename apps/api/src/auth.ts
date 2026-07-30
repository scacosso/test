import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { getFeatureFlags, pool } from "./db.js";

const transporter = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;
const socialProviders = config.googleClientId && config.googleClientSecret
  ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
  : undefined;

export const auth = pool
  ? betterAuth({
      database: pool,
      secret: config.authSecret,
      baseURL: config.appUrl,
      trustedOrigins: config.allowedOrigins,
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false,
        minPasswordLength: 8
      },
      emailVerification: {
        sendOnSignUp: false,
        sendVerificationEmail: async ({ user, url }) => {
          if (!transporter) {
            console.info(`[email-preview] Verify ${user.email}: ${url}`);
            return;
          }
          await transporter.sendMail({
            from: config.emailFrom,
            to: user.email,
            subject: "Verifica tu cuenta de NexoCam",
            text: `Abre este enlace para verificar tu cuenta: ${url}`
          });
        }
      },
      socialProviders,
      user: {
        additionalFields: {
          dateOfBirth: { type: "date", required: false, input: true },
          role: { type: "string", required: false, defaultValue: "user", input: false }
        }
      },
      plugins: [
        anonymous({
          emailDomainName: "guest.nexocam.invalid",
          generateName: () => "Invitado"
        })
      ],
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24
      },
      advanced: {
        useSecureCookies: config.nodeEnv === "production",
        defaultCookieAttributes: {
          httpOnly: true,
          sameSite: "lax",
          secure: config.nodeEnv === "production"
        }
      }
    })
  : null;

export async function sessionUser(headers: Headers) {
  if (!auth) return null;
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const flags = await getFeatureFlags();
  const isGuest = Boolean((session.user as unknown as { isAnonymous?: boolean }).isAnonymous);
  if (isGuest && !flags.guest_access) return null;
  if (!isGuest && flags.email_verification && !session.user.emailVerified) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    isGuest,
    role: ((session.user as unknown as { role?: string }).role ?? "user") as "user" | "moderator" | "admin" | "superuser"
  };
}
