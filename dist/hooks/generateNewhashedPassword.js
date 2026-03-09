"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomChar = generateRandomChar;
exports.generateNewhashedPassword = generateNewhashedPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function generateRandomChar(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return { result };
}
async function generateNewhashedPassword() {
    const { result } = generateRandomChar(8);
    const hashedPassword = await bcryptjs_1.default.hash(result, 10);
    return hashedPassword;
}
//# sourceMappingURL=generateNewhashedPassword.js.map