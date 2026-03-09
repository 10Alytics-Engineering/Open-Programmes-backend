"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEmail = void 0;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateEmail = (email) => emailRegex.test(email);
exports.validateEmail = validateEmail;
//# sourceMappingURL=validate-email.js.map