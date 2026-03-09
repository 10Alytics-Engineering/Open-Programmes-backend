"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSessions = exports.createSession = void 0;
const index_1 = require("../../index");
const createSession = async (req, res) => {
    try {
        const { title, description, startTime, endTime, sessionLink, } = req.body;
        if (!title || !startTime || !endTime || !sessionLink) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (new Date(startTime) >= new Date(endTime)) {
            return res
                .status(400)
                .json({ error: "End time must be after start time" });
        }
        const session = await index_1.prismadb.sessions.create({
            data: {
                title,
                description,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                sessionLink,
            },
        });
        res.status(201).json(session);
    }
    catch (error) {
        console.error("[SESSION_CREATION_ERROR]", error);
        res.status(500).json({ error: "Failed to create session" });
    }
};
exports.createSession = createSession;
const getActiveSessions = async (req, res) => {
};
exports.getActiveSessions = getActiveSessions;
//# sourceMappingURL=index.js.map