CREATE TABLE "geocode_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"q_lat" double precision NOT NULL,
	"q_lng" double precision NOT NULL,
	"city" text,
	"area" text,
	"label" text,
	"language" text DEFAULT 'local' NOT NULL,
	"response_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "geocode_cache_qlatlng_idx" ON "geocode_cache" USING btree ("q_lat","q_lng");