import assert from "node:assert/strict";
import { acceptedExtensions, bannerVideoMaxBytes, detectUploadMedia } from "../lib/media-upload.ts";

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom", "ascii"), Buffer.alloc(12)]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

assert.deepEqual(detectUploadMedia(mp4), { mime: "video/mp4", ext: "mp4", kind: "video" });
assert.deepEqual(detectUploadMedia(webm), { mime: "video/webm", ext: "webm", kind: "video" });
assert.deepEqual(detectUploadMedia(png), { mime: "image/png", ext: "png", kind: "image" });
assert.equal(detectUploadMedia(Buffer.from("not media")), null);
assert.deepEqual(acceptedExtensions({ mime: "image/jpeg", ext: "jpg", kind: "image" }), [".jpg", ".jpeg"]);
assert.equal(bannerVideoMaxBytes(), 80 * 1024 * 1024);

console.log("Passed media upload signature and limit checks.");
