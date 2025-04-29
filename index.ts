interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  IMAGE_STORE: KVNamespace;
}

async function streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    totalLength += value.length;
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined.buffer;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const imageFile = formData.get("image") as File;

        if (!imageFile) {
          return new Response("No image file provided", { status: 400 });
        }

        const arrayBuffer = await imageFile.arrayBuffer();
        const imageKey = crypto.randomUUID();
        await env.IMAGE_STORE.put(imageKey, arrayBuffer);

        return new Response(JSON.stringify({ key: imageKey }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error handling image upload:", error);
        return new Response("Error uploading image", { status: 500 });
      }
    }

    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const { prompt, model, imageKey } = await request.json<{
          prompt?: string;
          model?: string;
          imageKey?: string;
        }>();
        const inputs: Record<string, any> = {
          prompt: prompt,
          num_inference_steps: 30,
          guidance_scale: 8,
        };

        if (!prompt) {
          return new Response("Missing 'prompt' in request body", { status: 400 });
        }
        if (!model) {
          return new Response("Missing 'model' in request body", { status: 400 });
        }

        let imageData: ArrayBuffer | null = null;
        if (model === "@cf/runwayml/stable-diffusion-v1-5-img2img" || model === "@cf/stabilityai/stable-diffusion-v1-5-inpainting") {
          if (!imageKey) {
            return new Response("Missing 'imageKey' in request body for this model", { status: 400 });
          }
          const storedImage = await env.IMAGE_STORE.get(imageKey, { type: "arrayBuffer" });
          if (!storedImage) {
            return new Response("Image not found in storage", { status: 404 });
          }
          imageData = storedImage;
          inputs.image = imageData; // Assign the ArrayBuffer
          inputs.num_inference_steps = 50;
          inputs.guidance_scale = 7.5;
        }

        try {
          console.log("Inputs to AI.run:", inputs);
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
          } else {
            console.log("Response (typeof):", typeof aiResponse);

            if (aiResponse instanceof ReadableStream) {
              const arrayBuffer = await streamToArrayBuffer(aiResponse);
              return new Response(arrayBuffer, { headers: { 'Content-Type': 'image/png' } });
            } else {
              console.error("Unexpected AI response format:", aiResponse);
              console.log("Full aiResponse:", aiResponse);
              return new Response("Error generating image: Unexpected response format", { status: 500 });
            }
          }
        } catch (aiError) {
          console.error("Error during AI.run:", aiError);
          const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
          return new Response(`Error generating image: ${aiErrorMessage}`, { status: 500 });
        } finally {
          if (imageKey) {
            await env.IMAGE_STORE.delete(imageKey);
          }
        }
      } catch (e) {
        console.error("Error during /generate handling:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(`Error generating image: ${errorMessage}`, { status: 500 });
      }
    }

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
