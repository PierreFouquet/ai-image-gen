import { Ai } from '@cloudflare/ai';

interface Env {
    AI: Ai;
    ASSETS: Fetcher;
    IMAGE_STORE: KVNamespace; // Still used for uploaded images
    IMAGE_BUCKET: R2Bucket;    // R2 bucket for generated images
    IMAGE_LOG: KVNamespace;     // KV for logging generated image keys (per session)
}

const validAiModels = [
    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
    "@cf/runwayml/stable-diffusion-v1-5-inpainting",
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
                const maskFile = formData.get("mask") as File;
                const responseData: Record<string, string> = {};

                if (imageFile) {
                    const arrayBuffer = await imageFile.arrayBuffer();
                    const imageKey = crypto.randomUUID();
                    await env.IMAGE_STORE.put(imageKey, arrayBuffer);
                    console.log(`/upload: Base image stored in KV with key: ${imageKey}, size: ${arrayBuffer.byteLength} bytes`);
                    responseData.imageKey = imageKey;
                }

                if (maskFile) {
                    const arrayBuffer = await maskFile.arrayBuffer();
                    const maskKey = crypto.randomUUID();
                    await env.IMAGE_STORE.put(maskKey, arrayBuffer);
                    console.log(`/upload: Mask image stored in KV with key: ${maskKey}, size: ${arrayBuffer.byteLength} bytes`);
                    responseData.maskKey = maskKey;
                }

                return new Response(JSON.stringify(responseData), {
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                });
            } catch (error) {
                console.error("Error handling image upload:", error);
                return new Response("Error uploading image", { status: 500 });
            }
        }

        if (url.pathname === "/generate" && request.method === "POST") {
            try {
                const { prompt, model, imageKey, maskKey } = await request.json<{
                    prompt?: string;
                    model?: string;
                    imageKey?: string;
                    maskKey?: string;
                }>();

                if (!model) return new Response("Missing 'model' in request body", { status: 400 });
                if (!isValidAiModel(model)) return new Response("Invalid model selected", { status: 400 });

                const safeModel: AiModels = model;
                const inputs: Record<string, any> = {
                    prompt: prompt || "", // Allow empty prompt for img2img/inpainting
                    num_inference_steps: 30,
                    guidance_scale: 8,
                };

                let imageData: ArrayBuffer | null = null;
                let maskData: ArrayBuffer | null = null;

                if (
                    safeModel === "@cf/runwayml/stable-diffusion-v1-5-img2img" ||
                    safeModel === "@cf/runwayml/stable-diffusion-v1-5-inpainting"
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
                        inputs.image = Array.from(new Uint8Array(imageData));
                        inputs.num_inference_steps = 50;
                        inputs.guidance_scale = 7.5;

                        if (safeModel === "@cf/runwayml/stable-diffusion-v1-5-inpainting") {
                            if (!maskKey) {
                                return new Response(
                                    "Missing 'maskKey' in request body for inpainting model",
                                    { status: 400 }
                                );
                            }
                            const storedMask = await env.IMAGE_STORE.get(maskKey, {
                                type: "arrayBuffer",
                            });
                            if (!storedMask) {
                                return new Response("Mask image not found in storage", {
                                    status: 404,
                                });
                            }
                            maskData = storedMask;
                            inputs.mask = Array.from(new Uint8Array(maskData));
                        }
                    } catch (kvError) {
                        console.error("Error retrieving image(s) from KV:", kvError);
                        return new Response("Error retrieving image(s) from storage", {
                            status: 500,
                        });
                    }
                }

                let generatedImageBuffer: ArrayBuffer | null = null;
                let contentType = "image/png";

                try {
                    const aiResponse = (await env.AI.run(
                        safeModel,
                        inputs
                    )) as AiResponse;

                    if (
                        safeModel === "@cf/black-forest-labs/flux-1-schnell" &&
                        typeof aiResponse === "object" &&
                        "image" in aiResponse
                    ) {
                        const binaryString = atob(aiResponse.image);
                        generatedImageBuffer = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i)).buffer;
                        contentType = "image/jpeg";
                    } else if (aiResponse instanceof ReadableStream) {
                        generatedImageBuffer = await streamToArrayBuffer(aiResponse);
                        contentType = "image/*"; // Adjust as needed
                    } else if (aiResponse instanceof ArrayBuffer) {
                        generatedImageBuffer = aiResponse;
                    } else {
                        console.error("Unexpected AI response format:", aiResponse);
                        return new Response(
                            "Error generating image: Unexpected response format",
                            { status: 500 }
                        );
                    }

                    if (generatedImageBuffer) {
                        const timestamp = Date.now();
                        const objectKey = `generated/${timestamp}/${crypto.randomUUID()}.png`; // Example key
                        await env.IMAGE_BUCKET.put(objectKey, generatedImageBuffer, {
                            httpMetadata: { contentType },
                            customMetadata: { created: String(timestamp) }, // For potential lifecycle rules
                        });

                        // Basic logging by (potential) session ID
                        const sessionId = request.headers.get('cf-ray') || 'unknown'; // Example - CF-Ray is per request
                        const logEntry = JSON.stringify({ key: objectKey, timestamp });
                        await env.IMAGE_LOG.put(sessionId, (await env.IMAGE_LOG.get(sessionId) || '') + logEntry + '\n');

                        return new Response(generatedImageBuffer, {
                            headers: { "Content-Type": contentType, "Access-Control-Allow-Origin": "*" },
                        });
                    } else {
                        return new Response("Error generating image: No image data received", { status: 500 });
                    }

                } catch (aiError) {
                    console.error("Error during AI.run:", aiError);
                    return new Response(`Error generating image: ${aiError}`, { status: 500 });
                } finally {
                    // Clean up uploaded images from KV after generation (for all models now)
                    if (imageKey) {
                        try {
                            await env.IMAGE_STORE.delete(imageKey);
                            console.log(`/generate: Base image ${imageKey} deleted from KV`);
                        } catch (e) {
                            console.error("KV delete error:", e);
                        }
                    }
                    if (maskKey) {
                        try {
                            await env.IMAGE_STORE.delete(maskKey);
                            console.log(`/generate: Mask image ${maskKey} deleted from KV`);
                        } catch (e) {
                            console.error("KV delete error:", e);
                        }
                    }
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
