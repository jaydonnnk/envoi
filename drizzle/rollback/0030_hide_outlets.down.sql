-- Rollback of migration 0030, run by hand only with the deploy rolled back to the commit before it.
-- Not a drizzle migration: remove 0030's journal row by hand too if it must be applied again.
ALTER TABLE "outlets" DROP COLUMN "hidden_at";
