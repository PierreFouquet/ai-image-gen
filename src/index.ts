export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/generate" && request.method === "POST") { // Ensure it's a POST request
      try {
        const { prompt, model } = await request.json(); // Read prompt and model from JSON body

        if (!prompt) {
          return new Response("Missing prompt in request body", { status: 400 });
        }

        const imageModels = {
          stable_diffusion_v1_5: "@cf/stabilityai/stable-diffusion-2-1",
          stable_diffusion_xl: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
          "stable-diffusion-xl-lightning": "@cf/bytedance/stable-diffusion-xl-lightning",
          "flux-1-schnell": "@cf/black-forest-labs/flux-1-schnell",
          "stable-diffusion-v1-5-inpainting": "@cf/runwayml/stable-diffusion-v1-5-inpainting",
          "stable-diffusion-v1-5-img2img": "@cf/runwayml/stable-diffusion-v1-5-img2img",
          "dreamshaper-8-lcm": "@cf/lykon/dreamshaper-8-lcm",
        };

        const selectedModel = imageModels[model] || imageModels.stable_diffusion_xl; // Use model from body

        const inputs = { prompt: prompt }; // Use prompt from body

         // Ensure env.AI is defined before calling run
         if (!env.AI) {
              return new Response("AI binding not configured. Please check Cloudflare Worker settings or wrangler.toml", { status: 500 });
         }


        const response = await env.AI.run(selectedModel, inputs);

        return new Response(response, {
          headers: { "content-type": "image/png" },
        });

      } catch (error) {
        console.error("Error in /generate handler:", error);
        return new Response(`Error generating image: ${error.message}`, { status: 500 });
      }
    }

    // 🔥 Fallback to static file serving from /public
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

interface Env {
    ASSETS: Fetcher; // Assuming ASSETS is a binding for static assets
    AI: any; // Define the AI binding type
}
