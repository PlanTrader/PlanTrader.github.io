/**
 * EdgeOne Edge Function - Root Path Proxy Handler
 *
 * This function proxies requests to an external HTTP service.
 * All requests are forwarded to the backend service running on CNB.
 */

// Import functions from backendResolver
import { resolveBackendUrl, markBackendUnhealthy } from './backendResolver';

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