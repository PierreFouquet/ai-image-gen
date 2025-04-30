import { Ai } from '@cloudflare/ai';

interface Env {
    AI: Ai;
    ASSETS: Fetcher;
    IMAGE_STORE: KVNamespace; // Still used for uploaded images
    IMAGE_BUCKET: R2Bucket;    // R2 bucket for generated images
    IMAGE_LOG: KVNamespace;     // KV for logging generated image keys (per session)
}

const validAiModels = [...] // (same as before)
type AiModels = (typeof validAiModels)[number];
function isValidAiModel(model: string): model is AiModels { return validAiModels.includes(model as AiModels); }
type AiResponse = { image: string } | ReadableStream<Uint8Array> | ArrayBuffer;
async function streamToArrayBuffer(stream: ReadableStream): Promise<ArrayBuffer> { /* ... */ }

export default {
    async fetch(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/upload" && request.method === "POST") {
            // ... (same upload logic as before) ...
        }

        if (url.pathname === "/generate" && request.method === "POST") {
            try {
                const { prompt, model, imageKey, maskKey } = await request.json<{ /* ... */ }>();
                if (!model || !isValidAiModel(model)) return new Response("Invalid request", { status: 400 });
                const safeModel: AiModels = model;
                const inputs: Record<string, any> = { prompt: prompt || "", num_inference_steps: 30, guidance_scale: 8 };
                let imageData: ArrayBuffer | null = null;
                let maskData: ArrayBuffer | null = null;

                if (safeModel === "@cf/runwayml/stable-diffusion-v1-5-img2img" || safeModel === "@cf/runwayml/stable-diffusion-v1-5-inpainting") {
                    // ... (same logic to retrieve uploaded image(s) from IMAGE_STORE KV) ...
                }

                let generatedImageBuffer: ArrayBuffer | null = null;
                let contentType = "image/png";

                try {
                    const aiResponse = (await env.AI.run(safeModel, inputs)) as AiResponse;
                    // ... (same logic to handle AI response and get generatedImageBuffer and contentType) ...

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

                        const r2ObjectURL = `https://${env.IMAGE_BUCKET.bucket()}.r2.dev/${objectKey}`; // Construct R2 URL

                        return new Response(JSON.stringify({ imageUrl: r2ObjectURL }), { // Return the URL
                            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                        });
                    } else {
                        return new Response("Error generating image: No image data received", { status: 500 });
                    }

                } catch (aiError) {
                    console.error("Error during AI.run:", aiError);
                    return new Response(`Error generating image: ${aiError}`, { status: 500 });
                } finally {
                    // Clean up uploaded images from KV after generation
                    if (imageKey) try { await env.IMAGE_STORE.delete(imageKey); console.log(`/generate: Base image ${imageKey} deleted from KV`); } catch (e) { console.error("KV delete error:", e); }
                    if (maskKey) try { await env.IMAGE_STORE.delete(maskKey); console.log(`/generate: Mask image ${maskKey} deleted from KV`); } catch (e) { console.error("KV delete error:", e); }
                }

            } catch (e) {
                console.error("Error during /generate handling:", e);
                return new Response(`Error generating image: ${e}`, { status: 500 });
            }
        }

        if (url.pathname === "/session-images") {
            const sessionId = request.headers.get('cf-ray') || 'unknown';
            const logData = await env.IMAGE_LOG.get(sessionId);
            const imageKeys = logData ? logData.split('\n').filter(entry => entry.trim() !== '').map(entry => JSON.parse(entry).key) : [];
            return new Response(JSON.stringify({ keys: imageKeys }), {
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            });
        }

        if (env.ASSETS) {
            return await env.ASSETS.fetch(request);
        } else {
            return new Response("Internal Server Error: ASSETS binding missing", { status: 500 });
        }
    },
} satisfies ExportedHandler<Env>;