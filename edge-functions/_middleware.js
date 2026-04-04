/**
 * EdgeOne Edge Function - Middleware for routing
 * Intercepts all requests and routes /quantmind/* to the quantmind proxy
 */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Check if the path starts with /quantmind
  if (pathname.startsWith('/quantmind')) {
    // Import and use the quantmind proxy
    const quantmindModule = await import('./quantmind/[[default]].js');
    return quantmindModule.onRequest(context);
  }

  // For all other paths, return null to let EdgeOne Pages handle normally
  return null;
}
