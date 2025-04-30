import { ImageObject } from "./ImageObject.ts";

interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  IMAGE_OBJECTS: DurableObjectNamespace;
  IMAGE_BUCKET: R2Bucket; //  R2 Bucket binding
}

async function storeImageInR2(env: Env, image: ArrayBuffer, key: string): Promise<string> {
  const r2ObjectKey = `images/${key}`; // Customize your R2 object key
  await env.IMAGE_BUCKET.put(key, image);
  return r2ObjectKey;
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
        const doId = env.IMAGE_OBJECTS.newUniqueId(); // Get a new unique ID for the Durable Object
        const doStub = env.IMAGE_OBJECTS.get(doId); // Get the Durable Object stub

        // Send the image data to the Durable Object for storage
        await doStub.fetch(new Request("http://image-object/upload", { method: "PUT", body: arrayBuffer }));

        return new Response(JSON.stringify({ durableObjectId: doId.toString() }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error handling image upload:", error);
        return new Response("Error uploading image", { status: 500 });
      }
    }

    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const { prompt, model, durableObjectId } = await request.json<{
          prompt?: string;
          model?: string;
          durableObjectId?: string;
        }>();

        if (!prompt) {
          return new Response("Missing 'prompt' in request body", { status: 400 });
        }
        if (!model) {
          return new Response("Missing 'model' in request body", { status: 400 });
        }
        if (!durableObjectId) {
          return new Response("Missing 'durableObjectId' in request body", { status: 400 });
        }

        const doId = env.IMAGE_OBJECTS.idFromString(durableObjectId);
        const doStub = env.IMAGE_OBJECTS.get(doId);

        // Generate the image using the Durable Object
        const generateResponse = await doStub.fetch(new Request("http://image-object/generate", {
          method: "POST",
          body: JSON.stringify({ prompt, model }),
        }));

        if (!generateResponse.ok) {
          return new Response(`Error from Durable Object: ${await generateResponse.text()}`, {
            status: generateResponse.status,
          });
        }

        const { r2ObjectKey } = await generateResponse.json<{ r2ObjectKey: string }>();

        return new Response(JSON.stringify({ r2ObjectKey }), {
          headers: { "Content-Type": "application/json" },
        });

      } catch (e) {
        console.error("Error during /generate handling:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(`Error generating image: ${errorMessage}`, { status: 500 });
      }
    }

    if (url.pathname === "/get-image" && request.method === "GET") {
      try {
        const { durableObjectId, imageType } = url.searchParams.get("durableObjectId") as string;

        if (!durableObjectId) {
          return new Response("Missing 'durableObjectId' in query", { status: 400 });
        }
        if (!imageType || (imageType !== "original" && imageType !== "generated")) {
          return new Response("Invalid or missing 'imageType' in query (must be 'original' or 'generated')", { status: 400 });
        }

        const doId = env.IMAGE_OBJECTS.idFromString(durableObjectId);
        const doStub = env.IMAGE_OBJECTS.get(doId);

        let imageResponse: Response;
        if (imageType === "original") {
          imageResponse = await doStub.fetch(new Request("http://image-object/get-original", { method: "GET" }));
        } else {
          imageResponse = await doStub.fetch(new Request("http://image-object/get-generated", { method: "GET" }));
        }

        if (!imageResponse.ok) {
          return new Response(`Error retrieving ${imageType} image: ${await imageResponse.text()}`, {
            status: imageResponse.status,
          });
        }

        return new Response(imageResponse.body, { headers: { "Content-Type": "image/png" } }); // Or appropriate type

      } catch (e) {
        console.error("Error during /get-image handling:", e);
        return new Response("Error retrieving image", { status: 500 });
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

export { ImageObject };
