document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reportForm');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('file');
  const previewContainer = document.getElementById('previewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const removeImageBtn = document.getElementById('removeImage');
  const getLocationBtn = document.getElementById('getLocationBtn');
  const locationStatus = document.getElementById('locationStatus');
  const latInput = document.getElementById('lat');
  const lngInput = document.getElementById('lng');
  const submitBtn = document.getElementById('submitBtn');
  const resultSection = document.getElementById('resultSection');
  const newReportBtn = document.getElementById('newReportBtn');
  const observedAtInput = document.getElementById('observed_at');

  // Set default observed_at to now
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  observedAtInput.value = now.toISOString().slice(0, 16);

  // Drag and drop handling
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  dropZone.addEventListener('click', (e) => {
    if (e.target !== removeImageBtn && !previewContainer.contains(e.target)) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF, WebP, or HEIC.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      previewContainer.style.display = 'block';
      dropZone.querySelector('.drop-zone-content').style.display = 'none';
    };
    reader.readAsDataURL(file);

    // Update file input
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
  }

  removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    previewContainer.style.display = 'none';
    dropZone.querySelector('.drop-zone-content').style.display = 'flex';
  });

  // Geolocation
  getLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      locationStatus.textContent = 'Geolocation is not supported by your browser.';
      return;
    }

    locationStatus.textContent = 'Getting location...';
    getLocationBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        latInput.value = position.coords.latitude.toFixed(6);
        lngInput.value = position.coords.longitude.toFixed(6);
        locationStatus.textContent = 'Location captured!';
        getLocationBtn.disabled = false;
      },
      (error) => {
        let message = 'Unable to get location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location unavailable.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out.';
            break;
        }
        locationStatus.textContent = message;
        getLocationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    submitBtn.disabled = true;

    const formData = new FormData();
    formData.append('text', document.getElementById('text').value);
    formData.append('place_text', document.getElementById('place_text').value);
    formData.append('observed_at', new Date(observedAtInput.value).toISOString());

    const placeArea = document.getElementById('place_area').value;
    if (placeArea) formData.append('place_area', placeArea);

    if (latInput.value) formData.append('lat', latInput.value);
    if (lngInput.value) formData.append('lng', lngInput.value);

    if (fileInput.files.length > 0) {
      formData.append('file', fileInput.files[0]);
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      displayResult(data);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      submitBtn.disabled = false;
    }
  });

  function displayResult(data) {
    form.parentElement.style.display = 'none';
    resultSection.style.display = 'block';

    document.getElementById('resultDomain').textContent = data.ai.domain;
    document.getElementById('resultDomain').className = `badge badge-${data.ai.domain}`;

    document.getElementById('resultSeverity').textContent = data.ai.severity;
    document.getElementById('resultSeverity').className = `badge badge-severity-${data.ai.severity}`;

    document.getElementById('resultCaption').textContent = data.ai.caption;

    const issuesDiv = document.getElementById('resultIssues');
    if (data.ai.issue_types && data.ai.issue_types.length > 0) {
      issuesDiv.innerHTML = `<p><strong>Detected Issues:</strong> ${data.ai.issue_types.join(', ')}</p>`;
    }

    const recsDiv = document.getElementById('resultRecommendations');
    if (data.ai.recommended_actions && data.ai.recommended_actions.length > 0) {
      recsDiv.innerHTML = `
        <h4>Recommended Actions</h4>
        <ul>
          ${data.ai.recommended_actions.map(r => `
            <li>
              <span class="priority-badge priority-${r.priority}">${r.priority}</span>
              ${r.title}
            </li>
          `).join('')}
        </ul>
      `;
    }

    const shareUrl = window.location.origin + data.viewUrl;
    document.getElementById('shareUrl').value = shareUrl;
  }

  document.getElementById('copyBtn').addEventListener('click', () => {
    const shareUrl = document.getElementById('shareUrl');
    shareUrl.select();
    navigator.clipboard.writeText(shareUrl.value).then(() => {
      document.getElementById('copyBtn').textContent = 'Copied!';
      setTimeout(() => {
        document.getElementById('copyBtn').textContent = 'Copy';
      }, 2000);
    });
  });

  newReportBtn.addEventListener('click', () => {
    form.reset();
    fileInput.value = '';
    previewContainer.style.display = 'none';
    dropZone.querySelector('.drop-zone-content').style.display = 'flex';
    latInput.value = '';
    lngInput.value = '';
    locationStatus.textContent = '';
    
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    observedAtInput.value = now.toISOString().slice(0, 16);

    resultSection.style.display = 'none';
    form.parentElement.style.display = 'block';
  });
});
