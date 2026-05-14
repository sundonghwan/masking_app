import * as Minio from "minio";

export function createObjectStorageConfig(input = {}) {
  const endpoint = String(input.endpoint || input.objectEndpoint || "").trim();
  if (!endpoint) throw new TypeError("object storage endpoint is required");
  const url = new URL(endpoint);
  const useSSL = url.protocol === "https:";
  if (!useSSL && url.protocol !== "http:") {
    throw new TypeError("object storage endpoint must use http or https");
  }

  const accessKey = String(input.accessKey || input.objectAccessKey || "").trim();
  const secretKey = String(input.secretKey || input.objectSecretKey || "").trim();
  const bucket = String(input.bucket || input.objectBucket || "").trim();
  if (!accessKey) throw new TypeError("object storage access key is required");
  if (!secretKey) throw new TypeError("object storage secret key is required");
  if (!bucket) throw new TypeError("object storage bucket is required");

  return {
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : (useSSL ? 443 : 80),
    useSSL,
    accessKey,
    secretKey,
    region: String(input.region || input.objectRegion || "us-east-1").trim() || "us-east-1",
    bucket,
  };
}

export function createObjectStorageClient(config, options = {}) {
  const Client = options.Client || Minio.Client;
  return new Client({
    endPoint: config.endPoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region,
  });
}

export async function ensureObjectBucket(client, bucket, options = {}) {
  if (!client) throw new TypeError("object storage client is required");
  const bucketName = String(bucket || "").trim();
  if (!bucketName) throw new TypeError("object storage bucket is required");
  const exists = await client.bucketExists(bucketName);
  if (!exists) {
    await client.makeBucket(bucketName, options.region || "us-east-1");
    return { bucket: bucketName, created: true };
  }
  return { bucket: bucketName, created: false };
}

export async function verifyObjectStorage(client, bucket) {
  const bucketName = String(bucket || "").trim();
  if (!bucketName) throw new TypeError("object storage bucket is required");
  const exists = await client.bucketExists(bucketName);
  return {
    ok: exists,
    bucket: bucketName,
  };
}
