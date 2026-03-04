const rbacService = require("../service/rbac.service");

async function getRbacTable(req, res) {
  try {
    const rows = await rbacService.getRbacTableRows();
    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Get RBAC table error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch RBAC table",
    });
  }
}

async function updateRbacTable(req, res) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const updated = await rbacService.updateRbacTableRows(rows);
    return res.status(200).json({
      success: true,
      message: "RBAC permissions updated",
      data: updated,
    });
  } catch (error) {
    console.error("Update RBAC table error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update RBAC table",
    });
  }
}

module.exports = {
  getRbacTable,
  updateRbacTable,
};
