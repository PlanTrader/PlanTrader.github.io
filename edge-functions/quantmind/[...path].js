/**
 * EdgeOne Edge Function - Quantmind Route Proxy Handler
 *
 * This function proxies /quantmind/* requests to a specific backend service.
 * All paths starting with /quantmind are forwarded to the quantmind backend.
 *
 * Important notes:
 * - This function handles all paths starting with /quantmind/*
 * - Requests are forwarded to the quantmind backend service on CNB
 */

// Backend service URL for quantmind
const BACKEND_URL = 'https://9xz2tsffxk-8080.cnb.run';

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
    newHeaders.set('x-ef-handler', 'quantmind/[...path].js');
    newHeaders.set('x-backend-service', 'quantmind');

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
