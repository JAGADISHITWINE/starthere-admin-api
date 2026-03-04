const db = require("../config/db");

const PERMISSIONS = [
  "dashboard.view",
  "bookings.view",
  "bookings.manage",
  "treks.view",
  "treks.manage",
  "users.view",
  "users.manage",
  "reviews.view",
  "reviews.manage",
  "blog.view",
  "blog.manage",
  "finance.view",
  "operations.view",
  "notifications.view",
  "dropdowns.manage",
  "rbac.manage",
];

const ROLE_DEFINITIONS = [
  { roleKey: "super_admin", roleName: "Super Admin" },
  { roleKey: "operations", roleName: "Operations" },
  { roleKey: "finance", roleName: "Finance" },
  { roleKey: "content", roleName: "Content" },
  { roleKey: "support", roleName: "Support" },
];

const ROLE_PERMISSION_MATRIX = {
  super_admin: new Set(PERMISSIONS),
  operations: new Set([
    "dashboard.view",
    "bookings.view",
    "bookings.manage",
    "treks.view",
    "treks.manage",
    "users.view",
    "operations.view",
    "notifications.view",
  ]),
  finance: new Set([
    "dashboard.view",
    "bookings.view",
    "finance.view",
    "operations.view",
    "notifications.view",
  ]),
  content: new Set([
    "dashboard.view",
    "reviews.view",
    "reviews.manage",
    "blog.view",
    "blog.manage",
    "operations.view",
    "notifications.view",
  ]),
  support: new Set([
    "dashboard.view",
    "bookings.view",
    "users.view",
    "reviews.view",
    "notifications.view",
    "operations.view",
  ]),
};

const TABLE_GROUP_MAP = {
  dashboard: ["dashboard.view"],
  bookings: ["bookings.view", "bookings.manage", "treks.view", "treks.manage"],
  finance: ["finance.view"],
  content: ["blog.view", "blog.manage", "reviews.view", "reviews.manage"],
  settings: ["users.manage", "dropdowns.manage", "rbac.manage"],
};

let schemaReady = false;

async function columnExists(tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
  return rows.length > 0;
}

async function ensureRbacSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      role_key VARCHAR(64) NOT NULL UNIQUE,
      role_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      permission_key VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS admin_role_permissions (
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      allowed TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY(role_id, permission_id),
      CONSTRAINT fk_arp_role FOREIGN KEY (role_id) REFERENCES admin_roles(id) ON DELETE CASCADE,
      CONSTRAINT fk_arp_permission FOREIGN KEY (permission_id) REFERENCES admin_permissions(id) ON DELETE CASCADE
    )
  `);

  const hasRoleId = await columnExists("admins", "role_id");
  if (!hasRoleId) {
    await db.query(`ALTER TABLE admins ADD COLUMN role_id INT NULL`);
  }

  const [roleRows] = await db.query("SELECT id, role_key FROM admin_roles");
  const roleMap = new Map(roleRows.map((row) => [row.role_key, row.id]));

  for (const role of ROLE_DEFINITIONS) {
    if (!roleMap.has(role.roleKey)) {
      const [result] = await db.query(
        "INSERT INTO admin_roles (role_key, role_name) VALUES (?, ?)",
        [role.roleKey, role.roleName]
      );
      roleMap.set(role.roleKey, result.insertId);
    }
  }

  const [permissionRows] = await db.query("SELECT id, permission_key FROM admin_permissions");
  const permissionMap = new Map(permissionRows.map((row) => [row.permission_key, row.id]));

  for (const permissionKey of PERMISSIONS) {
    if (!permissionMap.has(permissionKey)) {
      const [result] = await db.query(
        "INSERT INTO admin_permissions (permission_key, description) VALUES (?, ?)",
        [permissionKey, permissionKey]
      );
      permissionMap.set(permissionKey, result.insertId);
    }
  }

  for (const role of ROLE_DEFINITIONS) {
    const roleId = roleMap.get(role.roleKey);
    const allowedSet = ROLE_PERMISSION_MATRIX[role.roleKey] || new Set();
    for (const permissionKey of PERMISSIONS) {
      const permissionId = permissionMap.get(permissionKey);
      await db.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id, allowed)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)`,
        [roleId, permissionId, allowedSet.has(permissionKey) ? 1 : 0]
      );
    }
  }

  const superAdminRoleId = roleMap.get("super_admin");
  if (superAdminRoleId) {
    await db.query("UPDATE admins SET role_id = ? WHERE role_id IS NULL", [superAdminRoleId]);
  }

  schemaReady = true;
}

