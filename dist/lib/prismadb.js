"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prismadb = void 0;
const client_1 = require("@prisma/client");
exports.prismadb = globalThis.prisma || new client_1.PrismaClient();
if (process.env.NODE_ENV !== "production")
    globalThis.prisma = exports.prismadb;
//# sourceMappingURL=prismadb.js.map