
import { DEFAULT_PRESET } from "../shared/brand";
import { brandName, parseButtonIcons, parseEmojiMap } from "./brand";
import type { Env } from "./env";
import { setBotBrand, setBotMessages } from "./i18n";
import { setCustomization } from "./telegram";

export const DEFAULTS = {
  default_markup_pct: 30,
  stars_per_usd: 77,

  min_topup_stars: 50,
  max_topup_stars: 10_000,

  sync_enabled: 0,
  sync_every_hours: 6,
  auto_enable_new: 1,
  only_timed: 1,
  low_balance: 5_000_000,

  support_username: "",

  channel_url: "",
  channel_id: "",
  channel_gate: 1,

  referral_enabled: 1,
  referral_reward_stars: 3,
  referral_daily_cap: 50,

  terms_text:
    "By using this app you agree that services are delivered by third parties and delivery times are estimates. " +
    "Balance top-ups are paid in Telegram Stars and are credited to your in-app balance. Orders that cannot be " +
    "delivered are refunded to your balance automatically.",

  last_sync_at: 0,
  last_sync_summary: "",
  sync_state: "",
  last_catalog_at: "",
  catalog_version: 1,

  app_url: "",
  welcome_photo: "",
  bot_username: "",
  np_webhook_id: "",
  np_webhook_secret: "",

  brand_name: "Amit Bot",
  brand_preset: DEFAULT_PRESET,
  brand_accent: "#2457ff",
  website_url: "",
  terms_url: "",
  welcome_text: "",
  bot_messages: "{}",
  custom_emoji: "{}",
  button_icons: '{"open":"","viewOrder":"","terms":"","invite":""}',

  owner_ids: "",
  claim_code_hash: "",
  claim_expires: 0,

  np_api_key: "",
  logo_ver: 0,
  banner_ver: 0,
  setup_done: 0,

  commands_key: "",
  commands_step: 0,
  broadcast_state: "",
  alerts_sent: "{}",
  commands_wait_until: 0,
  names_done: 0,
  commands_admins: "",

  // INR wallet and key delivery
  inr_symbol: "₹",
  inr_per_usd: 85,
  key_delivery_mode: "auto",
  low_stock_alert: 3,
  key_stock_checked_at: 0,
  api_low_balance_inr: 100,
  api_balance_checked_at: 0,

  reseller_api_url: "https://bantibhaiya.to/api/reseller_v1.php",
  reseller_api_key: "",
  reseller_master_key: "",
  active_key_api_id: "",

  payment_methods: "[]",
  upi_id: "",
  upi_qr_url: "",

  bonus_enabled: 1,
  bonus_mode: "random",
  bonus_fixed_inr: 1,
  bonus_min_inr: 0.5,
  bonus_max_inr: 2,
  bonus_cooldown_hours: 24,

  referral_signup_bonus_inr: 2,
  referral_commission_percent: 5,

  apk_file_id: "",
  apk_file_name: "",
  apk_updated_at: 0,

  setup_steps: "",

  // Paytm one-time wallet payments
  paytm_enabled: 0,
  paytm_environment: "staging",
  paytm_mid: "",
  paytm_min_topup_inr: 10,
  paytm_max_topup_inr: 100000,
  paytm_callback_url: "",
};

export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;

let memo: { at: number; value: Settings } | null = null;

const MEMO_MS = 15_000;
const FRESH_MS = 2_000;

/**
 * Settings are cached per isolate.
 * Use fresh for operations that coordinate jobs.
 */
export async function getSettings(
  env: Env,
  opts: { fresh?: boolean } = {},
): Promise<Settings> {
  if (
    memo &&
    Date.now() - memo.at < (opts.fresh ? FRESH_MS : MEMO_MS)
  ) {
    return memo.value;
  }

  const value = await loadSettings(env);

  memo = {
    at: Date.now(),
    value,
  };

  applyBranding(value);

  return value;
}

let applied = "";

/** Applies branding and Telegram message customizations when changed. */
function applyBranding(settings: Settings): void {
  const signature =
    `${settings.brand_name}\u0000` +
    `${settings.custom_emoji}\u0000` +
    `${settings.button_icons}`;

  if (signature === applied) return;

  applied = signature;

  setBotBrand(brandName(settings));

  try {
    setBotMessages(
      JSON.parse(settings.bot_messages || "{}"),
    );
  } catch {
    setBotMessages({});
  }

  setCustomization(
    parseEmojiMap(settings.custom_emoji),
    parseButtonIcons(settings.button_icons),
  );
}

/** Loads persisted settings, retaining defaults for missing rows. */
async function loadSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB
    .prepare("SELECT key, value FROM settings")
    .all<{ key: string; value: string }>();

  const settings: Record<string, unknown> = {
    ...DEFAULTS,
  };

  for (const row of results) {
    if (!(row.key in DEFAULTS)) continue;

    const defaultValue = (DEFAULTS as Record<string, unknown>)[row.key];

    settings[row.key] =
      typeof defaultValue === "number"
        ? Number(row.value)
        : row.value;
  }

  return settings as Settings;
}

/** Invalidates cached settings after direct database writes. */
export function bustSettings(): void {
  memo = null;
}

/** Builds D1 statements for updating settings. */
export function setSettingsStmts(
  env: Env,
  values: Partial<Settings>,
): D1PreparedStatement[] {
  memo = null;

  return Object.entries(values).map(([key, value]) =>
    env.DB
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (?1, ?2)
         ON CONFLICT(key)
         DO UPDATE SET value = excluded.value`,
      )
      .bind(key, String(value)),
  );
}

/** Saves multiple settings in one D1 batch. */
export async function setSettings(
  env: Env,
  values: Partial<Settings>,
): Promise<void> {
  const statements = setSettingsStmts(env, values);

  if (statements.length) {
    await env.DB.batch(statements);
  }
}

/** Increments the catalog version after catalog changes. */
export function bumpCatalogStmt(
  env: Env,
): D1PreparedStatement {
  memo = null;

  return env.DB.prepare(
    `INSERT INTO settings (key, value)
     VALUES ('catalog_version', '2')
     ON CONFLICT(key)
     DO UPDATE SET value = CAST(value AS INTEGER) + 1`,
  );
}
