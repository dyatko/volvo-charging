ALTER TABLE "volvo_tokens" ALTER COLUMN "access_token_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ALTER COLUMN "refresh_token_enc" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ALTER COLUMN "scope" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "energy_token_enc" text;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "energy_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "conve_token_enc" text;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "conve_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "location_token_enc" text;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD COLUMN "location_expires_at" timestamp with time zone;