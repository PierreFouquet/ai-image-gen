interface Env {
  AI: Ai;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    console.log("Worker received request:", request.url, request.method);

    if (url.pathname === "/generate" && request.method === "POST") {
      // ... (your image generation code remains the same) ...
    }

    // --- Static Asset Serving ---
    if (env.ASSETS) {
      try {
        console.log("Serving static asset via ASSETS:", request.url);
        return await env.ASSETS.fetch(request);
      } catch (e) {
        console.error("Error fetching asset via ASSETS:", e);
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      console.error("ASSETS binding is undefined!");
      return new Response("Internal Server Error: ASSETS binding missing", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
