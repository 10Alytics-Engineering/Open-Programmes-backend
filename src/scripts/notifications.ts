import { prismadb } from "../lib/prismadb";

const runSript = async () => {
  const assignments = await prismadb.courseCohortLeaderboard.findMany({});

  console.log(assignments);
};

runSript().catch((e) => {
  console.error(e);
  process.exit(1);
});
