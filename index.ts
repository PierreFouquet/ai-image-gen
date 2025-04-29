interface Env {
  AI: Ai;
  ASSETS: Fetcher;
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

    if (url.pathname === "/generate" && request.method === "POST") {
      try {
        const { prompt, model } = await request.json<{ prompt?: string; model?: string }>();
        const inputs = { prompt: prompt };

        try {
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
            console.log("Response (typeof):", typeof aiResponse); // Log the type

            if (aiResponse instanceof ReadableStream) {
              // Handle ReadableStream
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
          return new Response(`Error generating image: ${aiError}`, { status: 500 });
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
        return new Response("Internal Server Error", { status: 500 });
      }
    } else {
      return new Response("Internal Server Error: ASSETS binding missing", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
