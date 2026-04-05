/**
 * EdgeOne Edge Function - Root Path Proxy Handler
 *
 * This function proxies requests to an external HTTP service.
 * All requests are forwarded to the backend service running on CNB.
 */

// Import functions from backendResolver
//import { resolveBackendUrl, markBackendUnhealthy } from './backendResolver';
/**
 * backendResolver.js
 * 管理带有缓存和故障转移逻辑的后端 URL 解析。
 */

// 使用环境变量存储秘密和配置
// 确保在部署平台中设置了这些变量
const REPO = 'pt-config/config';
const PATH = 'main/quantmind.json';

// 使用模板字符串正确构造 URL
//const CONFIG_URL = `https://api.cnb.cool/${REPO}/-/git/raw/${PATH}`; 
// ✅ 修复：使用反引号 ` 而不是单引号 '
const CONFIG_URL = `https://api.cnb.cool/${REPO}/-/git/raw/${PATH}`; 

// 状态变量
let cachedBackendUrl = null;
let isHealthy = false;
let lastFetchTime = 0;
const REFRESH_COOLDOWN = 5000; 

export async function resolveBackendUrl() {
  const now = Date.now();
  const CNB_TOKEN = env?.CNB_TOKEN || ''; // 从环境变量获取

  // 场景 1：健康的缓存命中
  if (cachedBackendUrl && isHealthy) {
    return cachedBackendUrl;
  }

  // 场景 2：不健康状态下的冷却期激活
  if (cachedBackendUrl && !isHealthy && (now - lastFetchTime < REFRESH_COOLDOWN)) {
     console.log('[Resolver] Using stale URL due to cooldown');
     return cachedBackendUrl;
  }

  // 获取新配置
  lastFetchTime = now;
  try {
    console.log('[Resolver] Fetching backend config from:', CONFIG_URL);
    
    // 准备请求头
    const headers = { 
      'Cache-Control': 'no-cache' 
    };
    
    // 如果存在令牌，添加认证信息
    if (CNB_TOKEN) {
        headers['Authorization'] = `${CNB_TOKEN}`;
    }

    const response = await fetch(CONFIG_URL, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`Config fetch status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.backendUrl) {
      cachedBackendUrl = data.backendUrl;
      isHealthy = true;
      console.log('[Resolver] New Backend URL set:', cachedBackendUrl);
      return cachedBackendUrl;
    } else {
      throw new Error('Invalid config format: missing backendUrl');
    }

  } catch (error) {
    console.error('[Resolver] Failed to fetch config:', error.message);
    isHealthy = false;
    
    if (cachedBackendUrl) {
      console.warn('[Resolver] Returning stale URL as fallback');
      return cachedBackendUrl;
    }
    
    // ⚠️ 如果这里抛出错误，index.js 会捕获并返回 500
    throw new Error(`Config fetch failed: ${error.message}`);
  }
}

export function markBackendUnhealthy() {
  console.warn('[Resolver] Marking current backend as unhealthy');
  isHealthy = false;
}

export async function onRequest(context) {
  const { request } = context;

  try {
    // 1. 动态获取后端 URL
    let baseUrl;
    try {
      baseUrl = await resolveBackendUrl();
    } catch (configError) {
      console.error('[Index] Failed to resolve backend URL:', configError.message);
      // 返回更明确的错误，方便浏览器调试
      return new Response(JSON.stringify({ 
        error: 'Configuration Error', 
        message: configError.message 
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Get the request URL and path
    const url = new URL(request.url);
    const pathname = url.pathname;
    const search = url.search;

    // 2. Build the backend URL using the resolved base URL
    // Ensure baseUrl ends with / if pathname doesn't start with /, or handle accordingly
    // Assuming baseUrl from config is like 'https://example.com/'
    const backendUrl = new URL(pathname + search, baseUrl);

    // Copy the request body and headers
    const requestBody = request.body ? request.body : undefined;
    const requestHeaders = new Headers(request.headers);

    // Remove hop-by-hop headers that shouldn't be proxied
    requestHeaders.delete('host');
    requestHeaders.delete('connection');
    requestHeaders.delete('keep-alive');
    requestHeaders.delete('transfer-encoding');

    // 🔧 新增：防止后端域名泄漏的关键头部处理
    // 1. Location — 最关键！重定向时要把后端域名替换为边缘节点域名
    if (newHeaders.has('location')) {
      const originalLocation = newHeaders.get('location');
      try {
        const backendUrlObj = new URL(originalLocation);
        // 把后端域名替换为当前请求的域名
        const currentOrigin = new URL(request.url).origin;
        const rewrittenLocation = `${currentOrigin}${backendUrlObj.pathname}${backendUrlObj.search}`;
        newHeaders.set('location', rewrittenLocation);
        console.log(`[Proxy] Rewrote Location: ${originalLocation} → ${rewrittenLocation}`);
      } catch (e) {
        // 如果不是合法 URL，直接删除
        newHeaders.delete('location');
        console.warn('[Proxy] Removed invalid Location header:', originalLocation);
      }
    }

    // 2. Content-Location — 同样需要重写或删除
    if (newHeaders.has('content-location')) {
      newHeaders.delete('content-location');
    }

    // 3. Set-Cookie — 域名可能绑定到后端（需更复杂处理，先删除）
    // newHeaders.delete('set-cookie');  // ⚠️ 如果你需要 cookie，需要做 domain 重写

    // 4. WWW-Authenticate — 删除，避免弹出后端域名的登录框
    if (newHeaders.has('www-authenticate')) {
      newHeaders.delete('www-authenticate');
    }

    // 5. Link header (rel=canonical 等)
    if (newHeaders.has('link')) {
      newHeaders.delete('link');
    }

    // Create the proxied request
    const proxyRequest = new Request(backendUrl, {
      method: request.method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'manual'
    });

    // Forward the request to the backend
    let response;
    try {
      response = await fetch(proxyRequest);
      
      // Optional: Mark unhealthy if backend returns 5xx errors
      if (response.status >= 500) {
        console.warn(`[Proxy] Backend returned status ${response.status}, marking unhealthy`);
        markBackendUnhealthy();
      }
    } catch (fetchError) {
      // Network error or DNS failure
      console.error('[Proxy] Fetch failed, marking backend unhealthy:', fetchError.message);
      markBackendUnhealthy();
      throw fetchError; // Re-throw to be caught by the outer catch block
    }

    // Create a new response with backend content
    const newHeaders = new Headers(response.headers);

    // Set custom headers for debugging
    newHeaders.set('x-edge-function', 'proxy');
    newHeaders.set('x-powered-by', 'EdgeOne Pages');
    newHeaders.set('x-backend-url', backendUrl.toString());
    newHeaders.set('x-ef-handler', 'index.js');

    // Remove hop-by-hop headers from backend response
    newHeaders.delete('connection');
    newHeaders.delete('keep-alive');
    newHeaders.delete('transfer-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (error) {
    console.error('Error in proxy function:', error);
    return new Response('Internal Server Error: ' + error.message, {
      status: 500,
      headers: {
        'content-type': 'text/plain',
        'x-edge-function': 'proxy'
      }
    });
  }
}