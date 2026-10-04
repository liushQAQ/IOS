import { createHmac, createHash } from "node:crypto";
import https from "node:https";
import { writeFileSync } from "node:fs";

const SECRET_B64URL = "M4Hgf5zNIrtZ_Ry-nAt3hdLs7fZIcOZsavQA34L9Yz0";
function encodeBase64Url(buf){return Buffer.from(buf).toString("base64").replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,"");}
function decodeBase64Url(v){const p="=".repeat((4-v.length%4)%4);return Buffer.from(v.replaceAll("-","+").replaceAll("_","/")+p,"base64");}
const secret = decodeBase64Url(SECRET_B64URL);
const authority = "192.168.215.218:18605";
const name = "dsh-auth-" + encodeBase64Url(createHash("sha256").update(authority).digest());
const issuedAt = Date.now(); const expiresAt = issuedAt + 30*86400e3;
const body = encodeBase64Url(Buffer.from(JSON.stringify({version:1,authority,issuedAt,expiresAt}),"utf8"));
const sig = encodeBase64Url(createHmac("sha256", secret).update(body).digest());
const cookie = `${name}=v1.${body}.${sig}`;

function get(path, extraHeaders={}) {
  return new Promise((resolve) => {
    const req = https.get(`https://${authority}${path}`, { rejectUnauthorized:false, headers:{ Cookie:cookie, ...extraHeaders } }, (res) => {
      let data = ""; res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", e => resolve({ error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ error: "timeout" }); });
  });
}
function post(path, payload, extraHeaders={}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const req = https.request(`https://${authority}${path}`, { method:"POST", rejectUnauthorized:false, headers:{ Cookie:cookie, "Content-Type":"application/json", "Content-Length":Buffer.byteLength(data), ...extraHeaders } }, (res) => {
      let b=""; res.on("data", c=>b+=c); res.on("end",()=>resolve({status:res.statusCode, body:b}));
    });
    req.on("error", e => resolve({ error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ error: "timeout" }); });
    req.write(data); req.end();
  });
}

const idx = await get("/");
console.log("GET / ->", idx.status, "len=", (idx.body||"").length, idx.error||"");
writeFileSync("E:/desktop/所有skill/deepseek-harness-ios/edge-index.html", idx.body||"");

// 提取资产与 boot 标记
const bootTag = (idx.body||"").match(/__DSH_BOOT__[^<]*/);
console.log("has __DSH_BOOT__:", !!bootTag);

// 常见 API 探测
for (const p of ["/api/pluginInventory/list", "/api/desktop/settings", "/api/session/list", "/api/config", "/api/health", "/api/status"]) {
  const r = await get(p);
  console.log("GET", p, "->", r.status, (r.body||"").slice(0,80).replace(/\n/g," "), r.error||"");
}

// 尝试 plugin inventory POST（对照 headless 3080 的用法）
const r1 = await post("/api/pluginInventory/list", { type:"client-request", rpcId:"x", method:"pluginInventory/list", payload:{ args:{} } });
console.log("POST /api/pluginInventory/list ->", r1.status, (r1.body||"").slice(0,200).replace(/\n/g," "), r1.error||"");

// 无 cookie 对照
const raw = await get("/");
console.log("GET / (no cookie) ->", raw.status, raw.error||"");
