"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueAssignmentSlug = exports.slugify = void 0;
const slugify = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w-]+/g, '') // Remove all non-word chars
        .replace(/--+/g, '-'); // Replace multiple - with single -
};
exports.slugify = slugify;
/**
 * Generates a unique slug for an assignment by checking the DB.
 * e.g. "assignment-1", then "assignment-1-2" if taken, etc.
 */
const generateUniqueAssignmentSlug = async (title, prismaClient, excludeId) => {
    const base = (0, exports.slugify)(title);
    let candidate = base;
    let counter = 2;
    while (true) {
        const existing = await prismaClient.assignment.findUnique({
            where: { slug: candidate },
            select: { id: true },
        });
        // No clash, or the clash is the assignment we're updating itself
        if (!existing || existing.id === excludeId) {
            return candidate;
        }
        candidate = `${base}-${counter}`;
        counter++;
    }
};
exports.generateUniqueAssignmentSlug = generateUniqueAssignmentSlug;
//# sourceMappingURL=slugify.js.map