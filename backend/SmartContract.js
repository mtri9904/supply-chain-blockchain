const crypto = require('crypto');

/**
 * Smart Contract cho Supply Chain Blockchain
 * Quản lý quyền hạn và validation logic cho các role
 */
class SupplyChainContract {
    constructor() {
        // Định nghĩa quyền hạn cho từng role
        this.rules = {
            farmer: ['create_product', 'harvest', 'update_harvest_info'],
            shipper: ['transport', 'update_location', 'update_transport_status'],
            factory: ['process', 'quality_check', 'update_processing_info'],
            retailer: ['sell', 'update_inventory', 'update_sales_info'],
            admin: ['view_all', 'validate_blockchain', 'manage_users']
        };

        // Định nghĩa các validation rules cho từng action
        this.validationRules = {
            create_product: {
                requiredFields: ['productName', 'quantity', 'location', 'harvestDate'],
                validate: (data) => {
                    if (!data.productName || data.productName.trim() === '') {
                        throw new Error('Tên sản phẩm không được để trống');
                    }
                    if (!data.quantity || isNaN(data.quantity) || data.quantity <= 0) {
                        throw new Error('Số lượng phải là số dương');
                    }
                    if (!data.location || data.location.trim() === '') {
                        throw new Error('Địa điểm không được để trống');
                    }
                    if (!data.harvestDate) {
                        throw new Error('Ngày thu hoạch không được để trống');
                    }
                    return true;
                }
            },
            harvest: {
                requiredFields: ['productName', 'quantity', 'quality', 'location'],
                validate: (data) => {
                    if (!data.productName || data.productName.trim() === '') {
                        throw new Error('Tên sản phẩm không được để trống');
                    }
                    if (!data.quantity || isNaN(data.quantity) || data.quantity <= 0) {
                        throw new Error('Số lượng thu hoạch phải là số dương');
                    }
                    if (!data.quality || !['A', 'B', 'C'].includes(data.quality)) {
                        throw new Error('Chất lượng phải là A, B hoặc C');
                    }
                    if (!data.location || data.location.trim() === '') {
                        throw new Error('Địa điểm không được để trống');
                    }
                    return true;
                }
            },
            transport: {
                requiredFields: ['batchNumber', 'fromLocation', 'toLocation', 'status'],
                validate: (data) => {
                    if (!data.batchNumber || data.batchNumber.trim() === '') {
                        throw new Error('Số lô hàng (batchNumber) không được để trống');
                    }
                    if (!data.fromLocation || data.fromLocation.trim() === '') {
                        throw new Error('Địa điểm xuất phát không được để trống');
                    }
                    if (!data.toLocation || data.toLocation.trim() === '') {
                        throw new Error('Địa điểm đến không được để trống');
                    }
                    if (!data.status || !['pickup', 'intransit', 'delivered'].includes(data.status)) {
                        throw new Error('Trạng thái vận chuyển không hợp lệ (pickup, intransit, delivered)');
                    }
                    return true;
                }
            },
            process: {
                requiredFields: ['batchNumber', 'processType'],
                validate: (data) => {
                    if (!data.batchNumber || data.batchNumber.trim() === '') {
                        throw new Error('Số lô (batchNumber) không được để trống');
                    }
                    if (!data.processType || data.processType.trim() === '') {
                        throw new Error('Loại chế biến không được để trống');
                    }
                    return true;
                }
            },
            sell: {
                requiredFields: ['batchNumber', 'price', 'quantity'],
                validate: (data) => {
                    if (!data.batchNumber || data.batchNumber.trim() === '') {
                        throw new Error('Số lô (batchNumber) không được để trống');
                    }
                    if (!data.price || isNaN(data.price) || data.price <= 0) {
                        throw new Error('Giá bán phải là số dương');
                    }
                    if (!data.quantity || isNaN(data.quantity) || data.quantity <= 0) {
                        throw new Error('Số lượng bán phải là số dương');
                    }
                    return true;
                }
            },
        };
        // Lưu trữ lịch sử validation
        this.validationHistory = [];
    }

