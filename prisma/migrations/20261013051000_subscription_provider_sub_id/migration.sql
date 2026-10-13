-- B9: one subscription identity per provider. Existing providerSubId uniqueness stays.
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_provider_providerSubId_key"
  ON "Subscription" ("provider", "providerSubId");