async function getRoleContextForAdmin(adminId) {
  await ensureRbacSchema();

  const [rows] = await db.query(
    `SELECT 
      a.id AS admin_id,
      r.id AS role_id,
      COALESCE(r.role_key, 'super_admin') AS role_key,
      COALESCE(r.role_name, 'Super Admin') AS role_name
    FROM admins a
    LEFT JOIN admin_roles r ON r.id = a.role_id
    WHERE a.id = ?
    LIMIT 1`,
    [adminId]
  );

  if (rows.length === 0) {
    return { roleKey: "super_admin", roleName: "Super Admin", permissions: Array.from(ROLE_PERMISSION_MATRIX.super_admin) };
  }

  const role = rows[0];
  if (!role.role_id) {
    return { roleKey: role.role_key, roleName: role.role_name, permissions: Array.from(ROLE_PERMISSION_MATRIX.super_admin) };
  }

  const [permissionRows] = await db.query(
    `SELECT p.permission_key
     FROM admin_role_permissions rp
     INNER JOIN admin_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ? AND rp.allowed = 1`,
    [role.role_id]
  );

  return {
    roleKey: role.role_key,
    roleName: role.role_name,
    permissions: permissionRows.map((row) => row.permission_key),
  };
}

async function getRbacTableRows() {
  await ensureRbacSchema();

  const [rows] = await db.query(
    `SELECT 
      r.id AS role_id,
      r.role_key,
      r.role_name,
      p.permission_key,
      rp.allowed
    FROM admin_roles r
    LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id
    LEFT JOIN admin_permissions p ON p.id = rp.permission_id
    ORDER BY r.role_name ASC`
  );

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.role_key)) {
      grouped.set(row.role_key, {
        roleId: row.role_id,
        roleKey: row.role_key,
        role: row.role_name,
        dashboard: false,
        bookings: false,
        finance: false,
        content: false,
        settings: false,
      });
    }

    if (!row.permission_key || row.allowed !== 1) continue;
    const current = grouped.get(row.role_key);

    for (const [groupKey, permissionKeys] of Object.entries(TABLE_GROUP_MAP)) {
      if (permissionKeys.includes(row.permission_key)) {
        current[groupKey] = true;
      }
    }
  }

  return Array.from(grouped.values());
}

async function upsertRolePermission(roleId, permissionKey, allowed) {
  const [[permission]] = await db.query(
    "SELECT id FROM admin_permissions WHERE permission_key = ? LIMIT 1",
    [permissionKey]
  );
  if (!permission) return;

  await db.query(
    `INSERT INTO admin_role_permissions (role_id, permission_id, allowed)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE allowed = VALUES(allowed)`,
    [roleId, permission.id, allowed ? 1 : 0]
  );
}

async function updateRbacTableRows(rows = []) {
  await ensureRbacSchema();
  if (!Array.isArray(rows)) return [];

  for (const row of rows) {
    if (!row?.roleKey) continue;

    const [[role]] = await db.query("SELECT id FROM admin_roles WHERE role_key = ? LIMIT 1", [row.roleKey]);
    if (!role) continue;

    for (const [groupKey, permissionKeys] of Object.entries(TABLE_GROUP_MAP)) {
      const allowed = Boolean(row[groupKey]);
      for (const permissionKey of permissionKeys) {
        await upsertRolePermission(role.id, permissionKey, allowed);
      }
    }
  }

  return getRbacTableRows();
}

module.exports = {
  ensureRbacSchema,
  getRoleContextForAdmin,
  getRbacTableRows,
  updateRbacTableRows,
};
