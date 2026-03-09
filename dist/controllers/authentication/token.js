"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePasswordResetToken = exports.generateVerificationToken = void 0;
const generate6digits_1 = require("../../hooks/generate6digits");
const index_1 = require("../../../src/index");
const generateVerificationToken = async (email) => {
    // const token = uuidv4();
    const token = (0, generate6digits_1.generateRandom6DigitNumber)();
    const expires = new Date(new Date().getTime() + 3600 * 1000);
    const existingToken = await index_1.prismadb.verificationToken.findFirst({
        where: {
            email,
        },
    });
    if (existingToken) {
        await index_1.prismadb.verificationToken.delete({
            where: {
                id: existingToken.id,
            },
        });
    }
    const verificationToken = index_1.prismadb.verificationToken.create({
        data: {
            token,
            email,
            expires,
        },
    });
    return verificationToken;
};
exports.generateVerificationToken = generateVerificationToken;
const generatePasswordResetToken = async (email) => {
    // const token = uuidv4();
    const token = (0, generate6digits_1.generateRandom6DigitNumber)();
    const expires = new Date(new Date().getTime() + 3600 * 1000);
    const existingToken = await index_1.prismadb.passwordResetToken.findFirst({
        where: {
            email,
        },
    });
    if (existingToken) {
        await index_1.prismadb.passwordResetToken.delete({
            where: {
                id: existingToken.id,
            },
        });
    }
    const passwordResetToken = index_1.prismadb.passwordResetToken.create({
        data: {
            token,
            email,
            expires,
        },
    });
    return passwordResetToken;
};
exports.generatePasswordResetToken = generatePasswordResetToken;
//# sourceMappingURL=token.js.map