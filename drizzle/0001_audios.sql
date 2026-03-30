CREATE TABLE "audios" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text,
	"topic" text NOT NULL,
	"title" text NOT NULL,
	"script" text,
	"audio_url" text,
	"length_minutes" integer,
	"format" text NOT NULL,
	"tones" text[] DEFAULT '{}'::text[] NOT NULL,
	"radio_style" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
