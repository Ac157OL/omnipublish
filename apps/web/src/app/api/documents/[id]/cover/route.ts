import { NextResponse } from "next/server";
import { generateDocumentCover } from "@/actions/ai";
import { prisma } from "@omnipublish/db";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id;
    const coverResult = await generateDocumentCover(documentId);

    if (coverResult.success && coverResult.publicUrl) {
      // 自动将生成的图片 URL 更新到 Document 的 coverImageUrl 字段
      await prisma.document.update({
        where: { id: documentId },
        data: { coverImageUrl: coverResult.publicUrl }
      });
      return NextResponse.json({ url: coverResult.publicUrl });
    } else {
      return NextResponse.json(
        { error: coverResult.errorMessage || "Failed to generate cover" },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Generate cover error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate cover" },
      { status: 500 }
    );
  }
}