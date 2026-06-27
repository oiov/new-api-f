package middleware

const apiLandingPageHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Nbility API</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#09090b;--card:#18181b;--border:#27272a;--text:#fafafa;--muted:#a1a1aa;--accent:#ca3500;--accent2:#ff8818;--green:#22c55e}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.container{max-width:480px;width:100%}
.header{display:flex;align-items:center;gap:12px;margin-bottom:32px}
.logo svg{width:40px;height:40px}
.title{font-size:1.5rem;font-weight:700}
.status{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;background:var(--card);border:1px solid var(--border);border-radius:999px;font-size:0.8rem;color:var(--muted);margin-bottom:32px}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:16px}
.card-label{font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px}
.endpoint{display:flex;align-items:center;justify-content:space-between;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:8px}
.endpoint:last-child{margin-bottom:0}
.endpoint-url{font-family:"SF Mono",Monaco,Consolas,monospace;font-size:0.82rem;color:var(--text);word-break:break-all}
.copy-btn{background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;border-radius:4px;transition:color .2s}
.copy-btn:hover{color:var(--text)}
.copy-btn svg{width:16px;height:16px}
.copied{color:var(--green)!important}
.links{display:flex;gap:12px;margin-top:24px;flex-wrap:wrap}
.links a{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--muted);text-decoration:none;font-size:0.82rem;transition:border-color .2s,color .2s}
.links a:hover{border-color:var(--accent2);color:var(--text)}
.links a svg{width:14px;height:14px}
.footer{margin-top:40px;text-align:center;font-size:0.75rem;color:var(--muted)}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="logo">
      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <circle cx="512" cy="512" r="512" fill="#ca3500"/>
        <g transform="translate(512,512) scale(0.7) translate(-512,-512)">
          <path d="M655.36 89.813333L216.533333 309.12c-52.053333 26.026667-63.36 95.573333-22.186666 136.746667L413.866667 665.173333c41.173333 41.173333 110.72 29.866667 136.746666-22.186666L769.92 204.16c36.693333-73.386667-41.173333-151.04-114.56-114.346667z" fill="#ffb869"/>
          <path d="M368.64 934.186667l438.826667-219.306667c52.053333-26.026667 63.36-95.573333 22.186666-136.746667L610.133333 358.826667c-41.173333-41.173333-110.72-29.866667-136.746666 22.186666L254.08 819.84c-36.693333 73.386667 41.173333 151.04 114.56 114.346667z" fill="#ff8818"/>
        </g>
      </svg>
    </div>
    <div class="title">Nbility API</div>
  </div>

  <div class="status">
    <span class="status-dot"></span>
    运行正常 · API 接入节点
  </div>

  <div class="card">
    <div class="card-label">OpenAI 兼容接口</div>
    <div class="endpoint">
      <span class="endpoint-url">https://api.nbility.dev/v1</span>
      <button class="copy-btn" onclick="copyText('https://api.nbility.dev/v1',this)" title="复制">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Anthropic 兼容接口</div>
    <div class="endpoint">
      <span class="endpoint-url">https://api.nbility.dev</span>
      <button class="copy-btn" onclick="copyText('https://api.nbility.dev',this)" title="复制">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/></svg>
      </button>
    </div>
  </div>

  <div class="links">
    <a href="https://nbility.dev" target="_blank">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/></svg>
      主站
    </a>
    <a href="https://nbility.dev/docs" target="_blank">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg>
      文档
    </a>
    <a href="https://status.nbility.dev" target="_blank">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"/></svg>
      状态
    </a>
  </div>

  <div class="footer">Powered by Nbility</div>
</div>
<script>
function copyText(text,btn){
  navigator.clipboard.writeText(text).then(function(){
    btn.classList.add('copied');
    setTimeout(function(){btn.classList.remove('copied')},1500);
  });
}
</script>
</body>
</html>`
