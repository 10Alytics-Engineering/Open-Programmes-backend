"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMasterClassApplicants = exports.registerMasterclass = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const registerMasterclass = async (req, res) => {
    const { name, email, phone, gender, location, heard_from, help_with } = req.body;
    if (!name || !email || !phone) {
        return res
            .status(400)
            .json({ message: "Name, Email and Phone Number required" });
    }
    try {
        await prismadb_1.prismadb.masterClassRegistration.create({
            data: {
                name,
                email,
                phone,
                gender,
                location,
                heard_from,
                help_with,
            },
        });
        return res.status(201).json({
            status: "success",
            message: null,
            data: "Registration successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.registerMasterclass = registerMasterclass;
const getMasterClassApplicants = async (req, res) => {
    try {
        const masterclassApplicants = await prismadb_1.prismadb.masterClassRegistration.findMany();
        res
            .status(200)
            .json({ status: "success", message: null, data: masterclassApplicants });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getMasterClassApplicants = getMasterClassApplicants;
//# sourceMappingURL=index.js.map