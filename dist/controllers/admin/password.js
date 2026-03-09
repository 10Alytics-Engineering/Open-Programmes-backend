"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomPassword = void 0;
const generateRandomPassword = (length = 8) => {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const special = "!@#$%^&*()_+";
    // Ensuring we have at least one character from each required set
    let password = [
        lowercase[Math.floor(Math.random() * lowercase.length)],
        uppercase[Math.floor(Math.random() * uppercase.length)],
        special[Math.floor(Math.random() * special.length)],
        numbers[Math.floor(Math.random() * numbers.length)]
    ].join('');
    // Filling the rest with random characters from all sets
    const allChars = lowercase + uppercase + numbers + special;
    while (password.length < length) {
        const randomIndex = Math.floor(Math.random() * allChars.length);
        password += allChars[randomIndex];
    }
    // Shuffling the password to mix the required characters
    return password.split('').sort(() => Math.random() - 0.5).join('');
};
exports.generateRandomPassword = generateRandomPassword;
//# sourceMappingURL=password.js.map