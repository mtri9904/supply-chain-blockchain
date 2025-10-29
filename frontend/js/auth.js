// Auto-detect API URL - will be set by config.js
// const API_URL = 'http://172.16.16.65:5000'; // Old hardcoded IP

// Đăng ký
if (document.getElementById('registerForm')) {
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;

        // Validate
        if (!username || !password || !role) {
            document.getElementById('message').className = 'message error';
            document.getElementById('message').textContent = '❌ Vui lòng điền đầy đủ thông tin';
            return;
        }

        try {
            const response = await fetch(`${window.API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });

            const data = await response.json();
            const messageDiv = document.getElementById('message');

            if (response.ok) {
                messageDiv.className = 'message success';
                messageDiv.textContent = '✅ ' + data.message + ' - Chuyển sang đăng nhập...';
                setTimeout(() => window.location.href = 'login.html', 2000);
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = '❌ ' + (data.error || data.message);
            }
        } catch (error) {
            document.getElementById('message').className = 'message error';
            document.getElementById('message').textContent = '❌ Lỗi kết nối server';
        }
    });
}

// Đăng nhập
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${window.API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            const messageDiv = document.getElementById('message');

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify({
                    username: data.username,
                    role: data.role
                }));
                
                messageDiv.className = 'message success';
                messageDiv.textContent = '✅ Đăng nhập thành công - Đang chuyển hướng...';
                setTimeout(() => window.location.href = 'dashboard.html', 1500);
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = '❌ ' + data.error;
            }
        } catch (error) {
            document.getElementById('message').className = 'message error';
            document.getElementById('message').textContent = '❌ Lỗi kết nối server';
        }
    });
}