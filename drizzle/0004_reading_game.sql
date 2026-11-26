CREATE TYPE "public"."advice_source" AS ENUM('ai', 'rules');--> statement-breakpoint
CREATE TYPE "public"."reading_list_source" AS ENUM('advice', 'catalog', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."xp_reason" AS ENUM('profile', 'added', 'read', 'rated');--> statement-breakpoint
CREATE TABLE "advice_suggestions" (
	"user_id" uuid NOT NULL,
	"book_id" text NOT NULL,
	"source" "advice_source" NOT NULL,
	"first_shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_shown_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advice_suggestions_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "book_ratings" (
	"user_id" uuid NOT NULL,
	"book_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"source" "reading_list_source",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_ratings_user_id_book_id_pk" PRIMARY KEY("user_id","book_id"),
	CONSTRAINT "book_ratings_stars" CHECK ("book_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" "xp_reason" NOT NULL,
	"book_id" text DEFAULT '' NOT NULL,
	"xp" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_events_once" UNIQUE("user_id","reason","book_id")
);
--> statement-breakpoint
ALTER TABLE "reading_list_items" ADD COLUMN "source" "reading_list_source";--> statement-breakpoint
ALTER TABLE "advice_suggestions" ADD CONSTRAINT "advice_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_ratings" ADD CONSTRAINT "book_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Existing students keep what they already did: XP for a saved reading profile, for every title on
-- the reading list and for every title they read, dated to when it happened.
INSERT INTO "xp_events" ("user_id", "reason", "book_id", "xp", "created_at")
SELECT "user_id", 'profile', '', 50, "created_at" FROM "reading_profiles"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "xp_events" ("user_id", "reason", "book_id", "xp", "created_at")
SELECT "user_id", 'added', "book_id", 10, "added_at" FROM "reading_list_items"
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "xp_events" ("user_id", "reason", "book_id", "xp", "created_at")
SELECT "user_id", 'read', "book_id", 40, COALESCE("read_at", "added_at") FROM "reading_list_items"
WHERE "status" = 'read'
ON CONFLICT DO NOTHING;
