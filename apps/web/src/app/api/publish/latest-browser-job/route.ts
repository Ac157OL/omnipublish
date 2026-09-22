import { NextResponse } from "next/server";
import { prisma } from "@omnipublish/db";

export async function GET() {
  try {
    const job = await prisma.publishJob.findFirst({
      where: {
        mode: "browser",
        status: "awaiting_user"
      },
      orderBy: { createdAt: "desc" }
    });

    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (!job) {
      return NextResponse.json({ error: "No pending browser job found" }, { status: 404, headers });
    }

    return NextResponse.json(job, { headers });
  } catch (_error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
