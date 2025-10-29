// Sử dụng IP để điện thoại có thể kết nối
// Auto-detect API URL - will be set by config.js
// const API_URL = 'http://172.16.16.65:5000'; // Old hardcoded IP

document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const productId = document.getElementById('productId').value.trim();
    const resultDiv = document.getElementById('result');
    
    // Hiển thị loading
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="loading">⏳ Đang tìm kiếm trên blockchain...</div>';

    try {
        const response = await fetch(`${window.API_URL}/api/history/${productId}`);
        const data = await response.json();

        if (response.ok) {
            if (!data || data.length === 0) {
                resultDiv.innerHTML = `
                    <div class="result-title">Kết quả cho: ${productId}</div>
                    <div class="empty-message">
                        ℹ️ Không tìm thấy lịch sử cho sản phẩm này.<br>
                        Sản phẩm có thể chưa được ghi nhận trên blockchain.
                    </div>
                `;
            } else {
                let html = `<div class="result-title">📦 Lịch sử sản phẩm: ${productId}</div>`;
                html += '<div class="timeline">';
                
                data.forEach((item, index) => {
                    const timestamp = new Date(item.timestamp).toLocaleString('vi-VN');
                    html += `
                        <div class="timeline-item">
                            <div class="timeline-status">📍 ${item.status}</div>
                            <div class="timeline-info"><strong>🕒 Thời gian:</strong> ${timestamp}</div>
                            <div class="timeline-info"><strong>📍 Vị trí:</strong> ${item.location}</div>
                            <div class="timeline-info"><strong>👤 Thực hiện bởi:</strong> <code>${item.actor}</code></div>
                        </div>
                    `;
                });
                
                html += '</div>';
                resultDiv.innerHTML = html;
            }
        } else {
            resultDiv.innerHTML = `
                <div class="empty-message" style="color: #d32f2f;">
                    ❌ ${data.error || 'Có lỗi xảy ra'}
                </div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="empty-message" style="color: #d32f2f;">
                ❌ Lỗi kết nối server: ${error.message}
            </div>
        `;
    }
});
