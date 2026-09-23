-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "fulfilment_mode" AS ENUM ('inquiry', 'instant');

-- CreateEnum
CREATE TYPE "confirmation_type" AS ENUM ('instant', 'manual');

-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('new', 'assigned', 'contacted', 'quoted', 'negotiating', 'payment_pending', 'won', 'lost', 'spam');

-- CreateEnum
CREATE TYPE "inquiry_source" AS ENUM ('inquiry_form', 'whatsapp', 'concierge', 'contact_form', 'quote_request', 'agent_created', 'abandoned_cart');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('customer', 'agent', 'admin', 'system', 'supplier');

-- CreateEnum
CREATE TYPE "inquiry_event_kind" AS ENUM ('status', 'note', 'assignment', 'contact', 'item', 'system');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('INR', 'AED');

-- CreateEnum
CREATE TYPE "admin_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "agent_status" AS ENUM ('available', 'busy', 'away', 'offline');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('whatsapp', 'email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed', 'suppressed');

-- CreateEnum
CREATE TYPE "consent_channel" AS ENUM ('whatsapp', 'email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "consent_purpose" AS ENUM ('transactional', 'marketing', 'recovery');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_payment', 'payment_failed', 'paid', 'supplier_pending', 'confirmed', 'partially_confirmed', 'cancelled', 'refunded', 'completed');

