"use server";

import { auth } from "@/auth";
import { prisma } from "@omnipublish/db";
import { s3Client } from "@/lib/s3";
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

const BUCKET = process.env.S3_BUCKET?.replace(/"/g, "") || "omnipublish";

export async function getPresignedUploadUrl(filename: string, mimeType: string, byteSize: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const ext = filename.split(".").pop() || "";
  const storageKey = `users/${session.user.id}/${uuidv4()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: byteSize,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  const currentEndpoint = process.env.S3_ENDPOINT?.replace(/"/g, "") || "http://localhost:9000";
  const publicUrl = `${currentEndpoint}/${BUCKET}/${storageKey}`;

  return { uploadUrl, publicUrl, storageKey };
}

export async function createAssetRecord({
  originalName,
  mimeType,
  byteSize,
  storageKey,
  publicUrl,
  hash,
}: {
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  publicUrl: string;
  hash: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Avoid duplicates if hash matches
  const existing = await prisma.asset.findUnique({
    where: { userId_sha256: { userId: session.user.id, sha256: hash } }
  });

  if (existing) return existing;

  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  return prisma.asset.create({
    data: {
      userId: session.user.id,
      kind: isImage ? "image" : isVideo ? "video" : "file",
      source: "upload",
      originalName,
      mimeType,
      byteSize,
      sha256: hash,
      storageKey,
      publicUrl,
    }
  });
}

export async function getAssets() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return prisma.asset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" }
  });
}

export async function deleteAsset(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const asset = await prisma.asset.findUnique({
    where: { id, userId: session.user.id }
  });

  if (!asset) return;

  // Try delete from S3
  try {
    // 像 ai.ts 那样使用内部直连的 localhost S3 客户端，防止外网穿透造成的网络错误
    const internalS3Client = new S3Client({
      region: process.env.S3_REGION?.replace(/"/g, "") || "us-east-1",
      endpoint: "http://localhost:9000",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID?.replace(/"/g, "") || "minio",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.replace(/"/g, "") || "minio123",
      },
      forcePathStyle: true,
    });

    await internalS3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: asset.storageKey
    }));
  } catch (e) {
    console.error("Failed to delete from S3", e);
  }

  // Delete from DB
  await prisma.asset.delete({
    where: { id }
  });
}
