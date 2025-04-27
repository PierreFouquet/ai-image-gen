// Make sure you have this interface defined, or adjust as needed
// You might need to install @cloudflare/workers-types if you haven't
// npm install --save-dev @cloudflare/workers-types
// or yarn add --dev @cloudflare/workers-types
interface Env {
    // This binding is essential and MUST be configured in wrangler.toml or Cloudflare dashboard
    AI: Ai;

    // This binding is needed for serving static assets like index.html
    // It's typically configured via [site] in wrangler.toml
    ASSETS: Fetcher;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // Handle the POST request for image generation
        if (url.pathname === "/generate" && request.method === "POST") {
            try {
                // Read the JSON body from the request
                const { prompt, model } = await request.json<{ prompt?: string; model?: string }>();

                // Basic validation
                if (!prompt) {
                    return new Response("Missing 'prompt' in request body", { status: 400 });
                }
                if (!model) {
                    return new Response("Missing 'model' in request body", { status: 400 });
                }

                console.log(`Generating image with model: ${model}, prompt: "${prompt}"`);

                const inputs = { prompt: prompt };

                // Use the model identifier directly from the request body
                // Ensure the AI binding is correctly configured in wrangler.toml ([ai] binding = "AI")
                const response = await env.AI.run(model, inputs);

                return new Response(response, {
                    headers: { "content-type": "image/png" },
                });

            } catch (e) {
                 // Catch potential errors during JSON parsing or AI execution
                 console.error("Error during image generation:", e);
                 // Check if e is an Error instance to safely access message
                 const errorMessage = e instanceof Error ? e.message : String(e);
                 return new Response(`Error generating image: ${errorMessage}`, { status: 500 });
            }
        }

        // --- Static Asset Serving ---
        // For any other path OR if the request to /generate wasn't a POST,
        // fall back to serving static files from the /public directory.
        // This requires the [site] bucket = "./public" configuration in wrangler.toml
        // and the ASSETS binding.
        try {
             // Let the ASSETS fetcher handle the request (serves index.html for '/')
            return await env.ASSETS.fetch(request);
        } catch (e) {
            // Optional: Customize the response if the asset isn't found
            // By default, env.ASSETS.fetch might throw if the asset isn't found
            // depending on configuration, or return a 404 response.
             console.error("Error fetching asset:", e);
            // Example: Return a generic 404 if asset not found
             // if (e instanceof NotFoundError) { // Hypothetical error type
             //     return new Response("Not Found", { status: 404 });
             // }
            return new Response("Internal Server Error", { status: 500 });
        }
    },
} satisfies ExportedHandler<Env>; // Use satisfies for better type checking if using TypeScript
