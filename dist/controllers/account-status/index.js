"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAccountStatus = exports.toggleUserAccountStatus = void 0;
const index_1 = require("../../index");
const toggleUserAccountStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { inactive } = req.body;
        // Validate input
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        if (typeof inactive !== 'boolean') {
            return res.status(400).json({ error: "Invalid status value. Must be boolean" });
        }
        // Check if user exists
        const existingUser = await index_1.prismadb.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, inactive: true }
        });
        if (!existingUser) {
            return res.status(404).json({ error: "User not found" });
        }
        // Update user status
        const updatedUser = await index_1.prismadb.user.update({
            where: { id: userId },
            data: { inactive },
            select: {
                id: true,
                name: true,
                email: true,
                inactive: true,
                updatedAt: true
            }
        });
        // Log the action for audit purposes
        console.log(`[USER_STATUS_CHANGE] User ${updatedUser.email} account ${inactive ? 'suspended' : 'activated'} at ${new Date().toISOString()}`);
        res.status(200).json({
            message: `User account ${inactive ? 'suspended' : 'activated'} successfully`,
            user: updatedUser
        });
    }
    catch (error) {
        console.error("[USER_STATUS_TOGGLE_ERROR]", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.toggleUserAccountStatus = toggleUserAccountStatus;
const getUserAccountStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                inactive: true,
                updatedAt: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json({
            user,
            status: user.inactive ? 'inactive' : 'active'
        });
    }
    catch (error) {
        console.error("[GET_USER_STATUS_ERROR]", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getUserAccountStatus = getUserAccountStatus;
//# sourceMappingURL=index.js.map