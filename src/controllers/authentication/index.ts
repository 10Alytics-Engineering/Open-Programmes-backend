import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { generatePasswordResetToken, generateVerificationToken } from "./token";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mail";
import { validateEmail } from "../../hooks/validate-email";
import { validatePassword } from "../../hooks/validate-password";
import { OAuth2Client } from "google-auth-library";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function login(req: Request, res: Response) {
  try {
    const { password: rawPassword }: { password: string } = req.body;
    const password = rawPassword.trim();
    const email: string = req.body.email?.toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    if (password?.length < 7) {
      return res
        .status(400)
        .json({ message: "Password should be at least 8 characters" });
    }

    const existingUser = await prismadb.user.findUnique({
      where: {
        email,
      },
    });

    if (!existingUser || !existingUser?.email) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    if (!existingUser?.password) {
      console.log(`[LOGIN_ERROR]: User ${email} has no password in DB.`);
      return res.status(401).json({ message: "This account was created via social login. Please sign in with Google or reset your password." });
    }

    // Defensive check against non-string passwords
    if (typeof existingUser.password !== 'string') {
      console.error(`[LOGIN_CRITICAL]: User ${email} password is not a string! Type: ${typeof existingUser.password}`, existingUser.password);
      return res.status(500).json({ message: "Internal account error. Please reset your password." });
    }

    if (typeof password !== 'string') {
      console.error(`[LOGIN_ERROR]: Provided password is not a string! Type: ${typeof password}`);
      return res.status(400).json({ message: "Invalid password format" });
    }

    const comparePassword = await bcrypt.compare(
      password,
      existingUser.password
    );

    if (!comparePassword) {
      console.log(`[LOGIN_ERROR]: Invalid password attempt for ${email}`);
      return res?.status(401).json({ message: "Invalid Password" });
    }

    // In Case account have not been verified;
    //Commented out because next-auth can't process this response,
    //it would work in normal authentication though, so for now, handle email verification in frontend.

    // if (!existingUser?.emailVerified) {
    //   const verificationToken = await generateVerificationToken(email);

    //   await sendVerificationEmail(existingUser.email, verificationToken.token);
    //   return res.status(200).json({
    //     status: "success",
    //     emailVerified: null,
    //     message: "Confirmation email sent!",
    //   });
    // }

    if (!existingUser?.emailVerified) {
      const verificationToken = await generateVerificationToken(email);
      await sendVerificationEmail(existingUser.email, verificationToken.token);
    }

    const access_token = jwt.sign(
      {
        email: existingUser.email,
        id: existingUser.id,
        role: existingUser.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    const refresh_token = jwt.sign(
      {
        email: existingUser.email,
        id: existingUser?.id,
        role: existingUser?.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    const updatedExistingUser = await prismadb.user.update({
      data: {
        access_token,
      },
      where: {
        id: existingUser.id,
      },
    });

    return res.status(200).json({
      status: "success",
      message: `${!existingUser.emailVerified && "Confirmation email sent!"}`,
      refresh_token,
      data: { ...updatedExistingUser },
    });
  } catch (error) {
    console.log("[LOGIN]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function googleAuth(req: Request, res: Response) {
  try {
    const {
      email,
      name,
      googleId,
      image,
      token, // ID Token
      accessToken, // Access Token (for custom button flow)
    }: {
      email: string;
      name: string;
      googleId: string;
      image?: string;
      token?: string;
      accessToken?: string;
    } = req.body;

    if (!email || !googleId) {
      return res.status(400).json({ message: "Invalid Google credentials: Email and ID are required" });
    }

    // Secure verification
    if (token) {
      // 1. Verify ID Token (Branded Button Flow)
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload || payload.email?.toLowerCase() !== email.toLowerCase()) {
          console.error("[GOOGLE_AUTH_MISTMATCH]: Payload email does not match requested email");
          return res.status(401).json({ message: "Email mismatch in Google session" });
        }
      } catch (err: any) {
        console.error("[GOOGLE_AUTH_VERIFY_ERROR]:", err.message);
        return res.status(401).json({ message: "Google ID token verification failed" });
      }
    } else if (accessToken) {
      // 2. Verify Access Token (Custom Button Flow)
      try {
        const axios = (await import('axios')).default;
        // Verify with Google's tokeninfo endpoint
        const verification = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
        const data = verification.data;

        if (data.email?.toLowerCase() !== email.toLowerCase()) {
          return res.status(401).json({ message: "Email mismatch in Google session" });
        }
        if (data.sub !== googleId) {
          return res.status(401).json({ message: "Google ID mismatch" });
        }
      } catch (err: any) {
        console.error("[GOOGLE_AUTH_ACCESS_TOKEN_ERROR]:", err.message);
        return res.status(401).json({ message: "Google access token verification failed" });
      }
    } else {
      console.warn("Google authentication requested without ID token or Access Token. This is insecure.");
    }

    const normalizedEmail = email.toLowerCase();
    let user = await prismadb.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Creating new user if doesn't exist
      user = await prismadb.user.create({
        data: {
          email: normalizedEmail,
          name: name || "Google User",
          image: image,
          emailVerified: new Date(),
          password: "",
        },
      });

      console.log(`[GOOGLE_AUTH]: Created new user: ${normalizedEmail}`);

      // Creating account record for Google OAuth
      await prismadb.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleId,
        },
      });
    } else {
      // Update existing user's image if missing
      if (!user.image && image) {
        await prismadb.user.update({
          where: { id: user.id },
          data: { image },
        });
      }
    }

    // Checking if this Google account is linked to the user
    const existingAccount = await prismadb.account.findFirst({
      where: {
        userId: user.id,
        provider: "google",
        providerAccountId: googleId,
      },
    });

    if (!existingAccount) {
      await prismadb.account.create({
        data: {
          userId: user.id,
          type: "oauth",
          provider: "google",
          providerAccountId: googleId,
        },
      });
      console.log(`[GOOGLE_AUTH]: Linked Google account to existing user: ${normalizedEmail}`);
    }

    // Generate tokens
    const access_token = jwt.sign(
      { email: user.email, id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    const refresh_token = jwt.sign(
      { email: user.email, id: user.id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    // Update user with new access token
    const updatedUser = await prismadb.user.update({
      where: { id: user.id },
      data: { access_token },
    });

    console.log(`[GOOGLE_AUTH]: Login successful for: ${normalizedEmail}`);

    return res.status(200).json({
      status: "success",
      refresh_token,
      data: { ...updatedUser, access_token },
    });
  } catch (error: any) {
    console.error("[GOOGLE_AUTH_CRASH]:", error);
    res.status(500).json({ message: "Internal Server Error during Google Auth", detail: error.message });
  }
}

export async function account(req: Request, res: Response) {
  try {
    const {
      userId,
      type,
      provider,
      providerAccountId,
      refresh_token,
      access_token,
      expires_at,
      token_type,
      scope,
      id_token,
      session_state,
    }: {
      userId: string;
      type: string;
      provider: string;
      providerAccountId: string;
      refresh_token?: string;
      access_token?: string;
      expires_at?: number;
      token_type?: string;
      scope?: string;
      id_token?: string;
      session_state?: string;
    } = req.body;

    if (!type || !provider || !providerAccountId) {
      return res.status(400).json({ message: "Invalid field" });
    }

    const oauthAccount = await prismadb.account.create({
      data: {
        userId,
        type,
        provider,
        providerAccountId,
        refresh_token,
        access_token,
        expires_at,
        token_type,
        scope,
        id_token,
        session_state,
      },
    });

    return res.status(200).json({
      status: "success",
      data: { ...oauthAccount },
    });
  } catch (error) {
    console.log("[ACCOUNT]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const { name, password: rawPassword, phone_number } = req.body;
    const password = rawPassword.trim();
    const email: string = req.body.email?.toLowerCase();

    if (!name || !email || !password || !phone_number) {
      return res.status(400).json({ message: "Fill in credentials!" });
    }

    const isEmailValid = validateEmail(email);

    if (!isEmailValid) {
      return res.status(400).json({ message: "Invalid email address!" });
    }

    const isPasswordValid = validatePassword(password, res);

    if (!isPasswordValid) {
      return;
    }

    const existingUsers = await prismadb.user.findMany({
      where: {
        OR: [{ email }, { phone_number }],
      },
    });

    if (existingUsers.length > 0) {
      const isEmailTaken = existingUsers.some((user) => user.email === email);
      const isPhoneTaken = existingUsers.some(
        (user) => user.phone_number === phone_number
      );

      if (isEmailTaken && isPhoneTaken) {
        return res
          .status(403)
          .json({ message: "Email and Phone number already used" });
      }

      if (isEmailTaken) {
        return res
          .status(403)
          .json({ message: "User with this email already exists" });
      }

      if (isPhoneTaken) {
        return res.status(403).json({ message: "Phone number already used" });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prismadb.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        emailVerified: new Date(),
        phone_number,
      },
    });

    // const verificationToken = await generateVerificationToken(email);

    // await sendVerificationEmail(
    //   verificationToken?.email,
    //   verificationToken?.token
    // );

    return res.status(201).json({ user });
  } catch (error) {
    console.log("[REGISTER]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  try {
    const { code }: { code: string } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    const existingToken = await prismadb.verificationToken.findUnique({
      where: {
        token: code,
      },
    });

    if (!existingToken) {
      return res.status(403).json({ message: "Invalid Token" });
    }

    const hasExpired = new Date(existingToken?.expires) < new Date();

    if (hasExpired) {
      return res.status(403).json({ message: "Token has expired" });
    }

    const existingUser = await prismadb.user.findUnique({
      where: {
        email: existingToken?.email,
      },
    });

    await prismadb.user.update({
      where: {
        id: existingUser?.id,
      },
      data: {
        emailVerified: new Date(),
        email: existingToken?.email,
      },
    });

    await prismadb.verificationToken.delete({
      where: {
        id: existingToken?.id,
        email: existingToken?.email,
      },
    });

    return res
      .status(200)
      .json({ status: "success", message: "Email verified!" });
  } catch (error) {
    console.log("[VERIFY_EMAIL]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function resendEmailVerification(req: Request, res: Response) {
  try {
    const { email }: { email: string } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Invalid field" });
    }

    const existingUser = await prismadb.user.findUnique({
      where: {
        email,
      },
    });

    if (!existingUser || !existingUser?.email) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    const verificationToken = await generateVerificationToken(
      existingUser.email
    );

    await sendVerificationEmail(
      verificationToken?.email,
      verificationToken?.token
    );

    return res
      .status(200)
      .json({ status: "success", message: "Verification email sent!" });
  } catch (error) {
    console.log("[RESEND_VERIFICATION_EMAIL]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email }: { email: string } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Invalid field" });
    }

    const existingUser = await prismadb.user.findUnique({
      where: {
        email,
      },
    });

    if (!existingUser || !existingUser.email) {
      return res.status(404).json({ message: "Nonexistent User!" });
    }

    const generatedToken = await generatePasswordResetToken(
      existingUser?.email
    );

    await sendPasswordResetEmail(generatedToken.email, generatedToken.token);

    return res.status(200).json({
      status: "success",
      message: "Reset token email has been sent!",
    });
  } catch (error) {
    console.log("[FORGOT_PASSWORD]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const {
      code,
      password,
      password_confirmation,
    }: { code: string; password: string; password_confirmation: string } =
      req.body;

    if (!password || !password_confirmation || !code) {
      return res.status(400).json({ message: "Invalid field!" });
    }

    if (password !== password_confirmation) {
      return res.status(400).json({ message: "Password do not match!" });
    }

    const existingToken = await prismadb.passwordResetToken.findUnique({
      where: {
        token: code,
      },
    });

    if (!existingToken) {
      return res.status(403).json({ message: "Invalid Token" });
    }

    const hasExpired = new Date(existingToken?.expires) < new Date();

    if (hasExpired) {
      return res.status(403).json({ message: "Token has expired" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prismadb.user.update({
      data: {
        password: hashedPassword,
        email: existingToken?.email,
      },
      where: {
        email: existingToken?.email,
      },
    });

    await prismadb.passwordResetToken.delete({
      where: {
        token: existingToken.token,
      },
    });

    return res.status(200).json({
      status: "success",
      message: "Password reset successfully!",
    });
  } catch (error) {
    console.log("[RESET_PASSWORD]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function refreshAccessToken(req: Request, res: Response) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(401).json({ message: "Refresh token is required" });
    }

    // Verify the refresh token
    let payload: any = null;
    try {
      payload = jwt.verify(refresh_token, process.env.JWT_SECRET as string);
    } catch (err) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    // Check if the refresh token is still valid
    const existingUser = await prismadb.user.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!existingUser) {
      return res.status(401).json({ message: "User not found" });
    }

    // Generate a new access token
    const access_token = jwt.sign(
      {
        email: existingUser.email,
        id: existingUser.id,
        role: existingUser.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    await prismadb.user.update({
      data: {
        access_token,
      },
      where: {
        id: existingUser.id,
      },
    });

    return res
      .status(200)
      .json({ status: "success", message: "Access token refreshed!" });
  } catch (error) {
    console.log("[REFRESH_ACCESS_TOKEN]:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}
