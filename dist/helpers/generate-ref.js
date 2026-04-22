"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePaymentRef = void 0;
const generatePaymentRef = () => {
    return Math.random().toString(36).substring(2, 14).toUpperCase();
};
exports.generatePaymentRef = generatePaymentRef;
//# sourceMappingURL=generate-ref.js.map