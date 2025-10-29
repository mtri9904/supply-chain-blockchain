// Auto-detect API URL - will be set by config.js
// const API_URL = 'http://172.16.16.65:5000'; // Old hardcoded IP

// Wait for API_URL to be available
function waitForAPIUrl() {
    return new Promise((resolve) => {
        if (window.API_URL) {
            resolve(window.API_URL);
        } else {
            const checkInterval = setInterval(() => {
                if (window.API_URL) {
                    clearInterval(checkInterval);
                    resolve(window.API_URL);
                }
            }, 100);
        }
    });
}

// Kiểm tra đăng nhập với SessionManager
if (!window.sessionManager.isLoggedIn()) {
    alert('⚠️ Bạn chưa đăng nhập!');
    window.location.href = 'login.html';
}

const token = window.sessionManager.getToken();
const user = window.sessionManager.getUser();
const currentSessionId = window.sessionManager.getSessionId();

console.log('🆔 Current session ID:', currentSessionId);
console.log('👤 Current user:', user);

// Hàm xử lý submit form chung
window.submitForm = async () => {
    const productId = document.getElementById('productId').value.trim();
    const location = document.getElementById('location').value.trim();
    
    // Validate input
    if (!productId || !location) {
        alert('Vui lòng điền mã sản phẩm và địa điểm');
        return;
    }

    // Thu thập dữ liệu từ form
    const formData = {};
    const inputs = document.querySelectorAll('#inputSection input, #inputSection select, #inputSection textarea');
    inputs.forEach(input => {
        if (input.value) {
            formData[input.id] = input.value;
        }
    });

    // Tìm message div cũ và xóa nếu có
    const oldMessage = document.querySelector('.message');
    if (oldMessage) {
        oldMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.textContent = '⏳ Đang ghi lên blockchain...';
    messageDiv.className = 'message';
    document.getElementById('inputSection').appendChild(messageDiv);

    try {
        // Wait for API_URL to be available
        const apiUrl = await waitForAPIUrl();
        console.log('Using API URL:', apiUrl);
        
        // Log request
        console.log('Sending data:', formData);

        const response = await fetch(`${apiUrl}/api/record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Session-ID': currentSessionId || 'no-session'
            },
            body: JSON.stringify({
                ...formData,
                actor: user.username,
                role: user.role,
                timestamp: new Date().toISOString()
            })
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error(`Server trả về HTML thay vì JSON. Status: ${response.status}. Response: ${text.substring(0, 200)}...`);
        }

        const data = await response.json();
        console.log('Server response:', data);

        if (response.ok) {
            messageDiv.className = 'message success';
            messageDiv.innerHTML = `
                <strong>✅ ${data.message}</strong><br>
                📦 Block số: <code>${data.data.blockIndex}</code><br>
                🔗 Block Hash: <code>${data.data.blockHash}</code><br>
                🕒 Thời gian: <code>${new Date(data.data.timestamp).toLocaleString('vi-VN')}</code>
            `;

            // Reset form sau khi thành công
            const form = document.getElementById('inputSection');
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type !== 'submit') {
                    input.value = '';
                }
            });

            // Cập nhật lại lịch sử
            if (typeof loadUserHistory === 'function') {
                loadUserHistory();
            }
        } else {
            messageDiv.className = 'message error';
            messageDiv.innerHTML = `❌ ${data.message || 'Có lỗi xảy ra'}<br>
                <small>${data.error || ''}</small>`;
        }
    } catch (error) {
        console.error('Request failed:', error);
        messageDiv.className = 'message error';
        messageDiv.innerHTML = `❌ Lỗi kết nối: ${error.message}<br>
            <small>Vui lòng kiểm tra kết nối và thử lại</small>`;
    }
};