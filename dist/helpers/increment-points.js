"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementPoints = void 0;
const index_1 = require("../index");
const incrementPoints = async (userId, quizId, isCorrect) => {
    if (isCorrect) {
        const leaderboardEntry = await index_1.prismadb.leaderboard.upsert({
            where: {
                userId_quizId: {
                    userId: userId,
                    quizId: quizId,
                },
            },
            update: {
                points: {
                    increment: 10,
                },
            },
            create: {
                userId: userId,
                quizId: quizId,
                points: 10,
            },
        });
        console.log(`Points updated for user ${userId} in quiz ${quizId}:`, leaderboardEntry.points);
    }
};
exports.incrementPoints = incrementPoints;
//# sourceMappingURL=increment-points.js.map