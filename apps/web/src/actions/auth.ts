"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { hashPassword, prisma } from "@omnipublish/db";

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

export async function register(
  prevState: string | undefined,
  formData: FormData,
) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return "请填写所有必填字段";
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return "该邮箱已被注册";
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
      },
    });

    // 注册成功后直接登录
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "登录失败，请检查凭据。";
        default:
          return "发生了未知错误。";
      }
    }
    throw error;
  }
}
