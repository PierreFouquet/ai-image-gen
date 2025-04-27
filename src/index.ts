export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const modelQuery = url.searchParams.get("model");

    const inputs = {
      prompt: "cyberpunk cat",
    };

    // Supported image generation models
    const imageModels = {
      stable_diffusion_v1_5: "@cf/stabilityai/stable-diffusion-2-1",
      stable_diffusion_xl: "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    };

    // Fallback to stable diffusion XL if no model or invalid model is provided
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
  },
} satisfies ExportedHandler<Env>;
