ALTER TABLE "users" ADD COLUMN "risk_free_rate" DECIMAL(5,2) NOT NULL DEFAULT 2;
ALTER TABLE "users" ADD CONSTRAINT "users_risk_free_rate_range" CHECK ("risk_free_rate" >= 0 AND "risk_free_rate" <= 100);
