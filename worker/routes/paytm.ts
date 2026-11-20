
import { Hono } from "hono";
import type { AppEnv } from "./app";
import {
  getPaytmTransaction,
  initiatePaytmTransaction,
  isSuccessfulPaytmPayment,
  type PaytmConfig,
} from "../paytm";
import { tg } from "../telegram";

export const paytm = new Hono<AppEnv>();

async function getConfig(env: AppEnv["Bindings"]): Promise<PaytmConfig> {
  const rows = await env.DB.prepare(
    `SELECT key,value FROM settings
     WHERE key IN (
       'paytm_enabled','paytm_mid','paytm_key',
       'paytm_environment','paytm_min_amount','paytm_max_amount'
     )`,
  ).all<{ key: string; value: string }>();

  const values = Object.fromEntries(
    rows.results.map((r) => [r.key, r.value]),
  );

  return {
    enabled: values.paytm_enabled === "1",
    merchant_id: values.paytm_mid || "",
    merchant_key: values.paytm_key || "",
    environment:
      values.paytm_environment === "production"
        ? "production"
        : "staging",
    min_amount: Number(values.paytm_min_amount || 10),
    max_amount: Number(values.paytm_max_amount || 10000),
  };
}

paytm.post("/create", async (c) => {
  const user = c.get("user");
  const config = await getConfig(c.env);

  if (!config.enabled) {
    return c.json({ error: "PAYTM_DISABLED" }, 403);
  }

  const body = await c.req.json().catch(() => null) as {
    amount?: number;
  } | null;

  const amount = Number(body?.amount);

  if (
    !Number.isFinite(amount) ||
    amount < config.min_amount ||
    amount > config.max_amount ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return c.json({ error: "INVALID_AMOUNT" }, 400);
  }

  const orderId = `AMIT${Date.now()}${user.id}`;

  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO paytm_payments
     (order_id,user_id,amount_inr,status,created_at)
     VALUES (?1,?2,?3,'pending',?4)`,
  ).bind(orderId, user.id, amount, now).run();

  try {
    const callbackUrl = new URL(
      "/hooks/paytm",
      c.req.url,
    ).toString();

    const payment = await initiatePaytmTransaction(
      config,
      orderId,
      amount,
      callbackUrl,
    );

    return c.json({
      ok: true,
      ...payment,
      environment: config.environment,
    });
  } catch (error) {
    console.error("Paytm initiation error:", error);

    await c.env.DB.prepare(
      `UPDATE paytm_payments
       SET status='failed'
       WHERE order_id=?1 AND status='pending'`,
    ).bind(orderId).run();

    return c.json({ error: "PAYTM_INITIATION_FAILED" }, 502);
  }
});

async function verifyAndCredit(
  env: AppEnv["Bindings"],
  orderId: string,
  expectedUserId?: number,
) {
  const config = await getConfig(env);

  const payment = await env.DB.prepare(
    `SELECT * FROM paytm_payments WHERE order_id=?1`,
  ).bind(orderId).first<{
    order_id: string;
    user_id: number;
    amount_inr: number;
    status: string;
  }>();

  if (!payment) return { ok: false, error: "PAYMENT_NOT_FOUND" };

  if (expectedUserId && payment.user_id !== expectedUserId) {
    return { ok: false, error: "FORBIDDEN" };
  }

  if (payment.status === "paid") {
    return { ok: true, alreadyPaid: true };
  }

  if (payment.status !== "pending") {
    return { ok: false, error: "PAYMENT_NOT_PENDING" };
  }

  const transaction = await getPaytmTransaction(config, orderId);

  if (
    !isSuccessfulPaytmPayment(
      transaction,
      config,
      orderId,
      Number(payment.amount_inr),
    )
  ) {
    return { ok: false, error: "PAYMENT_NOT_CONFIRMED" };
  }

  const now = Math.floor(Date.now() / 1000);

  const [mark] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE paytm_payments
       SET status='paid',txn_id=?2,paid_at=?3
       WHERE order_id=?1 AND status='pending'`,
    ).bind(orderId, transaction.TXNID!, now),

    env.DB.prepare(
      `UPDATE users SET balance_inr=balance_inr+?2
       WHERE id=?1
       AND (SELECT status FROM paytm_payments
            WHERE order_id=?3)='paid'
       AND (SELECT paid_at FROM paytm_payments
            WHERE order_id=?3)=?4
       AND (SELECT txn_id FROM paytm_payments
            WHERE order_id=?3)=?5`,
    ).bind(payment.user_id, payment.amount_inr, orderId, now, transaction.TXNID),

    env.DB.prepare(
      `INSERT INTO inr_ledger
       (user_id,delta_inr,kind,ref,note,created_at)
       SELECT ?1,?2,'topup',?3,'Paytm automatic top-up',?4
       WHERE changes()=1`,
    ).bind(payment.user_id, payment.amount_inr, 0, now),
  ]);

  if (!mark.meta.changes) {
    return { ok: false, error: "PAYMENT_ALREADY_PROCESSED" };
  }

  const userBalance = await env.DB.prepare(
    "SELECT balance_inr FROM users WHERE id=?1",
  ).bind(payment.user_id).first<{ balance_inr: number }>();

  await tg(env.BOT_TOKEN, "sendMessage", {
    chat_id: payment.user_id,
    text:
      `✅ Paytm payment successful!\n\n` +
      `Amount: ₹${Number(payment.amount_inr).toFixed(2)}\n` +
      `Order: ${orderId}\n` +
      `Wallet balance: ₹${Number(userBalance?.balance_inr || 0).toFixed(2)}`,
  }).catch((e) => console.error("Paytm notification failed", e));

  return { ok: true };
}

paytm.get("/status/:orderId", async (c) => {
  const orderId = c.req.param("orderId");

  const result = await verifyAndCredit(
    c.env,
    orderId,
    c.get("user").id,
  ).catch((e) => {
    console.error("Paytm verification error:", e);
    return { ok: false, error: "VERIFICATION_FAILED" };
  });

  return c.json(result);
});
