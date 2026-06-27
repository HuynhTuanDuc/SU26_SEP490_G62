-- Migration: merge qr_transfer → bank_transfer
-- Run once on live DB

-- 1. Update existing data
UPDATE shipment_receipts
SET payment_type = 'bank_transfer'
WHERE payment_type = 'qr_transfer';

UPDATE shipment_receipts
SET driver_collection_type = 'bank_transfer'
WHERE driver_collection_type = 'qr_transfer';

-- 2. Drop old CHECK constraints
ALTER TABLE shipment_receipts
  DROP CONSTRAINT IF EXISTS shipment_receipts_payment_type_check,
  DROP CONSTRAINT IF EXISTS shipment_receipts_driver_collection_type_check;

-- 3. Re-add CHECK constraints without qr_transfer
ALTER TABLE shipment_receipts
  ADD CONSTRAINT shipment_receipts_payment_type_check
    CHECK (payment_type IN ('cash_collected', 'bank_transfer', 'client_credit')),
  ADD CONSTRAINT shipment_receipts_driver_collection_type_check
    CHECK (driver_collection_type IN ('cash_collected', 'bank_transfer', 'client_credit'));
