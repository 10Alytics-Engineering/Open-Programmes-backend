"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createModule = exports.getModulesByWeek = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getModulesByWeek = async (req, res) => {
    try {
        const { weekId } = req.params;
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const modules = await index_1.prismadb.module.findMany({
            where: { courseWeekId: weekId },
            orderBy: { createdAt: "asc" },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: modules,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getModulesByWeek = getModulesByWeek;
const createModule = async (req, res) => {
    try {
        const { title, description, courseWeekId } = req.body;
        if (!title || !courseWeekId) {
            return res.status(400).json({
                message: "Title and courseWeekId are required",
            });
        }
        const newModule = await index_1.prismadb.module.create({
            data: {
                title,
                description: description || "",
                courseWeekId,
            },
        });
        res.status(201).json({
            status: "success",
            message: "Module created successfully",
            data: newModule,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createModule = createModule;
//# sourceMappingURL=index.js.map