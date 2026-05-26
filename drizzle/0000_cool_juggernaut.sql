CREATE TABLE "charging_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vin" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"start_soc" smallint NOT NULL,
	"end_soc" smallint,
	"energy_kwh" real,
	"peak_power_kw" real,
	"connection_type" text,
	"start_lat" double precision,
	"start_lng" double precision,
	"end_lat" double precision,
	"end_lng" double precision,
	"is_open" boolean DEFAULT true NOT NULL,
	"derived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_snapshots" (
	"vin" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"soc" smallint,
	"range_km" smallint,
	"connection_status" text,
	"charging_status" text,
	"charging_type" text,
	"charger_power_status" text,
	"charging_power_kw" real,
	"target_soc" smallint,
	"current_limit_a" smallint
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"vin" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text,
	"model_year" smallint,
	"fuel_type" text,
	"external_colour" text,
	"battery_capacity_kwh" real,
	"exterior_image_url" text,
	"capabilities_json" jsonb,
	"last_seen_at" timestamp with time zone,
	"next_poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volvo_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"vcc_api_key_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volvo_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "charging_sessions" ADD CONSTRAINT "charging_sessions_vin_vehicles_vin_fk" FOREIGN KEY ("vin") REFERENCES "public"."vehicles"("vin") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_snapshots" ADD CONSTRAINT "state_snapshots_vin_vehicles_vin_fk" FOREIGN KEY ("vin") REFERENCES "public"."vehicles"("vin") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volvo_credentials" ADD CONSTRAINT "volvo_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volvo_tokens" ADD CONSTRAINT "volvo_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charging_sessions_vin_started_idx" ON "charging_sessions" USING btree ("vin","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charging_sessions_open_per_vin_idx" ON "charging_sessions" USING btree ("vin") WHERE "is_open" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "state_snapshots_vin_observed_idx" ON "state_snapshots" USING btree ("vin","observed_at");--> statement-breakpoint
CREATE INDEX "vehicles_user_idx" ON "vehicles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vehicles_next_poll_idx" ON "vehicles" USING btree ("next_poll_at");