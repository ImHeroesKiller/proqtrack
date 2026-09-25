-- Settings P1 — authoritative profile identity.
-- Additive migration: global login identity gains a user-managed display name.
ALTER TABLE auth_users ADD COLUMN display_name TEXT;
