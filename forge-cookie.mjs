import { createHmac, createHash } from "node:crypto";
import https from "node:https";

// 磁盘 secret（base64url），与 dsh-client-connection 的 canonicalSecret 一致
const SECRET_B64URL = "M4Hgf5zNIrtZ_Ry-nAt3hdLs7fZIcOZsavQA34L9Yz0";

function encodeBase64Url(buf) {
  return Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decodeBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + padding, "base64");
}

const secretBytes = decodeBase64Url(SECRET_B64URL);
console.log("secret decoded bytes length =", secretBytes.byteLength);

function signature(secret, body) {
  return createHmac("sha256", secret).update(body).digest();
}
function cookieName(authority) {
  return "dsh-auth-" + encodeBase64Url(createHash("sha256").update(authority).digest());
}
function encodeCookie(payload, secret) {
  const body = encodeBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `v1.${body}.${encodeBase64Url(signature(secret, body))}`;
}

const authority = process.argv[2] || "192.168.215.218:18605";
const DAY_MS = 86400e3;
const issuedAt = Date.now();
const expiresAt = issuedAt + 30 * DAY_MS;

const payload = { version: 1, authority, issuedAt, expiresAt };
const cookieVal = encodeCookie(payload, secretBytes);
const name = cookieName(authority);

console.log("authority =", authority);
console.log("cookie name =", name);
console.log("cookie value =", cookieVal);
console.log("Cookie header =", `${name}=${cookieVal}`);

// 直接验证
const url = `https://${authority}/`;
const req = https.get(url, { rejectUnauthorized: false, headers: { Cookie: `${name}=${cookieVal}` } }, (res) => {
  let len = 0;
  res.on("data", (c) => { len += c.length; });
  res.on("end", () => {
    console.log("GET", url, "-> status", res.statusCode, "bytes", len);
    process.exit(0);
  });
});
req.on("error", (e) => { console.error("ERR", e.message); process.exit(1); });
req.setTimeout(8000, () => { console.error("timeout"); process.exit(1); });
