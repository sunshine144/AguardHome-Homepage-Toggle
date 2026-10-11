#!/usr/bin/env bash
# ==============================================================================
# Homepage AdGuard Pill - Container Patcher
# Extracts and patches Homepage's en.html and [path].js from your container.
# Supports Docker and Podman.
# ==============================================================================

set -euo pipefail

CONTAINER_NAME="${1:-homepage}"
RUNTIME="docker"

if ! command -v docker &> /dev/null; then
  if command -v podman &> /dev/null; then
    RUNTIME="podman"
  else
    echo "❌ Error: Neither docker nor podman was found on your system."
    exit 1
  fi
fi

echo "🔍 Using container runtime: ${RUNTIME}"
echo "📦 Targeting container: ${CONTAINER_NAME}"

# Verify container is running
if ! ${RUNTIME} ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  echo "❌ Error: Container '${CONTAINER_NAME}' is not currently running."
  echo "   Please start Homepage first, then re-run this script."
  exit 1
fi

echo "📥 1/4 Extracting files from ${CONTAINER_NAME}..."
${RUNTIME} cp "${CONTAINER_NAME}:/app/.next/server/pages/en.html" ./en.html.patched
${RUNTIME} cp "${CONTAINER_NAME}:/app/.next/server/pages/api/config/[path].js" ./path.js.patched

echo "🛠️ 2/4 Patching en.html (injecting custom.js script tag)..."
if grep -q "custom.js" ./en.html.patched; then
  echo "   ℹ️ en.html already contains custom.js. Skipping injection."
else
  sed -i 's|<link rel="stylesheet" href="/api/config/custom.css"/>|<link rel="stylesheet" href="/api/config/custom.css"/><script src="/api/config/custom.js" defer=""></script>|g' ./en.html.patched
  echo "   ✅ Successfully patched en.html.patched"
fi

echo "🛠️ 3/4 Patching [path].js (injecting AdGuard Home same-origin proxy)..."
if grep -q 'c==="adguard"' ./path.js.patched; then
  echo "   ℹ️ [path].js already contains AdGuard proxy. Skipping injection."
else
  # Injection snippet using node for cross-platform reliability
  node -e '
    const fs = require("fs");
    let content = fs.readFileSync("./path.js.patched", "utf8");

    const target = "if(![\"custom.css\",\"custom.js\"].includes(c))";
    const proxyHandler = `if(c==="adguard"){
const adgUrl=process.env.HOMEPAGE_VAR_ADGUARD_URL||"http://192.168.1.1:80";
const user=process.env.HOMEPAGE_VAR_ADGUARD_USER||"";
const pass=process.env.HOMEPAGE_VAR_ADGUARD_PASSWORD||"";
const auth="Basic "+Buffer.from(user+":"+pass).toString("base64");
const action=a.query.action||(a.method==="POST"?"pause":"status");
const client=adgUrl.startsWith("https")?require("https"):require("http");
const u=new URL(adgUrl);

if(action==="status"){
  const req=client.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),path:"/control/status",method:"GET",headers:{Authorization:auth}},(res)=>{
    let d="";res.on("data",c=>d+=c);res.on("end",()=>{
      try{const j=JSON.parse(d);return b.status(200).json({ok:true,protection_enabled:j.protection_enabled,protection_disabled_duration:j.protection_disabled_duration||0});}catch(e){return b.status(500).json({ok:false,error:e.message});}
    });
  });
  req.on("error",e=>b.status(500).json({ok:false,error:e.message}));
  return req.end();
}else if(action==="pause"){
  const duration=parseInt(a.query.duration,10)||600000;
  const payload=JSON.stringify({enabled:false,duration:duration});
  const req=client.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),path:"/control/protection",method:"POST",headers:{Authorization:auth,"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}},(res)=>{
    let d="";res.on("data",c=>d+=c);res.on("end",()=>b.status(200).json({ok:true,action:"paused",duration_ms:duration}));
  });
  req.on("error",e=>b.status(500).json({ok:false,error:e.message}));
  req.write(payload);
  return req.end();
}else if(action==="resume"){
  const payload=JSON.stringify({enabled:true});
  const req=client.request({protocol:u.protocol,hostname:u.hostname,port:u.port||(u.protocol==="https:"?443:80),path:"/control/protection",method:"POST",headers:{Authorization:auth,"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}},(res)=>{
    let d="";res.on("data",c=>d+=c);res.on("end",()=>b.status(200).json({ok:true,action:"resumed"}));
  });
  req.on("error",e=>b.status(500).json({ok:false,error:e.message}));
  req.write(payload);
  return req.end();
}
return b.status(400).json({ok:false,error:"Invalid action"});
}`;

    if (!content.includes(target)) {
      console.error("❌ Could not find injection anchor in [path].js. Container version might be different.");
      process.exit(1);
    }

    content = content.replace(target, proxyHandler + target);
    fs.writeFileSync("./path.js.patched", content, "utf8");
    console.log("   ✅ Successfully injected AdGuard proxy into path.js.patched");
  '
fi

echo "🎉 4/4 Done! Patched files generated in current directory:"
echo "   - ./en.html.patched"
echo "   - ./path.js.patched"
echo ""
echo "Next step: Add these volume mounts to your docker-compose.yml:"
echo "   volumes:"
echo "     - ./en.html.patched:/app/.next/server/pages/en.html:z"
echo "     - ./path.js.patched:/app/.next/server/pages/api/config/[path].js:z"
