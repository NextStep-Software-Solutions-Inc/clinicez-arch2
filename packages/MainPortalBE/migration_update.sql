START TRANSACTION;
ALTER TABLE main."Tenants" ADD "SubscriptionId" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "SubscriptionPlanId" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "SubscriptionStatus" text NOT NULL DEFAULT '';

ALTER TABLE main."Tenants" ADD "XenditCustomerId" text NOT NULL DEFAULT '';

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260709192544_AddXenditSubscriptionFields', '10.0.9');

COMMIT;

