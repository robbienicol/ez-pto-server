ALTER TABLE "audios" ALTER COLUMN "tones" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audios" ALTER COLUMN "tones" SET DATA TYPE text USING (array_to_string("tones", ', '));--> statement-breakpoint
ALTER TABLE "audios" ALTER COLUMN "tones" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "audios" ALTER COLUMN "tones" SET NOT NULL;
