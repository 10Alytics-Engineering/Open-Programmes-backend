"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.googleAuth = googleAuth;
exports.account = account;
exports.register = register;
exports.verifyEmail = verifyEmail;
exports.resendEmailVerification = resendEmailVerification;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.refreshAccessToken = refreshAccessToken;
const index_1 = require("../../../src/index");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const token_1 = require("./token");
const mail_1 = require("./mail");
const validate_email_1 = require("../../hooks/validate-email");
const validate_password_1 = require("../../hooks/validate-password");
const google_auth_library_1 = require("google-auth-library");
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
async function login(req, res) {
    try {
        const { password } = req.body;
        const email = req.body.email?.toLowerCase();
        if (!email || !password) {
            return res.status(400).json({ message: "Invalid Credentials" });
        }
        if (password?.length < 7) {
            return res
                .status(400)
                .json({ message: "Password should be at least 8 characters" });
        }
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                email,
            },
        });
        if (!existingUser || !existingUser?.email) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        const comparePassword = await bcryptjs_1.default.compare(password, existingUser?.password);
        if (!comparePassword) {
            return res?.status(401).json({ message: "Invalid Password" });
        }
        // In Case account have not been verified;
        //Commented out because next-auth can't process this response,
        //it would work in normal authentication though, so for now, handle email verification in frontend.
        // if (!existingUser?.emailVerified) {
        //   const verificationToken = await generateVerificationToken(email);
        //   await sendVerificationEmail(existingUser.email, verificationToken.token);
        //   return res.status(200).json({
        //     status: "success",
        //     emailVerified: null,
        //     message: "Confirmation email sent!",
        //   });
        // }
        if (!existingUser?.emailVerified) {
            const verificationToken = await (0, token_1.generateVerificationToken)(email);
            await (0, mail_1.sendVerificationEmail)(existingUser.email, verificationToken.token);
        }
        const access_token = jsonwebtoken_1.default.sign({
            email: existingUser.email,
            id: existingUser.id,
            role: existingUser.role,
        }, process.env.JWT_SECRET, { expiresIn: "30d" });
        const refresh_token = jsonwebtoken_1.default.sign({
            email: existingUser.email,
            id: existingUser?.id,
            role: existingUser?.role,
        }, process.env.JWT_SECRET, { expiresIn: "30d" });
        const updatedExistingUser = await index_1.prismadb.user.update({
            data: {
                access_token,
            },
            where: {
                id: existingUser.id,
            },
        });
        return res.status(200).json({
            status: "success",
            message: `${!existingUser.emailVerified && "Confirmation email sent!"}`,
            refresh_token,
            data: { ...updatedExistingUser },
        });
    }
    catch (error) {
        console.log("[LOGIN]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function googleAuth(req, res) {
    try {
        const { email, name, googleId, image, token, // Optional: The ID token from Google
         } = req.body;
        if (!email || !name || !googleId) {
            return res.status(400).json({ message: "Invalid Google credentials" });
        }
        // Secure verification (if token is provided)
        if (token) {
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken: token,
                    audience: process.env.GOOGLE_CLIENT_ID,
                });
                const payload = ticket.getPayload();
                if (!payload || payload.email?.toLowerCase() !== email.toLowerCase()) {
                    return res.status(401).json({ message: "Invalid Google session" });
                }
            }
            catch (err) {
                console.error("Token verification failed:", err);
                return res.status(401).json({ message: "Token verification failed" });
            }
        }
        else {
            console.warn("Google authentication requested without ID token. This is insecure.");
        }
        // Checking if user exists with this email
        //...
        let user = await index_1.prismadb.user.findUnique({
            where: { email },
        });
        if (!user) {
            // Creating new user if doesn't exist
            user = await index_1.prismadb.user.create({
                data: {
                    email,
                    name,
                    image,
                    emailVerified: new Date(), // Google verified emails are considered verified
                    password: "", // No password for Google users
                },
            });
            // Creating account record for Google OAuth
            await index_1.prismadb.account.create({
                data: {
                    userId: user.id,
                    type: "oauth",
                    provider: "google",
                    providerAccountId: googleId,
                },
            });
        }
        // Checking if this Google account is linked to the user
        const account = await index_1.prismadb.account.findFirst({
            where: {
                userId: user.id,
                provider: "google",
                providerAccountId: googleId,
            },
        });
        if (!account) {
            // Linking the Google account if not already linked
            await index_1.prismadb.account.create({
                data: {
                    userId: user.id,
                    type: "oauth",
                    provider: "google",
                    providerAccountId: googleId,
                },
            });
        }
        // Generate tokens
        const access_token = jsonwebtoken_1.default.sign({
            email: user.email,
            id: user.id,
            role: user.role,
        }, process.env.JWT_SECRET, { expiresIn: "30d" });
        const refresh_token = jsonwebtoken_1.default.sign({
            email: user.email,
            id: user.id,
            role: user.role,
        }, process.env.JWT_SECRET, { expiresIn: "30d" });
        // Update user with new access token
        await index_1.prismadb.user.update({
            where: { id: user.id },
            data: { access_token },
        });
        return res.status(200).json({
            status: "success",
            refresh_token,
            data: { ...user, access_token },
        });
    }
    catch (error) {
        console.log("[GOOGLE_AUTH]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function account(req, res) {
    try {
        const { userId, type, provider, providerAccountId, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state, } = req.body;
        if (!type || !provider || !providerAccountId) {
            return res.status(400).json({ message: "Invalid field" });
        }
        const oauthAccount = await index_1.prismadb.account.create({
            data: {
                userId,
                type,
                provider,
                providerAccountId,
                refresh_token,
                access_token,
                expires_at,
                token_type,
                scope,
                id_token,
                session_state,
            },
        });
        return res.status(200).json({
            status: "success",
            data: { ...oauthAccount },
        });
    }
    catch (error) {
        console.log("[ACCOUNT]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function register(req, res) {
    try {
        const { name, password, phone_number } = req.body;
        const email = req.body.email?.toLowerCase();
        if (!name || !email || !password || !phone_number) {
            return res.status(400).json({ message: "Fill in credentials!" });
        }
        const isEmailValid = (0, validate_email_1.validateEmail)(email);
        if (!isEmailValid) {
            return res.status(400).json({ message: "Invalid email address!" });
        }
        const isPasswordValid = (0, validate_password_1.validatePassword)(password, res);
        if (!isPasswordValid) {
            return;
        }
        const existingUsers = await index_1.prismadb.user.findMany({
            where: {
                OR: [{ email }, { phone_number }],
            },
        });
        if (existingUsers.length > 0) {
            const isEmailTaken = existingUsers.some((user) => user.email === email);
            const isPhoneTaken = existingUsers.some((user) => user.phone_number === phone_number);
            if (isEmailTaken && isPhoneTaken) {
                return res
                    .status(403)
                    .json({ message: "Email and Phone number already used" });
            }
            if (isEmailTaken) {
                return res
                    .status(403)
                    .json({ message: "User with this email already exists" });
            }
            if (isPhoneTaken) {
                return res.status(403).json({ message: "Phone number already used" });
            }
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        const user = await index_1.prismadb.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                emailVerified: new Date(),
                phone_number,
            },
        });
        // const verificationToken = await generateVerificationToken(email);
        // await sendVerificationEmail(
        //   verificationToken?.email,
        //   verificationToken?.token
        // );
        return res.status(201).json({ user });
    }
    catch (error) {
        console.log("[REGISTER]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function verifyEmail(req, res) {
    try {
        const { code } = req.body;
        if (!code || typeof code !== "string") {
            return res.status(400).json({ message: "Invalid verification code" });
        }
        const existingToken = await index_1.prismadb.verificationToken.findUnique({
            where: {
                token: code,
            },
        });
        if (!existingToken) {
            return res.status(403).json({ message: "Invalid Token" });
        }
        const hasExpired = new Date(existingToken?.expires) < new Date();
        if (hasExpired) {
            return res.status(403).json({ message: "Token has expired" });
        }
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                email: existingToken?.email,
            },
        });
        await index_1.prismadb.user.update({
            where: {
                id: existingUser?.id,
            },
            data: {
                emailVerified: new Date(),
                email: existingToken?.email,
            },
        });
        await index_1.prismadb.verificationToken.delete({
            where: {
                id: existingToken?.id,
                email: existingToken?.email,
            },
        });
        return res
            .status(200)
            .json({ status: "success", message: "Email verified!" });
    }
    catch (error) {
        console.log("[VERIFY_EMAIL]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function resendEmailVerification(req, res) {
    try {
        const { email } = req.body;
        if (!email || typeof email !== "string") {
            return res.status(400).json({ message: "Invalid field" });
        }
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                email,
            },
        });
        if (!existingUser || !existingUser?.email) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        const verificationToken = await (0, token_1.generateVerificationToken)(existingUser.email);
        await (0, mail_1.sendVerificationEmail)(verificationToken?.email, verificationToken?.token);
        return res
            .status(200)
            .json({ status: "success", message: "Verification email sent!" });
    }
    catch (error) {
        console.log("[RESEND_VERIFICATION_EMAIL]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email || typeof email !== "string") {
            return res.status(400).json({ message: "Invalid field" });
        }
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                email,
            },
        });
        if (!existingUser || !existingUser.email) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        const generatedToken = await (0, token_1.generatePasswordResetToken)(existingUser?.email);
        await (0, mail_1.sendPasswordResetEmail)(generatedToken.email, generatedToken.token);
        return res.status(200).json({
            status: "success",
            message: "Reset token email has been sent!",
        });
    }
    catch (error) {
        console.log("[FORGOT_PASSWORD]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function resetPassword(req, res) {
    try {
        const { code, password, password_confirmation, } = req.body;
        if (!password || !password_confirmation || !code) {
            return res.status(400).json({ message: "Invalid field!" });
        }
        if (password !== password_confirmation) {
            return res.status(400).json({ message: "Password do not match!" });
        }
        const existingToken = await index_1.prismadb.passwordResetToken.findUnique({
            where: {
                token: code,
            },
        });
        if (!existingToken) {
            return res.status(403).json({ message: "Invalid Token" });
        }
        const hasExpired = new Date(existingToken?.expires) < new Date();
        if (hasExpired) {
            return res.status(403).json({ message: "Token has expired" });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        await index_1.prismadb.user.update({
            data: {
                password: hashedPassword,
                email: existingToken?.email,
            },
            where: {
                email: existingToken?.email,
            },
        });
        await index_1.prismadb.passwordResetToken.delete({
            where: {
                token: existingToken.token,
            },
        });
        return res.status(200).json({
            status: "success",
            message: "Password reset successfully!",
        });
    }
    catch (error) {
        console.log("[RESET_PASSWORD]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function refreshAccessToken(req, res) {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(401).json({ message: "Refresh token is required" });
        }
        // Verify the refresh token
        let payload = null;
        try {
            payload = jsonwebtoken_1.default.verify(refresh_token, process.env.JWT_SECRET);
        }
        catch (err) {
            return res.status(403).json({ message: "Invalid refresh token" });
        }
        // Check if the refresh token is still valid
        const existingUser = await index_1.prismadb.user.findUnique({
            where: {
                id: payload.id,
            },
        });
        if (!existingUser) {
            return res.status(401).json({ message: "User not found" });
        }
        // Generate a new access token
        const access_token = jsonwebtoken_1.default.sign({
            email: existingUser.email,
            id: existingUser.id,
            role: existingUser.role,
        }, process.env.JWT_SECRET, { expiresIn: "1h" });
        await index_1.prismadb.user.update({
            data: {
                access_token,
            },
            where: {
                id: existingUser.id,
            },
        });
        return res
            .status(200)
            .json({ status: "success", message: "Access token refreshed!" });
    }
    catch (error) {
        console.log("[REFRESH_ACCESS_TOKEN]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
//# sourceMappingURL=index.js.map