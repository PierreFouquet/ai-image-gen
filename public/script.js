// Handle image uploads for Img2Img and Inpainting
const uploadBtn = document.getElementById('upload-btn');
const uploadInput = document.getElementById('upload-image');
const uploadMaskInput = document.getElementById('upload-mask');
const uploadLoading = document.getElementById('upload-loading');
const uploadedImg = document.getElementById('uploaded-img');
const uploadedKeyDisplay = document.getElementById('uploaded-key');
const uploadedMaskImg = document.getElementById('uploaded-mask-img');
const uploadedMaskKeyDisplay = document.getElementById('uploaded-mask-key');

// Handle the "Upload" button click
uploadBtn.addEventListener('click', async () => {
    const imageFile = uploadInput.files[0];
    const maskFile = uploadMaskInput.files[0];

    if (!imageFile) {
        alert('Please select a base image.');
        return;
    }

    if (maskFile && !maskFile.type.startsWith('image/')) {
        alert('Please select a valid mask image.');
        return;
    }

    uploadLoading.style.display = 'block'; // Show loading spinner

    const formData = new FormData();
    formData.append('image', imageFile);
    if (maskFile) formData.append('mask', maskFile);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        // Handle successful upload response
        if (data.baseImageKey) {
            uploadedImg.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${data.baseImageKey}`;
            uploadedImg.style.display = 'block';
            uploadedKeyDisplay.style.display = 'block';
            document.getElementById('key-value').textContent = data.baseImageKey;
        }

        if (data.maskImageKey) {
            uploadedMaskImg.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${data.maskImageKey}`;
            uploadedMaskImg.style.display = 'block';
            uploadedMaskKeyDisplay.style.display = 'block';
            document.getElementById('mask-key-value').textContent = data.maskImageKey;
        }

        uploadLoading.style.display = 'none'; // Hide loading spinner
    } catch (err) {
        console.error('Error uploading images:', err);
        alert('Error uploading images. Please try again.');
        uploadLoading.style.display = 'none';
    }
});

// Generate new image using the prompt and selected model
const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt');
const modelSelect = document.getElementById('model');
const generatedImage = document.getElementById('generated-image');
const loadingText = document.getElementById('loading');

// Handle the "Generate Image" button click
generateBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value;

    if (!prompt) {
        alert('Please enter a prompt.');
        return;
    }

    generatedImage.style.display = 'none'; // Hide previously generated image
    loadingText.style.display = 'block'; // Show loading text

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model }),
        });

        const data = await response.json();

        if (data.imageUrl) {
            generatedImage.src = data.imageUrl;
            generatedImage.onload = () => {
                generatedImage.style.display = 'block';
                loadingText.style.display = 'none'; // Hide loading text
            };
        }
    } catch (err) {
        console.error('Error generating image:', err);
        alert('Error generating image. Please try again.');
        loadingText.style.display = 'none';
    }
});

// Fetch and display previous images
async function loadPreviousImages() {
    try {
        const response = await fetch('/session-images');
        if (!response.ok) throw new Error('Failed to load previous images');

        const data = await response.json();
        const previousImagesContainer = document.getElementById('previous-images');
        previousImagesContainer.innerHTML = ''; // Clear previous images

        if (data.keys && data.keys.length > 0) {
            previousImagesContainer.innerHTML = '<h2>Previous Images (Current Session)</h2>';
            data.keys.forEach(key => {
                const img = document.createElement('img');
                img.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${key}?width=100&height=auto`;
                img.alt = 'Previous Generated Image';
                previousImagesContainer.appendChild(img);
            });
        } else {
            previousImagesContainer.innerHTML = '<p>No previous images available.</p>';
        }
    } catch (err) {
        console.error('Failed to fetch previous images:', err);
        document.getElementById('previous-images').innerHTML = '<p>Error loading previous images.</p>';
    }
}

// Load previous images when the page loads
window.addEventListener('load', loadPreviousImages);
