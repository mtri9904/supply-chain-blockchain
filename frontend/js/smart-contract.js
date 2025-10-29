// Smart Contract Frontend Handler
// Auto-detect API URL - will be set by config.js
// const API_URL = 'http://172.16.16.65:5000'; // Old hardcoded IP

class SmartContractHandler {
    constructor() {
        this.currentUser = this.getCurrentUser();
        this.smartContractInfo = null;
    }

    // Lấy thông tin user hiện tại
    getCurrentUser() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return {
                username: payload.username,
                role: payload.role
            };
        } catch (error) {
            console.error('Lỗi parse token:', error);
            return null;
        }
    }

    // Lấy thông tin Smart Contract
    async getSmartContractInfo() {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/info`);
            const data = await response.json();
            
            if (data.success) {
                this.smartContractInfo = data.data;
                return data.data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Lỗi lấy thông tin Smart Contract:', error);
            return null;
        }
    }

    // Lấy quyền hạn của role
    async getRolePermissions(role) {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/permissions/${role}`);
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Lỗi lấy quyền hạn:', error);
            return null;
        }
    }

    // Kiểm tra quyền hạn
    async checkPermission(role, action) {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/check-permission/${role}/${action}`);
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Lỗi kiểm tra quyền hạn:', error);
            return null;
        }
    }

    // Validate transaction
    async validateTransaction(role, action, data, actor) {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ role, action, data, actor })
            });
            
            const result = await response.json();
            
            if (result.success) {
                return result.data;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Lỗi validate transaction:', error);
            return null;
        }
    }

    // Lấy lịch sử validation
    async getValidationHistory(limit = 50) {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/validation-history?limit=${limit}`);
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Lỗi lấy lịch sử validation:', error);
            return null;
        }
    }

    // Lấy thống kê Smart Contract
    async getSmartContractStats() {
        try {
            const response = await fetch(`${window.API_URL}/api/smart-contract/stats`);
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            console.error('Lỗi lấy thống kê Smart Contract:', error);
            return null;
        }
    }

    // Hiển thị thông báo Smart Contract
    showSmartContractMessage(validation, isSuccess = true) {
        const messageDiv = document.getElementById('message') || document.getElementById('smartContractMessage');
        
        if (!messageDiv) {
            console.log('Không tìm thấy element để hiển thị message');
            return;
        }

        if (isSuccess) {
            messageDiv.className = 'message success smart-contract-success';
            messageDiv.innerHTML = `
                <div class="smart-contract-header">
                    🤖 Smart Contract Validation
                </div>
                <div class="smart-contract-details">
                    <strong>✅ ${validation.message}</strong><br>
                    <small>Role: ${validation.role} | Action: ${validation.action} | Actor: ${validation.actor}</small>
                </div>
            `;
        } else {
            messageDiv.className = 'message error smart-contract-error';
            messageDiv.innerHTML = `
                <div class="smart-contract-header">
                    🤖 Smart Contract Validation
                </div>
                <div class="smart-contract-details">
                    <strong>❌ ${validation.error}</strong><br>
                    <small>Role: ${validation.role} | Action: ${validation.action} | Actor: ${validation.actor}</small>
                </div>
            `;
        }

        // Tự động ẩn sau 5 giây
        setTimeout(() => {
            if (messageDiv) {
                messageDiv.className = 'message';
                messageDiv.innerHTML = '';
            }
        }, 5000);
    }

    // Hiển thị quyền hạn của user hiện tại
    async displayUserPermissions() {
        if (!this.currentUser) {
            console.log('Chưa đăng nhập');
            return;
        }

        const permissions = await this.getRolePermissions(this.currentUser.role);
        if (!permissions) {
            console.log('Không thể lấy quyền hạn');
            return;
        }

        const permissionsDiv = document.getElementById('userPermissions');
        if (permissionsDiv) {
            permissionsDiv.innerHTML = `
                <div class="permissions-info">
                    <h4>🔐 Quyền hạn của bạn (${this.currentUser.role})</h4>
                    <div class="permissions-list">
                        ${permissions.permissions.map(permission => 
                            `<span class="permission-badge">${permission}</span>`
                        ).join('')}
                    </div>
                </div>
            `;
        }
    }

    // Hiển thị thông tin Smart Contract
    async displaySmartContractInfo() {
        const info = await this.getSmartContractInfo();
        if (!info) return;

        const infoDiv = document.getElementById('smartContractInfo');
        if (infoDiv) {
            infoDiv.innerHTML = `
                <div class="smart-contract-info">
                    <h4>🤖 Smart Contract Information</h4>
                    <div class="contract-stats">
                        <div class="stat-item">
                            <strong>Tổng validations:</strong> ${info.validationStats.total}
                        </div>
                        <div class="stat-item">
                            <strong>Thành công:</strong> ${info.validationStats.successful}
                        </div>
                        <div class="stat-item">
                            <strong>Thất bại:</strong> ${info.validationStats.failed}
                        </div>
                        <div class="stat-item">
                            <strong>Tỷ lệ thành công:</strong> ${info.validationStats.successRate}
                        </div>
                    </div>
                    <div class="contract-rules">
                        <h5>📋 Rules:</h5>
                        ${Object.entries(info.rules).map(([role, actions]) => 
                            `<div class="role-rule">
                                <strong>${role}:</strong> ${actions.join(', ')}
                            </div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }
    }

    // Kiểm tra quyền hạn trước khi thực hiện action
    async checkPermissionBeforeAction(action, showMessage = true) {
        if (!this.currentUser) {
            if (showMessage) {
                alert('Vui lòng đăng nhập trước');
            }
            return false;
        }

        const permission = await this.checkPermission(this.currentUser.role, action);
        if (!permission) {
            if (showMessage) {
                alert('Không thể kiểm tra quyền hạn');
            }
            return false;
        }

        if (!permission.hasPermission) {
            if (showMessage) {
                alert(`Bạn không có quyền thực hiện action '${action}'`);
            }
            return false;
        }

        return true;
    }

    // Thêm action vào form data trước khi gửi
    addActionToFormData(formData, action) {
        formData.append('action', action);
        return formData;
    }

    // Xử lý response từ server có Smart Contract validation
    handleSmartContractResponse(response, data) {
        if (data.smartContractValidation) {
            const validation = data.smartContractValidation;
            this.showSmartContractMessage(validation, validation.success);
        }
    }
}

