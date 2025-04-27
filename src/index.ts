export default {
  async fetch(request, env, ctx) {
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

      const response = await env.AI.run(selectedModel, inputs);

      return new Response(response, {
        headers: { "content-type": "image/png" },
      });
    }

    // 🔥 Fallback to static file serving from /public
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
