import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getOverview = async (req: Request, res: Response) => {
  try {
    const courses = await prismadb.course.findMany();
    const users = await prismadb.user.findMany();
    const cohorts = await prismadb.cohort.findMany();
    const blogs = await prismadb.blog.findMany();

    const modelOveriew = [
      { title: "Users", category: users, route: "/users" },
      { title: "Courses", category: courses, route: "/courses" },
      { title: "Cohorts", category: cohorts, route: "/cohort" },
      { title: "Blogs", category: blogs, route: "/blogs" },
    ];

    res
      .status(200)
      .json({ status: "success", message: null, data: modelOveriew });
  } catch (error) {
    handleServerError(error, res);
  }
};
