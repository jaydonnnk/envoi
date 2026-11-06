-- Rollback of migration 0031, run by hand only with the deploy rolled back to the commit before it.
-- Not a drizzle migration: remove 0031's journal row by hand too if it must be applied again.
-- Refuses while a crypto attempt holds a state the restored capture key check forbids.
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_crypto_no_capture_key_check";
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_paypal_funding_check";
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_capture_key_check";
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_capture_key_check" CHECK ("payment_attempts"."state" not in ('capture_dispatched', 'capture_confirmed', 'capture_unknown') or "payment_attempts"."capture_request_id" is not null);
ALTER TABLE "payment_attempts" DROP COLUMN "paypal_funding";
