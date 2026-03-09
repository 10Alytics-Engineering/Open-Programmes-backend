"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProgramLead = createProgramLead;
exports.getProgramLeads = getProgramLeads;
exports.getProgramLeadsCount = getProgramLeadsCount;
exports.exportProgramLeads = exportProgramLeads;
const index_1 = require("../../../src/index");
const exceljs_1 = __importDefault(require("exceljs"));
async function createProgramLead(req, res) {
    try {
        const { firstName, lastName, email, gender, phoneNumber, hearAbout, otherSource, programType, } = req.body;
        // Validate required fields
        if (!firstName ||
            !lastName ||
            !email ||
            !gender ||
            !phoneNumber ||
            !hearAbout ||
            !programType) {
            return res
                .status(400)
                .json({ message: "All required fields must be provided" });
        }
        // Check if email already exists
        const existingLead = await index_1.prismadb.programLeads.findFirst({
            where: {
                email,
                programType,
            },
        });
        if (existingLead) {
            return res.status(409).json({
                message: "This email has already been registered for this program",
                existingLead,
            });
        }
        // Create new program lead
        const programLead = await index_1.prismadb.programLeads.create({
            data: {
                programType,
                firstName,
                lastName,
                email,
                gender,
                phoneNumber,
                hearAbout: hearAbout.join(", "), // Convert array to string
                otherSource,
            },
        });
        return res.status(201).json({ programLead });
    }
    catch (error) {
        console.error("[CREATE_PROGRAM_LEAD_ERROR]:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}
async function getProgramLeads(req, res) {
    try {
        const { programType } = req.query;
        const whereClause = programType ? { programType: String(programType) } : {};
        const leads = await index_1.prismadb.programLeads.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc',
            },
        });
        return res.status(200).json({ data: leads });
    }
    catch (error) {
        console.error("[GET_PROGRAM_LEADS_ERROR]:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}
async function getProgramLeadsCount(req, res) {
    try {
        const counts = await index_1.prismadb.programLeads.groupBy({
            by: ['programType'],
            _count: {
                programType: true,
            },
        });
        return res.status(200).json({ data: counts });
    }
    catch (error) {
        console.error("[GET_PROGRAM_LEADS_COUNT_ERROR]:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}
async function exportProgramLeads(req, res) {
    try {
        const { programType } = req.query;
        const whereClause = programType ? { programType: String(programType) } : {};
        const leads = await index_1.prismadb.programLeads.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc',
            },
        });
        // Create workbook
        const workbook = new exceljs_1.default.Workbook();
        const worksheet = workbook.addWorksheet('Program Leads');
        // Add headers
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'First Name', key: 'firstName', width: 20 },
            { header: 'Last Name', key: 'lastName', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Phone', key: 'phoneNumber', width: 20 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Program Type', key: 'programType', width: 20 },
            { header: 'Heard About', key: 'hearAbout', width: 30 },
            { header: 'Other Source', key: 'otherSource', width: 30 },
            { header: 'Created At', key: 'createdAt', width: 20 },
        ];
        // Add data
        leads.forEach(lead => {
            worksheet.addRow({
                id: lead.id,
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email,
                phoneNumber: lead.phoneNumber,
                gender: lead.gender,
                programType: lead.programType,
                hearAbout: lead.hearAbout,
                otherSource: lead.otherSource || '',
                createdAt: lead.createdAt.toISOString(),
            });
        });
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=program-leads-${programType || 'all'}-${new Date().toISOString()}.xlsx`);
        // Send the workbook
        await workbook.xlsx.write(res);
        res.end();
    }
    catch (error) {
        console.error("[EXPORT_PROGRAM_LEADS_ERROR]:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
}
//# sourceMappingURL=index.js.map