// Tạo instance global
window.smartContractHandler = new SmartContractHandler();

// CSS cho Smart Contract messages
const style = document.createElement('style');
style.textContent = `
    .smart-contract-success {
        border-left: 4px solid #4CAF50;
        background-color: #f1f8e9;
    }
    
    .smart-contract-error {
        border-left: 4px solid #f44336;
        background-color: #ffebee;
    }
    
    .smart-contract-header {
        font-weight: bold;
        margin-bottom: 5px;
    }
    
    .smart-contract-details {
        font-size: 0.9em;
    }
    
    .permissions-info {
        margin: 10px 0;
        padding: 10px;
        background-color: #f5f5f5;
        border-radius: 5px;
    }
    
    .permissions-list {
        margin-top: 10px;
    }
    
    .permission-badge {
        display: inline-block;
        background-color: #2196F3;
        color: white;
        padding: 2px 8px;
        margin: 2px;
        border-radius: 12px;
        font-size: 0.8em;
    }
    
    .smart-contract-info {
        margin: 10px 0;
        padding: 15px;
        background-color: #f8f9fa;
        border-radius: 5px;
        border: 1px solid #dee2e6;
    }
    
    .contract-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 10px;
        margin: 10px 0;
    }
    
    .stat-item {
        padding: 8px;
        background-color: white;
        border-radius: 3px;
        border: 1px solid #e0e0e0;
    }
    
    .contract-rules {
        margin-top: 15px;
    }
    
    .role-rule {
        margin: 5px 0;
        padding: 5px;
        background-color: white;
        border-radius: 3px;
    }
`;
document.head.appendChild(style);

// Khởi tạo khi trang load
document.addEventListener('DOMContentLoaded', () => {
    if (window.smartContractHandler) {
        window.smartContractHandler.displayUserPermissions();
        window.smartContractHandler.displaySmartContractInfo();
    }
});
