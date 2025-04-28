interface Env {
  AI: Ai;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    console.log("Worker received request:", request.url, request.method);

    if (url.pathname === "/generate" && request.method === "POST") {
      console.log("Handling /generate POST request");
      try {
        const { prompt, model } = await request.json<{ prompt?: string; model?: string }>();

        console.log("Request body:", { prompt, model });

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

        try {
          const response = await env.AI.run(model, inputs);
          console.log("AI response (raw):", response);

          return new Response(response, {
            headers: { "content-type": "image/png" },
          });
        } catch (aiError) {
          console.error("Error during AI.run:", aiError);
          const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
          return new Response(`Error generating image: ${aiErrorMessage}`, { status: 500 });
        }
      } catch (e) {
        console.error("Error during /generate handling:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(`Error generating image: ${errorMessage}`, { status: 500 });
      }
    }

    // --- Static Asset Serving ---
    // Explicitly check if ASSETS binding is available
    if (env.ASSETS) {
      try {
        console.log("Serving static asset via ASSETS:", request.url);
        const response = await env.ASSETS.fetch(request);
        return response;
      } catch (e) {
        console.error("Error fetching asset via ASSETS:", e);
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      console.error("ASSETS binding not found!");
      return new Response("Internal Server Error: ASSETS binding missing", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
