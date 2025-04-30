// imageObject.ts
import { Ai } from '@cloudflare/ai'; // Import Ai type if you have a separate types file

interface Env {
  AI: Ai;
  IMAGE_BUCKET: R2Bucket;
}

export class ImageObject {
  private imageData: ArrayBuffer | null = null;
  private generatedImageKey: string | null = null; // Key in R2 for the *generated* image
  private originalImageKey: string | null = null; // Key in R2 for the *uploaded* image (if applicable)
  private expirationTimer: number | null = null;
  private isProcessing: boolean = false;

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/upload":
        return this.handleUpload(request);
      case "/generate":
        return this.handleGenerate(request);
      case "/get-original":
        return this.handleGetOriginal();
      case "/get-generated":
        return this.handleGetGenerated();
      case "/delete":
        return this.handleDelete();
      default:
        return new Response("Invalid request", { status: 400 });
    }
  }

  private async handleUpload(request: Request): Promise<Response> {
    if (request.method !== "PUT") {
      return new Response("Method not allowed", { status: 405 });
    }

    this.imageData = await request.arrayBuffer();

    if (this.imageData) {
      this.originalImageKey = `original/${this.state.id.toString()}`; // Store original in R2
      await this.storeImageInR2(this.imageData, this.originalImageKey);
      return new Response("Image uploaded to Durable Object", { status: 200 });
    } else {
      return new Response("No image data provided", { status: 400 });
    }
  }

  private async handleGenerate(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (this.isProcessing) {
      return new Response("Image generation already in progress", { status: 409 }); // Conflict
    }

    this.isProcessing = true;

    try {
      const { prompt, model } = await request.json<{ prompt: string; model: string }>();

      if (!prompt || !model) {
        return new Response("Missing prompt or model", { status: 400 });
      }

      let aiInput: any = { prompt };
      if (this.imageData) {
        aiInput.image = this.imageData;
      }

      const aiResponse = await this.env.AI.run(model, aiInput);

      if (aiResponse instanceof ArrayBuffer) {
        this.generatedImageKey = `generated/${this.state.id.toString()}`;
        await this.storeImageInR2(aiResponse, this.generatedImageKey);

        // Schedule deletion of the Durable Object after a delay
        this.scheduleDeletion(60 * 1000); // Example: 60 seconds (adjust as needed)

        return new Response(JSON.stringify({ r2ObjectKey: this.generatedImageKey }), {
          headers: { "Content-Type": "application/json" },
        });
      } else if (typeof aiResponse === 'object' && 'image' in aiResponse && typeof aiResponse.image === 'string') {
          // Handle base64 encoded image (Flux 1 Schnell)
          const binaryString = atob(aiResponse.image);
          const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
          const arrayBuffer = img.buffer;

          this.generatedImageKey = `generated/${this.state.id.toString()}`;
          await this.storeImageInR2(arrayBuffer, this.generatedImageKey);

          // Schedule deletion of the Durable Object after a delay
          this.scheduleDeletion(60 * 1000); // Example: 60 seconds (adjust as needed)

          return new Response(JSON.stringify({ r2ObjectKey: this.generatedImageKey }), {
              headers: { "Content-Type": "application/json" },
          });

      } else {
        return new Response("Unexpected AI response format", { status: 500 });
      }
    } catch (error) {
      console.error("Error during AI generation:", error);
      return new Response("Error generating image", { status: 500 });
    } finally {
      this.isProcessing = false;
    }
  }

  private handleGetOriginal(): Response {
    if (this.imageData) {
      return new Response(this.imageData, { headers: { "Content-Type": "image/png" } }); // Or appropriate type
    } else {
      return new Response("Original image not found", { status: 404 });
    }
  }

  private async handleGetGenerated(): Promise<Response> {
    if (this.generatedImageKey) {
      const object = await this.env.IMAGE_BUCKET.get(this.generatedImageKey);
      if (object) {
        const arrayBuffer = await object.arrayBuffer();
        return new Response(arrayBuffer, { headers: { "Content-Type": "image/png" } }); // Or appropriate type
      } else {
        return new Response("Generated image not found in R2", { status: 404 });
      }
    } else {
      return new Response("Generated image not available yet", { status: 404 });
    }
  }

  private async handleDelete(): Promise<Response> {
    if (this.originalImageKey) {
      await this.env.IMAGE_BUCKET.delete(this.originalImageKey);
    }
    if (this.generatedImageKey) {
      await this.env.IMAGE_BUCKET.delete(this.generatedImageKey);
    }
    await this.state.storage.deleteAll(); // Clean up Durable Object storage
    return new Response("Durable Object and associated data deleted", { status: 200 });
  }

  private async storeImageInR2(image: ArrayBuffer, key: string): Promise<void> {
    await this.env.IMAGE_BUCKET.put(key, image);
  }

  private scheduleDeletion(milliseconds: number) {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
    }
    this.expirationTimer = setTimeout(async () => {
      await this.handleDelete(); // Delete data
    }, milliseconds);
  }
}