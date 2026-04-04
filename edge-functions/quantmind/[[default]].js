/**
 * EdgeOne Edge Function - Quantmind Route Proxy Handler
 *
 * This function proxies /quantmind/* requests to a specific backend service.
 * Supports Hilla/Vaadin applications with proper path rewriting.
 *
 * Important notes:
 * - This function handles all paths starting with /quantmind/*
 * - Requests are forwarded to the quantmind backend service on CNB
 * - Rewrites HTML content to fix asset paths for Hilla applications
 */

// Backend service URL for quantmind
const BACKEND_URL = 'https://9xz2tsffxk-8080.cnb.run';

// Paths that need path rewriting in HTML
const ASSET_PATHS = ['/VAADIN/', '/icons/', '/sw.js', '/manifest.webmanifest'];

export async function onRequest(context) {
  const { request } = context;

  try {
    // Get the request URL and path
    const url = new URL(request.url);
    const pathname = url.pathname;
    const search = url.search;

    // Build the backend URL (remove /quantmind prefix)
    // /quantmind/api/users -> /api/users
    const quantmindPath = pathname.replace(/^\/quantmind/, '') || '/';
    const backendUrl = new URL(quantmindPath + search, BACKEND_URL);

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
    const response = await fetch(proxyRequest);

    // Create a new response with backend content
    const newHeaders = new Headers(response.headers);

    // Set custom headers for debugging
    newHeaders.set('x-edge-function', 'proxy');
    newHeaders.set('x-powered-by', 'EdgeOne Pages');
    newHeaders.set('x-backend-url', backendUrl.toString());
    newHeaders.set('x-ef-handler', 'quantmind/[[default]].js');
    newHeaders.set('x-backend-service', 'quantmind');

    // Remove hop-by-hop headers from backend response
    newHeaders.delete('connection');
    newHeaders.delete('keep-alive');
    newHeaders.delete('transfer-encoding');

    // For non-HTML content, return as-is
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (error) {
    console.error('Error in quantmind proxy function:', error);
    return new Response('Internal Server Error: ' + error.message, {
      status: 500,
      headers: {
        'content-type': 'text/plain',
        'x-edge-function': 'proxy',
        'x-backend-service': 'quantmind'
      }
    });
  }
}

/**
 * Rewrite HTML content to fix asset paths for Quantmind/Hilla
 * @param {string} html - Original HTML content
 * @returns {string} - Modified HTML with corrected paths
 */
function rewriteHtmlForQuantmind(html) {
  let result = html;

  // Rewrite <base href="."> to <base href="/quantmind/">
  result = result.replace(
    /<base\s+href="\."\s*\/?>/i,
    '<base href="/quantmind/">'
  );

  // Rewrite asset paths to include /quantmind/ prefix
  // This handles all root-level paths: /VAADIN/, /icons/, /sw.js, /manifest.webmanifest
  // And their subpaths: /icons/icon-16x16.png, /VAADIN/generated/vaadin.ts
  // Also handles relative paths: icons/, VAADIN/, sw.js, etc.
  result = result.replace(
    /<(link|script|img)\s+[^>]*(?:src|href)="(\/?(VAADIN|icons|sw\.js|manifest\.webmanifest)[^"]*)"[^>]*>/gi,
    (match, tag, fullPath, pathPart) => {
      // Skip paths that already have /quantmind/ prefix
      if (match.includes('/quantmind/')) return match;
      // If path is relative (starts without /), prepend /quantmind/
      // If path is absolute (starts with /), rewrite /(VAADIN|icons|sw.js) -> /quantmind/$1
      if (fullPath.startsWith('/')) {
        return match.replace(/"\/(VAADIN|icons|sw\.js|manifest\.webmanifest)/g, '"/quantmind/$1');
      } else {
        return match.replace(/"(VAADIN|icons|sw\.js|manifest\.webmanifest)/g, '"/quantmind/$1');
      }
    }
  );

  // Handle manifest webmanifest
  result = result.replace(
    /<link[^>]*rel="manifest"[^>]*href="manifest\.webmanifest"[^>]*>/gi,
    '<link rel="manifest" href="/quantmind/manifest.webmanifest">'
  );

  // Handle service worker registration
  result = result.replace(
    /navigator\.serviceWorker\.register\('sw\.js'\)/gi,
    "navigator.serviceWorker.register('/quantmind/sw.js')"
  );

  // Handle Vaadin dev tools WebSocket URL
  result = result.replace(
    /<vaadin-dev-tools\s+url="\.\/VAADIN\/push"/gi,
    '<vaadin-dev-tools url="/quantmind/VAADIN/push"'
  );

  return result;
}
