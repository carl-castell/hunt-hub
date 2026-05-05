import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const isMinio = process.env.STORAGE_PROVIDER === 'minio';

const endpoint = isMinio
  ? process.env.MINIO_ENDPOINT
  : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

export const s3 = new S3Client({
  endpoint,
  region: isMinio ? (process.env.MINIO_REGION ?? 'eu-west-1') : 'auto',
  credentials: {
    accessKeyId:     isMinio ? process.env.MINIO_ACCESS_KEY! : process.env.R2_ACCESS_KEY!,
    secretAccessKey: isMinio ? process.env.MINIO_SECRET_KEY! : process.env.R2_SECRET_KEY!,
  },
  forcePathStyle: isMinio, // required for MinIO, must be false for R2
});

export const BUCKET = isMinio ? process.env.MINIO_BUCKET! : process.env.R2_BUCKET!;

export async function uploadFile(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
}

export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key:    key,
  }));
}
