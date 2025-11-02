class RecordEventHandler {
    constructor() {
        this.currentUser = null;
        this.currentRole = null;
         this.API_URL = 'http://localhost:5000'; 
        this.init();
    }

    async init() {
        await this.loadUserInfo();
        this.attachEventListeners();
    }

    // Load thông tin user từ session/localStorage
    async loadUserInfo() {
        try {
            // Giả lập - trong thực tế lấy từ auth system
            this.currentUser = {
                id: 1,
                username: 'farmer_john',
                role: 'farmer'
            };

            document.getElementById('currentUser').textContent = this.currentUser.username;
            document.getElementById('currentRole').textContent = this.currentUser.role;

        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    attachEventListeners() {
        // Submit form
        document.getElementById('recordEventForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRecordEvent();
        });

        // Tìm kiếm lịch sử
        document.getElementById('searchHistoryBtn').addEventListener('click', () => {
            this.loadProductHistory();
        });

        // Enter để tìm kiếm lịch sử
        document.getElementById('searchProductId').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadProductHistory();
            }
        });
    }

    async handleRecordEvent() {
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;

    try {
        // 🔥 XỬ LÝ UPLOAD ẢNH TRƯỚC
        let imageData = await this.handleImageUpload();
        
        // Lấy dữ liệu từ form
        const formData = {
            productId: document.getElementById('productId').value.trim(),
            eventType: document.getElementById('eventType').value,
            description: document.getElementById('description').value.trim(),
            userId: this.currentUser.id,
            username: this.currentUser.username,
            role: this.currentUser.role,
            location: 'Default Location', // Thêm location
            notes: document.getElementById('description').value.trim(),
            // 🔥 THÊM DỮ LIỆU ẢNH
            imageUrl: imageData?.imageUrl || null,
            thumbUrl: imageData?.thumbUrl || null,
            imageName: imageData?.imageName || null
        };

        // Validate
        if (!this.validateForm(formData)) {
            return;
        }

        // Hiển thị loading
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Đang ghi lên blockchain...';
        submitBtn.disabled = true;

        // Gọi API
        const response = await this.callRecordEventAPI(formData);

        // Hiển thị kết quả
        this.showSuccessResult(response, imageData);

        // Reset form
        document.getElementById('recordEventForm').reset();

    } catch (error) {
        console.error('Error recording event:', error);
        this.showError('Lỗi khi ghi sự kiện: ' + error.message);
    } finally {
        // Khôi phục button
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

    validateForm(formData) {
        if (!formData.productId) {
            this.showError('Vui lòng nhập mã sản phẩm');
            return false;
        }
        if (!formData.eventType) {
            this.showError('Vui lòng chọn loại sự kiện');
            return false;
        }
        if (!formData.description) {
            this.showError('Vui lòng nhập mô tả chi tiết');
            return false;
        }
        return true;
    }

    async handleImageUpload() {
    const fileInput = document.getElementById('imageUpload');
    const file = fileInput.files[0];
    
    if (!file) return null;

    try {
        console.log('🖼️ Đang upload ảnh...');
        
        const formData = new FormData();
        formData.append('image', file);

        // 🔥 UPLOAD THỰC TẾ
        const response = await fetch('http://localhost:5000/api/upload-image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Upload ảnh thành công:', result);
            return {
                imageUrl: result.imageUrl,
                thumbUrl: result.imageUrl, // Dùng chung URL
                imageName: result.filename || result.originalName
            };
        } else {
            throw new Error(result.message || 'Upload failed');
        }

    } catch (error) {
        console.error('❌ Lỗi upload ảnh:', error);
        // Không throw error để form vẫn submit được (không có ảnh)
        return null;
    }
}

    async generateImageHash(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                // Giả lập tạo hash (trong thực tế dùng crypto)
                const timestamp = new Date().getTime();
                const hash = btoa(file.name + timestamp).substring(0, 32);
                resolve(hash);
            };
            reader.readAsDataURL(file);
        });
    }

    async callRecordEventAPI(formData) {
        const response = await fetch('http://localhost:5000/api/record-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Network error');
        }

        return await response.json();
    }

    showSuccessResult(response, imageData) {
    const resultSection = document.getElementById('resultSection');
    const resultDetails = document.getElementById('resultDetails');
    
    // 🔥 THÊM HIỂN THỊ ẢNH NẾU CÓ
    let imageHtml = '';
    if (imageData && imageData.imageUrl) {
        imageHtml = `
            <div style="margin-top: 10px;">
                <strong>📸 Ảnh minh chứng:</strong><br>
                <img src="http://localhost:5000${imageData.imageUrl}" 
                    style="max-width: 200px; max-height: 200px; border-radius: 5px; margin-top: 5px; border: 1px solid #ddd;">
            </div>
        `;
    }
    
    resultDetails.innerHTML = `
        <p><strong>Mã sản phẩm:</strong> ${response.eventData.productId}</p>
        <p><strong>Sự kiện:</strong> ${response.eventData.eventType}</p>
        <p><strong>Mô tả:</strong> ${response.eventData.description}</p>
        <p><strong>Thời gian:</strong> ${new Date(response.eventData.timestamp).toLocaleString('vi-VN')}</p>
        <p><strong>Block Index:</strong> ${response.blockIndex}</p>
        <p><strong>Transaction Hash:</strong> <code>${response.transactionHash.substring(0, 20)}...</code></p>
        ${imageHtml}
    `;
    
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

    async loadProductHistory() {
        const productId = document.getElementById('searchProductId').value.trim();
        
        if (!productId) {
            this.showError('Vui lòng nhập mã sản phẩm để tìm kiếm');
            return;
        }

        try {
            const response = await fetch(`http://localhost:5000/api/product-events/${productId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch history');
            }

            this.displayHistoryResults(data);

        } catch (error) {
            console.error('Error loading history:', error);
            this.showError('Lỗi khi tải lịch sử: ' + error.message);
        }
    }

    async loadUserHistory() {
    const historyContent = document.getElementById('historyContent');
    historyContent.innerHTML = '<div class="loading">⏳ Đang tải lịch sử...</div>';

    try {
        const response = await fetch(`${API_URL}/api/user-events/${currentUser.username}`);
        const data = await response.json();

        console.log('📊 User events data:', data); // THÊM LOG NÀY

        if (response.ok && data.events && data.events.length > 0) {
            let html = '';
            
            for (let item of data.events) {
                const timestamp = new Date(item.timestamp).toLocaleString('vi-VN');
                console.log('🔍 Processing event:', item); // THÊM LOG NÀY
                
                // Gọi API để lấy QR code
                let qrCode = '';
                try {
                    console.log(`🔄 Fetching QR code for: ${item.productId}`); // THÊM LOG NÀY
                    const qrResponse = await fetch(`${API_URL}/api/qrcode/${item.productId}`);
                    console.log('📨 QR response status:', qrResponse.status); // THÊM LOG NÀY
                    
                    if (qrResponse.ok) {
                        const qrData = await qrResponse.json();
                        console.log('🎯 QR data:', qrData); // THÊM LOG NÀY
                        
                        if (qrData.success) {
                            qrCode = qrData.qrCode;
                            console.log('✅ QR code generated successfully'); // THÊM LOG NÀY
                        } else {
                            console.log('❌ QR API failed:', qrData.message); // THÊM LOG NÀY
                        }
                    }
                } catch (qrError) {
                    console.log('❌ QR fetch error:', qrError); // THÊM LOG NÀY
                }
                
                // Tạo QR section
                let qrSection = '';
                if (qrCode) {
                    qrSection = `
                        <div class="timeline-qr">
                            <img src="${qrCode}" 
                                 alt="QR Code" 
                                 onclick="enlargeQR('${qrCode}', '${item.productId}', ${item.blockIndex})"
                                 title="Click để phóng to QR code">
                            <p>📱 Quét QR</p>
                        </div>
                    `;
                    console.log('🖼️ QR section created'); // THÊM LOG NÀY
                } else {
                    console.log('❌ No QR code available'); // THÊM LOG NÀY
                }
                
                html += `
                    <div class="timeline-item">
                        <div class="timeline-content">
                            <div class="timeline-status">${item.status}</div>
                            <div class="timeline-info"><strong>🕒 Thời gian:</strong> ${timestamp}</div>
                            <div class="timeline-info"><strong>📦 Sản phẩm:</strong> ${item.productId}</div>
                            <div class="timeline-info"><strong>📍 Địa điểm:</strong> ${item.location}</div>
                            <div class="timeline-info"><strong>🔗 Block:</strong> #${item.blockIndex}</div>
                            ${item.notes ? `<div class="timeline-info"><strong>📝 Ghi chú:</strong> ${item.notes}</div>` : ''}
                        </div>
                        ${qrSection}
                    </div>
                `;
            }

            historyContent.innerHTML = html;
            console.log('🎉 History loaded with HTML:', html); // THÊM LOG NÀY
        } else {
            console.log('❌ No events found'); // THÊM LOG NÀY
            historyContent.innerHTML = '<div class="empty-message">ℹ️ Chưa có lịch sử cập nhật nào.</div>';
        }
    } catch (error) {
        console.error('❌ Load history error:', error); // THÊM LOG NÀY
        historyContent.innerHTML = `<div class="empty-message" style="color: #d32f2f;">❌ Lỗi tải lịch sử: ${error.message}</div>`;
    }
}

    displayHistoryResults(data) {
        const historyResults = document.getElementById('historyResults');
        
        if (!data.events || data.events.length === 0) {
            historyResults.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-info-circle me-2"></i>
                    Không tìm thấy sự kiện nào cho sản phẩm "${data.productId}"
                </div>
            `;
            return;
        }

        let html = `
            <h6>Lịch sử ${data.totalEvents} sự kiện cho sản phẩm: <strong>${data.productId}</strong></h6>
            <div class="table-responsive mt-3">
                <table class="table table-striped table-sm">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Sự kiện</th>
                            <th>Mô tả</th>
                            <th>Người thực hiện</th>
                            <th>Thời gian</th>
                            <th>Block</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.events.forEach((event, index) => {
            html += `
                <tr>
                    <td>${index + 1}</td>
                    <td><span class="badge bg-primary">${event.transaction.eventType}</span></td>
                    <td>${event.transaction.description}</td>
                    <td>${event.transaction.performedBy} (${event.transaction.userRole})</td>
                    <td>${new Date(event.timestamp).toLocaleString('vi-VN')}</td>
                    <td><small class="text-muted">#${event.blockIndex}</small></td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        historyResults.innerHTML = html;
    }

    showError(message) {
        alert('Lỗi: ' + message);
    }
}

// Khởi tạo ứng dụng khi trang loaded
document.addEventListener('DOMContentLoaded', () => {
    new RecordEventHandler();
});