
import PaytmChecksum from "paytmchecksum";

export interface PaytmConfig {
  enabled: boolean;
  merchant_id: string;
  merchant_key: string;
  environment: "staging" | "production";
  min_amount: number;
  max_amount: number;
}

export interface PaytmTransaction {
  ORDERID: string;
  MID: string;
  TXNAMOUNT: string;
  STATUS: string;
  TXNID?: string;
  RESPMSG?: string;
  CURRENCY?: string;
}

export function paytmBase(environment: string): string {
  return environment === "production"
    ? "https://securegw.paytm.in"
    : "https://securegw-stage.paytm.in";
}

export async function createPaytmSignature(
  params: Record<string, string>,
  merchantKey: string,
): Promise<string> {
  return PaytmChecksum.generateSignature(params, merchantKey);
}

export async function verifyPaytmSignature(
  params: Record<string, string>,
  merchantKey: string,
  checksum: string,
): Promise<boolean> {
  return PaytmChecksum.verifySignature(
    params,
    merchantKey,
    checksum,
  );
}

export async function initiatePaytmTransaction(
  config: PaytmConfig,
  orderId: string,
  amount: number,
  callbackUrl: string,
) {
  if (!config.enabled) throw new Error("PAYTM_DISABLED");
  if (!config.merchant_id || !config.merchant_key) {
    throw new Error("PAYTM_NOT_CONFIGURED");
  }

  const base = paytmBase(config.environment);

  const body = {
    requestType: "Payment",
    mid: config.merchant_id,
    websiteName: "DEFAULT",
    orderId,
    callbackUrl,
    txnAmount: {
      value: amount.toFixed(2),
      currency: "INR",
    },
    userInfo: {
      custId: orderId,
    },
  };

  const signature = await createPaytmSignature(
    body as unknown as Record<string, string>,
    config.merchant_key,
  );

  const response = await fetch(
    `${base}/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(config.merchant_id)}&orderId=${encodeURIComponent(orderId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        head: { signature },
      }),
    },
  );

  if (!response.ok) {
    throw new Error("PAYTM_INITIATION_FAILED");
  }

  const result = await response.json() as {
    body?: {
      resultInfo?: { resultStatus?: string; resultMsg?: string };
      txnToken?: string;
    };
  };

  if (
    result.body?.resultInfo?.resultStatus !== "S" ||
    !result.body.txnToken
  ) {
    throw new Error(
      result.body?.resultInfo?.resultMsg || "PAYTM_TOKEN_FAILED",
    );
  }

  return {
    txnToken: result.body.txnToken,
    mid: config.merchant_id,
    orderId,
    amount: amount.toFixed(2),
  };
}

export async function getPaytmTransaction(
  config: PaytmConfig,
  orderId: string,
): Promise<PaytmTransaction> {
  const base = paytmBase(config.environment);

  const body = {
    mid: config.merchant_id,
    orderId,
  };

  const signature = await createPaytmSignature(
    body,
    config.merchant_key,
  );

  const response = await fetch(`${base}/v3/order/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body,
      head: { signature },
    }),
  });

  if (!response.ok) {
    throw new Error("PAYTM_STATUS_FAILED");
  }

  const result = await response.json() as {
    body?: PaytmTransaction;
  };

  if (!result.body) {
    throw new Error("INVALID_PAYTM_RESPONSE");
  }

  return result.body;
}

export function isSuccessfulPaytmPayment(
  transaction: PaytmTransaction,
  config: PaytmConfig,
  orderId: string,
  expectedAmount: number,
): boolean {
  return (
    transaction.STATUS === "TXN_SUCCESS" &&
    transaction.MID === config.merchant_id &&
    transaction.ORDERID === orderId &&
    transaction.CURRENCY === "INR" &&
    Number(transaction.TXNAMOUNT) === expectedAmount &&
    !!transaction.TXNID
  );
}
