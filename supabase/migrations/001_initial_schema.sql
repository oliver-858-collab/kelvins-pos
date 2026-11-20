-- ============================================================
-- KELVIN'S POS SYSTEM - Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Database: Supabase / PostgreSQL
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE account_status AS ENUM ('pending', 'active', 'suspended', 'rejected');

CREATE TYPE role_type AS ENUM ('super_admin', 'manager', 'cashier', 'storekeeper', 'custom');

CREATE TYPE wage_type AS ENUM ('hourly', 'daily', 'weekly', 'monthly', 'commission', 'hybrid');

CREATE TYPE sale_status AS ENUM ('pending', 'completed', 'held', 'voided', 'refunded');

CREATE TYPE payment_status AS ENUM ('pending', 'partial', 'paid', 'overdue');

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE stock_adjustment_reason AS ENUM (
    'damage', 'loss', 'expiry', 'theft', 'correction', 'return', 'transfer'
);

CREATE TYPE service_job_status AS ENUM (
    'quoted', 'accepted', 'in_progress', 'completed', 'paid', 'cancelled'
);

CREATE TYPE notification_type AS ENUM (
    'sale', 'approval_request', 'approval_result', 'low_stock', 'out_of_stock',
    'payment', 'overdue_debt', 'attendance', 'new_account', 'payroll',
    'price_override', 'void', 'suspicious_activity', 'system'
);

CREATE TYPE expense_frequency AS ENUM ('once', 'daily', 'weekly', 'monthly', 'yearly');

CREATE TYPE purchase_order_status AS ENUM (
    'draft', 'sent', 'partial', 'received', 'cancelled'
);

CREATE TYPE approval_type AS ENUM (
    'price_negotiation', 'refund', 'void', 'stock_adjustment', 'expense',
    'payroll', 'advance', 'leave', 'account', 'credit_override',
    'write_off', 'po_approval', 'price_change'
);

CREATE TYPE tax_class AS ENUM ('exempt', 'standard', 'zero');

CREATE TYPE login_status AS ENUM ('success', 'failed');

CREATE TYPE stock_entry_type AS ENUM (
    'purchase', 'sale', 'adjustment', 'transfer', 'return'
);

CREATE TYPE stock_take_status AS ENUM ('in_progress', 'completed');

CREATE TYPE stock_adjustment_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE category_type AS ENUM ('product', 'service');

CREATE TYPE shift_status AS ENUM ('open', 'closed');

CREATE TYPE attendance_status AS ENUM (
    'present', 'absent', 'late', 'half_day', 'leave', 'holiday'
);

CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE advance_status AS ENUM ('pending', 'approved', 'rejected', 'repaying', 'settled');

CREATE TYPE payroll_status AS ENUM ('draft', 'approved', 'paid');

CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'paid');

CREATE TYPE receipt_type AS ENUM (
    'sale', 'invoice', 'quotation', 'credit_note', 'debit_note'
);

CREATE TYPE service_pricing_type AS ENUM ('fixed', 'hourly', 'per_unit', 'quote');

CREATE TYPE cash_transaction_type AS ENUM ('in', 'out');

CREATE TYPE pay_period_type AS ENUM ('weekly', 'biweekly', 'monthly');

CREATE TYPE contract_type AS ENUM ('full_time', 'part_time', 'contract', 'casual');

CREATE TYPE creditor_status AS ENUM ('pending', 'partial', 'paid', 'overdue');

