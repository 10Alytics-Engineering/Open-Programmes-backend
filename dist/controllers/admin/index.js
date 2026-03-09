"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityLinkChange = exports.createBulkUsers = exports.createUser = void 0;
const index_1 = require("../../index");
const password_1 = require("./password");
const mail_1 = require("./mail");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
// Define payment types as constants
const PAYMENT_TYPES = {
    FULL_PAYMENT: "FULL_PAYMENT",
    FIRST_HALF_COMPLETE: "FIRST_HALF_COMPLETE",
    SECOND_HALF_PAYMENT: "SECOND_HALF_PAYMENT",
    FOUR_INSTALLMENTS: "FOUR_INSTALLMENTS",
    THREE_INSTALLMENTS: "THREE_INSTALLMENTS",
};
const createUser = async (req, res) => {
    try {
        const { name, email, phone_number, role, courseId, cohortId } = req.body;
        // Validate input
        if (!name || !email || !phone_number || !role || !courseId || !cohortId) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        // Check if user exists
        const existingUser = await index_1.prismadb.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: "User already exists" });
        }
        // Generate random password
        const password = (0, password_1.generateRandomPassword)(12);
        // Hash the password before storing
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        // Create user
        const user = await index_1.prismadb.user.create({
            data: {
                name,
                email,
                phone_number,
                password: hashedPassword,
                role: role,
            },
        });
        // Add to cohort
        await index_1.prismadb.userCohort.create({
            data: {
                userId: user.id,
                cohortId,
                courseId,
                isPaymentActive: true, // Auto-activate payment
            },
        });
        // Set payment status
        /*
        await prismadb.paymentStatus.create({
          data: {
            userId: user.id,
            courseId,
            paymentType: PAYMENT_TYPES.FULL_PAYMENT,
            status: PaymentStatusType.COMPLETE,
          },
        });
        */
        // Record purchase
        await index_1.prismadb.purchase.create({
            data: {
                userId: user.id,
                courseId,
            },
        });
        // Send email with credentials
        await (0, mail_1.sendWelcomeEmail)({
            email: user.email,
            name: user.name,
            password,
            courseId,
        });
        res.status(201).json(user);
    }
    catch (error) {
        console.error("[ADMIN_USER_CREATION_ERROR]", error);
        res.status(500).json({ error: error });
    }
};
exports.createUser = createUser;
const createBulkUsers = async (req, res) => {
    try {
        const { users, courseId, cohortId } = req.body;
        if (!users || !Array.isArray(users) || !courseId || !cohortId) {
            return res.status(400).json({ error: "Invalid request body" });
        }
        const createdUsers = [];
        const errors = [];
        for (const userData of users) {
            try {
                const { name, email, phone_number } = userData;
                if (!name || !email || !phone_number) {
                    return res.status(400).json({ message: "Missing required Fields!" });
                }
                // Check if user exists
                const existingUser = await index_1.prismadb.user.findUnique({
                    where: { email },
                });
                if (existingUser) {
                    errors.push({ email, error: "User already exists" });
                    continue;
                }
                // Generate random password
                const password = (0, password_1.generateRandomPassword)(12);
                // Hash the password before storing
                const salt = await bcryptjs_1.default.genSalt(10);
                const hashedPassword = await bcryptjs_1.default.hash(password, salt);
                // Create user
                const user = await index_1.prismadb.user.create({
                    data: {
                        name,
                        email,
                        phone_number,
                        password: hashedPassword,
                        role: "USER", // Default role
                    },
                });
                // Add to cohort
                await index_1.prismadb.userCohort.create({
                    data: {
                        userId: user.id,
                        cohortId,
                        courseId,
                        isPaymentActive: true,
                    },
                });
                // Set payment status
                /* await prismadb.paymentStatus.create({
                  data: {
                    userId: user.id,
                    courseId,
                    paymentType: PAYMENT_TYPES.FULL_PAYMENT,
                    status: "COMPLETE",
                  },
                }); */
                // Record purchase
                await index_1.prismadb.purchase.create({
                    data: {
                        userId: user.id,
                        courseId,
                    },
                });
                // Send welcome email
                await (0, mail_1.sendWelcomeEmail)({
                    email: user.email,
                    name: user.name,
                    password,
                    courseId,
                });
                createdUsers.push(user);
            }
            catch (error) {
                errors.push({ email: userData.email, error: "Failed to create user" });
                console.error(`Error creating user ${userData.email}:`, error);
            }
        }
        res.status(201).json({
            success: createdUsers.length,
            failed: errors.length,
            createdUsers,
            errors,
        });
    }
    catch (error) {
        console.error("[BULK_USER_CREATION_ERROR]", error);
        res.status(500).json({ error: error });
    }
};
exports.createBulkUsers = createBulkUsers;
const communityLinkChange = async (req, res) => {
    try {
        const { communityLink } = req.body;
        if (!communityLink) {
            return res.status(400).json({ error: "Add a link to update" });
        }
        // Update the community link for the specified course and cohort
        await index_1.prismadb.links.update({
            where: { id: 1 },
            data: { communityLink },
        });
        res.status(200).json({ message: "Community link updated successfully" });
    }
    catch (error) {
        console.error("[COMMUNITY_LINK_UPDATE_ERROR]", error);
        res.status(500).json({ error: "Failed to update community link" });
    }
};
exports.communityLinkChange = communityLinkChange;
//# sourceMappingURL=index.js.map