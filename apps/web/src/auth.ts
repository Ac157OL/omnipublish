import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma, verifyPassword } from "@omnipublish/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET?.replace(/"/g, ""),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({ where: { email: credentials.email as string } });
        if (user?.password && await verifyPassword(credentials.password as string, user.password)) {
          return { id: user.id, email: user.email, name: user.name };
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // Fix for previously hardcoded "1" ID
        if (session.user.id === "1" && session.user.email) {
          const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
          if (dbUser) session.user.id = dbUser.id;
        }
      }
      return session;
    },
  },
});
