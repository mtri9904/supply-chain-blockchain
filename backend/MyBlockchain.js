// backend/MyBlockchain.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Định nghĩa Block class bên trong file
class Block {
    constructor(timestamp, data, previousHash = '') {
        this.index = 0;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        return crypto.createHash('sha256')
            .update(
                this.index + 
                this.timestamp + 
                this.previousHash + 
                JSON.stringify(this.data) + 
                this.nonce
            )
            .digest('hex');
    }

    mineBlock(difficulty) {
        const target = Array(difficulty + 1).join("0");
        
        console.log(`⛏️  Bắt đầu mining block #${this.index}...`);
        const startTime = Date.now();
        
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
            
            if (this.nonce % 100000 === 0) {
                console.log(`  Thử lần ${this.nonce}... Hash hiện tại: ${this.hash.substring(0, 10)}...`);
            }
        }
        
        const endTime = Date.now();
        const miningTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log(`✅ Block #${this.index} đã được mine!`);
        console.log(`   Nonce: ${this.nonce}`);
        console.log(`   Hash: ${this.hash}`);
        console.log(`   Thời gian mining: ${miningTime}s`);
        console.log(`   Số lần thử: ${this.nonce.toLocaleString()}\n`);
        
        return this.hash;
    }
}

// Smart Contract đơn giản (tạm thời)
class SimpleSmartContract {
    constructor() {
        this.validationHistory = [];
        console.log('🤖 Simple Smart Contract đã được khởi tạo');
    }

    validateTransaction(role, action, data, actor) {
        const validation = {
            success: true,
            error: null,
            timestamp: new Date().toISOString(),
            rule: `${role}.${action}`
        };

        // Basic validation - luôn trả về success cho testing
        if (!data.productId) {
            validation.success = false;
            validation.error = 'Product ID là bắt buộc';
        }

        this.validationHistory.push(validation);
        return validation;
    }

    getValidationStats() {
        return {
            totalValidations: this.validationHistory.length,
            successRate: 100
        };
    }
    getRolePermissions(role) {
        const permissions = {
            'farmer': ['planting', 'fertilizing', 'watering', 'harvesting', 'quality_check'],
            'transporter': ['pickup', 'intransit', 'warehouse', 'delivered', 'delay'],
            'processor': ['cleaning', 'sorting', 'roasting', 'grinding', 'packaging', 'quality_control'],
            'retailer': ['received', 'sale', 'display', 'promotion', 'return'],
            'admin': ['all']
        };
        
        return {
            role: role,
            allowedActions: permissions[role] || [],
            description: `Quyền hạn cho ${role}`
        };
    }
}

// Blockchain class chính
class Blockchain {
    constructor(difficulty = 2) { // Giảm difficulty để test nhanh hơn
        this.difficulty = difficulty;
        this.chain = [];
        this.pendingTransactions = [];
        this.dataFile = path.join(__dirname, 'blockchain_data.json');
        
        this.smartContract = new SimpleSmartContract();
        console.log('📦 Blockchain đã được khởi tạo');
        
        this.loadBlockchain();
    }

    loadBlockchain() {
        try {
            if (fs.existsSync(this.dataFile)) {
                console.log('📂 Đang load blockchain từ file...');
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                
                this.chain = data.chain.map(blockData => {
                    const block = new Block(
                        blockData.timestamp,
                        blockData.data,
                        blockData.previousHash
                    );
                    block.index = blockData.index;
                    block.nonce = blockData.nonce;
                    block.hash = blockData.hash;
                    return block;
                });
                
                console.log(`✅ Đã load blockchain với ${this.chain.length} blocks`);
            } else {
                console.log('📝 Không tìm thấy blockchain, tạo mới...');
                this.chain = [this.createGenesisBlock()];
                this.saveBlockchain();
            }
        } catch (error) {
            console.error('❌ Lỗi khi load blockchain:', error.message);
            console.log('📝 Tạo blockchain mới...');
            this.chain = [this.createGenesisBlock()];
            this.saveBlockchain();
        }
    }

    saveBlockchain() {
        try {
            const data = {
                chain: this.chain,
                pendingTransactions: this.pendingTransactions,
                difficulty: this.difficulty,
                lastUpdated: new Date().toISOString()
            };
            
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
            console.log('💾 Đã lưu blockchain vào file');
        } catch (error) {
            console.error('❌ Lỗi khi lưu blockchain:', error.message);
        }
    }

