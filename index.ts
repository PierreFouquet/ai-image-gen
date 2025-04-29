interface Env {
  AI: Ai;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const { prompt, model } = await request.json<{ prompt?: string; model?: string }>();
        const inputs = { prompt: prompt };

        try {
          const aiResponse = await env.AI.run(model, inputs);

          if (model === "@cf/black-forest-labs/flux-1-schnell") {
            try {
              console.log("Flux 1 Schnell Response (JSON.stringify):", JSON.stringify(aiResponse, null, 2));
            } catch (e) {
              console.error("Error stringifying aiResponse:", e);
              console.log("Flux 1 Schnell Response (typeof):", typeof aiResponse);
            }

            if (aiResponse && typeof aiResponse.image === 'string') {
              const binaryString = atob(aiResponse.image);
              const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
              return new Response(img, { headers: { 'Content-Type': 'image/jpeg' } });
            } else {
              console.error("Unexpected Flux 1 Schnell response format:", aiResponse);
              return new Response("Error generating image: Unexpected Flux 1 Schnell response format", { status: 500 });
            }
          } else if (aiResponse instanceof ArrayBuffer) {
            return new Response(aiResponse, { headers: { 'Content-Type': 'image/png' } });
          } else {
            console.error("Unexpected AI response format:", aiResponse);
            return new Response("Error generating image: Unexpected response format", { status: 500 });
          }
        } catch (aiError) {
          console.error("Error during AI.run:", aiError);
          return new Response(`Error generating image: ${aiError}`, { status: 500 });
        }
      } catch (e) {
        console.error("Error during /generate handling:", e);
        return new Response(`Error generating image: ${e}`, { status: 500 });
      }
    }

    if (env.ASSETS) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (e) {
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      return new Response("Internal Server Error: ASSETS binding missing", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
