import { Ai } from '@cloudflare/ai';

interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  IMAGE_STORE: KVNamespace;
}

const validAiModels = [
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/stabilityai/stable-diffusion-v1-5-inpainting",
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/runwayml/stable-diffusion-v1-5-img2img",
  "@cf/lykon/dreamshaper-8-lcm",
] as const;

type AiModels = (typeof validAiModels)[number];

function isValidAiModel(model: string): model is AiModels {
  return validAiModels.includes(model as AiModels);
}

type AiResponse = { image: string } | ReadableStream<Uint8Array> | ArrayBuffer;

async function streamToArrayBuffer(
  stream: ReadableStream
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
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
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
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
        console.log(
          `/upload: Image stored in KV with key: ${imageKey}, size: ${arrayBuffer.byteLength} bytes`
        );
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

        if (!prompt) return new Response("Missing 'prompt' in request body", { status: 400 });
        if (!model) return new Response("Missing 'model' in request body", { status: 400 });
        if (!isValidAiModel(model)) return new Response("Invalid model selected", { status: 400 });

        const safeModel: AiModels = model;
        const inputs: Record<string, any> = {
          prompt,
          num_inference_steps: 30,
          guidance_scale: 8,
        };

        let imageData: ArrayBuffer | null = null;

        if (
          safeModel === "@cf/runwayml/stable-diffusion-v1-5-img2img" ||
          safeModel === "@cf/stabilityai/stable-diffusion-v1-5-inpainting"
        ) {
          if (!imageKey) {
            return new Response(
              "Missing 'imageKey' in request body for this model",
              { status: 400 }
            );
          }
          try {
            const storedImage = await env.IMAGE_STORE.get(imageKey, {
              type: "arrayBuffer",
            });
            if (!storedImage) {
              return new Response("Image not found in storage", {
                status: 404,
              });
            }
            imageData = storedImage;
            inputs.image = imageData;
            inputs.num_inference_steps = 50;
            inputs.guidance_scale = 7.5;
          } catch (kvError) {
            console.error("Error retrieving image from KV:", kvError);
            return new Response("Error retrieving image from storage", {
              status: 500,
            });
          }
        }

        try {
          const aiResponse = (await env.AI.run(
            safeModel,
            inputs
          )) as AiResponse;

          console.log("Raw AI Response:", aiResponse);

          if (
            safeModel === "@cf/black-forest-labs/flux-1-schnell" &&
            typeof aiResponse === "object" &&
            "image" in aiResponse
          ) {
            const binaryString = atob(aiResponse.image);
            const img = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              img[i] = binaryString.charCodeAt(i);
            }
            return new Response(img, { headers: { "Content-Type": "image/jpeg" } });
          } else if (aiResponse instanceof ReadableStream) {
            console.log("Handling ReadableStream response");
            try {
              const arrayBuffer = await streamToArrayBuffer(aiResponse);
              console.log("Stream converted to ArrayBuffer:", arrayBuffer.byteLength, "bytes");
              return new Response(arrayBuffer, {
                headers: {
                  "Content-Type": "image/*", // Or the specific image type if known
                  "Access-Control-Allow-Origin": "*", // VERY IMPORTANT: Adjust for production!
                  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                  "Access-Control-Allow-Headers": "Content-Type",
                },
              });
            } catch (streamError) {
              console.error("Error converting stream to ArrayBuffer:", streamError);
              return new Response("Error processing image stream", { status: 500 });
            }
          } else if (aiResponse instanceof ArrayBuffer) {
            return new Response(aiResponse, { headers: { "Content-Type": "image/png" } });
          } else {
            console.error("Unexpected AI response format:", aiResponse);
            return new Response(
              "Error generating image: Unexpected response format",
              { status: 500 }
            );
          }
        } catch (aiError) {
          console.error("Error during AI.run:", aiError);
          const aiErrorMessage = aiError instanceof Error ? aiError.message : String(aiError);
          return new Response(`Error generating image: ${aiErrorMessage}`, {
            status: 500,
          });
        } finally {
          if (imageKey) {
            try {
              await env.IMAGE_STORE.delete(imageKey);
              console.log(
                `/generate: Image with key ${imageKey} deleted from KV`
              );
            } catch (deleteError) {
              console.error("Error deleting image from KV:", deleteError);
            }
          }
        }
      } catch (e) {
        console.error("Error during /generate handling:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(`Error generating image: ${errorMessage}`, {
          status: 500,
        });
      }
    }

    if (env.ASSETS) {
      try {
        return await env.ASSETS.fetch(request);
      } catch (e) {
        console.error("Error fetching asset via ASSETS:", e);
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      console.error("ASSETS binding is undefined!");
      return new Response("Internal Server Error: ASSETS binding missing", {
        status: 500,
      });
    }
  },
} satisfies ExportedHandler<Env>;
