import { S3Client } from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as { s3Client: S3Client };

export const s3Client =
  globalForS3.s3Client ||
  new S3Client({
    region: process.env.S3_REGION?.replace(/"/g, "") || "us-east-1",
    endpoint: process.env.S3_ENDPOINT?.replace(/"/g, "") || "http://localhost:9000",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID?.replace(/"/g, "") || "minio",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.replace(/"/g, "") || "minio123",
    },
    forcePathStyle: true, // Required for MinIO
  });

if (process.env.NODE_ENV !== "production") globalForS3.s3Client = s3Client;
