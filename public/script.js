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
    }
}

function resetUpload() {
    currentImageKey = null;
    uploadedImg.src = uploadedImg.dataset.empty || uploadedImg.src;
    uploadedImg.style.display = 'none';
    uploadedKeyDisplay.style.display = 'none';
    keyValueSpan.textContent = '';
    uploadInput.value = '';
    resetMask();
}

function resetMask() {
    currentMaskKey = null;
    uploadedMaskImg.src = uploadedMaskImg.dataset.empty || uploadedMaskImg.src;
    uploadedMaskImg.style.display = 'none';
    uploadedMaskKeyDisplay.style.display = 'none';
    maskKeyValueSpan.textContent = '';
    uploadMaskInput.value = '';
}

modelSelect.addEventListener('change', updateUploadVisibility);
updateUploadVisibility();

uploadBtn.addEventListener('click', async () => {
    const imageFile = uploadInput.files[0];
    const maskFile = uploadMaskInput.files[0];

    if (!imageFile && ["@cf/runwayml/stable-diffusion-v1-5-img2img", "@cf/runwayml/stable-diffusion-v1-5-inpainting"].includes(modelSelect.value)) {
        alert('Please select a base image.');
        return;
    }
    if (modelSelect.value === "@cf/runwayml/stable-diffusion-v1-5-inpainting" && !maskFile) {
        alert('Please select a mask image for inpainting.');
        return;
    }

    uploadLoading.style.display = 'block';
    uploadedImageDisplay.style.display = 'none';
    resetUpload();

    const formData = new FormData();
    if (imageFile) formData.append('image', imageFile);
    if (maskFile) formData.append('mask', maskFile);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        if (data.imageKey) {
            currentImageKey = data.imageKey;
            keyValueSpan.textContent = currentImageKey;
            uploadedImg.src = URL.createObjectURL(imageFile);
            uploadedImg.style.display = 'block';
            uploadedKeyDisplay.style.display = 'block';
        }
        if (data.maskKey) {
            currentMaskKey = data.maskKey;
            maskKeyValueSpan.textContent = currentMaskKey;
            uploadedMaskImg.src = URL.createObjectURL(maskFile);
            uploadedMaskImg.style.display = 'block';
            uploadedMaskKeyDisplay.style.display = 'block';
        }
        uploadedImageDisplay.style.display = 'block';

    } catch (error) {
        console.error('Upload error:', error);
        alert(`Error uploading: ${error.message}`);
    } finally {
        uploadLoading.style.display = 'none';
    }
});

generateBtn.addEventListener('click', async () => {
    const prompt = promptInput.value;
    const model = modelSelect.value;

    if (["@cf/runwayml/stable-diffusion-v1-5-img2img", "@cf/runwayml/stable-diffusion-v1-5-inpainting"].includes(model) && !currentImageKey) {
        alert('Please upload a base image.');
        return;
    }
    if (model === "@cf/runwayml/stable-diffusion-v1-5-inpainting" && !currentMaskKey) {
        alert('Please upload a mask image.');
        return;
    }

    loadingIndicator.style.display = 'block';
    generatedImage.style.display = 'none';
    generatedImage.src = '';
    imageDisplay.style.backgroundColor = '#e9e9e9';

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, imageKey: currentImageKey, maskKey: currentMaskKey })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        generatedImage.src = data.imageUrl;
        generatedImage.style.display = 'block';
        imageDisplay.style.backgroundColor = 'transparent';
        loadPreviousImages();

    } catch (error) {
        console.error('Generate error:', error);
        imageDisplay.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
        imageDisplay.style.backgroundColor = '#ffe9e9';
    } finally {
        loadingIndicator.style.display = 'none';
    }
});

async function loadPreviousImages() {
    previousImagesContainer.innerHTML = '<h2>Previous Images (Current Session)</h2>';
    try {
        const response = await fetch('/session-images');
        if (!response.ok) throw new Error('Failed to load previous images');

        const data = await response.json();
        (data.keys || []).forEach(key => {
            const img = document.createElement('img');
            img.src = `https://pub-8fa64dd4c5d8443db9d65e5e84df9c35.r2.dev/${key}?width=100&height=auto`;
            img.alt = 'Previous Generated Image';
            previousImagesContainer.appendChild(img);
        });
    } catch (err) {
        console.error('Failed to fetch previous images:', err);
    }
}

window.addEventListener('load', loadPreviousImages);