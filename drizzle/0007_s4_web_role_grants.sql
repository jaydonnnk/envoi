-- Custom SQL migration file, put your code below! --
-- S4 grants for the least-privileged web role (Gate 4 delta D7): the public-route limiter rows (D9).
-- Admission counts and inserts its own rows and prunes rows older than the longest window; no
-- update is ever needed.
GRANT SELECT, INSERT, DELETE ON TABLE public."rate_limit_hits" TO envoi_web;
