
import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { navigate } from "../router";
import {
  BackNav,
  BottomButtons,
  LargeTitle,
  Screen,
  Section,
  toast,
} from "../ui";

type PaytmSettings = {
  enabled: boolean;
  merchant_id: string;
  hasMerchantKey: boolean;
  environment: "staging" | "production";
  min_amount: number;
  max_amount: number;
};

export function AdminPaytm() {
  const [settings, setSettings] = useState<PaytmSettings>({
    enabled: false,
    merchant_id: "",
    hasMerchantKey: false,
    environment: "staging",
    min_amount: 10,
    max_amount: 10000,
  });

  const [merchantKey, setMerchantKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<PaytmSettings>("/admin/paytm-settings")
      .then(setSettings)
      .catch(() => toast("Could not load Paytm settings", "error"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: keyof PaytmSettings, value: unknown) => {
    setSettings((old) => ({ ...old, [key]: value }));
  };

  const save = async () => {
    if (
      settings.enabled &&
      (!settings.merchant_id.trim() ||
        (!settings.hasMerchantKey && !merchantKey.trim()))
    ) {
      toast("Enter your Paytm MID and Merchant Key", "error");
      return;
    }

    if (
      settings.min_amount <= 0 ||
      settings.max_amount < settings.min_amount
    ) {
      toast("Check the payment limits", "error");
      return;
    }

    setSaving(true);

    try {
      await api("/admin/paytm-settings", {
        method: "PUT",
        body: {
          enabled: settings.enabled,
          merchant_id: settings.merchant_id.trim(),
          ...(merchantKey.trim()
            ? { merchant_key: merchantKey.trim() }
            : {}),
          environment: settings.environment,
          min_amount: Number(settings.min_amount),
          max_amount: Number(settings.max_amount),
        },
      });

      setMerchantKey("");
      toast("Paytm settings saved", "ok");

      const refreshed = await api<PaytmSettings>(
        "/admin/paytm-settings",
      );
      setSettings(refreshed);
    } catch {
      toast("Could not save Paytm settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BackNav to="/admin" />

      <Screen
        bottom="native"
        overlay={
          <BottomButtons
            main={{
              text: saving ? "Saving…" : "Save Paytm settings",
              onClick: () => void save(),
              disabled: saving || loading,
            }}
            secondary={{
              text: "Back",
              onClick: () => navigate("/admin"),
            }}
          />
        }
      >
        <div class="admin-extra">
          <LargeTitle
            size="large"
            title="Paytm Gateway"
            sub="Configure automatic INR wallet top-ups."
          />

          {loading ? (
            <Section header="Loading">
              <p>Loading Paytm configuration…</p>
            </Section>
          ) : (
            <>
              <Section header="Gateway status">
                <label class="inline-check">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) =>
                      update(
                        "enabled",
                        (e.currentTarget as HTMLInputElement).checked,
                      )
                    }
                  />
                  Enable Paytm payments
                </label>

                <label>
                  Environment
                  <select
                    value={settings.environment}
                    onChange={(e) =>
                      update(
                        "environment",
                        (e.currentTarget as HTMLSelectElement).value,
                      )
                    }
                  >
                    <option value="staging">Staging / Testing</option>
                    <option value="production">Production</option>
                  </select>
                </label>
              </Section>

              <Section header="Merchant credentials">
                <label>
                  Merchant ID (MID)
                  <input
                    value={settings.merchant_id}
                    onInput={(e) =>
                      update(
                        "merchant_id",
                        (e.currentTarget as HTMLInputElement).value,
                      )
                    }
                    placeholder="Enter your Paytm MID"
                  />
                </label>

                <label>
                  Merchant Key
                  <input
                    type="password"
                    value={merchantKey}
                    onInput={(e) =>
                      setMerchantKey(
                        (e.currentTarget as HTMLInputElement).value,
                      )
                    }
                    placeholder={
                      settings.hasMerchantKey
                        ? "Saved — leave blank to keep"
                        : "Enter Merchant Key"
                    }
                    autocomplete="new-password"
                  />
                </label>

                <small>
                  {settings.hasMerchantKey
                    ? "A Merchant Key is already configured."
                    : "No Merchant Key is configured."}
                  {" "}The key must remain server-side.
                </small>
              </Section>

              <Section header="Top-up limits">
                <label>
                  Minimum amount (₹)
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={settings.min_amount}
                    onInput={(e) =>
                      update(
                        "min_amount",
                        Number(
                          (e.currentTarget as HTMLInputElement).value,
                        ),
                      )
                    }
                  />
                </label>

                <label>
                  Maximum amount (₹)
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={settings.max_amount}
                    onInput={(e) =>
                      update(
                        "max_amount",
                        Number(
                          (e.currentTarget as HTMLInputElement).value,
                        ),
                      )
                    }
                  />
                </label>
              </Section>

              <Section header="Payment information">
                <p>
                  Payment method: Paytm Checkout
                </p>
                <p>
                  Currency: INR (₹)
                </p>
                <p>
                  Wallet credit: Automatic after verified payment
                </p>
                <p>
                  Recurring payments: Disabled
                </p>
              </Section>
            </>
          )}
        </div>
      </Screen>
    </>
  );
}
