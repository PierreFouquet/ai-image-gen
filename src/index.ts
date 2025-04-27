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

    console.log("Worker received request:", request.url, request.method); // Log every request

    // Handle the POST request for image generation
    if (url.pathname === "/generate" && request.method === "POST") {
      console.log("Handling /generate POST request");
      try {
        // Read the JSON body from the request
        const { prompt, model } = await request.json<{ prompt?: string; model?: string }>();

        console.log("Request body:", { prompt, model });

        // Basic validation
        if (!prompt) {
          console.error("Missing 'prompt' in request body");
          return new Response("Missing 'prompt' in request body", { status: 400 });
        }
        if (!model) {
          console.error("Missing 'model' in request body");
          return new Response("Missing 'model' in request body", { status: 400 });
        }

        console.log(`Generating image with model: ${model}, prompt: "${prompt}"`);

        const inputs = { prompt: prompt };

        // Use the model identifier directly from the request body
        // Ensure the AI binding is correctly configured in wrangler.toml ([ai] binding = "AI")
        try {
          const response = await env.AI.run(model, inputs);
          console.log("AI response (raw):", response); // Log the raw response

          // Assuming the response is the image data
          return new Response(response, {
            headers: { "content-type": "image/png" },
          });
        } catch (aiError) {
          console.error("Error during AI.run:", aiError);
          const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
          return new Response(`Error generating image: ${aiErrorMessage}`, { status: 500 });
        }
      } catch (e) {
        // Catch potential errors during JSON parsing or AI execution
        console.error("Error during /generate handling:", e);
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
      console.log("Serving static asset:", request.url);
      return await env.ASSETS.fetch(request);
    } catch (e) {
      // Optional: Customize the response if the asset isn't found
      // By default, env.ASSETS.fetch might throw if the asset isn't found
      // depending on configuration, or return a 404 response.
      console.error("Error fetching asset:", e);
      // Example: Return a generic 404 if asset not found
      // if (e instanceof NotFoundError) { // Hypothetical error type
      //   return new Response("Not Found", { status: 404 });
      // }
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>; // Use satisfies for better type checking if using TypeScript
