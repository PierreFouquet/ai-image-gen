import { Ai } from '@cloudflare/ai';

 interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  IMAGE_BUCKET: R2Bucket; // Add R2 Bucket binding
 }

 async function storeImageInR2(env: Env, image: ArrayBuffer, key: string): Promise<string> {
  const r2ObjectKey = `images/${key}`; // Customize your R2 object key
  await env.IMAGE_BUCKET.put(r2ObjectKey, image);
  return r2ObjectKey;
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
      const aiResponse = await env.AI.run(model, inputs);
      console.log("AI response (raw):", aiResponse);

      let r2ObjectKey: string | undefined;

      if (aiResponse instanceof ArrayBuffer) {
       const imageKey = crypto.randomUUID();
       r2ObjectKey = await storeImageInR2(env, aiResponse, imageKey);
       return new Response(JSON.stringify({ r2ObjectKey }), { // Return R2 key
        headers: { 'Content-Type': 'application/json' },
       });
      } else if (model === "@cf/black-forest-labs/flux-1-schnell" && aiResponse && typeof aiResponse.image === 'string') {
       // Convert base64 to binary
       const binaryString = atob(aiResponse.image);
       const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
       const arrayBuffer = img.buffer;

       const imageKey = crypto.randomUUID();
       r2ObjectKey = await storeImageInR2(env, arrayBuffer, imageKey);

       return new Response(JSON.stringify({ r2ObjectKey }), {
        headers: { 'Content-Type': 'application/json' },
       });
      } else {
       console.error("Unexpected AI response format:", aiResponse);
       return new Response("Error generating image: Unexpected response format", { status: 500 });
      }
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
