import { generateRandom6DigitNumber } from "../../hooks/generate6digits";
import { prismadb } from "../../lib/prismadb";
import { v4 as uuidv4 } from "uuid";

export const generateVerificationToken = async (email: string) => {
  // const token = uuidv4();

  const token = generateRandom6DigitNumber();

  const expires = new Date(new Date().getTime() + 3600 * 1000);

  const existingToken = await prismadb.verificationToken.findFirst({
    where: {
      email,
    },
  });

  if (existingToken) {
    await prismadb.verificationToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  const verificationToken = prismadb.verificationToken.create({
    data: {
      token,
      email,
      expires,
    },
  });

  return verificationToken;
};

export const generatePasswordResetToken = async (email: string) => {
  // const token = uuidv4();

  const token = generateRandom6DigitNumber();

  const expires = new Date(new Date().getTime() + 3600 * 1000);

  const existingToken = await prismadb.passwordResetToken.findFirst({
    where: {
      email,
    },
  });

  if (existingToken) {
    await prismadb.passwordResetToken.delete({
      where: {
        id: existingToken.id,
      },
    });
  }

  const passwordResetToken = prismadb.passwordResetToken.create({
    data: {
      token,
      email,
      expires,
    },
  });

  return passwordResetToken;
};
