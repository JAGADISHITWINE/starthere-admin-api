const db = require("../config/db");

let schemaReady = false;

async function ensureCouponSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS trek_coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trek_id INT NOT NULL,
      code VARCHAR(60) NOT NULL,
      discount_type ENUM('percentage', 'flat') NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(10,2) NOT NULL,
      min_booking_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      max_discount_amount DECIMAL(10,2) NULL,
      start_date DATETIME NULL,
      end_date DATETIME NULL,
      usage_limit INT NULL,
      usage_count INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_trek_coupon_code (trek_id, code),
      KEY idx_trek_coupons_trek_id (trek_id),
      KEY idx_trek_coupons_active (is_active)
    )
  `);

  schemaReady = true;
}

module.exports = {
  ensureCouponSchema,
};
