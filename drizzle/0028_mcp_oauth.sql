CREATE TABLE "mcp_acces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"hote" text NOT NULL,
	"portee" text NOT NULL,
	"acces_hash" text NOT NULL,
	"acces_expire_le" timestamp with time zone NOT NULL,
	"rafraichissement_hash" text NOT NULL,
	"precedent_hash" text,
	"rafraichissement_expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilise_le" timestamp with time zone,
	CONSTRAINT "mcp_acces_acces_hash_unique" UNIQUE("acces_hash"),
	CONSTRAINT "mcp_acces_rafraichissement_hash_unique" UNIQUE("rafraichissement_hash"),
	CONSTRAINT "mcp_acces_precedent_hash_unique" UNIQUE("precedent_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text,
	"methode" text NOT NULL,
	"nom" text NOT NULL,
	"retours" jsonb NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"retour" text NOT NULL,
	"defi" text NOT NULL,
	"portee" text NOT NULL,
	"ressource" text,
	"expire_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_acces" ADD CONSTRAINT "mcp_acces_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_acces" ADD CONSTRAINT "mcp_acces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_client_id_mcp_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_codes" ADD CONSTRAINT "mcp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_acces_user_idx" ON "mcp_acces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_clients_cree_idx" ON "mcp_clients" USING btree ("cree_le");