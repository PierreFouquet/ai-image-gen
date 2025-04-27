export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/generate") {
      const modelQuery = url.searchParams.get("model");
      const promptQuery = url.searchParams.get("prompt") || "cyberpunk cat";

      const inputs = { prompt: promptQuery };

      const imageModels = {
        stable_diffusion_v1_5: "@cf/stabilityai/stable-diffusion-2-1",
        stable_diffusion_xl: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
      };

      const selectedModel = imageModels[modelQuery] || imageModels.stable_diffusion_xl;

      const response = await env.AI.run(
        selectedModel,
        inputs,
      );

      return new Response(response, {
        headers: {
          "content-type": "image/png",
        },
      });
    }

    // Optional: serve the frontend HTML if they visit '/'
    return new Response("Frontend page not found.", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
