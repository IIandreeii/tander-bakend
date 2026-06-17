-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PICKED';
ALTER TYPE "OrderStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNING';
ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';

-- Migrate existing data
UPDATE "orders" SET "status" = 'PENDING' WHERE "status" = 'PROCESSING';
UPDATE "orders" SET "status" = 'PICKED' WHERE "status" = 'SHIPPED';
UPDATE "orders" SET "status" = 'RETURNING' WHERE "status" = 'CANCELLED';

UPDATE "order_status_history" SET "status" = 'PENDING' WHERE "status" = 'PROCESSING';
UPDATE "order_status_history" SET "status" = 'PICKED' WHERE "status" = 'SHIPPED';
UPDATE "order_status_history" SET "status" = 'RETURNING' WHERE "status" = 'CANCELLED';
