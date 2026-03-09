"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandom6DigitNumber = void 0;
const crypto_1 = __importDefault(require("crypto"));
const generateRandom6DigitNumber = () => {
    const randomNumber = crypto_1.default.randomInt(0, 99999);
    return randomNumber.toString().padStart(6, '0');
};
exports.generateRandom6DigitNumber = generateRandom6DigitNumber;
//# sourceMappingURL=generate6digits.js.map