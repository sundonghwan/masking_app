export function multipartBoundary(contentType) {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] || match[2] || "").trim() : "";
}

export function parseMultipartBody(body, boundary) {
  const marker = Buffer.from(`--${boundary}`);
  const parts = [];
  let offset = 0;
  while (offset < body.length) {
    const start = body.indexOf(marker, offset);
    if (start < 0) break;
    let partStart = start + marker.length;
    if (body.subarray(partStart, partStart + 2).toString() === "--") break;
    if (body.subarray(partStart, partStart + 2).toString() === "\r\n") partStart += 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd < 0) break;
    const next = body.indexOf(marker, headerEnd + 4);
    if (next < 0) break;
    const headers = body.subarray(partStart, headerEnd).toString("utf8");
    let data = body.subarray(headerEnd + 4, next);
    if (data.subarray(data.length - 2).toString() === "\r\n") data = data.subarray(0, data.length - 2);
    const disposition = headers.match(/content-disposition:[^\r\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    const contentType = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase() || "application/octet-stream";
    if (name) parts.push({ name, filename, contentType, data });
    offset = next;
  }
  return parts;
}
