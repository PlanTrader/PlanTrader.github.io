/**
 * EdgeOne Edge Function - Quantmind Route Proxy Handler
 *
 * Handles /quantmind/* requests by proxying to backend service.
 */

const BACKEND_URL = 'https://9xz2tsffxk-8080.cnb.run';

export async function onRequest(context) {
  const { request } = context;

  // Check if this is a /quantmind/* request
  const url = new URL(request.url);
  const pathname = url.pathname;

  // This function should handle all /quantmind/* paths
  if (!pathname.startsWith('/quantmind')) {
    // Return 404 for non-quantmind requests
    return new Response('Not Found', { status: 404 });
  }

  try {
    // Remove /quantmind prefix and build backend URL
    const backendPath = pathname.replace(/^\/quantmind/, '') || '/';
    const backendUrl = new URL(backendPath + url.search, BACKEND_URL);

    // Copy request
    const requestBody = request.body ? request.body : undefined;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('host');
    requestHeaders.delete('connection');

    const proxyRequest = new Request(backendUrl, {
      method: request.method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'manual'
    });

    const response = await fetch(proxyRequest);
    const newHeaders = new Headers(response.headers);

    // Set debug headers
    newHeaders.set('x-edge-function', 'quantmind');
    newHeaders.set('x-backend-url', backendUrl.toString());

    newHeaders.delete('connection');

    // For HTML responses, rewrite content to fix paths
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const rewrittenHtml = rewriteHtml(html);
      newHeaders.set('content-length', String(rewrittenHtml.length));
      return new Response(rewrittenHtml, {
        status: response.status,
        headers: newHeaders
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response('Error: ' + error.message, { status: 500 });
  }
}

/**
 * Rewrite HTML to fix asset paths
 */
function rewriteHtml(html) {
  let result = html;

  // Rewrite service worker registration
  result = result.replace(
    /navigator\.serviceWorker\.register\('sw\.js'\)/g,
    "navigator.serviceWorker.register('/quantmind/sw.js')"
  );

  // Rewrite manifest href if it's relative
  result = result.replace(
    /<link[^>]*href="manifest\.webmanifest"[^>]*>/g,
    '<link rel="manifest" href="/quantmind/manifest.webmanifest">'
  );

  return result;
}
