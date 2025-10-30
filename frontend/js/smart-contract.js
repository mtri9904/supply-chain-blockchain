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

// ====== UI Truy xuất nguồn gốc theo UniqueID, Batch, GTIN ======
function initializeTraceInputUI(containerId = 'traceSection') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <label for="traceInput" style="font-weight:bold;">Nhập hoặc quét mã sản phẩm (Unique ID, Batch, GTIN):</label><br>
      <input id="traceInput" class="trace-input" placeholder="Ví dụ: 083ce23e-..., BATCH-CÀPHÊ..., 81321A30..." style="width: 340px; padding:6px; font-size:1em;">
      <button id="traceSearchBtn" style="margin-left:6px;">Truy xuất</button>
      <button id="traceQRBtn" style="margin-left:2px;">Quét QR</button>
      <div id="traceResult" style="margin-top:14px;"></div>
    `;
    const input = document.getElementById('traceInput');
    const resultDiv = document.getElementById('traceResult');
    
    // Hàm tra cứu lịch sử bằng mã nhập
    async function handleTrace() {
      const value = input.value.trim();
      if (!value) {
        resultDiv.innerHTML = '<span style="color:red">Vui lòng nhập mã sản phẩm!</span>';
        return;
      }
      resultDiv.innerHTML = '⏳ Đang truy xuất...';
      let url = window.API_URL + '/api/product-history?';
      if (/^[0-9a-fA-F\-]{30,}$/.test(value)) {
        url += 'uniqueId=' + encodeURIComponent(value);
      } else if (/^BATCH/i.test(value)) {
        url += 'batchNumber=' + encodeURIComponent(value);
      } else if (/^[0-9]{10,}$/.test(value)) {
        url += 'gtin=' + encodeURIComponent(value);
      } else {
        resultDiv.innerHTML = '<span style="color:orange">Chú ý: Tên sản phẩm có thể trả về nhiều lô/trùng lặp. Vui lòng nhập chính xác mã uniqueId hoặc batch hoặc GTIN nếu cần tra cứu nguồn gốc duy nhất!</span>';
        url += 'productName=' + encodeURIComponent(value);
      }
      fetch(url, {headers:{'Authorization':`Bearer ${localStorage.getItem('token')||''}`}})
        .then(res => res.json())
        .then(data => {
          if (data && data.success !== false && data.length) {
            // BẮT ĐẦU: Render đẹp từng block/event
            let html = `<div style='font-weight:bold;font-size:1.1em;margin-bottom:8px;color:#fb8c00'>⛓️ Lịch sử sản phẩm/lô (${data.length} sự kiện)</div><div class='timeline-trace'>`;
            data.forEach((item, idx) => {
              const roleDict = {farmer:'🌾', shipper:'🚚', factory:'🏭', retailer:'🏪'};
              const actorRole = roleDict[item.role] || '👤';
              const t = item.timestamp || item.recordedAt || item['timestampBlock'] || item.details?.recordedAt;
              const tm = t ? (new Date(t).toLocaleString('vi-VN')) : '?';
              html += `<div class='timeline-block'>
                <div class='timeline-row1'>
                  <span class='block-index'>#${item.blockIndex ?? idx+1}</span>
                  <span class='trace-role'>${actorRole} ${item.role||''}</span>
                  <span class='trace-actor'>👤 <b>${item.actor||'-'}</b></span>
                  <span class='trace-time'>🕒 ${tm}</span>
                </div>
                <div class='trace-status'><b>${item.status||item.action||'-'}</b></div>
                <div class='trace-meta'>
                  ${item.productName?`<span>📦 <b>${item.productName}</b></span>`:''}
                  ${item.batchNumber?`<span style='color:#0277bd'>• Batch <b>${item.batchNumber}</b></span>`:''}
                  ${item.quantity?`<span>• Số lượng <b>${item.quantity}</b></span>`:''}
                  ${item.quality?`<span>• Chất lượng <b>${item.quality}</b></span>`:''}
                  ${item.location?`<span>• Địa điểm <b>${item.location}</b></span>`:''}
                  ${item.gtin?`<span style='color:#00796b'>• GTIN ${item.gtin}</span>`:''}
                </div>
                ${item.qrCode?`<div class='trace-qr-img'><img src='${item.qrCode}' title='QR sản phẩm/lô này' style='width:70px;border:2px solid #fbc02d;border-radius:8px;padding:4px;background:#fff'></div>`:''}
                <div class='trace-hash'>🔗 Hash: <span>${(item.hash||'').substring(0,14)}...</span></div>
              </div>`;
            });
            html += '</div>';
            resultDiv.innerHTML = html;
          } else if (data && Array.isArray(data) && data.length === 0) {
            resultDiv.innerHTML = '<span style="color:orange">Không tìm thấy sản phẩm nào với mã này!</span>';
          } else {
            resultDiv.innerHTML = `<span style='color:red;'>${data.message||'Không tìm thấy sản phẩm phù hợp.'}</span>`;
          }
        })
        .catch(err => {
          resultDiv.innerHTML = `<span style='color:red;'>Lỗi khi kết nối server: ${err.message}</span>`;
        });
    }
    document.getElementById('traceSearchBtn').onclick = handleTrace;
    input.addEventListener('keydown', e => (e.key==='Enter') && handleTrace());
    
    // Nút quét QR (placeholder, cần tích hợp thư viện jsQR hoặc html5-qrcode nếu muốn)
    document.getElementById('traceQRBtn').onclick = function() {
      alert('Chức năng quét QR cần được tích hợp thêm (jsQR, html5-qrcode hoặc gọi camera điện thoại)!');
    };
    
    // Có thể tự động fill demo mã nếu muốn hướng dẫn demo cho người mới
}

// Gợi ý: thêm dòng này ở layout hoặc khi load trang tra cứu, dashboard:
// initializeTraceInputUI();

// CSS TIMELINE UI TRA CỨU ĐẸP
if (!document.getElementById('timeline_trace_css')) {
  const style = document.createElement('style');
  style.id = 'timeline_trace_css';
  style.textContent = `
  .timeline-trace { border-left:5px solid #ffe082; margin-top:17px; margin-left:10px; }
  .timeline-block { position:relative; margin-bottom:32px; margin-left:-7px; padding-left:22px; background:#fffde7; border-radius:10px; border:1px solid #ffe082; box-shadow:0 1px 5px #fffbe5;}
  .timeline-row1 { display:flex; gap:14px; align-items:center; padding-top:10px; font-size:1em; color:#ef6c00; }
  .block-index { color:#fff; background:#fb8c00; border-radius: 7px; min-width:36px; text-align:center; font-weight:bold; padding: 3px 10px; margin-right:7px; }
  .trace-role { font-weight:600; }
  .trace-actor { color:#1a237e; }
  .trace-time { color:#333; font-size:0.97em; margin-left:auto; }
  .trace-status { font-size:1.12em; color:#d84315; padding:6px 0; margin-top:4px; margin-bottom:3px; font-weight:600; }
  .trace-meta { font-size:0.99em; color:#4e2801; padding:0 0 8px 0; display:flex; flex-wrap:wrap; gap:14px; }
  .trace-qr-img { margin-bottom:7px; }
  .trace-hash { font-size:0.89em; color:#bdbdbd; padding-bottom:8px; }
  `;
  document.head.appendChild(style);
}

// JS xử lý nhập liệu, dashboard và lịch sử sản phẩm dùng chuẩn tiếng Việt và batchNumber là ID duy nhất.

let currentUser = null;

function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token || !user.username) {
        location.href = 'login.html';
        return;
    }
    currentUser = user;
    document.getElementById('userName').textContent = `👤 ${user.username}`;
    document.getElementById('userRole').textContent = getRoleIcon(user.role) + ' ' + getRoleName(user.role);
    createFormForRole(user.role);
    loadUserHistory();
}

function getRoleIcon(role) {
    const icons = {
        'farmer': '🌾', 'shipper': '🚚', 'factory': '🏭', 'retailer': '🏪'
    };
    return icons[role] || '👤';
}
function getRoleName(role) {
    const roles = {
        'farmer': 'Nông dân','shipper': 'Vận chuyển','factory': 'Nhà máy','retailer': 'Bán lẻ'
    };
    return roles[role] || role;
}

function createFormForRole(role) {
    const section = document.getElementById('inputSection');
    let formContent = '';
    if(role === 'farmer') {
        formContent = `
          <h2>🌾 Thêm sản phẩm mới</h2>
          <div class="form-group">
              <label for="productName">Tên sản phẩm *</label>
              <input type="text" id="productName" required placeholder="VD: Gạo, Cà phê, Đậu nành">
          </div>
          <div class="form-group">
              <label for="location">Địa điểm *</label>
              <input type="text" id="location" required placeholder="Nhập địa điểm hiện tại">
          </div>
          <div class="form-group">
              <label for="harvestDate">Ngày thu hoạch *</label>
              <input type="date" id="harvestDate" required>
          </div>
          <div class="form-group">
              <label for="quantity">Số lượng (kg) *</label>
              <input type="number" id="quantity" required min="0" step="0.1">
          </div>
          <div class="form-group">
              <label for="quality">Chất lượng</label>
              <select id="quality" required>
                  <option value="A">Loại A - Cao cấp</option>
                  <option value="B">Loại B - Tiêu chuẩn</option>
                  <option value="C">Loại C - Thường</option>
              </select>
          </div>
          <div class="form-group">
              <label for="notes">Ghi chú</label>
              <textarea id="notes" placeholder="Thông tin thêm về lô hàng..."></textarea>
          </div>
          <button type="submit" class="submit-btn" onclick="submitForm()">💾 Lưu thông tin</button>
        `;
    } else {
        // Các role khác dùng batchNumber làm ID chính
        formContent = `
        <h2>${getRoleIcon(role)} Cập nhật thông tin lô hàng</h2>
        <div class="form-group">
            <label for="batchNumber">Mã lô sản phẩm *</label>
            <input type="text" id="batchNumber" required placeholder="Nhập mã lô sản phẩm (batchNumber)">
        </div>
        <div class="form-group">
            <label for="location">Địa điểm *</label>
            <input type="text" id="location" required placeholder="Nhập địa điểm hiện tại">
        </div>
        <!-- Thêm các field tuỳ biến theo role ở đây, ví dụ shipper/factory -->
        `;
        if (role === 'factory') {
            formContent += `
            <div class="form-group">
                <label for="processType">Loại quy trình *</label>
                <select id="processType" required>
                    <option value="cleaning">Làm sạch</option>
                    <option value="roasting">Rang</option>
                    <option value="grinding">Xay</option>
                    <option value="packaging">Đóng gói</option>
                </select>
            </div>
            <div class="form-group">
                <label for="temperature">Nhiệt độ xử lý (°C)</label>
                <input type="number" id="temperature" step="0.1">
            </div>
            <div class="form-group">
                <label for="duration">Thời gian xử lý (phút)</label>
                <input type="number" id="duration" min="0">
            </div>`;
        }
        if (role === 'retailer') {
            formContent += `
            <div class="form-group">
                <label for="saleDate">Ngày bán *</label>
                <input type="date" id="saleDate" required>
            </div>
            <div class="form-group">
                <label for="quantity">Số lượng bán (kg) *</label>
                <input type="number" id="quantity" required min="0" step="0.1">
            </div>
            <div class="form-group">
                <label for="price">Giá bán (VNĐ/kg) *</label>
                <input type="number" id="price" required min="0">
            </div>
            <div class="form-group">
                <label for="customerType">Loại khách hàng</label>
                <select id="customerType">
                    <option value="individual">Cá nhân</option>
                    <option value="business">Doanh nghiệp</option>
                </select>
            </div>`;
        }
        formContent += `<button type="submit" class="submit-btn" onclick="submitForm()">💾 Cập nhật trạng thái</button>`;
    }
    section.innerHTML = formContent;
}

async function submitForm() {
    const formData = {};
    const inputs = document.querySelectorAll('#inputSection input, #inputSection select, #inputSection textarea');
    inputs.forEach(input => {
        if (input.value) {
            formData[input.id] = input.value;
        }
    });
    formData.actor = currentUser.username;
    formData.role = currentUser.role;

    // Chuẩn hoá dữ liệu gửi lên
    if(currentUser.role === 'farmer') {
        // Chỉ gửi productName, không gửi batchNumber
        if(formData.batchNumber) delete formData.batchNumber;
    } else {
        // Các vai trò khác: chỉ gửi batchNumber, không gửi productName
        if(formData.productName) delete formData.productName;
    }

    try {
        const response = await fetch(`${window.API_URL}/api/record`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            alert(`❌ Thất bại: ${data.message || 'Không thể lưu dữ liệu'}`);
            return;
        }
        alert('✅ Thành công! Dữ liệu đã được ghi nhận trên blockchain!');
        // Gửi xong reset form và reload lịch sử
        loadUserHistory();
        inputs.forEach(input => {
            if (input.type !== 'select-one') input.value = '';
        });
    } catch (error) {
        alert(`❌ Lỗi: ${error.message}`);
    }
}

async function loadUserHistory() {
    const historyContent = document.getElementById('historyContent');
    historyContent.innerHTML = '<div class="loading">⏳ Đang tải lịch sử...</div>';
    try {
        // Wait for API_URL to be available
        if (!window.API_URL) {
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (window.API_URL) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }
        const response = await fetch(`${window.API_URL}/api/user-history/${currentUser.username}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Có lỗi xảy ra');

        if (!data || data.length === 0) {
            historyContent.innerHTML = `<div class="empty-message">ℹ️ Chưa có lịch sử cập nhật nào.</div>`;
            return;
        }
        let html = '';
        data.forEach(item => {
            const timestamp = new Date(item.timestamp).toLocaleString('vi-VN');
            let qrSection = '';
            if(item.qrCode) {
                qrSection = `<div class="timeline-qr"><img src="${item.qrCode}" alt="QR Code" onclick="enlargeQR('${item.qrCode}', '${item.batchNumber || ''}', '${item.productName || ''}')" title="Click để phóng to QR code"><p>📱 Quét QR</p></div>`;
            }
            html += `
            <div class="timeline-item">
                <div class="timeline-content">
                    <div class="timeline-status">${item.status || ''}</div>
                    <div class="timeline-info"><strong>🕒 Thời gian:</strong> ${timestamp}</div>
                    <div class="timeline-info"><strong>📦 Tên sản phẩm:</strong> ${item.productName || '-'}</div>
                    <div class="timeline-info"><strong>🏷️ Batch Number:</strong> ${item.batchNumber || '-'}</div>
                    <div class="timeline-info"><strong>📍 Địa điểm:</strong> ${item.location || '-'}</div>
                </div>
                ${qrSection}
            </div>`;
        });
        historyContent.innerHTML = html;
    } catch (error) {
        historyContent.innerHTML = `<div class="empty-message" style="color: #d32f2f;">❌ Lỗi tải lịch sử: ${error.message}</div>`;
    }
}

function logout() {
    if (confirm('Bạn có chắc muốn đăng xuất?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.href = 'index.html';
    }
}

function enlargeQR(qrCodeData, batchNumber, productName) {
    const modal = document.getElementById('qrModal');
    const qrImage = document.getElementById('qrCodeImage');
    const batchNumberEl = document.getElementById('qrBatchNumber');
    const productNameEl = document.getElementById('qrProductName');
    qrImage.src = qrCodeData;
    batchNumberEl.textContent = batchNumber || '';
    productNameEl.textContent = productName || '';
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeQRModal() {
    const modal = document.getElementById('qrModal');
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
}
function downloadQRCode() {
    const qrImage = document.getElementById('qrCodeImage');
    const batchNumber = document.getElementById('qrBatchNumber').textContent;
    const link = document.createElement('a');
    link.href = qrImage.src;
    link.download = `QR_${batchNumber.replace(/\s+/g, '_')}.png`;
    link.click();
}

// Xử lý nút chuyển tab
function showSection(sectionName) {
    document.getElementById('inputSection').style.display = sectionName === 'input' ? 'block' : 'none';
    document.getElementById('historySection').style.display = sectionName === 'history' ? 'block' : 'none';
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(sectionName === 'input' ? 'Nhập liệu' : 'Lịch sử')) {
            btn.classList.add('active');
        }
    });
}
window.onload = checkAuth;