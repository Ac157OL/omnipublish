import { NextResponse } from "next/server";
import { renderCardAsSvg } from "@omnipublish/card-renderer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const svg = await renderCardAsSvg({
      headline: body.headline || "未命名标题",
      body: body.body || "",
      backgroundUrl: body.backgroundUrl,
      pageNumber: body.pageNumber,
      totalPages: body.totalPages
    });

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
