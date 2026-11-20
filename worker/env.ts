
import type { Settings } from "./settings";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  /** Telegram bot token from @BotFather. */
  BOT_TOKEN: string;

  /** NotPanel API key. Can also be configured in app settings. */
  NOTPANEL_API_KEY?: string;

  /** Overrides the webhook secret derived from BOT_TOKEN. */
  TG_WEBHOOK_SECRET?: string;

  /** Secret path segment for legacy /setup routes. */
  SETUP_SECRET?: string;

  /** Comma-separated Telegram user IDs that are always admins. */
  OWNER_IDS?: string;

  /** Local development only: skip Telegram auth and act as this user ID. */
  DEV_FAKE_USER_ID?: string;

  /** Local development guard: allows placing real NotPanel orders. */
  ALLOW_LIVE_ORDERS?: string;

  /** Paytm Merchant ID. Configure as a Cloudflare secret. */
  PAYTM_MID?: string;

  /** Paytm Merchant Key. Configure as a Cloudflare secret. */
  PAYTM_MERCHANT_KEY?: string;

  /** Paytm environment: "production" or "staging". */
  PAYTM_ENV?: string;

  /** Public application URL used for Paytm callbacks, if required. */
  PAYTM_CALLBACK_URL?: string;
}

/**
 * Converts "1, 2,x,3" into [1, 2, 3].
 * Only positive safe integers are accepted.
 * Duplicate IDs are removed.
 */
export function parseIds(
  value: string | undefined | null,
): number[] {
  const out: number[] = [];

  for (const part of (value ?? "").split(",")) {
    const trimmed = part.trim();

    if (!trimmed) continue;

    const id = Number(trimmed);

    if (
      Number.isSafeInteger(id) &&
      id > 0 &&
      !out.includes(id)
    ) {
      out.push(id);
    }
  }

  return out;
}

/** Admins configured through the OWNER_IDS environment variable. */
export const envOwners = (env: Env): number[] =>
  parseIds(env.OWNER_IDS);

/** Admins claimed or added in app settings. */
export const addedOwners = (
  settings: Pick<Settings, "owner_ids">,
): number[] => parseIds(settings.owner_ids);

/** All users allowed to access the Admin panel. */
export const ownerIds = (
  env: Env,
  settings: Pick<Settings, "owner_ids">,
): number[] => [
  ...new Set([
    ...envOwners(env),
    ...addedOwners(settings),
  ]),
];

/** Checks whether a Telegram user has admin access. */
export function isOwner(
  env: Env,
  settings: Pick<Settings, "owner_ids">,
  userId: number,
): boolean {
  return (
    Number.isSafeInteger(userId) &&
    userId > 0 &&
    ownerIds(env, settings).includes(userId)
  );
}
