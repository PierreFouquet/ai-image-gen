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
const errorMessage = document.getElementById('error-message');

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

    uploadLoading.style.display = 'block';

    const formData = new FormData();
    formData.append('image', imageFile);
    if (maskFile) formData.append('mask', maskFile);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

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

        uploadLoading.style.display = 'none';
    } catch (err) {
        console.error('Error uploading images:', err);
        alert('Error uploading images. Please try again.');
        uploadLoading.style.display = 'none';
    }
});

// Function to load the image and return a Promise
function loadImage(imageUrl) {
    return new Promise((resolve, reject) => {
        generatedImage.onload = () => resolve(generatedImage);
        generatedImage.onerror = reject;
        generatedImage.src = imageUrl;
    });
}

// Generate new image using the prompt and selected model
generateBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    const model = modelSelect.value;

    if (!prompt) {
        alert('Please enter a prompt.');
        return;
    }

    // Reset UI
    generatedImage.style.display = 'none';
    loadingIndicator.style.display = 'block';
    errorMessage.style.display = 'none';

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt, model }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        if (data.imageUrl) {
            await loadImage(data.imageUrl); // Wait for the image to load
            generatedImage.style.display = 'block';
            loadingIndicator.style.display = 'none';

            // Add to previous images
            const img = document.createElement('img');
            img.src = data.imageUrl + '?width=100&height=auto';
            img.alt = 'Previous Generated Image';
            img.classList.add('previous-image');
            previousImagesContainer.appendChild(img);
        } else if (data.error) {
            throw new Error(data.error);
        } else {
            throw new Error('Failed to generate image: Unknown error');
        }
    } catch (error) {
        console.error('Error generating image:', error);
        errorMessage.textContent = `Error: ${error.message || 'An unexpected error occurred.'}`;
        errorMessage.style.display = 'block';
        loadingIndicator.style.display = 'none';
    }
});

const modal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const closeBtn = document.querySelector('.close');
const downloadLink = document.getElementById('download-link');

async function loadPreviousImages() {
    const previousImagesContainer = document.getElementById('previous-images');
    previousImagesContainer.innerHTML = '<h2>Previous Images (Current Session)</h2>'; // Reset the container

    try {
        const response = await fetch('/session-images');
        if (!response.ok) throw new Error('Failed to load previous images');

        const data = await response.json();

        if (data.keys && data.keys.length > 0) {
            data.keys.forEach(key => {
                const img = document.createElement('img');
                img.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${key}?width=100&height=auto`;
                img.alt = 'Previous Generated Image';
                img.classList.add('previous-image');
                previousImagesContainer.appendChild(img);
            });
        } else {
            const noImagesMessage = document.createElement('p');
            noImagesMessage.textContent = 'No previous images available.';
            previousImagesContainer.appendChild(noImagesMessage);
        }
    } catch (err) {
        console.error('Failed to fetch previous images:', err);
        const errorMessage = document.createElement('p');
        errorMessage.textContent = 'Error loading previous images.';
        previousImagesContainer.appendChild(errorMessage);
    }
}

// Add event listener to previous images container
previousImagesContainer.addEventListener('click', (event) => {
    if (event.target.tagName === 'IMG' && event.target.classList.contains('previous-image')) {
        modal.style.display = 'block';
        modalImage.src = event.target.src.split('?')[0];
        downloadLink.href = event.target.src.split('?')[0];
        downloadLink.download = 'generated_image.png';
    }
});

// Close the modal
closeBtn.onclick = function() {
    modal.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Load previous images when the page loads
window.addEventListener('load', loadPreviousImages);

// Force browser to display select options correctly
window.addEventListener('load', () => {
    const temp = modelSelect.innerHTML;
    modelSelect.innerHTML = temp;
});
