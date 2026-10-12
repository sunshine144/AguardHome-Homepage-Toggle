#!/bin/sh
# ==============================================================================
# Homepage AdGuard Toggle - In-Container Dynamic Boot Patcher
# Automatically patches Next.js HTML and API router on container startup.
# Survives image updates and gracefully degrades if version changes.
# ==============================================================================
set -e

if command -v node >/dev/null 2>&1; then
  node -e '
const fs = require("fs");

// 1. Inject custom.js into en.html
try {
  const htmlPath = "/app/.next/server/pages/en.html";
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, "utf8");
    if (!html.includes("/api/config/custom.js")) {
      const anchor = "<link rel=\"stylesheet\" href=\"/api/config/custom.css\"/>";
      if (html.includes(anchor)) {
        html = html.replace(anchor, anchor + "<script src=\"/api/config/custom.js\" defer=\"\"></script>");
        fs.writeFileSync(htmlPath, html, "utf8");
        console.log("[adguard-toggle] Injected custom.js into en.html");
      } else {
        console.warn("[adguard-toggle] WARNING: custom.css anchor not found in en.html. Skipping custom.js injection.");
      }
    }
  }
} catch (e) {
  console.warn("[adguard-toggle] Non-fatal error while patching en.html:", e.message);
}

// 2. Inject secure AdGuard proxy handler into [path].js
try {
  const jsPath = "/app/.next/server/pages/api/config/[path].js";
  if (fs.existsSync(jsPath)) {
    let code = fs.readFileSync(jsPath, "utf8");
    if (!code.includes("c===\"adguard\"") && !code.includes("action===\"status\"")) {
      const targetRegex = /if\s*\(!\s*\["custom\.css",\s*"custom\.js"\]\.includes\((\w+)\)\)/;
      const match = code.match(targetRegex);
      if (match) {
        const v = match[1];
        const proxyHandler = `if(${v}==="adguard"){
const req=a,res=b;
if(req.method!=="POST"){return res.status(405).json({ok:false,error:"Method Not Allowed"});}
if(req.headers["x-homepage-adguard-toggle"]!=="1"){return res.status(403).json({ok:false,error:"Forbidden: Missing or invalid X-Homepage-AdGuard-Toggle header"});}
if((req.headers["sec-fetch-site"]||"").toLowerCase()==="cross-site"){return res.status(403).json({ok:false,error:"Forbidden: Cross-site requests rejected"});}
const origin=req.headers["origin"];
if(origin){
  try{
    const uO=new URL(origin);
    const oHost=uO.hostname.toLowerCase();
    const reqHost=(req.headers["host"]||"").split(":")[0].toLowerCase();
    const allowed=(process.env.HOMEPAGE_ALLOWED_HOSTS||"127.0.0.1,localhost,zimablade,192.168.1.17").split(",").map(h=>h.split(":")[0].trim().toLowerCase()).filter(Boolean);
    if(oHost!==reqHost&&!allowed.includes(oHost)){return res.status(403).json({ok:false,error:"Forbidden: Origin not permitted"});}
  }catch(_){return res.status(403).json({ok:false,error:"Forbidden: Malformed Origin header"});}
}
const adgUrl=process.env.HOMEPAGE_VAR_ADGUARD_URL;
const user=process.env.HOMEPAGE_VAR_ADGUARD_USER;
const pass=process.env.HOMEPAGE_VAR_ADGUARD_PASSWORD;
if(!adgUrl||!user||!pass){return res.status(500).json({ok:false,error:"AdGuard service not configured"});}
let body=req.body;
if(typeof body==="string"){try{body=JSON.parse(body);}catch(_){return res.status(400).json({ok:false,error:"Invalid JSON body"});}}
else if(!body||typeof body!=="object"){body={};}
const action=body.action;
if(!["status","pause","resume"].includes(action)){return res.status(400).json({ok:false,error:"Invalid action"});}
if(action==="pause"){
  const dur=body.duration;
  if(typeof dur!=="number"||dur!==Math.floor(dur)){return res.status(400).json({ok:false,error:"Duration must be an integer"});}
  if(dur<1000||dur>86400000){return res.status(400).json({ok:false,error:"Duration out of allowed range (1s to 24h)"});}
}
const auth="Basic "+Buffer.from(user+":"+pass).toString("base64");
const tUrl=new URL(adgUrl);
const isHttps=tUrl.protocol==="https:";
const client=isHttps?require("https"):require("http");
let outPath="/control/status",outMethod="GET",outBody=null;
if(action==="pause"||action==="resume"){
  outPath="/control/protection";outMethod="POST";
  const pPayload={enabled:action==="resume"};
  if(action==="pause"){pPayload.duration=body.duration;}
  outBody=JSON.stringify(pPayload);
}
const outHeaders={Authorization:auth,"User-Agent":"Homepage-Proxy/1.0"};
if(outBody){outHeaders["Content-Type"]="application/json";outHeaders["Content-Length"]=Buffer.byteLength(outBody);}
let responded=false;
function sendResp(st,dt){if(responded)return;responded=true;res.status(st).json(dt);}
const outReq=client.request({protocol:tUrl.protocol,hostname:tUrl.hostname,port:tUrl.port||(isHttps?443:80),path:outPath,method:outMethod,headers:outHeaders,timeout:10000},(outRes)=>{
  let raw="";outRes.on("data",c=>raw+=c);
  outRes.on("end",()=>{
    const code=outRes.statusCode||500;
    if(code<200||code>=300){return sendResp(code,{ok:false,error:"Backend error: "+code});}
    if(action==="status"){
      try{
        const pj=JSON.parse(raw);
        return sendResp(200,{ok:true,protection_enabled:pj.protection_enabled,protection_disabled_duration:pj.protection_disabled_duration||0});
      }catch(e){return sendResp(500,{ok:false,error:"Invalid JSON from AdGuard"});}
    }else{
      const isR=action==="resume";
      return sendResp(200,{ok:true,action:isR?"resumed":"paused",protection_enabled:isR,protection_disabled_duration:isR?0:body.duration});
    }
  });
});
outReq.on("timeout",()=>{outReq.destroy();sendResp(504,{ok:false,error:"Gateway Timeout"});});
outReq.on("error",()=>{sendResp(502,{ok:false,error:"Bad Gateway"});});
if(outBody){outReq.write(outBody);}
return outReq.end();
}`;
        code = code.replace(match[0], proxyHandler + match[0]);
        fs.writeFileSync(jsPath, code, "utf8");
        console.log("[adguard-toggle] Injected AdGuard proxy handler into [path].js");
      } else {
        console.warn("[adguard-toggle] WARNING: target regex not found in [path].js. Skipping proxy injection.");
      }
    }
  }
} catch (e) {
  console.warn("[adguard-toggle] Non-fatal error while patching [path].js:", e.message);
}
  ' || echo "[adguard-toggle] Patching script returned non-zero, continuing startup"
fi

if [ $# -gt 0 ]; then
  exec /usr/local/bin/docker-entrypoint.sh "$@"
else
  exec /usr/local/bin/docker-entrypoint.sh node server.js
fi
