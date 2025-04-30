// script.js

const uploadSection = document.getElementById('upload-section');
const baseImageUpload = document.getElementById('base-image-upload');
const uploadInput = document.getElementById('upload-image');
const maskImageUpload = document.getElementById('mask-image-upload');
const uploadMaskInput = document.getElementById('upload-mask');
const uploadBtn = document.getElementById('upload-btn');
const uploadLoading = document.getElementById('upload-loading');
const uploadedImageDisplay = document.getElementById('uploaded-image-display');
const uploadedImg = document.getElementById('uploaded-img');
const uploadedKeyDisplay = document.getElementById('uploaded-key');
const keyValueSpan = document.getElementById('key-value');
const uploadedMaskImg = document.getElementById('uploaded-mask-img');
const uploadedMaskKeyDisplay = document.getElementById('uploaded-mask-key');
const maskKeyValueSpan = document.getElementById('mask-key-value');

const generateBtn = document.getElementById('generate-btn');
const promptInput = document.getElementById('prompt');
const modelSelect = document.getElementById('model');
const imageDisplay = document.getElementById('image-display');
const generatedImage = document.getElementById('generated-image');
const loadingIndicator = document.getElementById('loading');
const previousImagesContainer = document.getElementById('previous-images');

let currentImageKey = null;
let currentMaskKey = null;

uploadLoading.style.display = 'none';
uploadedImageDisplay.style.display = 'none';

function updateUploadVisibility() {
    const selectedModel = modelSelect.value;
    if (selectedModel === "@cf/runwayml/stable-diffusion-v1-5-img2img") {
        uploadSection.style.display = 'block';
        baseImageUpload.style.display = 'block';
        maskImageUpload.style.display = 'none';
        resetMask();
    } else if (selectedModel === "@cf/runwayml/stable-diffusion-v1-5-inpainting") {
        uploadSection.style.display = 'block';
        baseImageUpload.style.display = 'block';
        maskImageUpload.style.display = 'block';
    } else {
        uploadSection.style.display = 'none';
        resetUpload();
        resetMask();
    }
}

function resetUpload() {
    uploadedImg.src = '#';
    uploadedImg.style.display = 'none';
    uploadedKeyDisplay.style.display = 'none';
    currentImageKey = null;
    keyValueSpan.textContent = '';
    uploadInput.value = '';
}

function resetMask() {
    uploadedMaskImg.src = '#';
    uploadedMaskImg.style.display = 'none';
    uploadedMaskKeyDisplay.style.display = 'none';
    currentMaskKey = null;
    maskKeyValueSpan.textContent = '';
    uploadMaskInput.value = '';
}

modelSelect.addEventListener('change', updateUploadVisibility);
updateUploadVisibility();

// Handle image uploads for Img2Img and Inpainting
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
generateBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value;

    if (!prompt) {
        alert('Please enter a prompt.');
        return;
    }

    generatedImage.style.display = 'none'; // Hide previously generated image
    loadingIndicator.style.display = 'block'; // Show loading text

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
                loadingIndicator.style.display = 'none'; // Hide loading text

                // Add the newly generated image to the previous images section
                const img = document.createElement('img');
                img.src = data.imageUrl + '?width=100&height=auto';  // Add sizing parameters
                img.alt = 'Previous Generated Image';
                previousImagesContainer.appendChild(img);

                console.log('Thumbnail added:', img.src); // Debugging

                // loadPreviousImages();  // Refresh thumbnails - REMOVE THIS LINE
            };
        }
    } catch (err) {
        console.error('Error generating image:', err);
        alert('Error generating image. Please try again.');
        loadingIndicator.style.display = 'none';
    }
});

// Fetch and display previous images
async function loadPreviousImages() {
    try {
        const response = await fetch('/session-images');
        if (!response.ok) throw new Error('Failed to load previous images');

        const data = await response.json();
        previousImagesContainer.innerHTML = '<h2>Previous Images (Current Session)</h2>';  // Ensure header is present

        if (data.keys && data.keys.length > 0) {
            data.keys.forEach(key => {
                const img = document.createElement('img');
                img.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${key}?width=100&height=auto`;
                img.alt = 'Previous Generated Image';
                previousImagesContainer.appendChild(img);
            });
        } else {
            previousImagesContainer.innerHTML = '<p>No previous images available.</p>';
        }

        console.log('Previous images loaded.'); // Debugging
    } catch (err) {
        console.error('Failed to fetch previous images:', err);
        previousImagesContainer.innerHTML = '<p>Error loading previous images.</p>';
    }
}

// Load previous images when the page loads
window.addEventListener('load', () => {
    previousImagesContainer.innerHTML = '<h2>Previous Images (Current Session)</h2>'; // Initial header
    loadPreviousImages();
});
