export type UploadMedia = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "video/mp4" | "video/webm";
  ext: "jpg" | "png" | "webp" | "avif" | "mp4" | "webm";
  kind: "image" | "video";
};

export const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export function bannerVideoMaxBytes() {
  const configured = Number.parseInt(process.env.BANNER_VIDEO_MAX_MB ?? "80", 10);
  const megabytes = Number.isFinite(configured) ? Math.min(250, Math.max(1, configured)) : 80;
  return megabytes * 1024 * 1024;
}

function isAvif(buffer: Buffer) {
  if (buffer.length < 16 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16 || boxSize > buffer.length) return false;
  const brands = [buffer.toString("ascii", 8, 12)];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(buffer.toString("ascii", offset, offset + 4));
  return brands.some((brand) => brand === "avif" || brand === "avis");
}

function isMp4(buffer: Buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  return ["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV"].includes(buffer.toString("ascii", 8, 12));
}

export function detectUploadMedia(buffer: Buffer): UploadMedia | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", ext: "png", kind: "image" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", kind: "image" };
  if (isAvif(buffer)) return { mime: "image/avif", ext: "avif", kind: "image" };
  if (isMp4(buffer)) return { mime: "video/mp4", ext: "mp4", kind: "video" };
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mime: "video/webm", ext: "webm", kind: "video" };
  return null;
}

export function acceptedExtensions(media: UploadMedia) {
  return media.ext === "jpg" ? [".jpg", ".jpeg"] : [`.${media.ext}`];
}
