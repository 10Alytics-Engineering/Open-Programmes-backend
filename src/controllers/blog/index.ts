import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { BlogImage, Prisma } from "@prisma/client";
import { generateSignedFileUrl } from "../../services/upload.service";
import { sendBlogNotificationEmail } from "../../mails/blog-mails";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const sendBlogNotificationsOnce = async (blogId: string) => {
  try {
    const blog = await prismadb.blog.findUnique({
      where: { id: blogId },
      include: { images: true },
    });

    if (!blog) {
      console.log("Blog not found for notification:", blogId);
      return;
    }

    const subscribers = await prismadb.emailSubscription.findMany({
      where: { notifyNewBlogs: true },
      select: { id: true, email: true, unsubscribeToken: true },
    });

    if (!subscribers.length) {
      console.log("No active blog subscribers found");
      return;
    }

    // fire-and-forget so request doesn't hang
    const results = await Promise.allSettled(
      subscribers.map((subscriber) =>
        sendBlogNotificationEmail({
          email: subscriber.email,
          blogTitle: blog.title,
          blogId: blog.id,
          unsubscribeToken: subscriber.unsubscribeToken,
        }),
      ),
    );

    console.log("Blog notification results:", {
      blogId: blog.id,
      total: results.length,
      sent: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    });

    await prismadb.blog.update({
      where: { id: blog.id },
      data: {
        notificationSentAt: new Date(),
      },
    });
  } catch (error) {
    console.log("Failed to send blog notifications");
  }
};

export const getBlogs = async (req: Request, res: Response) => {
  try {
    const { limit, offset, search } = req.query;

    const findOptions: any = {
      include: {
        images: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    };

    const take = Number(limit);
    const skip = Number(offset);

    const where: Prisma.BlogWhereInput = search
      ? {
          OR: [
            {
              title: {
                contains: String(search),
                mode: "insensitive",
              },
            },
            {
              content: {
                contains: String(search),
                mode: "insensitive",
              },
            },
          ],
        }
      : {};

    if (limit) {
      findOptions.take = take;
    }
    if (offset) {
      findOptions.skip = skip;
    }

    findOptions.where = where;

    const [blogs, total] = await Promise.all([
      prismadb.blog.findMany({ ...findOptions, include: { images: true } }),

      prismadb.blog.count({
        where,
      }),
    ]);

    const blogsWithSignedImages = await Promise.all(
      blogs.map(async (blog: { [key: string]: any }) => {
        const images = await Promise.all(
          (blog?.images || []).map(async (image: BlogImage) => {
            const signedUrl = image.key
              ? await generateSignedFileUrl(image.key)
              : image.url || null;

            return {
              ...image,
              url: signedUrl,
            };
          }),
        );

        return {
          ...blog,
          images,
        };
      }),
    );

    res.status(200).json({
      status: "success",
      message: null,
      data: blogsWithSignedImages,
      pagination: {
        total: total || 0,
        limit: take || 0,
        offset: skip || 0,
        hasMore: skip + blogs.length < total,
      },
    });
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

    if (!existingBlog?.id)
      return res.status(404).json({ error: "Blog not found" });

    const images = await Promise.all(
      existingBlog.images.map(async (image) => {
        if (image.url) {
          return image;
        } else {
          const url = (await generateSignedFileUrl(image.key || "")) || "";
          return { ...image, url: url };
        }
      }),
    );

    res.status(200).json({
      status: "success",
      message: existingBlog ? null : "Nonexistent Blog!",
      data: { ...existingBlog, images },
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

  try {
    const blog = await prismadb.blog.create({
      data: {
        title,
        content,
        mins_read,
        images:
          images && images.length
            ? {
                create: images.map((image: BlogImage) => ({
                  key: image.key,
                })),
              }
            : undefined,
      },
    });

    if (!blog.notificationSentAt) {
      void sendBlogNotificationsOnce(blog.id);
    }

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
        images:
          images && images.length
            ? {
                create: images.map((image: BlogImage) => ({
                  key: image.key,
                })),
              }
            : undefined,
      },
      include: {
        images: true,
      },
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
