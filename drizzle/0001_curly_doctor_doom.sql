CREATE TYPE "public"."desired_length" AS ENUM('short', 'medium', 'long');--> statement-breakpoint
CREATE TYPE "public"."language_level" AS ENUM('2F', '3F', '3F+');--> statement-breakpoint
CREATE TYPE "public"."reading_goal" AS ENUM('enjoyment', 'learn', 'language', 'work');--> statement-breakpoint
CREATE TABLE "reading_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"language_level" "language_level" NOT NULL,
	"material_types" text[] NOT NULL,
	"topics" text[] NOT NULL,
	"desired_length" "desired_length" NOT NULL,
	"reading_goal" "reading_goal" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_profiles" ADD CONSTRAINT "reading_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;