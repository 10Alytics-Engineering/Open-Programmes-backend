import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prismadb } from "../lib/prismadb";

export interface NebiantUser {
    id: string;
    email: string;
    role: string;
    name: string;
}


export const isLoggedIn = async (req: Request, res: Response, next: NextFunction) => {
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
        jwt.verify(auth_token, process.env.JWT_SECRET as string, async (err, decoded: any) => {
            if (err) {
                console.log("❌ [isLoggedIn] Token verification failed:", err.message);
                return res.status(401).json({ message: "Invalid Token" }).end();
            }

            try {
                // Fetch the latest user data from the database to ensure roles are up-to-date
                const dbUser = await prismadb.user.findUnique({
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

                const userObj: NebiantUser = {
                    id: dbUser.id,
                    email: dbUser.email || "",
                    role: dbUser.role,
                    name: dbUser.name,
                };
                req.user = userObj;

                console.log("✅ [isLoggedIn] Authentication successful for user:", userObj.email, "Role:", userObj.role);
                next();
            } catch (dbError) {
                console.error("❌ [isLoggedIn] Database verification error:", dbError);
                return res.status(500).json({ message: "Internal server error during verification" }).end();
            }
        });
    } catch (error) {
        console.error("❌ [isLoggedIn] Error:", error);
        res.status(500).end();
    }
};

export const isAuthorized = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        isLoggedIn(req, res, () => {
            const user = req.user as NebiantUser;
            const requestedUserId = req.params.userId || req.body.userId;

            if (user?.id === requestedUserId || user?.role === "ADMIN") {
                next();
            } else {
                return res
                    .status(403)
                    .json({ message: "You cannot do that!" })
                    .end();
            }
        });
    } catch (error) {
        console.error("[ISAUTHORIZED]:", error);
        res.status(500).end();
    }
};

export const isCourseAdmin = (req: Request, res: Response, next: NextFunction) => {
    try {
        isLoggedIn(req, res, () => {
            const user = req.user as NebiantUser;
            console.log("🔍 [isCourseAdmin] Checking course admin access for user:", user?.email, "Role:", user?.role);
            if (user?.role === "COURSE_ADMIN" || user?.role === "ADMIN") {
                console.log("✅ [isCourseAdmin] Access granted");
                next();
            } else {
                console.log("❌ [isCourseAdmin] Access denied - user role:", user?.role);
                return res
                    .status(403)
                    .json({ message: "Not authorized, Admin access only!" })
                    .end();
            }
        });
    } catch (error) {
        console.error("❌ [isCourseAdmin] Error:", error);
        res.status(500).end();
    }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
    try {
        isLoggedIn(req, res, () => {
            const user = req.user as NebiantUser;
            if (user?.role === "ADMIN") {
                next();
            } else {
                return res
                    .status(403)
                    .json({ message: "Not authorized, Admin access only!" })
                    .end();
            }
        });
    } catch (error) {
        console.error("[ISADMIN]:", error);
        res.status(500).end();
    }
};
