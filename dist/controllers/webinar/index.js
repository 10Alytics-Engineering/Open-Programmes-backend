"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGenerativeAiData = exports.registerAiAutomation = void 0;
const prismadb_1 = require("../../lib/prismadb");
const registerAiAutomation = async (req, res) => {
    try {
        const { full_name, email, phone, skill_interested_in, terms_accepted } = req.body;
        const registration = await prismadb_1.prismadb.webinarAiAutomation.create({
            data: {
                full_name,
                email,
                phone,
                skill_interested_in,
                terms_accepted,
            },
        });
        return res.status(200).json(registration);
    }
    catch (error) {
        console.log(error);
        return res.status(400).json({ error: "An error occurred during registration" });
    }
};
exports.registerAiAutomation = registerAiAutomation;
const registerGenerativeAiData = async (req, res) => {
    try {
        const { full_name, email, phone, skill_interested_in, terms_accepted } = req.body;
        const registration = await prismadb_1.prismadb.webinarGenerativeAiData.create({
            data: {
                full_name,
                email,
                phone,
                skill_interested_in,
                terms_accepted,
            },
        });
        return res.status(200).json(registration);
    }
    catch (error) {
        console.log(error);
        return res.status(400).json({ error: "An error occurred during registration" });
    }
};
exports.registerGenerativeAiData = registerGenerativeAiData;
//# sourceMappingURL=index.js.map