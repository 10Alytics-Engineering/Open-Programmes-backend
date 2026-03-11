import { Request, Response } from "express";
import { prismadb } from "../../index";
import { NebiantUser } from "../../middleware";
import {
  sendChangeRequestNotification,
  sendApprovalEmail,
  sendRejectionEmail,
  sendCompletionEmail
} from "./mail";
import { generatePaymentLink, verifyPaystackPayment } from "../../utils/paymentService";
import { RequestStatus, RequestType } from "@prisma/client";

export const createChangeRequest = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { type, currentCourseId, desiredCourseId, currentCohortId, desiredCohortId, reason } = req.body;

    if (!type || !reason) {
      return res.status(400).json({ message: "Type and reason are required" });
    }

    // Validate based on request type
    if (type === RequestType.COURSE_CHANGE && (!currentCourseId || !desiredCourseId)) {
      return res.status(400).json({ message: "Course change requires current and desired course IDs" });
    }

    if (type === RequestType.DEFERMENT && (!currentCohortId || !desiredCohortId)) {
      return res.status(400).json({ message: "Deferment requires current and desired cohort IDs" });
    }

    // Check if user has an active payment for the current course/cohort
    let paymentStatus;
    if (type === RequestType.COURSE_CHANGE) {
      // For course change, find payment status for the current course
      paymentStatus = await prismadb.paymentStatus.findFirst({
        where: {
          userId: user.id,
          courseId: currentCourseId,
          status: {
            in: ["COMPLETE", "BALANCE_HALF_PAYMENT"]
          }
        }
      });

      // If no payment status found, check if user has purchased the course
      if (!paymentStatus) {
        const purchase = await prismadb.purchase.findFirst({
          where: {
            userId: user.id,
            courseId: currentCourseId
          }
        });

        if (!purchase) {
          return res.status(400).json({
            message: "You don't have an active enrollment for this course"
          });
        }

        // Create a payment status record if purchase exists but no payment status
        paymentStatus = await prismadb.paymentStatus.create({
          data: {
            userId: user.id,
            courseId: currentCourseId,
            status: "COMPLETE", // Assuming purchase means complete payment
            paymentType: "FULL",
            paymentPlan: "ONE_TIME"
          }
        });
      }
    } else {
      // For deferment, find payment status for the current cohort
      paymentStatus = await prismadb.paymentStatus.findFirst({
        where: {
          userId: user.id,
          cohortId: currentCohortId,
          status: {
            in: ["COMPLETE", "BALANCE_HALF_PAYMENT"]
          }
        }
      });

      if (!paymentStatus) {
        return res.status(400).json({
          message: "You don't have an active payment for this cohort"
        });
      }
    }

    // Check if within two weeks of cohort start (free change)
    let cohortIdToCheck;
    if (type === RequestType.DEFERMENT) {
      cohortIdToCheck = currentCohortId;
    } else if (paymentStatus.cohortId) {
      cohortIdToCheck = paymentStatus.cohortId;
    } else {
      // For course changes without a cohort, use the desired cohort or find one
      const userCohort = await prismadb.userCohort.findFirst({
        where: {
          userId: user.id,
          courseId: currentCourseId,
          isActive: true
        }
      });

      cohortIdToCheck = userCohort?.cohortId;
    }

    const currentCohort = cohortIdToCheck ? await prismadb.cohort.findUnique({
      where: { id: cohortIdToCheck }
    }) : null;

    const isWithinTwoWeeks = currentCohort &&
      new Date() <= new Date(currentCohort.startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

    let status: RequestStatus = RequestStatus.PENDING;

    // If within two weeks, auto-approve for immediate change
    if (isWithinTwoWeeks) {
      status = RequestStatus.APPROVED;

      // Process immediate change
      if (type === RequestType.COURSE_CHANGE) {
        await processCourseChange(user.id, currentCourseId, desiredCourseId, paymentStatus.id);
      } else {
        await processCohortChange(user.id, currentCohortId, desiredCohortId, paymentStatus.id);
      }
    }

    // Create the request
    const request = await prismadb.changeRequest.create({
      data: {
        type,
        userId: user.id,
        currentCourseId: type === RequestType.COURSE_CHANGE ? currentCourseId : null,
        desiredCourseId: type === RequestType.COURSE_CHANGE ? desiredCourseId : null,
        currentCohortId: type === RequestType.DEFERMENT ? currentCohortId : null,
        desiredCohortId: type === RequestType.DEFERMENT ? desiredCohortId : null,
        reason,
        status,
        paymentStatusId: paymentStatus.id,
        // Set payment due date if not within two weeks
        paymentDueDate: isWithinTwoWeeks ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      include: {
        user: {
          select: { name: true, email: true }
        },
        currentCourse: type === RequestType.COURSE_CHANGE ? { select: { title: true } } : false,
        desiredCourse: type === RequestType.COURSE_CHANGE ? { select: { title: true } } : false,
        currentCohort: type === RequestType.DEFERMENT ? { select: { name: true, startDate: true } } : false,
        desiredCohort: type === RequestType.DEFERMENT ? { select: { name: true, startDate: true } } : false,
      }
    });

    // If within two weeks, send completion email immediately
    if (isWithinTwoWeeks) {
      await sendCompletionEmail(request.user, {
        type: request.type,
        desiredCourse: request.desiredCourse,
        desiredCohort: request.desiredCohort
      });
    } else {
      // If not within two weeks, notify admin
      await sendChangeRequestNotification(request);
    }

    return res.status(201).json({
      status: "success",
      message: isWithinTwoWeeks
        ? "Change processed successfully"
        : "Request submitted for admin approval",
      data: request
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getUserChangeRequests = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;

    const requests = await prismadb.changeRequest.findMany({
      where: { userId: user.id },
      include: {
        currentCourse: {
          select: { title: true, imageUrl: true }
        },
        desiredCourse: {
          select: { title: true, imageUrl: true }
        },
        currentCohort: {
          select: { name: true, startDate: true }
        },
        desiredCohort: {
          select: { name: true, startDate: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      status: "success",
      data: requests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAllChangeRequests = async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;

    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (type) whereClause.type = type;

    const requests = await prismadb.changeRequest.findMany({
      where: whereClause,
      include: {
        user: {
          select: { name: true, email: true, phone_number: true }
        },
        currentCourse: {
          select: { title: true, imageUrl: true }
        },
        desiredCourse: {
          select: { title: true, imageUrl: true }
        },
        currentCohort: {
          select: { name: true, startDate: true }
        },
        desiredCohort: {
          select: { name: true, startDate: true }
        },
        processedBy: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      status: "success",
      data: requests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateChangeRequest = async (req: Request, res: Response) => {
  try {
    const user = req.user as NebiantUser;
    const { requestId } = req.params;
    const { status, adminReason } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (status === "REJECTED" && !adminReason) {
      return res.status(400).json({
        message: "Reason is required when rejecting a request"
      });
    }

    const request = await prismadb.changeRequest.findUnique({
      where: { id: requestId },
      include: {
        paymentStatus: true,
        user: true,
        desiredCohort: true,
        currentCourse: true,
        desiredCourse: true,
        currentCohort: true
      }
    });

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    if (request.status !== RequestStatus.PENDING) {
      return res.status(400).json({
        message: "This request has already been processed"
      });
    }

    // Update the request
    const updatedRequest = await prismadb.changeRequest.update({
      where: { id: requestId },
      data: {
        status: status === "APPROVED" ? RequestStatus.PAYMENT_PENDING : RequestStatus.REJECTED,
        adminReason,
        processedById: user.id,
        processedAt: new Date()
      },
      include: {
        user: {
          select: { name: true, email: true }
        },
        currentCourse: {
          select: { title: true }
        },
        desiredCourse: {
          select: { title: true }
        },
        currentCohort: {
          select: { name: true, startDate: true }
        },
        desiredCohort: {
          select: { name: true, startDate: true }
        },
        processedBy: {
          select: { name: true }
        }
      }
    });

    // If approved, generate payment link and send email
    if (status === "APPROVED") {
      const paymentLink = await generatePaymentLink(
        request.user.id,
        "change_request",
        requestId,
        50000, // 50,000 in kobo (₦500)
        `${request.type === RequestType.COURSE_CHANGE ? "Course Change" : "Deferment"} Fee`
      );

      // Update request with payment link
      await prismadb.changeRequest.update({
        where: { id: requestId },
        data: { paymentLink }
      });

      // Send approval email with payment link
      await sendApprovalEmail(request.user, request, paymentLink);
    } else if (status === "REJECTED") {
      // Send rejection email
      await sendRejectionEmail(request.user, request, adminReason);
    }

    return res.status(200).json({
      status: "success",
      message: `Request ${status.toLowerCase()} successfully`,
      data: updatedRequest
    });
  } catch (error) {
    console.error("Error updating change request:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const handlePaymentVerification = async (req: Request, res: Response) => {
  try {
    const { reference, requestId } = req.body;

    // Verify payment with Paystack
    const verification = await verifyPaystackPayment(reference);

    if (verification.status === "success") {
      // Update request status to completed
      const request = await prismadb.changeRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.COMPLETED },
        include: {
          user: true,
          currentCourse: true,
          desiredCourse: true,
          currentCohort: true,
          desiredCohort: true,
          paymentStatus: true
        }
      });

      // Process the actual change
      if (request.type === RequestType.COURSE_CHANGE) {
        await processCourseChange(
          request.userId,
          request.currentCourseId,
          request.desiredCourseId,
          request.paymentStatusId
        );
      } else {
        await processCohortChange(
          request.userId,
          request.currentCohortId,
          request.desiredCohortId,
          request.paymentStatusId
        );
      }

      // Send completion email
      await sendCompletionEmail(request.user, request);

      return res.status(200).json({
        status: "success",
        message: "Payment verified and change processed successfully"
      });
    } else {
      return res.status(400).json({
        status: "error",
        message: "Payment verification failed"
      });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Helper functions
async function processCourseChange(userId: string, currentCourseId: string, desiredCourseId: string, paymentStatusId: string) {
  const user = await prismadb.user.findUnique({ where: { id: userId } });
  const desiredCourse = await prismadb.course.findUnique({ where: { id: desiredCourseId } });

  if (!user || !desiredCourse) {
    throw new Error("User or desired course not found");
  }

  await prismadb.$transaction([
    // Update payment status to point to the new course
    prismadb.paymentStatus.update({
      where: { id: paymentStatusId },
      data: { courseId: desiredCourseId, cohortId: null }
    }),

    // Update user's ongoing courses
    prismadb.user.update({
      where: { id: userId },
      data: {
        ongoing_courses: {
          set: user.ongoing_courses.filter(
            id => id !== currentCourseId
          ).concat(desiredCourseId)
        }
      }
    }),

    // Remove from current cohort if enrolled
    prismadb.userCohort.updateMany({
      where: {
        userId: userId,
        courseId: currentCourseId
      },
      data: {
        isActive: false,
        isPaymentActive: false,
        archivedAt: new Date()
      }
    }),

    // Remove purchase record for old course
    prismadb.purchase.deleteMany({
      where: {
        userId: userId,
        courseId: currentCourseId
      }
    }),

    // Create new purchase record for desired course
    prismadb.purchase.create({
      data: {
        userId: userId,
        courseId: desiredCourseId
      }
    })
  ]);
}

async function processCohortChange(userId: string, currentCohortId: string, desiredCohortId: string, paymentStatusId: string) {
  const desiredCohort = await prismadb.cohort.findUnique({
    where: { id: desiredCohortId },
    select: { courseId: true }
  });

  if (!desiredCohort) {
    throw new Error("Desired cohort not found");
  }

  await prismadb.$transaction([
    // Update payment status to point to the new cohort
    prismadb.paymentStatus.update({
      where: { id: paymentStatusId },
      data: { cohortId: desiredCohortId }
    }),

    // Update user cohort relationship
    prismadb.userCohort.updateMany({
      where: {
        userId: userId,
        cohortId: currentCohortId
      },
      data: {
        isActive: false,
        archivedAt: new Date()
      }
    }),

    // Create new user cohort relationship
    prismadb.userCohort.create({
      data: {
        userId: userId,
        cohortId: desiredCohortId,
        courseId: desiredCohort.courseId,
        isActive: true,
        isPaymentActive: true
      }
    })
  ]);
}

export const getChangeRequestsCount = async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;

    // Build where clause based on query parameters
    const whereClause: any = {};

    if (status) {
      whereClause.status = status;
    }

    if (type) {
      whereClause.type = type;
    }

    // Get counts for all statuses if no specific status is requested
    if (!status && !type) {
      const counts = await prismadb.changeRequest.groupBy({
        by: ['status'],
        where: whereClause,
        _count: {
          id: true,
        },
      });

      // Also get total count
      const totalCount = await prismadb.changeRequest.count({
        where: whereClause,
      });

      // Format the response
      const result = {
        total: totalCount,
        byStatus: counts.reduce((acc, item) => {
          acc[item.status] = item._count.id;
          return acc;
        }, {} as Record<string, number>),
      };

      return res.status(200).json({
        status: "success",
        data: result
      });
    }

    // Get count with filters
    const count = await prismadb.changeRequest.count({
      where: whereClause,
    });

    return res.status(200).json({
      status: "success",
      data: {
        count,
        ...(status && { status }),
        ...(type && { type })
      }
    });
  } catch (error) {
    console.error("Error getting change requests count:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};