    /**
     * Validate transaction dựa trên role và action
     * @param {string} role - Role của user
     * @param {string} action - Action muốn thực hiện
     * @param {object} data - Dữ liệu transaction
     * @param {string} actor - Tên người thực hiện
     * @returns {object} Kết quả validation
     */
    validateTransaction(role, action, data, actor) {
        const validationId = this.generateValidationId();
        const timestamp = Date.now();

        try {
            // Kiểm tra role có tồn tại không
            if (!this.rules[role]) {
                throw new Error(`Role '${role}' không tồn tại trong hệ thống`);
            }

            // Kiểm tra quyền hạn
            if (!this.rules[role].includes(action)) {
                throw new Error(`Role '${role}' không có quyền thực hiện action '${action}'`);
            }

            // Kiểm tra action có validation rules không
            if (!this.validationRules[action]) {
                throw new Error(`Action '${action}' không có validation rules`);
            }

            // Validate dữ liệu theo rules
            const rule = this.validationRules[action];
            
            // Kiểm tra required fields
            for (const field of rule.requiredFields) {
                if (!data[field] && data[field] !== 0) {
                    throw new Error(`Trường '${field}' là bắt buộc cho action '${action}'`);
                }
            }

            // Chạy custom validation
            rule.validate(data);

            // Ghi lại validation thành công
            const result = {
                validationId,
                timestamp,
                success: true,
                role,
                action,
                actor,
                message: `Smart Contract validation passed: ${role} -> ${action}`,
                data: this.sanitizeData(data)
            };

            this.validationHistory.push(result);
            console.log(`✅ Smart Contract: ${result.message}`);
            
            return result;

        } catch (error) {
            // Ghi lại validation thất bại
            const result = {
                validationId,
                timestamp,
                success: false,
                role,
                action,
                actor,
                error: error.message,
                message: `Smart Contract validation failed: ${role} -> ${action} - ${error.message}`,
                data: this.sanitizeData(data)
            };

            this.validationHistory.push(result);
            console.log(`❌ Smart Contract: ${result.message}`);
            
            return result;
        }
    }

    /**
     * Kiểm tra quyền hạn của role
     * @param {string} role - Role cần kiểm tra
     * @param {string} action - Action cần kiểm tra
     * @returns {boolean} Có quyền hay không
     */
    hasPermission(role, action) {
        return this.rules[role] && this.rules[role].includes(action);
    }

    /**
     * Lấy danh sách quyền hạn của role
     * @param {string} role - Role cần lấy quyền hạn
     * @returns {array} Danh sách quyền hạn
     */
    getRolePermissions(role) {
        return this.rules[role] || [];
    }

    /**
     * Lấy tất cả rules
     * @returns {object} Tất cả rules
     */
    getAllRules() {
        return this.rules;
    }

    /**
     * Lấy validation history
     * @param {number} limit - Số lượng record tối đa
     * @returns {array} Lịch sử validation
     */
    getValidationHistory(limit = 100) {
        return this.validationHistory
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Lấy thống kê validation
     * @returns {object} Thống kê
     */
    getValidationStats() {
        const total = this.validationHistory.length;
        const successful = this.validationHistory.filter(v => v.success).length;
        const failed = total - successful;

        const roleStats = {};
        const actionStats = {};

        this.validationHistory.forEach(v => {
            roleStats[v.role] = (roleStats[v.role] || 0) + 1;
            actionStats[v.action] = (actionStats[v.action] || 0) + 1;
        });

        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
            roleStats,
            actionStats,
            lastValidation: this.validationHistory[this.validationHistory.length - 1]
        };
    }

    /**
     * Tạo validation ID duy nhất
     * @returns {string} Validation ID
     */
    generateValidationId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Làm sạch dữ liệu trước khi lưu (loại bỏ thông tin nhạy cảm)
     * @param {object} data - Dữ liệu gốc
     * @returns {object} Dữ liệu đã làm sạch
     */
    sanitizeData(data) {
        const sanitized = { ...data };
        
        // Loại bỏ các trường nhạy cảm nếu có
        delete sanitized.password;
        delete sanitized.token;
        
        return sanitized;
    }

    /**
     * Reset validation history (chỉ dùng cho testing)
     */
    resetHistory() {
        this.validationHistory = [];
        console.log('🔄 Smart Contract validation history đã được reset');
    }

    /**
     * Thêm rule mới cho role
     * @param {string} role - Role
     * @param {string} action - Action mới
     */
    addRule(role, action) {
        if (!this.rules[role]) {
            this.rules[role] = [];
        }
        
        if (!this.rules[role].includes(action)) {
            this.rules[role].push(action);
            console.log(`➕ Đã thêm quyền '${action}' cho role '${role}'`);
        }
    }

    /**
     * Xóa rule khỏi role
     * @param {string} role - Role
     * @param {string} action - Action cần xóa
     */
    removeRule(role, action) {
        if (this.rules[role]) {
            const index = this.rules[role].indexOf(action);
            if (index > -1) {
                this.rules[role].splice(index, 1);
                console.log(`➖ Đã xóa quyền '${action}' khỏi role '${role}'`);
            }
        }
    }
}

module.exports = SupplyChainContract;