-- CreateEnum
CREATE TYPE "order_item_status" AS ENUM ('pending', 'confirmed', 'rejected', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "rail" AS ENUM ('self_serve', 'assisted');

-- CreateEnum
CREATE TYPE "payment_collection" AS ENUM ('gateway', 'manual_link', 'bank_transfer');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "supplier_source" AS ENUM ('direct', 'api', 'portal');

-- CreateEnum
CREATE TYPE "supplier_status" AS ENUM ('active', 'paused', 'terminated');

-- CreateEnum
CREATE TYPE "analytics_source" AS ENUM ('client', 'server');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('running', 'succeeded', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "wa_conversation_status" AS ENUM ('open', 'pending', 'resolved', 'snoozed');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret_encrypted" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "admin_status" NOT NULL DEFAULT 'active',
    "whatsapp_display_name" TEXT,
    "photo_url" TEXT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "admin_user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("admin_user_id","role_id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_availability" (
    "agent_id" UUID NOT NULL,
    "status" "agent_status" NOT NULL DEFAULT 'available',
    "max_concurrent" INTEGER NOT NULL DEFAULT 8,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shift" TEXT NOT NULL DEFAULT 'IST',
    "title" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_availability_pkey" PRIMARY KEY ("agent_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_pct" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "supplier_source" NOT NULL,
    "adapter" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '{}',
    "contact_name" TEXT,
    "contact_whatsapp" TEXT,
    "contact_email" TEXT,
    "emergency_phone" TEXT,
    "reliability_score" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "status" "supplier_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tier" CHAR(1) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'published',
    "category_slug" TEXT NOT NULL,
    "confirmation" "confirmation_type" NOT NULL,
    "fulfilment_mode" "fulfilment_mode" NOT NULL DEFAULT 'inquiry',
    "quote_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combos" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" CHAR(1) NOT NULL DEFAULT 'C',
    "status" TEXT NOT NULL DEFAULT 'published',
    "confirmation" "confirmation_type" NOT NULL,
    "fulfilment_mode" "fulfilment_mode" NOT NULL DEFAULT 'inquiry',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_supplier_mappings" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "variant_code" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "external_ref" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_supplier_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "inquiry_status" NOT NULL DEFAULT 'new',
    "source" "inquiry_source" NOT NULL,
    "channel_preference" TEXT,
    "lead_name" TEXT NOT NULL,
    "lead_phone" TEXT NOT NULL,
    "lead_email" TEXT,
    "country_code" TEXT NOT NULL,
    "whatsapp_consent" BOOLEAN NOT NULL DEFAULT true,
    "travel_date_from" DATE,
    "travel_date_to" DATE,
    "dates_flexible" BOOLEAN NOT NULL DEFAULT false,
    "pax" JSONB,
    "hotel" TEXT,
    "pickup_zone" TEXT,
    "dietary" TEXT,
    "special_requests" TEXT,
    "budget_band" TEXT,
    "currency" "currency" NOT NULL DEFAULT 'INR',
    "indicative_total_inr" BIGINT NOT NULL DEFAULT 0,
    "indicative_total_aed" BIGINT NOT NULL DEFAULT 0,
    "indicative_net_cost_aed" BIGINT NOT NULL DEFAULT 0,
    "assigned_agent_id" UUID,
    "assigned_at" TIMESTAMPTZ(6),
    "sla_due_at" TIMESTAMPTZ(6),
    "sla_breached_at" TIMESTAMPTZ(6),
    "escalated_at" TIMESTAMPTZ(6),
    "first_response_at" TIMESTAMPTZ(6),
    "last_contact_at" TIMESTAMPTZ(6),
    "next_followup_at" TIMESTAMPTZ(6),
    "followup_stage" INTEGER NOT NULL DEFAULT 0,
    "ack_sent_at" TIMESTAMPTZ(6),
    "converted_order_id" UUID,
    "lost_reason" TEXT,
    "lost_at" TIMESTAMPTZ(6),
    "attribution" JSONB,
    "session_id" TEXT,
    "anon_id" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "spam_signals" JSONB,
    "wa_conversation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_items" (
    "id" UUID NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "product_id" UUID,
    "combo_id" UUID,
    "variant_code" TEXT,
    "service_date" DATE,
    "timeslot" TEXT,
    "pax" JSONB NOT NULL,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "title_snapshot" TEXT NOT NULL,
    "tier_snapshot" CHAR(1) NOT NULL,
    "slug_snapshot" TEXT NOT NULL,
    "kind_snapshot" TEXT NOT NULL,
    "image_snapshot" TEXT,
    "variant_name_snapshot" TEXT,
    "confirmation_snapshot" "confirmation_type" NOT NULL,
    "fulfilment_mode_snapshot" "fulfilment_mode" NOT NULL,
    "free_cancellation_hours_snapshot" INTEGER NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "indicative_unit_inr" BIGINT NOT NULL,
    "indicative_unit_aed" BIGINT NOT NULL,
    "indicative_total_inr" BIGINT NOT NULL,
    "indicative_total_aed" BIGINT NOT NULL,
    "indicative_net_cost_aed" BIGINT NOT NULL DEFAULT 0,
    "confirmed_total_inr" BIGINT,
    "confirmed_total_aed" BIGINT,
    "confirmed_net_cost_aed" BIGINT,
    "availability_checked_at" TIMESTAMPTZ(6),
    "availability_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inquiry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_events" (
    "id" BIGSERIAL NOT NULL,
    "inquiry_id" UUID NOT NULL,
    "kind" "inquiry_event_kind" NOT NULL DEFAULT 'status',
    "from_status" "inquiry_status",
    "to_status" "inquiry_status",
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppressed_phones" (
    "phone_e164" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "added_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppressed_phones_pkey" PRIMARY KEY ("phone_e164")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT,
    "email" TEXT,
    "channel" "consent_channel" NOT NULL,
    "purpose" "consent_purpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "email" TEXT,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending_payment',
    "rail" "rail" NOT NULL,
    "guest_id" UUID,
    "created_by_agent" UUID,
    "source_inquiry_id" UUID,
    "payment_collection" "payment_collection" NOT NULL DEFAULT 'gateway',
    "currency" "currency" NOT NULL,
    "subtotal_inr" BIGINT NOT NULL,
    "subtotal_aed" BIGINT NOT NULL,
    "discount_inr" BIGINT NOT NULL DEFAULT 0,
    "discount_aed" BIGINT NOT NULL DEFAULT 0,
    "tax_inr" BIGINT NOT NULL DEFAULT 0,
    "tax_aed" BIGINT NOT NULL DEFAULT 0,
    "total_inr" BIGINT NOT NULL,
    "total_aed" BIGINT NOT NULL,
    "net_cost_aed" BIGINT NOT NULL DEFAULT 0,
    "coupon_code" TEXT,
    "lead_name" TEXT NOT NULL,
    "lead_email" TEXT,
    "lead_phone" TEXT NOT NULL,
    "hotel" TEXT,
    "pickup_zone" TEXT,
    "dietary" TEXT,
    "special_requests" TEXT,
    "payment_mode" TEXT NOT NULL DEFAULT 'full',
    "idempotency_key" TEXT,
    "placed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "combo_id" UUID,
    "variant_code" TEXT,
    "mapping_id" UUID,
    "title_snapshot" TEXT NOT NULL,
    "tier_snapshot" CHAR(1) NOT NULL,
    "slug_snapshot" TEXT NOT NULL,
    "kind_snapshot" TEXT NOT NULL,
    "image_snapshot" TEXT,
    "variant_name_snapshot" TEXT,
    "inclusions_snapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cancellation_policy_snapshot" JSONB NOT NULL DEFAULT '{}',
    "confirmation_snapshot" "confirmation_type" NOT NULL,
    "fulfilment_mode_snapshot" "fulfilment_mode" NOT NULL,
    "free_cancellation_hours_snapshot" INTEGER NOT NULL,
    "duration_minutes_snapshot" INTEGER NOT NULL,
    "service_date" DATE NOT NULL,
    "timeslot" TEXT,
    "pax" JSONB NOT NULL,
    "addons" JSONB NOT NULL DEFAULT '[]',
    "unit_inr" BIGINT NOT NULL,
    "unit_aed" BIGINT NOT NULL,
    "total_inr" BIGINT NOT NULL,
    "total_aed" BIGINT NOT NULL,
    "net_cost_aed" BIGINT NOT NULL DEFAULT 0,
    "status" "order_item_status" NOT NULL DEFAULT 'pending',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_attribution" (
    "order_id" UUID NOT NULL,
    "first_source" TEXT,
    "first_medium" TEXT,
    "first_campaign" TEXT,
    "first_touch_at" TIMESTAMPTZ(6),
    "last_source" TEXT,
    "last_medium" TEXT,
    "last_campaign" TEXT,
    "last_touch_at" TIMESTAMPTZ(6),
    "fbclid" TEXT,
    "fbc" TEXT,
    "fbp" TEXT,
    "gclid" TEXT,
    "wa_conversation_id" UUID,
    "uploaded_to_meta_at" TIMESTAMPTZ(6),

    CONSTRAINT "order_attribution_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "gateway_order_id" TEXT,
    "gateway_payment_id" TEXT,
    "payment_link_id" TEXT,
    "payment_link_url" TEXT,
    "method" TEXT,
    "amount_minor" BIGINT NOT NULL,
    "currency" "currency" NOT NULL,
    "status" "payment_status" NOT NULL,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "is_deposit" BOOLEAN NOT NULL DEFAULT false,
    "fee_minor" BIGINT,
    "tax_on_fee_minor" BIGINT,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_conversations" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "bsp_conversation_id" TEXT,
    "status" "wa_conversation_status" NOT NULL DEFAULT 'open',
    "assigned_agent_id" UUID,
    "intent" TEXT,
    "entry_context" JSONB,
    "attribution" JSONB,
    "csw_expires_at" TIMESTAMPTZ(6),
    "free_entry_window_expires_at" TIMESTAMPTZ(6),
    "first_response_at" TIMESTAMPTZ(6),
    "last_message_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "inquiry_id" UUID,
    "order_id" UUID,
    "template" TEXT,
    "payload" JSONB,
    "status" "notification_status" NOT NULL,
    "suppressed_reason" TEXT,
    "provider_id" TEXT,
    "provider_error" TEXT,
    "cost_minor" BIGINT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduled_for" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processing_error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,
    "anon_id" TEXT,
    "inquiry_id" UUID,
    "order_id" UUID,
    "product_slug" TEXT,
    "rail" TEXT,
    "tier" CHAR(1),
    "value_minor" BIGINT,
    "currency" TEXT,
    "props" JSONB NOT NULL DEFAULT '{}',
    "source" "analytics_source" NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "geo_country" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'development',
    "forwarded_meta" BOOLEAN NOT NULL DEFAULT false,
    "forwarded_posthog" BOOLEAN NOT NULL DEFAULT false,
    "forwarded_ga4" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "bucket_key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("bucket_key","window_start")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "locked_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "job_executions" (
    "id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" "job_status" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "payload" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_status_idx" ON "admin_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "admin_sessions_user_idx" ON "admin_sessions"("admin_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "admin_sessions_refresh_idx" ON "admin_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_tier_status_idx" ON "products"("tier", "status");

-- CreateIndex
CREATE UNIQUE INDEX "combos_slug_key" ON "combos"("slug");

-- CreateIndex
CREATE INDEX "psm_product_priority_idx" ON "product_supplier_mappings"("product_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "product_supplier_mappings_product_id_supplier_id_variant_co_key" ON "product_supplier_mappings"("product_id", "supplier_id", "variant_code");

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_reference_key" ON "inquiries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_converted_order_id_key" ON "inquiries"("converted_order_id");

-- CreateIndex
CREATE INDEX "inquiries_status_sla_idx" ON "inquiries"("status", "sla_due_at");

-- CreateIndex
CREATE INDEX "inquiries_agent_status_idx" ON "inquiries"("assigned_agent_id", "status");

-- CreateIndex
CREATE INDEX "inquiries_lead_phone_idx" ON "inquiries"("lead_phone");

-- CreateIndex
CREATE INDEX "inquiries_created_idx" ON "inquiries"("created_at" DESC);

-- CreateIndex
CREATE INDEX "inquiries_followup_idx" ON "inquiries"("next_followup_at");

-- CreateIndex
CREATE INDEX "inquiry_items_inquiry_idx" ON "inquiry_items"("inquiry_id");

-- CreateIndex
CREATE INDEX "inquiry_items_product_idx" ON "inquiry_items"("product_id");

-- CreateIndex
CREATE INDEX "inquiry_events_inquiry_idx" ON "inquiry_events"("inquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "consents_phone_idx" ON "consents"("phone_e164", "channel", "created_at" DESC);

-- CreateIndex
CREATE INDEX "guests_phone_idx" ON "guests"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

-- CreateIndex
CREATE INDEX "orders_status_placed_idx" ON "orders"("status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_lead_phone_idx" ON "orders"("lead_phone");

-- CreateIndex
CREATE INDEX "orders_rail_placed_idx" ON "orders"("rail", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "orders_source_inquiry_idx" ON "orders"("source_inquiry_id");

-- CreateIndex
CREATE INDEX "order_items_order_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_service_date_idx" ON "order_items"("service_date");

-- CreateIndex
CREATE INDEX "order_attribution_meta_upload_idx" ON "order_attribution"("uploaded_to_meta_at");

-- CreateIndex
CREATE INDEX "payments_order_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "wa_conversations_phone_idx" ON "wa_conversations"("phone_e164");

-- CreateIndex
CREATE INDEX "wa_conversations_status_idx" ON "wa_conversations"("status", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_inquiry_event_idx" ON "notifications"("inquiry_id", "event");

-- CreateIndex
CREATE INDEX "notifications_status_sched_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_key" ON "webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "analytics_events_name_idx" ON "analytics_events"("name", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "analytics_events_session_idx" ON "analytics_events"("session_id");

-- CreateIndex
CREATE INDEX "analytics_events_inquiry_idx" ON "analytics_events"("inquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_event_id_source_key" ON "analytics_events"("event_id", "source");

-- CreateIndex
CREATE INDEX "rate_limit_expires_idx" ON "rate_limit_buckets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "job_executions_job_type_dedupe_key_key" ON "job_executions"("job_type", "dedupe_key");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_mappings" ADD CONSTRAINT "product_supplier_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_supplier_mappings" ADD CONSTRAINT "product_supplier_mappings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_wa_conversation_id_fkey" FOREIGN KEY ("wa_conversation_id") REFERENCES "wa_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_items" ADD CONSTRAINT "inquiry_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_events" ADD CONSTRAINT "inquiry_events_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_agent_fkey" FOREIGN KEY ("created_by_agent") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_attribution" ADD CONSTRAINT "order_attribution_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written section — constraints Prisma cannot express (§05.3 preamble:
-- "those are the ones that protect money, so do not skip them").
-- ============================================================================

-- Human-facing references: sequence + Luhn check digit (§05.1 rule 7).
CREATE SEQUENCE IF NOT EXISTS inquiry_ref_seq START WITH 10482;
CREATE SEQUENCE IF NOT EXISTS order_ref_seq   START WITH 48291;

-- Inquiry state guards (§17 §7.1)
ALTER TABLE "inquiries"
  ADD CONSTRAINT inquiry_dates_ordered
    CHECK (travel_date_to IS NULL OR travel_date_from IS NULL OR travel_date_to >= travel_date_from),
  ADD CONSTRAINT inquiry_totals_non_negative
    CHECK (indicative_total_inr >= 0 AND indicative_total_aed >= 0 AND indicative_net_cost_aed >= 0),
  ADD CONSTRAINT inquiry_lost_has_reason
    CHECK (status <> 'lost' OR lost_reason IS NOT NULL),
  ADD CONSTRAINT inquiry_won_has_order
    CHECK (status <> 'won' OR converted_order_id IS NOT NULL),
  ADD CONSTRAINT inquiry_followup_stage_range
    CHECK (followup_stage BETWEEN 0 AND 4);

-- Queue indexes: the open queue and value triage are partial (§17 §6.1)
CREATE INDEX inquiries_open_queue_idx ON "inquiries" (status, sla_due_at)
  WHERE status IN ('new', 'assigned');
CREATE INDEX inquiries_value_triage_idx ON "inquiries" (indicative_total_inr DESC)
  WHERE status = 'new';

ALTER TABLE "inquiry_items"
  ADD CONSTRAINT inquiry_item_has_product
    CHECK (product_id IS NOT NULL OR combo_id IS NOT NULL),
  ADD CONSTRAINT inquiry_item_totals_non_negative
    CHECK (indicative_unit_inr >= 0 AND indicative_total_inr >= 0 AND indicative_total_aed >= 0);

-- Orders (§05.3.5) — retained shape, dormant until an agent wins an inquiry
ALTER TABLE "orders"
  ADD CONSTRAINT order_has_buyer CHECK (guest_id IS NOT NULL),
  ADD CONSTRAINT order_totals_consistent
    CHECK (total_inr = subtotal_inr - discount_inr + tax_inr
       AND total_aed = subtotal_aed - discount_aed + tax_aed);
CREATE UNIQUE INDEX orders_idem ON "orders" (idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE "order_items"
  ADD CONSTRAINT order_item_has_product
    CHECK (product_id IS NOT NULL OR combo_id IS NOT NULL);

-- Append-only tables (§13.10): enforced by trigger so it holds for every role,
-- including the table owner. REVOKE at the grant level is applied additionally
-- when a dedicated application role exists.
CREATE OR REPLACE FUNCTION outly_raise_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION outly_raise_immutable();
CREATE TRIGGER inquiry_events_immutable BEFORE UPDATE OR DELETE ON "inquiry_events"
  FOR EACH ROW EXECUTE FUNCTION outly_raise_immutable();
CREATE TRIGGER consents_immutable BEFORE UPDATE OR DELETE ON "consents"
  FOR EACH ROW EXECUTE FUNCTION outly_raise_immutable();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'outly_app') THEN
    REVOKE UPDATE, DELETE ON "audit_logs", "inquiry_events", "consents" FROM outly_app;
  END IF;
END $$;
