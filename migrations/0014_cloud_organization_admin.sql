-- M7 final UAT hardening — authoritative organization administration metadata.
-- Organization business/profile fields live in metadata_json while identity/scope fields remain normalized.

ALTER TABLE core_organizations ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
