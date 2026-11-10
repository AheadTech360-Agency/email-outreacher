import type { Security } from "./config-api"

/** Mail providers' standard settings, so adding a mailbox is the address and an app password. */
export interface Provider {
  id: string
  name: string
  smtp: { host: string; port: number; security: Security }
  imap: { host: string; port: number; security: Security } | null
  /** What the password field needs, in this provider's words. */
  passwordHint: string
}

export const PROVIDERS: Provider[] = [
  {
    id: "google",
    name: "Google Workspace",
    smtp: { host: "smtp.gmail.com", port: 465, security: "ssl" },
    imap: { host: "imap.gmail.com", port: 993, security: "ssl" },
    passwordHint: "An app password: Google Account, Security, 2-Step Verification, App passwords.",
  },
  {
    id: "microsoft",
    name: "Microsoft 365",
    smtp: { host: "smtp.office365.com", port: 587, security: "starttls" },
    imap: { host: "outlook.office365.com", port: 993, security: "ssl" },
    passwordHint: "An app password, and SMTP AUTH turned on for this mailbox in the Microsoft 365 admin center.",
  },
  {
    id: "privateemail",
    name: "Namecheap Private Email",
    smtp: { host: "mail.privateemail.com", port: 465, security: "ssl" },
    imap: { host: "mail.privateemail.com", port: 993, security: "ssl" },
    passwordHint: "The mailbox password, or an app password if the mailbox has one.",
  },
  {
    id: "zoho",
    name: "Zoho Mail",
    smtp: { host: "smtp.zoho.com", port: 465, security: "ssl" },
    imap: { host: "imap.zoho.com", port: 993, security: "ssl" },
    passwordHint: "An app-specific password from Zoho Accounts, Security.",
  },
  {
    id: "custom",
    name: "Other",
    smtp: { host: "", port: 465, security: "ssl" },
    imap: { host: "", port: 993, security: "ssl" },
    passwordHint: "The password your mail host gives for SMTP and IMAP.",
  },
]

export const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1]

/** The usual security for a port, when someone types one in. */
export const securityFor = (port: number): Security => (port === 587 || port === 143 || port === 25 ? "starttls" : "ssl")
