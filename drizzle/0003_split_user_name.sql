ALTER TABLE "users" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "infix" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Existing accounts: the first word of the name becomes the first name, the rest the last name.
-- A tussenvoegsel ends up in the last name; users can correct that in the settings.
UPDATE "users"
SET "first_name" = split_part(btrim("name"), ' ', 1),
    "last_name" = btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1))
WHERE "first_name" = '';
