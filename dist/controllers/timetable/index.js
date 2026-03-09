"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTimetable = exports.deleteTimetable = exports.updateTimetable = exports.getTimetable = exports.getTimetables = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getTimetables = async (req, res) => {
    try {
        const timetables = await index_1.prismadb.timeTable.findMany({
            orderBy: {
                createdAt: "asc"
            }
        });
        res
            .status(200)
            .json({ status: "success", message: null, data: timetables });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getTimetables = getTimetables;
const getTimetable = async (req, res) => {
    try {
        const { timetableId } = req.params;
        if (!timetableId) {
            return res.status(400).json({ message: "Timetable ID is required" });
        }
        const timetable = await index_1.prismadb.timeTable.findUnique({
            where: {
                id: timetableId,
            },
        });
        res.status(200).json({ status: "success", message: null, data: timetable });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getTimetable = getTimetable;
const updateTimetable = async (req, res) => {
    try {
        const { timetableId } = req.params;
        const body = req.body;
        if (!timetableId) {
            return res.status(400).json({ message: "Timetable ID is required" });
        }
        const timeTable = await index_1.prismadb.timeTable.findUnique({
            where: {
                id: timetableId,
            },
        });
        if (!timeTable) {
            return res.status(404).json({ message: "Timetable not found" });
        }
        await index_1.prismadb.timeTable.update({
            data: {
                ...body,
            },
            where: {
                id: timetableId,
            },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: "Timetable updated successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateTimetable = updateTimetable;
const deleteTimetable = async (req, res) => {
    try {
        const { timetableId } = req.params;
        if (!timetableId) {
            return res.status(400).json({ message: "Timetable ID is required" });
        }
        const timeTable = await index_1.prismadb.timeTable.findUnique({
            where: {
                id: timetableId,
            },
        });
        if (!timeTable) {
            return res.status(404).json({ message: "Timetable not found" });
        }
        await index_1.prismadb.timeTable.delete({
            where: {
                id: timetableId,
            },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: "Timetable deleted successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteTimetable = deleteTimetable;
const createTimetable = async (req, res) => {
    const { name, category, courseId, } = req.body;
    if (!name) {
        return res.status(400).json({ message: "name is required" });
    }
    if (!category) {
        return res.status(400).json({ message: "Category is required" });
    }
    if (!courseId) {
        return res.status(400).json({ message: "CohortId is required" });
    }
    try {
        const timetable = await index_1.prismadb.timeTable.create({
            data: {
                name,
                category,
                courseId,
            },
        });
        res.status(201).json({
            status: "success",
            message: "Timetable created successfully",
            data: timetable,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createTimetable = createTimetable;
//# sourceMappingURL=index.js.map