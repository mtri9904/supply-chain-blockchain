// Auto-detect API URL for frontend
// This file automatically detects the correct API URL based on the current environment

class APIConfig {
    constructor() {
        this.apiUrl = this.detectAPIUrl();
        console.log('🌐 Detected API URL:', this.apiUrl);
    }

    detectAPIUrl() {
        // Method 1: Try to detect from current hostname
        const hostname = window.location.hostname;
        
        // If running on localhost or 127.0.0.1, use localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:5000';
        }
        
        // If running on a specific IP (like 172.16.16.65), use that IP
        if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            return `http://${hostname}:5000`;
        }
        
        // Method 2: Try to detect from network interfaces (if available)
        // This is a fallback method
        const possibleIPs = [
            '172.16.16.65',  // Common WiFi IP range
            '192.168.1.100', // Common home network
            '192.168.0.100', // Another common range
            '10.0.0.100'     // Corporate network
        ];
        
        // For now, try the first possible IP
        // In a real implementation, you could ping these IPs to see which one responds
        return `http://${possibleIPs[0]}:5000`;
    }

    // Method to test API connectivity
    async testConnection() {
        try {
            const response = await fetch(`${this.apiUrl}/api/blockchain/stats`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                console.log('✅ API connection successful');
                return true;
            } else {
                console.log('❌ API connection failed:', response.status);
                return false;
            }
        } catch (error) {
            console.log('❌ API connection error:', error.message);
            return false;
        }
    }

    // Method to get the API URL
    getAPIUrl() {
        return this.apiUrl;
    }

    // Method to update API URL (for manual configuration)
    setAPIUrl(newUrl) {
        this.apiUrl = newUrl;
        console.log('🔧 API URL updated to:', this.apiUrl);
    }
}

// Create global instance
window.apiConfig = new APIConfig();

// Export for use in other files
const API_URL = window.apiConfig.getAPIUrl();

// Make API_URL available globally immediately
window.API_URL = API_URL;

// Test connection on load
window.apiConfig.testConnection().then(success => {
    if (!success) {
        console.warn('⚠️ API connection test failed. You may need to update the API URL.');
        // Show user-friendly message
        if (document.body) {
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
            warningDiv.innerHTML = '⚠️ Không thể kết nối API. Vui lòng kiểm tra server.';
            document.body.appendChild(warningDiv);
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (warningDiv.parentNode) {
                    warningDiv.parentNode.removeChild(warningDiv);
                }
            }, 5000);
        }
    }
});

// API_URL is already set above
