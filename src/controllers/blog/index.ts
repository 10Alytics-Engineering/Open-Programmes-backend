import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { BlogImage } from "@prisma/client";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const getBlogs = async (req: Request, res: Response) => {
  try {
    const blogs = await prismadb.blog.findMany({
      include: {
        images: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({ status: "success", message: null, data: blogs });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getBlog = async (req: Request, res: Response) => {
  const { blogId } = req.params;

  try {
    const existingBlog = await prismadb.blog.findUnique({
      where: {
        id: blogId,
      },
      include: {
        images: true,
      },
    });

    res
      .status(200)
      .json({
        status: "success",
        message: existingBlog ? "Nonexistent Blog!" : null,
        data: existingBlog,
      });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const createBlog = async (req: Request, res: Response) => {
  const {
    title,
    content,
    mins_read,
    images,
  }: {
    title: string;
    content: string;
    mins_read: string;
    images: BlogImage[];
  } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: "Title and Content is required" });
  }

  if (!images || !images.length) {
    return res.status(400).json({ message: "Image is required" });
  }

  try {
    const blog = await prismadb.blog.create({
      data: {
        title,
        content,
        mins_read,
        images: {
          createMany: {
            //@ts-ignore
            data: [...images.map((image: { url: string }) => image)],
          },
        },
      },
    });

    res.status(200).json({
      status: "success",
      message: "Blog created successfully",
      data: blog,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const updateBlog = async (req: Request, res: Response) => {
  const { blogId } = req.params;

  const {
    title,
    content,
    mins_read,
    images,
  }: {
    title: string;
    content: string;
    mins_read: string;
    images: BlogImage[];
  } = req.body;

  try {
    const existingBlog = await prismadb.blog.findUnique({
      where: {
        id: blogId,
      },
    });

    if (!existingBlog) {
      return res.status(404).json({ message: "Nonexistent Blog!" });
    }

    await prismadb.blog.update({
      where: {
        id: existingBlog.id,
      },
      data: {
        title,
        content,
        mins_read,
        images: {
          deleteMany: {},
        },
      },
    });

    const blog = await prismadb.blog.update({
      where: {
        id: existingBlog.id,
      },
      data: {
        title,
        content,
        mins_read,
        images: {
          createMany: {
            //@ts-ignore
            data: [...images.map((image: { url: string }) => image)],
          },
        },
      },
      include: {
        images: true
      }
    });

    res.status(200).json({
      status: "success",
      message: "Blog updated successfully",
      data: blog,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteBlog = async (req: Request, res: Response) => {
  const { blogId } = req.params;

  try {
    const existingBlog = await prismadb.blog.findUnique({
      where: {
        id: blogId,
      },
    });

    if (!existingBlog) {
      return res.status(404).json({ message: "Nonexistent Blog!" });
    }

    await prismadb.blog.delete({
      where: {
        id: existingBlog.id,
      },
    });

    res
      .status(200)
      .json({ status: "success", message: "Blog deleted sucessfully" });
  } catch (error) {
    handleServerError(error, res);
  }
};
