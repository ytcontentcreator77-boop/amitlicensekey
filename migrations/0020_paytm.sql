
CREATE TABLE IF NOT EXISTS paytm_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  order_id TEXT NOT NULL UNIQUE,

  user_id INTEGER NOT NULL,

  amount_inr REAL NOT NULL
    CHECK(amount_inr > 0),

  txn_id TEXT UNIQUE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN (
      'pending',
      'paid',
      'failed',
      'cancelled'
    )),

  created_at INTEGER NOT NULL,

  paid_at INTEGER,

  raw_response TEXT
);

CREATE INDEX IF NOT EXISTS
  idx_paytm_payments_user
ON paytm_payments(user_id, id DESC);

CREATE INDEX IF NOT EXISTS
  idx_paytm_payments_status
ON paytm_payments(status, created_at);

CREATE INDEX IF NOT EXISTS
  idx_paytm_payments_txn
ON paytm_payments(txn_id);
