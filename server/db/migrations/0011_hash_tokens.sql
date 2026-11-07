-- Session and invite tokens are now stored as SHA-256 digests (see
-- lib/auth/tokens.ts). Rows written before this hold the raw token, which no
-- longer matches any lookup — and is exactly what shouldn't sit in backups.
-- Clearing them signs everyone out once; unused invite/reset links stop
-- working and need resending from the People page.
DELETE FROM `sessions`;--> statement-breakpoint
DELETE FROM `invites` WHERE `used_at` IS NULL;
