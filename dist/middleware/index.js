"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = exports.isCourseAdmin = exports.isAuthorized = exports.isLoggedIn = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prismadb_1 = require("../lib/prismadb");
const isLoggedIn = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log("🔍 [isLoggedIn] Checking authentication...");
        console.log("🔍 [isLoggedIn] Authorization header:", authHeader ? "Present" : "Missing");
        if (!authHeader) {
            console.log("❌ [isLoggedIn] No authorization header found");
            return res.status(403).json({ message: "Invalid authentication!" }).end();
        }
        const auth_token = authHeader.split(" ")[1];
        if (!auth_token) {
            console.log("❌ [isLoggedIn] No token found in authorization header");
            return res.status(403).json({ message: "Invalid authentication!" }).end();
        }
        console.log("🔍 [isLoggedIn] Token found, verifying...");
        //@ts-ignore
        jsonwebtoken_1.default.verify(auth_token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) {
                console.log("❌ [isLoggedIn] Token verification failed:", err.message);
                return res.status(401).json({ message: "Invalid Token" }).end();
            }
            try {
                // Fetch the latest user data from the database to ensure roles are up-to-date
                const dbUser = await prismadb_1.prismadb.user.findUnique({
                    where: { id: decoded.id },
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        name: true,
                    }
                });
                if (!dbUser) {
                    console.log("❌ [isLoggedIn] User not found in database:", decoded.id);
                    return res.status(401).json({ message: "User not found" }).end();
                }
                const userObj = {
                    id: dbUser.id,
                    email: dbUser.email || "",
                    role: dbUser.role,
                    name: dbUser.name,
                };
                req.user = userObj;
                console.log("✅ [isLoggedIn] Authentication successful for user:", userObj.email, "Role:", userObj.role);
                next();
            }
            catch (dbError) {
                console.error("❌ [isLoggedIn] Database verification error:", dbError);
                return res.status(500).json({ message: "Internal server error during verification" }).end();
            }
        });
    }
    catch (error) {
        console.error("❌ [isLoggedIn] Error:", error);
        res.status(500).end();
    }
};
exports.isLoggedIn = isLoggedIn;
const isAuthorized = (req, res, next) => {
    try {
        (0, exports.isLoggedIn)(req, res, () => {
            const user = req.user;
            const requestedUserId = req.params.userId || req.body.userId;
            if (user?.id === requestedUserId || user?.role === "ADMIN" || user?.role === "COURSE_ADMIN") {
                next();
            }
            else {
                return res
                    .status(403)
                    .json({ message: "You cannot do that!" })
                    .end();
            }
        });
    }
    catch (error) {
        console.error("[ISAUTHORIZED]:", error);
        res.status(500).end();
    }
};
exports.isAuthorized = isAuthorized;
const isCourseAdmin = (req, res, next) => {
    try {
        (0, exports.isLoggedIn)(req, res, () => {
            const user = req.user;
            console.log("🔍 [isCourseAdmin] Checking course admin access for user:", user?.email, "Role:", user?.role);
            if (user?.role === "COURSE_ADMIN" || user?.role === "ADMIN") {
                console.log("✅ [isCourseAdmin] Access granted");
                next();
            }
            else {
                console.log("❌ [isCourseAdmin] Access denied - user role:", user?.role);
                return res
                    .status(403)
                    .json({ message: "Not authorized, Admin access only!" })
                    .end();
            }
        });
    }
    catch (error) {
        console.error("❌ [isCourseAdmin] Error:", error);
        res.status(500).end();
    }
};
exports.isCourseAdmin = isCourseAdmin;
const isAdmin = (req, res, next) => {
    try {
        (0, exports.isLoggedIn)(req, res, () => {
            const user = req.user;
            if (user?.role === "ADMIN") {
                next();
            }
            else {
                return res
                    .status(403)
                    .json({ message: "Not authorized, Admin access only!" })
                    .end();
            }
        });
    }
    catch (error) {
        console.error("[ISADMIN]:", error);
        res.status(500).end();
    }
};
exports.isAdmin = isAdmin;
//# sourceMappingURL=index.js.map