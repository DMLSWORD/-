/**
 * 图片压缩工具主要功能实现
 */

// 压缩配置选项
const compressionOptions = {
    maxSizeMB: 1,
    useWebWorker: true,
    quality: 0.8,
    maxWidthOrHeight: 2048 // 添加最大尺寸限制
};

// 存储压缩后的图片数据
let compressedImages = [];

// 存储当前处理的图片数据
let currentImages = []; // 存储所有待处理的图片信息

// 创建防抖函数
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 创建节流函数
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 初始化事件监听
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const qualitySlider = document.getElementById('quality');
    const qualityValue = document.getElementById('qualityValue');
    const downloadButton = document.getElementById('downloadAll');
    const previewContainer = document.querySelector('.preview-container');
    const sliderContainer = document.querySelector('.slider-container');

    // 添加滑块进度条元素
    const sliderProgress = document.createElement('div');
    sliderProgress.className = 'slider-progress';
    sliderContainer.appendChild(sliderProgress);

    // 更新滑块进度条
    function updateSliderProgress(value) {
        sliderProgress.style.width = `${value}%`;
    }

    // 更新质量显示值
    function updateQualityValue(value) {
        qualityValue.textContent = `${value}%`;
    }

    // 初始化滑块进度
    updateSliderProgress(qualitySlider.value);

    // 使用节流处理滑块值更新
    const throttledRecompress = throttle(async () => {
        await recompressAllImages();
    }, 300);

    // 质量滑块事件
    qualitySlider.addEventListener('input', (e) => {
        const value = e.target.value;
        const quality = value / 100;
        updateQualityValue(value);
        updateSliderProgress(value);
        compressionOptions.quality = quality;
        throttledRecompress();
    });

    // 点击上传区域触发文件选择
    dropZone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.addEventListener('change', (e) => {
            handleFiles(e);
            input.remove();
        });
        
        document.body.appendChild(input);
        input.click();
    });

    // 拖放事件
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles({ target: { files: e.dataTransfer.files } });
    });

    // 下载按钮事件
    downloadButton.addEventListener('click', downloadAllImages);
});

/**
 * 重新压缩所有图片
 */
const recompressAllImages = throttle(async () => {
    const compressPromises = currentImages.map(async (imageData) => {
        try {
            const compressedFile = await compressImage(imageData.originalFile);
            updateImageCard(imageData.card, imageData.originalFile, compressedFile);
            
            // 更新压缩后的图片数组
            const index = compressedImages.findIndex(img => 
                img.name.startsWith(imageData.originalFile.name.split('.')[0]));
            if (index !== -1) {
                compressedImages[index] = compressedFile;
            }
        } catch (error) {
            console.error('重新压缩失败:', error);
        }
    });

    await Promise.all(compressPromises);
}, 300);

/**
 * 处理选择的文件
 * @param {Event} event - 文件选择事件
 */
async function handleFiles(event) {
    const files = Array.from(event.target.files).filter(file => 
        file.type.startsWith('image/'));
    
    if (files.length === 0) return;

    const previewContainer = document.querySelector('.preview-container');
    const downloadButton = document.getElementById('downloadAll');
    
    // 清空之前的预览
    previewContainer.innerHTML = '';
    compressedImages = [];
    currentImages = []; // 清空当前图片数组
    
    for (const file of files) {
        try {
            const imageCard = createImageCard(file);
            previewContainer.appendChild(imageCard);
            
            // 存储图片信息
            currentImages.push({
                originalFile: file,
                card: imageCard
            });
            
            const compressedFile = await compressImage(file);
            updateImageCard(imageCard, file, compressedFile);
            compressedImages.push(compressedFile);
        } catch (error) {
            console.error('压缩失败:', error);
        }
    }
    
    downloadButton.disabled = false;
}

/**
 * 创建图片预览卡片
 * @param {File} file - 原始图片文件
 * @returns {HTMLElement} 图片卡片元素
 */
