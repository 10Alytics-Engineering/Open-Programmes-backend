import express from "express";
import {
  createBlog,
  deleteBlog,
  getBlog,
  getBlogs,
  updateBlog,
} from "../controllers/blog";
import { isAdmin } from "../middleware";

export default (router: express.Router) => {
  router.get("/blogs", getBlogs);
  router.post("/blogs", isAdmin, createBlog);
  router.get("/blogs/:blogId", getBlog);
  router.put("/blogs/:blogId", isAdmin, updateBlog);
  router.delete("/blogs/:blogId", isAdmin, deleteBlog);
};
