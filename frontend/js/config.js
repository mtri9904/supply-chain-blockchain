// Auto-detect API URL for frontend
// This file automatically detects the correct API URL based on the current environment

class APIConfig {
    constructor() {
        this.KEY_STORAGE = 'scb_custom_api_url';
        this.candidates = this.buildCandidateList();
        this.apiUrl = this.candidates[0];
        console.log('🌐 API candidates:', this.candidates);
        this.ensureConnection();
    }

    buildCandidateList() {
        const list = [];
        const params = new URLSearchParams(window.location.search);
        const queryApi = params.get('api');
        if (queryApi) {
            list.push(queryApi.trim());
        }

        const stored = localStorage.getItem(this.KEY_STORAGE);
        if (stored) {
            list.push(stored.trim());
        }

        const hostname = window.location.hostname;
        const defaultPorts = ['5000', '5001', '5002', '5003'];
        if (hostname) {
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                defaultPorts.forEach(port => list.push(`http://${hostname}:${port}`));
            } else if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                defaultPorts.forEach(port => list.push(`http://${hostname}:${port}`));
            } else {
                list.push(`https://${hostname}`);
                list.push(`http://${hostname}:5000`);
            }
        }

        const fallbackIPs = [
            '172.16.16.65',
            '192.168.100.107',
            '192.168.1.100',
            '192.168.0.100',
            '10.0.0.100'
        ];
        fallbackIPs.forEach(ip => {
            defaultPorts.forEach(port => list.push(`http://${ip}:${port}`));
        });

        const unique = Array.from(new Set(list.filter(Boolean)));
        return unique.length > 0 ? unique : ['http://localhost:5000'];
    }

    async ensureConnection() {
        for (const candidate of this.candidates) {
            if (await this.testConnection(candidate)) {
                this.setAPIUrl(candidate, { silent: true });
                console.log('✅ Using API URL:', candidate);
                return candidate;
            }
        }

        console.warn('⚠️ Không tìm thấy API hoạt động. Sử dụng URL đầu tiên:', this.candidates[0]);
        this.setAPIUrl(this.candidates[0], { silent: true, notifyFailure: true });
        return null;
    }

    async testConnection(url) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const response = await fetch(`${url}/api/blockchain/stats`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeout);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    getAPIUrl() {
        return this.apiUrl;
    }

    setAPIUrl(newUrl, { persist = true, silent = false, notifyFailure = false } = {}) {
        if (!newUrl) return;
        this.apiUrl = newUrl;
        window.API_URL = newUrl;
        if (persist) {
            localStorage.setItem(this.KEY_STORAGE, newUrl);
        }
        if (!silent) {
            console.log('🔧 API URL updated to:', newUrl);
        }
        if (notifyFailure) {
            this.showWarning('⚠️ Không thể tự động kết nối API. Đang dùng cấu hình mặc định: ' + newUrl);
        }
    }

    resetStoredUrl() {
        localStorage.removeItem(this.KEY_STORAGE);
    }

    showWarning(message) {
        if (!document.body) return;
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff9800;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 9999;
            font-family: Arial, sans-serif;
        `;
        warningDiv.innerHTML = message;
        document.body.appendChild(warningDiv);
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.parentNode.removeChild(warningDiv);
            }
        }, 6000);
    }
}

window.apiConfig = new APIConfig();
window.API_URL = window.apiConfig.getAPIUrl();

window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const queryApi = params.get('api');
    if (queryApi) {
        console.log('🔗 API URL overridden by query param:', queryApi);
        window.apiConfig.setAPIUrl(queryApi);
    }
});