function createImageCard(file) {
    const card = document.createElement('div');
    card.className = 'image-card';
    
    // 创建原始图片URL
    const originalUrl = URL.createObjectURL(file);
    
    card.innerHTML = `
        <h3 class="image-title">${file.name}</h3>
        <div class="image-comparison">
            <div class="image-preview">
                <h4>压缩前</h4>
                <img src="${originalUrl}" alt="原始图片" class="original-image">
            </div>
            <div class="image-preview">
                <h4>压缩后</h4>
                <img src="" alt="压缩后图片" class="compressed-image">
                <div class="compression-loading">压缩中...</div>
            </div>
        </div>
        <div class="image-info">
            <p>原始大小: ${formatFileSize(file.size)}</p>
            <p class="compressed-size">压缩后大小: 处理中...</p>
            <p class="compression-ratio">压缩比例: 计算中...</p>
        </div>
    `;
    
    // 清理URL对象
    card.addEventListener('remove', () => {
        URL.revokeObjectURL(originalUrl);
    });
    
    return card;
}

/**
 * 压缩图片
 * @param {File} file - 要压缩的图片文件
 * @returns {Promise<File>} 压缩后的图片文件
 */
async function compressImage(file) {
    const options = {
        ...compressionOptions,
        maxSizeMB: Math.max(0.1, file.size / (1024 * 1024) * 0.8),
        initialQuality: compressionOptions.quality,
        maxWidthOrHeight: 2048, // 限制最大尺寸
        alwaysKeepResolution: false // 允许调整分辨率以获得更好的压缩效果
    };
    
    // 添加加载状态
    const cards = document.querySelectorAll('.image-card');
    cards.forEach(card => {
        if (card.querySelector('.original-image').src.includes(file.name)) {
            const loading = card.querySelector('.compression-loading');
            if (loading) loading.style.display = 'block';
            const compressedImage = card.querySelector('.compressed-image');
            if (compressedImage) compressedImage.style.display = 'none';
        }
    });

    try {
        const compressedFile = await imageCompression(file, options);
        // 如果压缩效果不明显，尝试进一步压缩
        if (compressedFile.size > file.size * 0.8) {
            options.maxSizeMB = file.size / (1024 * 1024) * 0.5; // 进一步降低目标大小
            return await imageCompression(file, options);
        }
        return compressedFile;
    } catch (error) {
        console.error('压缩失败:', error);
        return file;
    }
}

/**
 * 更新图片卡片信息
 * @param {HTMLElement} card - 图片卡片元素
 * @param {File} originalFile - 原始文件
 * @param {File} compressedFile - 压缩后的文件
 */
function updateImageCard(card, originalFile, compressedFile) {
    // 更新压缩后的图片预览
    const compressedImage = card.querySelector('.compressed-image');
    const compressionLoading = card.querySelector('.compression-loading');
    const compressedUrl = URL.createObjectURL(compressedFile);
    
    compressedImage.src = compressedUrl;
    compressedImage.style.display = 'block';
    compressionLoading.style.display = 'none';
    
    // 更新压缩信息
    const compressedSize = card.querySelector('.compressed-size');
    const compressionRatio = card.querySelector('.compression-ratio');
    const ratio = ((1 - compressedFile.size / originalFile.size) * 100).toFixed(1);
    
    compressedSize.textContent = `压缩后大小: ${formatFileSize(compressedFile.size)}`;
    compressionRatio.textContent = `压缩比例: ${ratio}%`;
    
    // 清理URL对象
    card.addEventListener('remove', () => {
        URL.revokeObjectURL(compressedUrl);
    });
}

/**
 * 格式化文件大小
 * @param {number} bytes - 文件字节大小
 * @returns {string} 格式化后的大小字符串
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 下载所有压缩后的图片
 */
function downloadAllImages() {
    compressedImages.forEach((file, index) => {
        const originalName = currentImages[index].originalFile.name;
        const extension = originalName.split('.').pop();
        const baseName = originalName.slice(0, -(extension.length + 1));
        const newName = `${baseName}_压缩后.${extension}`;
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = newName;
        link.click();
        URL.revokeObjectURL(link.href);
    });
} 