-- ============================================================
-- TABLE 1: shop_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_settings (
    id                        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_name                 TEXT        NOT NULL DEFAULT 'Kelvin''s Shop',
    shop_tagline              TEXT,
    logo_url                  TEXT,
    address                   TEXT,
    city                      TEXT,
    country                   TEXT        NOT NULL DEFAULT 'Kenya',
    phone                     TEXT,
    email                     TEXT,
    website                   TEXT,
    currency                  TEXT        NOT NULL DEFAULT 'KES',
    currency_symbol           TEXT        NOT NULL DEFAULT 'KSh',
    timezone                  TEXT        NOT NULL DEFAULT 'Africa/Nairobi',
    tax_rate                  NUMERIC(5,2) NOT NULL DEFAULT 16.00,
    tax_name                  TEXT        NOT NULL DEFAULT 'VAT',
    tax_pin                   TEXT,                           -- KRA PIN
    kra_pin                   TEXT,
    business_registration     TEXT,
    receipt_footer            TEXT,
    receipt_header            TEXT,
    receipt_show_logo         BOOLEAN     NOT NULL DEFAULT TRUE,
    receipt_show_tax          BOOLEAN     NOT NULL DEFAULT TRUE,
    receipt_copies            INTEGER     NOT NULL DEFAULT 1,
    allow_credit_sales        BOOLEAN     NOT NULL DEFAULT TRUE,
    default_credit_days       INTEGER     NOT NULL DEFAULT 30,
    low_stock_threshold       INTEGER     NOT NULL DEFAULT 5,
    approval_threshold_price  NUMERIC(12,2) NOT NULL DEFAULT 500.00,  -- price negotiation above this needs approval
    approval_threshold_refund NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    approval_threshold_expense NUMERIC(12,2) NOT NULL DEFAULT 5000.00,
    allow_negative_stock      BOOLEAN     NOT NULL DEFAULT FALSE,
    require_customer_for_credit BOOLEAN   NOT NULL DEFAULT TRUE,
    pos_require_pin           BOOLEAN     NOT NULL DEFAULT FALSE,
    shift_require_float       BOOLEAN     NOT NULL DEFAULT TRUE,
    working_hours_start       TIME        NOT NULL DEFAULT '08:00:00',
    working_hours_end         TIME        NOT NULL DEFAULT '18:00:00',
    payroll_day               INTEGER     NOT NULL DEFAULT 25,
    fiscal_year_start         DATE        NOT NULL DEFAULT '2024-01-01',
    extra_settings            JSONB,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 2: roles
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL UNIQUE,
    description     TEXT,
    role_type       role_type   NOT NULL DEFAULT 'custom',
    is_system_role  BOOLEAN     NOT NULL DEFAULT FALSE,
    permissions     JSONB       NOT NULL DEFAULT '{}'::JSONB,
    -- permissions structure: { "module": { "view": bool, "create": bool, "edit": bool, "delete": bool, "approve": bool } }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 3: users (profile extension of auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                  UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name           TEXT        NOT NULL,
    email               TEXT        NOT NULL UNIQUE,
    phone               TEXT,
    avatar_url          TEXT,
    role_id             UUID        REFERENCES roles(id) ON DELETE SET NULL,
    account_status      account_status NOT NULL DEFAULT 'pending',
    wage_type           wage_type,
    wage_rate           NUMERIC(12,2),
    commission_rate     NUMERIC(5,2),   -- percentage
    pay_period          pay_period_type,
    emergency_contact   JSONB,          -- { name, phone, relationship }
    id_number           TEXT,           -- National ID / Passport
    start_date          DATE,
    notes               TEXT,
    pin_hash            TEXT,           -- Hashed PIN for POS quick-login
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    last_login          TIMESTAMPTZ,
    login_count         INTEGER     NOT NULL DEFAULT 0,
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ============================================================
-- TABLE 4: login_history
-- ============================================================
CREATE TABLE IF NOT EXISTS login_history (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address  INET,
    device_info JSONB,      -- { browser, os, device_type }
    status      login_status NOT NULL DEFAULT 'success',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 5: branches
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT        NOT NULL,
    address     TEXT,
    phone       TEXT,
    is_main     BOOLEAN     NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    manager_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 6: categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT            NOT NULL,
    slug        TEXT            NOT NULL UNIQUE,
    parent_id   UUID            REFERENCES categories(id) ON DELETE SET NULL,
    type        category_type   NOT NULL DEFAULT 'product',
    description TEXT,
    image_url   TEXT,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    sort_order  INTEGER         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 7: units_of_measure
-- ============================================================
CREATE TABLE IF NOT EXISTS units_of_measure (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT        NOT NULL,
    abbreviation        TEXT        NOT NULL,
    conversion_factor   NUMERIC(14,6) NOT NULL DEFAULT 1.0,  -- conversion to base unit
    base_unit_id        UUID        REFERENCES units_of_measure(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 8: suppliers
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL,
    contact_person  TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    payment_terms   TEXT,
    credit_limit    NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 9: products
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT        NOT NULL,
    sku                 TEXT        UNIQUE,
    barcode             TEXT        UNIQUE,
    category_id         UUID        REFERENCES categories(id) ON DELETE SET NULL,
    brand               TEXT,
    unit_id             UUID        REFERENCES units_of_measure(id) ON DELETE SET NULL,
    buying_price        NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_price           NUMERIC(12,2),   -- floor / minimum selling price
    wholesale_price     NUMERIC(12,2),
    wholesale_min_qty   INTEGER,
    tax_class           tax_class   NOT NULL DEFAULT 'standard',
    supplier_id         UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
    branch_id           UUID        REFERENCES branches(id) ON DELETE SET NULL,
    location_shelf      TEXT,
    description         TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    is_service          BOOLEAN     NOT NULL DEFAULT FALSE,
    track_stock         BOOLEAN     NOT NULL DEFAULT TRUE,
    reorder_level       INTEGER     NOT NULL DEFAULT 5,
    reorder_qty         INTEGER     NOT NULL DEFAULT 10,
    batch_tracking      BOOLEAN     NOT NULL DEFAULT FALSE,
    expiry_tracking     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE
);

-- ============================================================
-- TABLE 10: product_images
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 11: product_variants
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    attributes      JSONB,      -- { "size": "L", "color": "Red" }
    sku             TEXT        UNIQUE,
    barcode         TEXT        UNIQUE,
    buying_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_price       NUMERIC(12,2),
    stock_qty       INTEGER     NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 12: product_bundles
-- ============================================================
CREATE TABLE IF NOT EXISTS product_bundles (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL,
    sku             TEXT        UNIQUE,
    selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_price       NUMERIC(12,2),
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 13: bundle_items
-- ============================================================
CREATE TABLE IF NOT EXISTS bundle_items (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    bundle_id   UUID        NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
    product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

-- ============================================================
-- TABLE 14: stock_entries
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_entries (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID            NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id      UUID            REFERENCES product_variants(id) ON DELETE SET NULL,
    branch_id       UUID            NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    qty_in          NUMERIC(12,4)   NOT NULL DEFAULT 0,
    qty_out         NUMERIC(12,4)   NOT NULL DEFAULT 0,
    qty_on_hand     NUMERIC(12,4)   NOT NULL DEFAULT 0,
    batch_number    TEXT,
    expiry_date     DATE,
    buying_price    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    supplier_id     UUID            REFERENCES suppliers(id) ON DELETE SET NULL,
    reference       TEXT,
    type            stock_entry_type NOT NULL DEFAULT 'purchase',
    created_by      UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    notes           TEXT
);

-- ============================================================
-- TABLE 15: stock_adjustments
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID                    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id      UUID                    REFERENCES product_variants(id) ON DELETE SET NULL,
    branch_id       UUID                    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity        NUMERIC(12,4)           NOT NULL,  -- can be negative (reduction)
    reason          stock_adjustment_reason NOT NULL,
    notes           TEXT,
    images          JSONB,                  -- array of image URLs
    status          stock_adjustment_status NOT NULL DEFAULT 'pending',
    requested_by    UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by     UUID                    REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 16: stock_takes
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_takes (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id       UUID                NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    started_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    status          stock_take_status   NOT NULL DEFAULT 'in_progress',
    created_by      UUID                NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes           TEXT
);

-- ============================================================
-- TABLE 17: stock_take_items
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_take_items (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_take_id   UUID        NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id      UUID        REFERENCES product_variants(id) ON DELETE SET NULL,
    expected_qty    NUMERIC(12,4) NOT NULL DEFAULT 0,
    counted_qty     NUMERIC(12,4) NOT NULL DEFAULT 0,
    variance        NUMERIC(12,4) GENERATED ALWAYS AS (counted_qty - expected_qty) STORED,
    notes           TEXT
);

-- ============================================================
-- TABLE 18: purchase_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID                    NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    branch_id       UUID                    NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    status          purchase_order_status   NOT NULL DEFAULT 'draft',
    po_number       TEXT                    NOT NULL UNIQUE,
    expected_date   DATE,
    notes           TEXT,
    total_amount    NUMERIC(12,2)           NOT NULL DEFAULT 0,
    created_by      UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by     UUID                    REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 19: purchase_order_items
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id           UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id      UUID        REFERENCES product_variants(id) ON DELETE SET NULL,
    ordered_qty     NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (ordered_qty >= 0),
    received_qty    NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
    unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_price     NUMERIC(12,2) GENERATED ALWAYS AS (ordered_qty * unit_price) STORED
);

-- ============================================================
-- TABLE 20: purchase_receipts
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_receipts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_id           UUID        NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
    received_by     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT
);

-- ============================================================
-- TABLE 21: purchase_receipt_items
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_receipt_items (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_id      UUID        NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
    po_item_id      UUID        NOT NULL REFERENCES purchase_order_items(id) ON DELETE RESTRICT,
    qty_received    NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
    batch_number    TEXT,
    expiry_date     DATE
);

-- ============================================================
-- TABLE 22: customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT        NOT NULL,
    email               TEXT,
    phone               TEXT,
    address             TEXT,
    credit_limit        NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit_used         NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_terms_days  INTEGER     NOT NULL DEFAULT 0,
    notes               TEXT,
    id_number           TEXT,
    photo_url           TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 23: customer_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_payments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    sale_id         UUID,       -- FK added after sales table
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
    payment_method  TEXT        NOT NULL,
    reference       TEXT,
    notes           TEXT,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 24: sales
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_number         TEXT        NOT NULL UNIQUE,
    branch_id           UUID        NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    customer_id         UUID        REFERENCES customers(id) ON DELETE SET NULL,
    cashier_id          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status              sale_status NOT NULL DEFAULT 'pending',
    subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_paid         NUMERIC(12,2) NOT NULL DEFAULT 0,
    change_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes               TEXT,
    is_credit           BOOLEAN     NOT NULL DEFAULT FALSE,
    credit_due_date     DATE,
    hold_note           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    voided_at           TIMESTAMPTZ,
    voided_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
    void_reason         TEXT,
    refund_of_sale_id   UUID        REFERENCES sales(id) ON DELETE SET NULL,
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Now add FK from customer_payments to sales
ALTER TABLE customer_payments
    ADD CONSTRAINT fk_customer_payments_sale
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE 25: sale_items
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id             UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id          UUID        REFERENCES products(id) ON DELETE SET NULL,
    variant_id          UUID        REFERENCES product_variants(id) ON DELETE SET NULL,
    service_id          UUID,       -- FK added after services table
    service_job_id      UUID,       -- FK added after service_jobs table
    name                TEXT        NOT NULL,   -- snapshot of product name
    sku                 TEXT,                   -- snapshot of SKU
    quantity            NUMERIC(12,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
    original_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
    negotiated_price    NUMERIC(12,2),
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_pct        NUMERIC(5,2)  NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_price         NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_returned         BOOLEAN     NOT NULL DEFAULT FALSE,
    return_qty          NUMERIC(12,4) NOT NULL DEFAULT 0,
    return_reason       TEXT
);

-- ============================================================
-- TABLE 26: sale_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_payments (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id         UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payment_method  TEXT        NOT NULL,
    amount          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    reference       TEXT,
    transaction_code TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 27: price_negotiations
-- ============================================================
CREATE TABLE IF NOT EXISTS price_negotiations (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id             UUID            REFERENCES sales(id) ON DELETE CASCADE,
    sale_item_id        UUID            REFERENCES sale_items(id) ON DELETE CASCADE,
    original_price      NUMERIC(12,2)   NOT NULL,
    negotiated_price    NUMERIC(12,2)   NOT NULL,
    min_price           NUMERIC(12,2)   NOT NULL,
    discount_pct        NUMERIC(5,2)    NOT NULL DEFAULT 0,
    discount_limit      NUMERIC(5,2)    NOT NULL DEFAULT 0,
    requested_by        UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by         UUID            REFERENCES users(id) ON DELETE SET NULL,
    status              approval_status NOT NULL DEFAULT 'pending',
    reason              TEXT,
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 28: held_sales
-- ============================================================
CREATE TABLE IF NOT EXISTS held_sales (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_data   JSONB       NOT NULL,   -- full cart snapshot
    hold_note   TEXT,
    created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 29: receipts
-- ============================================================
CREATE TABLE IF NOT EXISTS receipts (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id         UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    receipt_number  TEXT        NOT NULL UNIQUE,
    type            receipt_type NOT NULL DEFAULT 'sale',
    pdf_url         TEXT,
    printed_count   INTEGER     NOT NULL DEFAULT 0,
    last_printed_at TIMESTAMPTZ,
    whatsapp_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
    email_sent      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 30: services
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
    id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT                    NOT NULL,
    description         TEXT,
    category_id         UUID                    REFERENCES categories(id) ON DELETE SET NULL,
    base_price          NUMERIC(12,2)           NOT NULL DEFAULT 0,
    min_price           NUMERIC(12,2),
    pricing_type        service_pricing_type    NOT NULL DEFAULT 'fixed',
    duration_minutes    INTEGER,
    images              JSONB,                  -- array of image URLs
    staff_ids           JSONB,                  -- array of user UUIDs
    is_active           BOOLEAN                 NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- Add FK for sale_items.service_id now that services exists
ALTER TABLE sale_items
    ADD CONSTRAINT fk_sale_items_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE 31: service_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS service_jobs (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id      UUID                NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    customer_id     UUID                REFERENCES customers(id) ON DELETE SET NULL,
    assigned_to     UUID                REFERENCES users(id) ON DELETE SET NULL,
    status          service_job_status  NOT NULL DEFAULT 'quoted',
    initial_quote   NUMERIC(12,2)       NOT NULL DEFAULT 0,
    agreed_price    NUMERIC(12,2),
    min_price       NUMERIC(12,2),
    deposit_paid    NUMERIC(12,2)       NOT NULL DEFAULT 0,
    balance_due     NUMERIC(12,2)       GENERATED ALWAYS AS
                        (COALESCE(agreed_price, initial_quote) - deposit_paid) STORED,
    notes           TEXT,
    attachments     JSONB,              -- array of { url, name, type }
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_by      UUID                NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- Add FK for sale_items.service_job_id now that service_jobs exists
ALTER TABLE sale_items
    ADD CONSTRAINT fk_sale_items_service_job
    FOREIGN KEY (service_job_id) REFERENCES service_jobs(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE 32: service_negotiations
-- ============================================================
CREATE TABLE IF NOT EXISTS service_negotiations (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id          UUID        NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
    offer_amount    NUMERIC(12,2),
    offered_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    counter_amount  NUMERIC(12,2),
    countered_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    agreed_amount   NUMERIC(12,2),
    agreed_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
    approval_id     UUID,       -- FK added after approvals table
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 33: employees
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
    id                          UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employee_number             TEXT            NOT NULL UNIQUE,
    department                  TEXT,
    position                    TEXT,
    contract_type               contract_type   NOT NULL DEFAULT 'full_time',
    photo_url                   TEXT,
    documents                   JSONB,          -- array of { name, url, type, expiry }
    clock_in_location_required  BOOLEAN         NOT NULL DEFAULT FALSE,
    allowed_device_ids          JSONB,          -- array of device identifiers
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 34: shifts
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id             UUID            NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    branch_id               UUID            NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    start_time              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    end_time                TIMESTAMPTZ,
    break_minutes           INTEGER         NOT NULL DEFAULT 0,
    status                  shift_status    NOT NULL DEFAULT 'open',
    opening_float           NUMERIC(12,2)   NOT NULL DEFAULT 0,
    closing_cash_declared   NUMERIC(12,2),
    closing_cash_actual     NUMERIC(12,2),
    cash_variance           NUMERIC(12,2),  -- computed on shift close
    notes                   TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 35: attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
    id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID                NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date            DATE                NOT NULL,
    clock_in        TIMESTAMPTZ,
    clock_out       TIMESTAMPTZ,
    break_start     TIMESTAMPTZ,
    break_end       TIMESTAMPTZ,
    hours_worked    NUMERIC(5,2)        GENERATED ALWAYS AS (
                        CASE
                            WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL
                            THEN ROUND(
                                EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0
                                - COALESCE(EXTRACT(EPOCH FROM (break_end - break_start)) / 3600.0, 0),
                                2)
                            ELSE 0
                        END
                    ) STORED,
    status          attendance_status   NOT NULL DEFAULT 'present',
    late_minutes    INTEGER             NOT NULL DEFAULT 0,
    overtime_minutes INTEGER            NOT NULL DEFAULT 0,
    device_info     JSONB,
    ip_address      INET,
    location        JSONB,              -- { lat, lng, accuracy }
    notes           TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, date)
);

-- ============================================================
-- TABLE 36: leave_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID            NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type      TEXT            NOT NULL,   -- annual, sick, maternity, etc.
    start_date      DATE            NOT NULL,
    end_date        DATE            NOT NULL,
    days            INTEGER         NOT NULL DEFAULT 1 CHECK (days > 0),
    reason          TEXT,
    status          leave_status    NOT NULL DEFAULT 'pending',
    approved_by     UUID            REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 37: payroll_runs
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_runs (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start        DATE            NOT NULL,
    period_end          DATE            NOT NULL,
    pay_period_type     pay_period_type NOT NULL DEFAULT 'monthly',
    branch_id           UUID            REFERENCES branches(id) ON DELETE SET NULL,
    status              payroll_status  NOT NULL DEFAULT 'draft',
    total_gross         NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total_net           NUMERIC(12,2)   NOT NULL DEFAULT 0,
    run_by              UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by         UUID            REFERENCES users(id) ON DELETE SET NULL,
    paid_at             TIMESTAMPTZ,
    payment_reference   TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 38: payroll_items
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_items (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_run_id      UUID        NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id         UUID        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    days_worked         NUMERIC(5,2) NOT NULL DEFAULT 0,
    hours_worked        NUMERIC(7,2) NOT NULL DEFAULT 0,
    basic_pay           NUMERIC(12,2) NOT NULL DEFAULT 0,
    overtime_pay        NUMERIC(12,2) NOT NULL DEFAULT 0,
    commission_earned   NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonuses             JSONB,      -- { description: amount, ... }
    allowances          JSONB,      -- { housing: amount, transport: amount, ... }
    deductions          JSONB,      -- { nssf: amount, nhif: amount, paye: amount, advances: amount, fines: amount }
    gross_pay           NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay             NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method      TEXT,
    payment_reference   TEXT,
    payslip_url         TEXT,
    notes               TEXT
);

-- ============================================================
-- TABLE 39: staff_advances
-- ============================================================
CREATE TABLE IF NOT EXISTS staff_advances (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id             UUID            NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount                  NUMERIC(12,2)   NOT NULL CHECK (amount > 0),
    reason                  TEXT,
    status                  advance_status  NOT NULL DEFAULT 'pending',
    repayment_start_date    DATE,
    repayment_per_period    NUMERIC(12,2)   NOT NULL DEFAULT 0,
    total_repaid            NUMERIC(12,2)   NOT NULL DEFAULT 0,
    balance                 NUMERIC(12,2)   NOT NULL DEFAULT 0,
    created_by              UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by             UUID            REFERENCES users(id) ON DELETE SET NULL,
    approved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 40: expense_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL UNIQUE,
    budget_limit    NUMERIC(12,2) NOT NULL DEFAULT 0,
    parent_id       UUID        REFERENCES expense_categories(id) ON DELETE SET NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE
);

-- ============================================================
-- TABLE 41: expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id     UUID            NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    amount          NUMERIC(12,2)   NOT NULL CHECK (amount > 0),
    description     TEXT            NOT NULL,
    vendor          TEXT,
    receipt_url     TEXT,
    branch_id       UUID            REFERENCES branches(id) ON DELETE SET NULL,
    is_recurring    BOOLEAN         NOT NULL DEFAULT FALSE,
    frequency       expense_frequency NOT NULL DEFAULT 'once',
    next_due_date   DATE,
    status          expense_status  NOT NULL DEFAULT 'pending',
    reference       TEXT,
    payment_method  TEXT,
    paid_by         UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_by      UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by     UUID            REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 42: cash_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_transactions (
    id          UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        cash_transaction_type   NOT NULL,
    amount      NUMERIC(12,2)           NOT NULL CHECK (amount > 0),
    description TEXT                    NOT NULL,
    branch_id   UUID                    NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    shift_id    UUID                    REFERENCES shifts(id) ON DELETE SET NULL,
    reference   TEXT,
    created_by  UUID                    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 43: approvals
-- ============================================================
CREATE TABLE IF NOT EXISTS approvals (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    type            approval_type   NOT NULL,
    reference_id    UUID,
    reference_table TEXT,
    details         JSONB,
    status          approval_status NOT NULL DEFAULT 'pending',
    requested_by    UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_to     UUID            REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    decision_note   TEXT,
    decided_by      UUID            REFERENCES users(id) ON DELETE SET NULL,
    decided_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Add FK from service_negotiations.approval_id now that approvals exists
ALTER TABLE service_negotiations
    ADD CONSTRAINT fk_service_negotiations_approval
    FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE 44: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    type        notification_type   NOT NULL,
    user_id     UUID                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT                NOT NULL,
    message     TEXT                NOT NULL,
    data        JSONB,
    is_read     BOOLEAN             NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 45: audit_log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,       -- INSERT, UPDATE, DELETE, LOGIN, etc.
    table_name  TEXT        NOT NULL,
    record_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    device_info JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 46: targets
-- ============================================================
CREATE TABLE IF NOT EXISTS targets (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id         UUID        REFERENCES employees(id) ON DELETE SET NULL,
    branch_id           UUID        REFERENCES branches(id) ON DELETE SET NULL,
    period_type         TEXT        NOT NULL,  -- daily, weekly, monthly
    period_start        DATE        NOT NULL,
    period_end          DATE        NOT NULL,
    target_sales        NUMERIC(12,2) NOT NULL DEFAULT 0,
    target_transactions INTEGER     NOT NULL DEFAULT 0,
    bonus_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
    bonus_threshold     NUMERIC(5,2)  NOT NULL DEFAULT 100,  -- % of target to earn bonus
    created_by          UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 48: creditors
-- ============================================================
CREATE TABLE IF NOT EXISTS creditors (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id     UUID            NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    invoice_number  TEXT            NOT NULL,
    amount          NUMERIC(12,2)   NOT NULL CHECK (amount > 0),
    due_date        DATE            NOT NULL,
    paid_amount     NUMERIC(12,2)   NOT NULL DEFAULT 0,
    balance         NUMERIC(12,2)   GENERATED ALWAYS AS (amount - paid_amount) STORED,
    status          creditor_status NOT NULL DEFAULT 'pending',
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 47: debtors (materialized view — created after seed data)
-- (defined as view after tables are ready)
-- ============================================================

-- ============================================================
-- INDEXES
-- ============================================================

-- sales indexes
CREATE INDEX IF NOT EXISTS idx_sales_created_at    ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_branch_id     ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id    ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_status        ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id   ON sales(customer_id);

-- sale_items indexes
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id     ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id  ON sale_items(product_id);

-- stock_entries indexes
CREATE INDEX IF NOT EXISTS idx_stock_entries_product_id ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_entries_created_at ON stock_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_entries_branch_id  ON stock_entries(branch_id);

-- attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date        ON attendance(date);

-- audit_log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id     ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name  ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at  ON audit_log(created_at);

-- notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id  ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read  ON notifications(is_read);

-- payroll_items indexes
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id    ON payroll_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll_run_id ON payroll_items(payroll_run_id);

-- products indexes
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

-- other FK indexes
CREATE INDEX IF NOT EXISTS idx_users_role_id              ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_login_history_user_id      ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product  ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_branch   ON stock_adjustments(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier   ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch     ON purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_service       ON service_jobs(service_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_customer      ON service_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_shifts_employee_id         ON shifts(employee_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch_id           ON shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee    ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch        ON payroll_runs(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id         ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id       ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_approvals_type             ON approvals(type);
CREATE INDEX IF NOT EXISTS idx_approvals_status           ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_requested_by     ON approvals(requested_by);
CREATE INDEX IF NOT EXISTS idx_creditors_supplier_id      ON creditors(supplier_id);
CREATE INDEX IF NOT EXISTS idx_targets_employee_id        ON targets(employee_id);
CREATE INDEX IF NOT EXISTS idx_targets_branch_id          ON targets(branch_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- View 1: v_stock_levels - current stock per product per branch
CREATE OR REPLACE VIEW v_stock_levels WITH (security_invoker = true) AS
SELECT
    p.id                        AS product_id,
    p.name                      AS product_name,
    p.sku,
    p.barcode,
    b.id                        AS branch_id,
    b.name                      AS branch_name,
    COALESCE(SUM(se.qty_in), 0) - COALESCE(SUM(se.qty_out), 0) AS qty_on_hand,
    p.reorder_level,
    p.reorder_qty,
    CASE
        WHEN (COALESCE(SUM(se.qty_in), 0) - COALESCE(SUM(se.qty_out), 0)) <= 0
            THEN 'out_of_stock'
        WHEN (COALESCE(SUM(se.qty_in), 0) - COALESCE(SUM(se.qty_out), 0)) <= p.reorder_level
            THEN 'low_stock'
        ELSE 'in_stock'
    END                         AS stock_status,
    p.selling_price,
    p.buying_price,
    p.is_active
FROM products p
CROSS JOIN branches b
LEFT JOIN stock_entries se ON se.product_id = p.id AND se.branch_id = b.id
WHERE p.track_stock = TRUE AND p.is_deleted = FALSE AND b.is_active = TRUE
GROUP BY p.id, p.name, p.sku, p.barcode, b.id, b.name,
         p.reorder_level, p.reorder_qty, p.selling_price, p.buying_price, p.is_active;

-- View 2: v_sales_summary - aggregated sales
CREATE OR REPLACE VIEW v_sales_summary WITH (security_invoker = true) AS
SELECT
    s.branch_id,
    b.name                              AS branch_name,
    DATE(s.created_at)                  AS sale_date,
    s.cashier_id,
    u.full_name                         AS cashier_name,
    COUNT(DISTINCT s.id)                AS total_sales,
    SUM(s.total_amount)                 AS total_revenue,
    SUM(s.discount_amount)              AS total_discounts,
    SUM(s.tax_amount)                   AS total_tax,
    AVG(s.total_amount)                 AS avg_sale_value,
    COUNT(DISTINCT si.product_id)       AS unique_products_sold,
    SUM(si.quantity)                    AS total_items_sold
FROM sales s
JOIN branches b ON b.id = s.branch_id
JOIN users u ON u.id = s.cashier_id
JOIN sale_items si ON si.sale_id = s.id
WHERE s.status = 'completed' AND s.is_deleted = FALSE
GROUP BY s.branch_id, b.name, DATE(s.created_at), s.cashier_id, u.full_name;

-- View 3: v_customer_balances
CREATE OR REPLACE VIEW v_customer_balances WITH (security_invoker = true) AS
SELECT
    c.id                                            AS customer_id,
    c.name,
    c.phone,
    c.email,
    c.credit_limit,
    c.credit_used,
    c.credit_limit - c.credit_used                 AS available_credit,
    CASE
        WHEN c.credit_used >= c.credit_limit AND c.credit_limit > 0 THEN 'over_limit'
        WHEN c.credit_used > 0 THEN 'has_credit'
        ELSE 'clear'
    END                                             AS credit_status,
    COALESCE(SUM(CASE WHEN s.is_credit AND s.status = 'completed'
                 THEN s.total_amount END), 0)       AS total_credit_sales,
    COALESCE(SUM(cp.amount), 0)                     AS total_payments_made,
    COALESCE(SUM(CASE WHEN s.is_credit AND s.status = 'completed'
                 THEN s.total_amount END), 0)
        - COALESCE(SUM(cp.amount), 0)               AS outstanding_balance
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id
LEFT JOIN customer_payments cp ON cp.customer_id = c.id
WHERE c.is_active = TRUE
GROUP BY c.id, c.name, c.phone, c.email, c.credit_limit, c.credit_used;

-- View 4: v_employee_summary
CREATE OR REPLACE VIEW v_employee_summary WITH (security_invoker = true) AS
SELECT
    e.id                                            AS employee_id,
    u.full_name,
    u.email,
    e.employee_number,
    e.department,
    e.position,
    u.wage_type,
    u.wage_rate,
    COUNT(DISTINCT a.date)                          AS days_attended,
    SUM(a.hours_worked)                             AS total_hours_worked,
    SUM(a.late_minutes)                             AS total_late_minutes,
    SUM(a.overtime_minutes)                         AS total_overtime_minutes,
    COUNT(DISTINCT CASE WHEN a.status = 'absent' THEN a.date END) AS days_absent,
    COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) AS total_sales_made,
    COALESCE(SUM(CASE WHEN s.status = 'completed' THEN s.total_amount END), 0) AS total_sales_amount
FROM employees e
JOIN users u ON u.id = e.id
LEFT JOIN attendance a ON a.employee_id = e.id
LEFT JOIN sales s ON s.cashier_id = e.id
GROUP BY e.id, u.full_name, u.email, e.employee_number, e.department,
         e.position, u.wage_type, u.wage_rate;

-- View 5: v_cash_position
CREATE OR REPLACE VIEW v_cash_position WITH (security_invoker = true) AS
SELECT
    sh.id                                           AS shift_id,
    sh.branch_id,
    b.name                                          AS branch_name,
    sh.employee_id,
    u.full_name                                     AS employee_name,
    sh.start_time,
    sh.end_time,
    sh.status,
    sh.opening_float,
    COALESCE(SUM(CASE WHEN ct.type = 'in'  THEN ct.amount END), 0) AS cash_in,
    COALESCE(SUM(CASE WHEN ct.type = 'out' THEN ct.amount END), 0) AS cash_out,
    sh.opening_float
        + COALESCE(SUM(CASE WHEN ct.type = 'in'  THEN ct.amount END), 0)
        - COALESCE(SUM(CASE WHEN ct.type = 'out' THEN ct.amount END), 0) AS expected_cash,
    sh.closing_cash_declared,
    sh.closing_cash_actual,
    sh.cash_variance
FROM shifts sh
JOIN branches b ON b.id = sh.branch_id
JOIN employees e ON e.id = sh.employee_id
JOIN users u ON u.id = e.id
LEFT JOIN cash_transactions ct ON ct.shift_id = sh.id
GROUP BY sh.id, sh.branch_id, b.name, sh.employee_id, u.full_name,
         sh.start_time, sh.end_time, sh.status, sh.opening_float,
         sh.closing_cash_declared, sh.closing_cash_actual, sh.cash_variance;

-- Materialized view 47: debtors
CREATE MATERIALIZED VIEW IF NOT EXISTS debtors AS
SELECT
    c.id                                            AS customer_id,
    c.name,
    c.phone,
    COALESCE(SUM(CASE WHEN s.is_credit AND s.status = 'completed'
                 THEN s.total_amount END), 0)       AS total_credit,
    COALESCE(SUM(cp.amount), 0)                     AS total_paid,
    COALESCE(SUM(CASE WHEN s.is_credit AND s.status = 'completed'
                 THEN s.total_amount END), 0)
        - COALESCE(SUM(cp.amount), 0)               AS balance,
    MAX(CASE WHEN s.is_credit AND s.status = 'completed' AND s.credit_due_date < CURRENT_DATE
             THEN CURRENT_DATE - s.credit_due_date END) AS days_overdue
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.id
LEFT JOIN customer_payments cp ON cp.customer_id = c.id
WHERE c.is_active = TRUE
GROUP BY c.id, c.name, c.phone
HAVING
    COALESCE(SUM(CASE WHEN s.is_credit AND s.status = 'completed'
               THEN s.total_amount END), 0)
    - COALESCE(SUM(cp.amount), 0) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_debtors_customer_id ON debtors(customer_id);
REVOKE ALL ON public.debtors FROM PUBLIC, anon, authenticated;

-- ============================================================
-- TRIGGERS AND FUNCTIONS
-- ============================================================

-- Function 4: auto_sale_number() trigger
CREATE OR REPLACE FUNCTION auto_sale_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_year TEXT;
    v_seq  BIGINT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SPLIT_PART(sale_number, '-', 3) AS BIGINT)
    ), 0) + 1
    INTO v_seq
    FROM sales
    WHERE sale_number LIKE 'SA-' || v_year || '-%';

    NEW.sale_number := 'SA-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_auto_sale_number
    BEFORE INSERT ON sales
    FOR EACH ROW
    WHEN (NEW.sale_number IS NULL OR NEW.sale_number = '')
    EXECUTE FUNCTION auto_sale_number();

-- Function 5: auto_receipt_number() trigger
CREATE OR REPLACE FUNCTION auto_receipt_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_year TEXT;
    v_seq  BIGINT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    SELECT COALESCE(MAX(
        CAST(SPLIT_PART(receipt_number, '-', 3) AS BIGINT)
    ), 0) + 1
    INTO v_seq
    FROM receipts
    WHERE receipt_number LIKE 'RC-' || v_year || '-%';

    NEW.receipt_number := 'RC-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_auto_receipt_number
    BEFORE INSERT ON receipts
    FOR EACH ROW
    WHEN (NEW.receipt_number IS NULL OR NEW.receipt_number = '')
    EXECUTE FUNCTION auto_receipt_number();

-- Function 1: update_stock_on_sale()
CREATE OR REPLACE FUNCTION update_stock_on_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_sale_status sale_status;
    v_branch_id   UUID;
BEGIN
    SELECT status, branch_id INTO v_sale_status, v_branch_id
    FROM sales WHERE id = NEW.sale_id;

    IF v_sale_status = 'completed' THEN
        -- Insert stock out entry
        INSERT INTO stock_entries (
            product_id, variant_id, branch_id,
            qty_in, qty_out, qty_on_hand,
            type, reference, created_at
        )
        SELECT
            NEW.product_id,
            NEW.variant_id,
            v_branch_id,
            0,
            NEW.quantity,
            COALESCE((
                SELECT qty_on_hand FROM stock_entries
                WHERE product_id = NEW.product_id
                  AND branch_id = v_branch_id
                ORDER BY created_at DESC LIMIT 1
            ), 0) - NEW.quantity,
            'sale'::stock_entry_type,
            NEW.sale_id::TEXT,
            NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_update_stock_on_sale
    AFTER INSERT ON sale_items
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_sale();

-- Function 2: update_stock_on_adjustment()
CREATE OR REPLACE FUNCTION update_stock_on_adjustment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        INSERT INTO stock_entries (
            product_id, variant_id, branch_id,
            qty_in, qty_out, qty_on_hand,
            type, reference, notes, created_at
        )
        SELECT
            NEW.product_id,
            NEW.variant_id,
            NEW.branch_id,
            CASE WHEN NEW.quantity > 0 THEN NEW.quantity ELSE 0 END,
            CASE WHEN NEW.quantity < 0 THEN ABS(NEW.quantity) ELSE 0 END,
            COALESCE((
                SELECT qty_on_hand FROM stock_entries
                WHERE product_id = NEW.product_id
                  AND branch_id = NEW.branch_id
                ORDER BY created_at DESC LIMIT 1
            ), 0) + NEW.quantity,
            'adjustment'::stock_entry_type,
            NEW.id::TEXT,
            NEW.notes,
            NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_update_stock_on_adjustment
    AFTER UPDATE OF status ON stock_adjustments
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_on_adjustment();

-- Function 3: compute_cash_variance()
CREATE OR REPLACE FUNCTION compute_cash_variance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'closed' AND OLD.status = 'open' THEN
        NEW.cash_variance := COALESCE(NEW.closing_cash_actual, 0) - COALESCE(NEW.closing_cash_declared, 0);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_compute_cash_variance
    BEFORE UPDATE OF status ON shifts
    FOR EACH ROW
    EXECUTE FUNCTION compute_cash_variance();

-- Function 6: log_audit() - generic audit trigger
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_user_id UUID;
    v_action  TEXT;
    v_old     JSONB;
    v_new     JSONB;
BEGIN
    v_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_old    := NULL;
        v_new    := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_old    := to_jsonb(OLD);
        v_new    := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_old    := to_jsonb(OLD);
        v_new    := NULL;
    END IF;

    INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values, created_at)
    VALUES (
        v_user_id,
        v_action,
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN (v_old->>'id')::UUID ELSE (v_new->>'id')::UUID END,
        v_old - 'pin_hash',
        v_new - 'pin_hash',
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Attach audit trigger to sensitive tables
CREATE OR REPLACE TRIGGER trg_audit_sales
    AFTER INSERT OR UPDATE OR DELETE ON sales
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_users
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_products
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_stock_adjustments
    AFTER INSERT OR UPDATE OR DELETE ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_expenses
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_payroll_runs
    AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
    FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE OR REPLACE TRIGGER trg_audit_approvals
    AFTER INSERT OR UPDATE OR DELETE ON approvals
    FOR EACH ROW EXECUTE FUNCTION log_audit();

-- Function 7: update_customer_credit()
CREATE OR REPLACE FUNCTION update_customer_credit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_credit = TRUE AND NEW.status = 'completed' AND
       (OLD IS NULL OR OLD.status != 'completed') THEN
        UPDATE customers
        SET credit_used = credit_used + NEW.total_amount
        WHERE id = NEW.customer_id;
    END IF;

    -- If a credit sale is voided/refunded, reduce credit_used
    IF OLD IS NOT NULL AND OLD.is_credit = TRUE AND OLD.status = 'completed'
       AND NEW.status IN ('voided', 'refunded') THEN
        UPDATE customers
        SET credit_used = GREATEST(0, credit_used - OLD.total_amount)
        WHERE id = OLD.customer_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_update_customer_credit
    AFTER INSERT OR UPDATE OF status ON sales
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_credit();

-- Function 8: check_credit_limit()
CREATE OR REPLACE FUNCTION check_credit_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_credit_limit NUMERIC;
    v_credit_used  NUMERIC;
BEGIN
    IF NEW.is_credit = TRUE AND NEW.customer_id IS NOT NULL THEN
        SELECT credit_limit, credit_used
        INTO v_credit_limit, v_credit_used
        FROM customers
        WHERE id = NEW.customer_id;

        IF v_credit_limit > 0 AND
           (v_credit_used + NEW.total_amount) > v_credit_limit THEN
            RAISE EXCEPTION
                'Credit limit exceeded. Limit: %, Used: %, Requested: %',
                v_credit_limit, v_credit_used, NEW.total_amount
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_check_credit_limit
    BEFORE INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION check_credit_limit();

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_shop_settings_updated_at
    BEFORE UPDATE ON shop_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE shop_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_history        ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE units_of_measure     ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_bundles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bundle_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_takes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_take_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_negotiations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE held_sales           ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE services             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_advances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE creditors            ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Helper: check if current user has a given role
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS role_type LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT r.role_type
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.id = auth.uid()
      AND u.account_status = 'active'
      AND u.is_deleted = FALSE;
$$;

CREATE OR REPLACE FUNCTION current_user_branch()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT b.id
    FROM branches b
    JOIN users u ON u.id = auth.uid()
    JOIN employees e ON e.id = u.id
    JOIN shifts sh ON sh.employee_id = e.id AND sh.status = 'open'
    WHERE sh.branch_id = b.id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT current_user_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT current_user_role() IN ('super_admin', 'manager');
$$;

CREATE OR REPLACE FUNCTION is_cashier_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT current_user_role() IN ('super_admin', 'manager', 'cashier');
$$;

CREATE OR REPLACE FUNCTION is_storekeeper_or_above()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT current_user_role() IN ('super_admin', 'manager', 'storekeeper');
$$;

-- ----------------------------------------------------------------
-- RLS POLICIES: shop_settings
-- ----------------------------------------------------------------
CREATE POLICY shop_settings_super_admin_all ON shop_settings
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY shop_settings_read ON shop_settings
    FOR SELECT TO authenticated USING (is_cashier_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: roles
-- ----------------------------------------------------------------
CREATE POLICY roles_super_admin_all ON roles
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY roles_read ON roles
    FOR SELECT TO authenticated USING (
        is_manager_or_above() OR EXISTS (
            SELECT 1 FROM public.users
            WHERE id = (SELECT auth.uid()) AND role_id = roles.id
              AND account_status = 'active' AND NOT is_deleted
        )
    );

-- ----------------------------------------------------------------
-- RLS POLICIES: users
-- ----------------------------------------------------------------
CREATE POLICY users_super_admin_all ON users
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY users_manager_read ON users
    FOR SELECT TO authenticated USING (is_manager_or_above());

CREATE POLICY users_self_read ON users
    FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY users_self_update ON users
    FOR UPDATE TO authenticated USING (
        id = (SELECT auth.uid()) AND account_status = 'active' AND NOT is_deleted
    )
    WITH CHECK (
        id = (SELECT auth.uid()) AND account_status = 'active' AND NOT is_deleted
    );

CREATE FUNCTION public.restrict_self_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user = 'authenticated'
        AND NOT COALESCE(public.is_super_admin(), false)
        AND (to_jsonb(NEW) - ARRAY['full_name', 'phone', 'avatar_url', 'updated_at'])
            IS DISTINCT FROM
            (to_jsonb(OLD) - ARRAY['full_name', 'phone', 'avatar_url', 'updated_at'])
    THEN
        RAISE EXCEPTION 'Only profile contact fields may be changed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_restrict_self_profile_update
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.restrict_self_profile_update();

-- ----------------------------------------------------------------
-- RLS POLICIES: login_history
-- ----------------------------------------------------------------
CREATE POLICY login_history_super_admin_all ON login_history
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY login_history_self_read ON login_history
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: branches
-- ----------------------------------------------------------------
CREATE POLICY branches_super_admin_all ON branches
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY branches_read ON branches
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY branches_manager_edit ON branches
    FOR UPDATE TO authenticated
    USING (is_manager_or_above() AND id = current_user_branch())
    WITH CHECK (is_manager_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: categories
-- ----------------------------------------------------------------
CREATE POLICY categories_super_admin_all ON categories
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY categories_read ON categories
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY categories_manager_write ON categories
    FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());

CREATE POLICY categories_manager_update ON categories
    FOR UPDATE TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: units_of_measure
-- ----------------------------------------------------------------
CREATE POLICY uom_super_admin_all ON units_of_measure
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY uom_read ON units_of_measure
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY uom_manager_write ON units_of_measure
    FOR INSERT TO authenticated WITH CHECK (is_manager_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: suppliers
-- ----------------------------------------------------------------
CREATE POLICY suppliers_super_admin_all ON suppliers
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY suppliers_manager_all ON suppliers
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

CREATE POLICY suppliers_storekeeper_read ON suppliers
    FOR SELECT TO authenticated USING (current_user_role() = 'storekeeper');

-- ----------------------------------------------------------------
-- RLS POLICIES: products
-- ----------------------------------------------------------------
CREATE POLICY products_super_admin_all ON products
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY products_manager_write ON products
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

CREATE POLICY products_cashier_read ON products
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY products_storekeeper_read ON products
    FOR SELECT TO authenticated USING (current_user_role() = 'storekeeper');

-- ----------------------------------------------------------------
-- RLS POLICIES: product_images, product_variants, product_bundles, bundle_items
-- ----------------------------------------------------------------
CREATE POLICY product_images_super_admin ON product_images
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY product_images_manager ON product_images
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY product_images_read ON product_images
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY product_variants_super_admin ON product_variants
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY product_variants_manager ON product_variants
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY product_variants_read ON product_variants
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY product_bundles_super_admin ON product_bundles
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY product_bundles_manager ON product_bundles
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY product_bundles_read ON product_bundles
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY bundle_items_super_admin ON bundle_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY bundle_items_manager ON bundle_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY bundle_items_read ON bundle_items
    FOR SELECT TO authenticated USING (is_cashier_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: stock_entries
-- ----------------------------------------------------------------
CREATE POLICY stock_entries_super_admin ON stock_entries
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY stock_entries_manager ON stock_entries
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY stock_entries_storekeeper_all ON stock_entries
    FOR ALL TO authenticated USING (current_user_role() = 'storekeeper')
    WITH CHECK (current_user_role() = 'storekeeper');
CREATE POLICY stock_entries_cashier_read ON stock_entries
    FOR SELECT TO authenticated USING (current_user_role() = 'cashier');

-- ----------------------------------------------------------------
-- RLS POLICIES: stock_adjustments
-- ----------------------------------------------------------------
CREATE POLICY stock_adjustments_super_admin ON stock_adjustments
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY stock_adjustments_manager ON stock_adjustments
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY stock_adjustments_storekeeper_insert ON stock_adjustments
    FOR INSERT TO authenticated WITH CHECK (current_user_role() = 'storekeeper');
CREATE POLICY stock_adjustments_storekeeper_read ON stock_adjustments
    FOR SELECT TO authenticated USING (
        current_user_role() = 'storekeeper' AND requested_by = auth.uid()
    );

-- ----------------------------------------------------------------
-- RLS POLICIES: stock_takes, stock_take_items
-- ----------------------------------------------------------------
CREATE POLICY stock_takes_super_admin ON stock_takes
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY stock_takes_manager ON stock_takes
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY stock_takes_storekeeper ON stock_takes
    FOR ALL TO authenticated USING (current_user_role() = 'storekeeper')
    WITH CHECK (current_user_role() = 'storekeeper');

CREATE POLICY stock_take_items_super_admin ON stock_take_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY stock_take_items_manager ON stock_take_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY stock_take_items_storekeeper ON stock_take_items
    FOR ALL TO authenticated USING (current_user_role() = 'storekeeper')
    WITH CHECK (current_user_role() = 'storekeeper');

-- ----------------------------------------------------------------
-- RLS POLICIES: purchase_orders, purchase_order_items, purchase_receipts, purchase_receipt_items
-- ----------------------------------------------------------------
CREATE POLICY po_super_admin ON purchase_orders
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY po_manager ON purchase_orders
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY po_storekeeper_read ON purchase_orders
    FOR SELECT TO authenticated USING (current_user_role() = 'storekeeper');

CREATE POLICY po_items_super_admin ON purchase_order_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY po_items_manager ON purchase_order_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY po_items_storekeeper_read ON purchase_order_items
    FOR SELECT TO authenticated USING (current_user_role() = 'storekeeper');

CREATE POLICY pr_super_admin ON purchase_receipts
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY pr_manager ON purchase_receipts
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY pr_storekeeper ON purchase_receipts
    FOR ALL TO authenticated USING (current_user_role() = 'storekeeper')
    WITH CHECK (current_user_role() = 'storekeeper');

CREATE POLICY pr_items_super_admin ON purchase_receipt_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY pr_items_manager ON purchase_receipt_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY pr_items_storekeeper ON purchase_receipt_items
    FOR ALL TO authenticated USING (current_user_role() = 'storekeeper')
    WITH CHECK (current_user_role() = 'storekeeper');

-- ----------------------------------------------------------------
-- RLS POLICIES: customers, customer_payments
-- ----------------------------------------------------------------
CREATE POLICY customers_super_admin ON customers
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY customers_manager ON customers
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY customers_cashier_all ON customers
    FOR ALL TO authenticated USING (current_user_role() = 'cashier')
    WITH CHECK (current_user_role() = 'cashier');

CREATE POLICY customer_payments_super_admin ON customer_payments
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY customer_payments_manager ON customer_payments
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY customer_payments_cashier_all ON customer_payments
    FOR ALL TO authenticated USING (current_user_role() = 'cashier')
    WITH CHECK (current_user_role() = 'cashier');

-- ----------------------------------------------------------------
-- RLS POLICIES: sales, sale_items, sale_payments
-- ----------------------------------------------------------------
CREATE POLICY sales_super_admin ON sales
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sales_manager ON sales
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY sales_cashier_own ON sales
    FOR ALL TO authenticated USING (
        current_user_role() = 'cashier' AND cashier_id = auth.uid()
    ) WITH CHECK (
        current_user_role() = 'cashier'
    );

CREATE POLICY sale_items_super_admin ON sale_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sale_items_manager ON sale_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY sale_items_cashier ON sale_items
    FOR ALL TO authenticated USING (
        current_user_role() = 'cashier' AND
        EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_items.sale_id AND s.cashier_id = auth.uid())
    ) WITH CHECK (current_user_role() = 'cashier');

CREATE POLICY sale_payments_super_admin ON sale_payments
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY sale_payments_manager ON sale_payments
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY sale_payments_cashier ON sale_payments
    FOR ALL TO authenticated USING (
        current_user_role() = 'cashier' AND
        EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_payments.sale_id AND s.cashier_id = auth.uid())
    ) WITH CHECK (current_user_role() = 'cashier');

-- ----------------------------------------------------------------
-- RLS POLICIES: price_negotiations
-- ----------------------------------------------------------------
CREATE POLICY price_neg_super_admin ON price_negotiations
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY price_neg_manager ON price_negotiations
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY price_neg_cashier_own ON price_negotiations
    FOR ALL TO authenticated USING (requested_by = auth.uid()) WITH CHECK (requested_by = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: held_sales
-- ----------------------------------------------------------------
CREATE POLICY held_sales_super_admin ON held_sales
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY held_sales_manager ON held_sales
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY held_sales_cashier_own ON held_sales
    FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: receipts
-- ----------------------------------------------------------------
CREATE POLICY receipts_super_admin ON receipts
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY receipts_manager ON receipts
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY receipts_cashier ON receipts
    FOR SELECT TO authenticated USING (
        current_user_role() = 'cashier' AND
        EXISTS (SELECT 1 FROM sales s WHERE s.id = receipts.sale_id AND s.cashier_id = auth.uid())
    );

-- ----------------------------------------------------------------
-- RLS POLICIES: services, service_jobs, service_negotiations
-- ----------------------------------------------------------------
CREATE POLICY services_super_admin ON services
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY services_manager ON services
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY services_read ON services
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY service_jobs_super_admin ON service_jobs
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY service_jobs_manager ON service_jobs
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY service_jobs_cashier_read ON service_jobs
    FOR SELECT TO authenticated USING (current_user_role() = 'cashier');
CREATE POLICY service_jobs_assigned ON service_jobs
    FOR SELECT TO authenticated USING (assigned_to = auth.uid());

CREATE POLICY service_neg_super_admin ON service_negotiations
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY service_neg_manager ON service_negotiations
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

-- ----------------------------------------------------------------
-- RLS POLICIES: employees
-- ----------------------------------------------------------------
CREATE POLICY employees_super_admin ON employees
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY employees_manager ON employees
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY employees_self ON employees
    FOR SELECT TO authenticated USING (id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: shifts
-- ----------------------------------------------------------------
CREATE POLICY shifts_super_admin ON shifts
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY shifts_manager ON shifts
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY shifts_own ON shifts
    FOR ALL TO authenticated USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: attendance
-- ----------------------------------------------------------------
CREATE POLICY attendance_super_admin ON attendance
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY attendance_manager ON attendance
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY attendance_self ON attendance
    FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY attendance_self_insert ON attendance
    FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: leave_requests
-- ----------------------------------------------------------------
CREATE POLICY leave_super_admin ON leave_requests
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY leave_manager ON leave_requests
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY leave_self ON leave_requests
    FOR ALL TO authenticated USING (employee_id = auth.uid()) WITH CHECK (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: payroll_runs, payroll_items
-- ----------------------------------------------------------------
CREATE POLICY payroll_runs_super_admin ON payroll_runs
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY payroll_runs_manager ON payroll_runs
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());

CREATE POLICY payroll_items_super_admin ON payroll_items
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY payroll_items_manager ON payroll_items
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY payroll_items_self ON payroll_items
    FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: staff_advances
-- ----------------------------------------------------------------
CREATE POLICY advances_super_admin ON staff_advances
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY advances_manager ON staff_advances
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY advances_self ON staff_advances
    FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY advances_self_insert ON staff_advances
    FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: expense_categories, expenses
-- ----------------------------------------------------------------
CREATE POLICY exp_cats_super_admin ON expense_categories
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY exp_cats_manager ON expense_categories
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY exp_cats_read ON expense_categories
    FOR SELECT TO authenticated USING (is_cashier_or_above());

CREATE POLICY expenses_super_admin ON expenses
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY expenses_manager ON expenses
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY expenses_cashier_insert ON expenses
    FOR INSERT TO authenticated WITH CHECK (current_user_role() = 'cashier');
CREATE POLICY expenses_self_read ON expenses
    FOR SELECT TO authenticated USING (created_by = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: cash_transactions
-- ----------------------------------------------------------------
CREATE POLICY cash_super_admin ON cash_transactions
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY cash_manager ON cash_transactions
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY cash_cashier_insert ON cash_transactions
    FOR INSERT TO authenticated WITH CHECK (current_user_role() = 'cashier');
CREATE POLICY cash_cashier_read ON cash_transactions
    FOR SELECT TO authenticated USING (created_by = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: approvals
-- ----------------------------------------------------------------
CREATE POLICY approvals_super_admin ON approvals
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY approvals_manager ON approvals
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY approvals_self_request ON approvals
    FOR SELECT TO authenticated USING (
        requested_by = auth.uid() OR assigned_to = auth.uid()
    );
CREATE POLICY approvals_self_insert ON approvals
    FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: notifications
-- ----------------------------------------------------------------
CREATE POLICY notifications_super_admin ON notifications
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY notifications_own ON notifications
    FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: audit_log (INSERT only via trigger, no UPDATE/DELETE via RLS)
-- ----------------------------------------------------------------
CREATE POLICY audit_log_super_admin_read ON audit_log
    FOR SELECT TO authenticated USING (is_super_admin());
CREATE POLICY audit_log_manager_read ON audit_log
    FOR SELECT TO authenticated USING (is_manager_or_above());
-- NO UPDATE or DELETE policies — these are intentionally omitted

-- ----------------------------------------------------------------
-- RLS POLICIES: targets
-- ----------------------------------------------------------------
CREATE POLICY targets_super_admin ON targets
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY targets_manager ON targets
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY targets_self ON targets
    FOR SELECT TO authenticated USING (employee_id = auth.uid());

-- ----------------------------------------------------------------
-- RLS POLICIES: creditors
-- ----------------------------------------------------------------
CREATE POLICY creditors_super_admin ON creditors
    FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY creditors_manager ON creditors
    FOR ALL TO authenticated USING (is_manager_or_above()) WITH CHECK (is_manager_or_above());
CREATE POLICY creditors_storekeeper_read ON creditors
    FOR SELECT TO authenticated USING (current_user_role() = 'storekeeper');

-- ============================================================
-- SEED DATA
-- ============================================================

-- ----------------------------------------------------------------
-- Shop Settings
-- ----------------------------------------------------------------
INSERT INTO shop_settings (shop_name, city) VALUES ('Kelvin''s POS', 'Nairobi');

-- ----------------------------------------------------------------
-- Roles
-- ----------------------------------------------------------------
INSERT INTO roles (name, description, role_type, is_system_role, permissions) VALUES
(
    'Super Admin',
    'Full system access with all privileges',
    'super_admin', TRUE,
    '{
        "dashboard": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "pos": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "inventory": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "customers": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "employees": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "expenses": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "approvals": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "reports": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "settings": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "payroll": {"view": true, "create": true, "edit": true, "delete": true, "approve": true},
        "services": {"view": true, "create": true, "edit": true, "delete": true, "approve": true}
    }'::JSONB
),
(
    'Manager',
    'Branch manager with broad access, approval powers',
    'manager', TRUE,
    '{
        "dashboard": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "pos": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "inventory": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "customers": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "employees": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "expenses": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "approvals": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "reports": {"view": true, "create": true, "edit": false, "delete": false, "approve": false},
        "settings": {"view": true, "create": false, "edit": true, "delete": false, "approve": false},
        "payroll": {"view": true, "create": true, "edit": true, "delete": false, "approve": true},
        "services": {"view": true, "create": true, "edit": true, "delete": false, "approve": true}
    }'::JSONB
),
(
    'Cashier',
    'Point of sale operations, customer management',
    'cashier', TRUE,
    '{
        "dashboard": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "pos": {"view": true, "create": true, "edit": true, "delete": false, "approve": false},
        "inventory": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "customers": {"view": true, "create": true, "edit": true, "delete": false, "approve": false},
        "employees": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "expenses": {"view": false, "create": true, "edit": false, "delete": false, "approve": false},
        "approvals": {"view": true, "create": true, "edit": false, "delete": false, "approve": false},
        "reports": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "settings": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "payroll": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "services": {"view": true, "create": true, "edit": false, "delete": false, "approve": false}
    }'::JSONB
),
(
    'Storekeeper',
    'Inventory management, stock control',
    'storekeeper', TRUE,
    '{
        "dashboard": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "pos": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "inventory": {"view": true, "create": true, "edit": true, "delete": false, "approve": false},
        "customers": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "employees": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "expenses": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "approvals": {"view": true, "create": true, "edit": false, "delete": false, "approve": false},
        "reports": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "settings": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "payroll": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "services": {"view": true, "create": false, "edit": false, "delete": false, "approve": false}
    }'::JSONB
),
(
    'Custom Role',
    'Customizable role with configurable permissions',
    'custom', FALSE,
    '{
        "dashboard": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "pos": {"view": true, "create": true, "edit": false, "delete": false, "approve": false},
        "inventory": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "customers": {"view": true, "create": false, "edit": false, "delete": false, "approve": false},
        "employees": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "expenses": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "approvals": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "reports": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "settings": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "payroll": {"view": false, "create": false, "edit": false, "delete": false, "approve": false},
        "services": {"view": true, "create": false, "edit": false, "delete": false, "approve": false}
    }'::JSONB
);


-- Explicit Data API grants for RLS-protected tables and invoker views.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.shop_settings,
    public.roles,
    public.users,
    public.login_history,
    public.branches,
    public.categories,
    public.units_of_measure,
    public.suppliers,
    public.products,
    public.product_images,
    public.product_variants,
    public.product_bundles,
    public.bundle_items,
    public.stock_entries,
    public.stock_adjustments,
    public.stock_takes,
    public.stock_take_items,
    public.purchase_orders,
    public.purchase_order_items,
    public.purchase_receipts,
    public.purchase_receipt_items,
    public.customers,
    public.customer_payments,
    public.sales,
    public.sale_items,
    public.sale_payments,
    public.price_negotiations,
    public.held_sales,
    public.receipts,
    public.services,
    public.service_jobs,
    public.service_negotiations,
    public.employees,
    public.shifts,
    public.attendance,
    public.leave_requests,
    public.payroll_runs,
    public.payroll_items,
    public.staff_advances,
    public.expense_categories,
    public.expenses,
    public.cash_transactions,
    public.approvals,
    public.notifications,
    public.audit_log,
    public.targets,
    public.creditors
TO authenticated;

GRANT SELECT ON TABLE
    public.v_stock_levels,
    public.v_sales_summary,
    public.v_customer_balances,
    public.v_employee_summary,
    public.v_cash_position
TO authenticated;
