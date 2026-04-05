/**
 * 配置加载器
 */
class ConfigLoader {
  constructor() {
    this.config = null;
    this.isLoading = false;
    // 内存缓存，避免重复请求
    this.cache = new Map();
  }

  /**
   * 获取配置
   * @param {string} url - JSON 配置文件的 URL
   * @param {object} options - 可选配置 (timeout, defaultConfig)
   * @returns {Promise<object>}
   */
  async getConfig(url, options = {}) {
    const { 
      timeout = 5000, 
      defaultConfig = {}, 
      useCache = true 
    } = options;

    // 1. 检查内存缓存
    if (useCache && this.cache.has(url)) {
      console.log('[Config] Using memory cache');
      return this.cache.get(url);
    }

    // 2. 防止并发重复请求
    if (this.isLoading) {
      // 简单等待当前加载完成（生产环境可使用更复杂的队列机制）
      await new Promise(resolve => setTimeout(resolve, 100));
      if (this.config) return this.config;
    }

    this.isLoading = true;

    try {
      // 3. 发起带超时的 Fetch 请求
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      console.log(`[Config] Fetching from: ${url}`);
      
      // 添加时间戳防止浏览器强缓存 (可选，取决于你的缓存策略)
      const fetchUrl = `${url}?t=${Date.now()}`;

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          // 如果服务端支持 CORS，这里通常不需要特殊头，除非需要携带 Cookie
          // 'Credentials': 'include' 
        },
        signal: controller.signal
      });

      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 4. 解析 JSON
      const data = await response.json();

      // 5. 验证基本结构 (可选)
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid config format');
      }

      // 6. 更新缓存
      this.config = { ...defaultConfig, ...data }; // 合并默认值
      if (useCache) {
        this.cache.set(url, this.config);
      }

      console.log('[Config] Loaded successfully:', this.config);
      return this.config;

    } catch (error) {
      console.error('[Config] Failed to load config:', error.message);
      
      // 7. 错误回退：返回默认配置或之前的缓存
      if (this.config) {
        console.warn('[Config] Using previous cached config due to error');
        return this.config;
      }
      
      console.warn('[Config] Using default config due to error');
      return defaultConfig;
      
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 清除缓存 (用于强制刷新)
   */
  clearCache(url) {
    if (url) {
      this.cache.delete(url);
    } else {
      this.cache.clear();
    }
    this.config = null;
  }
}

// 导出单例
export const configLoader = new ConfigLoader();