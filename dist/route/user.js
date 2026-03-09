"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const user_1 = require("../controllers/user");
const index_1 = require("../middleware/index");
exports.default = (router) => {
    router.get("/users", user_1.getUsers);
    router.get("/users/search", user_1.searchUsers);
    router.get("/users/:userId", index_1.isAuthorized, user_1.getUser);
    router.get("/users/get-by-email/:email", user_1.getUserByEmail);
    router.get("/users/:userId/no-auth", user_1.getUserWithoutAuth);
    router.get("/users/:userId/courses/:courseId/progress", user_1.getUserCourseProgress);
    router.post("/users/:userId/add-course", index_1.isAdmin, user_1.addUserCourse);
    router.patch("/users/:userId/update-cohort", index_1.isAdmin, user_1.updateUserCohort);
    router.patch("/users/:userId", index_1.isAuthorized, user_1.updateUser);
    router.patch("/users/:userId/update-image", index_1.isAuthorized, user_1.updateUserImage);
    router.patch("/users/:userId/update-role", user_1.updateUserRole);
    router.delete("/users/:userId", index_1.isAuthorized, user_1.deleteUser);
    router.delete("/users/:userId/remove-course", index_1.isAdmin, user_1.removeUserCourse);
};
//# sourceMappingURL=user.js.map