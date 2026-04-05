/**
 * backendResolver.js
 * 管理带有缓存和故障转移逻辑的后端 URL 解析。
 */

// 使用环境变量存储秘密和配置
// 确保在部署平台中设置了这些变量
const CNB_TOKEN = process.env.CNB_TOKEN; 
const REPO = 'pt-config/config';
const PATH = 'main/quantmind.json';

// 使用模板字符串正确构造 URL
const CONFIG_URL = `https://api.cnb.cool/${REPO}/-/git/raw/${PATH}`; 

// 状态变量
let cachedBackendUrl = null;
let isHealthy = false;
let lastFetchTime = 0;
const REFRESH_COOLDOWN = 5000; 

export async function resolveBackendUrl() {
  const now = Date.now();

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
        headers['Authorization'] = `Bearer ${CNB_TOKEN}`;
    }

    const response = await fetch(CONFIG_URL, {
      method: 'GET',
      headers: headers,
      cf: { cacheTtl: 0 } 
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
    
    throw new Error('No backend URL available and config fetch failed');
  }
}

export function markBackendUnhealthy() {
  console.warn('[Resolver] Marking current backend as unhealthy');
  isHealthy = false;
}