    createGenesisBlock() {
        console.log('\n🌟 Tạo Genesis Block...');
        const genesisBlock = new Block(Date.now(), { 
            productId: "GENESIS", 
            status: "Khởi tạo blockchain", 
            location: "System",
            actor: "System" 
        }, "0");
        
        genesisBlock.index = 0;
        genesisBlock.mineBlock(this.difficulty);
        
        return genesisBlock;
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    // Thêm sự kiện mới
    addTransactionEvent(transactionData) {
        try {
            console.log('📝 Đang thêm sự kiện mới:', {
                productId: transactionData.productId,
                eventType: transactionData.eventType,
                role: transactionData.role
            });

            // Validate với Smart Contract
            const validation = this.smartContract.validateTransaction(
                transactionData.role,
                transactionData.eventType,
                transactionData,
                transactionData.actor || 'unknown'
            );

            if (!validation.success) {
                throw new Error(`Smart Contract validation failed: ${validation.error}`);
            }

            // Thêm timestamp
            if (!transactionData.timestamp) {
                transactionData.timestamp = new Date().toISOString();
            }

            transactionData.action = 'record_event';

            // Tạo block mới
            const previousBlock = this.getLatestBlock();
            const newBlock = new Block(
                Date.now(),
                transactionData,
                previousBlock.hash
            );
            
            newBlock.index = this.chain.length;
            newBlock.mineBlock(this.difficulty);
            
            this.chain.push(newBlock);
            this.saveBlockchain();
            
            console.log(`✅ Đã thêm sự kiện vào block #${newBlock.index}`);
            
            return {
                success: true,
                blockIndex: newBlock.index,
                transactionHash: newBlock.hash,
                timestamp: transactionData.timestamp,
                eventData: transactionData
            };

        } catch (error) {
            console.error('❌ Lỗi khi thêm sự kiện:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Lấy lịch sử sự kiện của user
    getUserEvents(username, limit = 50) {
        const userEvents = [];
        const searchTerm = username.trim().toLowerCase();
        
        for (let i = this.chain.length - 1; i >= 0 && userEvents.length < limit; i--) {
            const block = this.chain[i];
            if (block.data && block.data.actor) {
                const blockActor = block.data.actor.trim().toLowerCase();
                if (blockActor === searchTerm && block.data.action === 'record_event') {
                    userEvents.push({
                        blockIndex: block.index,
                        timestamp: block.timestamp,
                        productId: block.data.productId,
                        eventType: block.data.eventType,
                        location: block.data.location,
                        notes: block.data.notes,
                        status: this.getEventStatusText(block.data.eventType)
                    });
                }
            }
        }
        
        return userEvents;
    }

    getEventStatusText(eventType) {
        const eventTexts = {
            'planting': 'Trồng cây',
            'fertilizing': 'Bón phân',
            'watering': 'Tưới nước',
            'harvesting': 'Thu hoạch',
            'quality_check': 'Kiểm tra chất lượng',
            'pickup': 'Lấy hàng',
            'intransit': 'Đang vận chuyển',
            'warehouse': 'Nhập kho',
            'delivered': 'Đã giao hàng',
            'delay': 'Trì hoãn',
            'cleaning': 'Làm sạch',
            'sorting': 'Phân loại',
            'roasting': 'Rang xay',
            'grinding': 'Xay nghiền',
            'packaging': 'Đóng gói',
            'quality_control': 'Kiểm soát chất lượng',
            'received': 'Nhập hàng',
            'sale': 'Bán hàng',
            'display': 'Trưng bày',
            'promotion': 'Khuyến mãi',
            'return': 'Hàng trả về'
        };

        return eventTexts[eventType] || eventType;
    }

    // Kiểm tra tính hợp lệ của blockchain
    isChainValid() {
        console.log('\n🔍 Đang kiểm tra tính hợp lệ của blockchain...');
        
        // Kiểm tra genesis block
        const realGenesisHash = this.chain[0].calculateHash();
        if (this.chain[0].hash !== realGenesisHash) {
            console.error('❌ Genesis block không hợp lệ!');
            return false;
        }

        // Kiểm tra từng block
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Kiểm tra hash
            const calculatedHash = currentBlock.calculateHash();
            if (currentBlock.hash !== calculatedHash) {
                console.error(`❌ Block #${i} có hash không hợp lệ!`);
                return false;
            }

            // Kiểm tra liên kết
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.error(`❌ Block #${i} không liên kết đúng với block trước!`);
                return false;
            }
        }

        console.log('✅ Blockchain hợp lệ!');
        return true;
    }

    // Lấy thống kê blockchain
    getBlockchainStats() {
        return {
            totalBlocks: this.chain.length,
            difficulty: this.difficulty,
            pendingTransactions: this.pendingTransactions.length,
            isValid: this.isChainValid(),
            latestBlock: {
                index: this.getLatestBlock().index,
                hash: this.getLatestBlock().hash,
                timestamp: this.getLatestBlock().timestamp
            }
        };
    }
    // Lấy sự kiện theo productId
    getProduct(productId) {
        console.log(`🔍 Tìm kiếm sản phẩm: ${productId}`);
        const productEvents = [];
        const searchId = productId.trim().toLowerCase();
        
        for (let block of this.chain) {
            if (block.data && block.data.productId) {
                const blockProductId = block.data.productId.trim().toLowerCase();
                if (blockProductId === searchId) {
                    const eventTypeVi = this.getEventStatusText(block.data.eventType);
                    // 🔥 THÊM TẤT CẢ THÔNG TIN SỰ KIỆN
                    productEvents.push({
                        blockIndex: block.index,
                        timestamp: block.timestamp,
                        productId: block.data.productId,
                        eventTypeEn: block.data.eventType,
                        eventType: eventTypeVi || '',
                        location: block.data.location || '',
                        actor: block.data.actor || '',
                        role: block.data.role || '',
                        notes: block.data.notes || block.data.description || '',
                        imageUrl: block.data.imageUrl || null,
                        imageName: block.data.imageName || null,
                        // Thêm các trường khác nếu có
                        quantity: block.data.quantity,
                        quality: block.data.quality,
                        temperature: block.data.temperature,
                        duration: block.data.duration,
                        price: block.data.price,
                        customerType: block.data.customerType,
                        batchNumber: block.data.batchNumber,
                        fromLocation: block.data.fromLocation,
                        toLocation: block.data.toLocation,
                        seedType: block.data.seedType,
                        area: block.data.area,
                        yield: block.data.yield,
                        waterSource: block.data.waterSource,
                        fertilizerType: block.data.fertilizerType
                    });
                }
            }
        }
        
        console.log(`✅ Tìm thấy ${productEvents.length} sự kiện cho sản phẩm: ${productId}`);
        console.log('📊 Chi tiết sự kiện:', productEvents);
        return productEvents;
    }
}

// CUỐI FILE MyBlockchain.js
const blockchainInstance = new Blockchain();

module.exports = blockchainInstance;
module.exports.Blockchain = Blockchain;
module.exports.Block = Block;
module.exports.SimpleSmartContract = SimpleSmartContract;