const jwt = require("jsonwebtoken");

exports.protect = (allowedRoles = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Not authorized, no token" });
    }

    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;

      // Check if role is allowed
      if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ msg: "Access denied for your role" });
      }

      next();
    } catch (err) {
      console.error("Auth error:", err);
      res.status(401).json({ msg: "Invalid token" });
    }
  };
};
