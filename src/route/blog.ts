import express from "express";
import {
  createBlog,
  deleteBlog,
  getBlog,
  getBlogs,
  updateBlog,
} from "../controllers/blog";
import { isAdmin, isCourseAdmin } from "../middleware";

export default (router: express.Router) => {
  router.get("/blogs", getBlogs);
  router.post("/blogs", isCourseAdmin, createBlog);
  router.get("/blogs/:blogId", getBlog);
  router.put("/blogs/:blogId", isCourseAdmin, updateBlog);
  router.delete("/blogs/:blogId", isCourseAdmin, deleteBlog);
};

