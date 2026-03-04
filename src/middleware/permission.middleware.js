function requirePermission(permissionKey) {
  return function permissionMiddleware(req, res, next) {
    const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    if (permissions.includes(permissionKey)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Forbidden",
    });
  };
}

module.exports = {
  requirePermission,
};
