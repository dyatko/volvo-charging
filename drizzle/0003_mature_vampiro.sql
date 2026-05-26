ALTER TABLE "vehicles" ADD COLUMN "current_lat" double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "current_lng" double precision;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "location_updated_at" timestamp with time zone;