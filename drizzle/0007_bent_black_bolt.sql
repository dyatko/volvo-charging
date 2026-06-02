ALTER TABLE "vehicles" ADD COLUMN "last_polled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "last_error" text;