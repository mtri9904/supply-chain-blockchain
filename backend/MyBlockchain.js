// backend/MyBlockchain.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const SupplyChainContract = require('./SmartContract');
const { v4: uuidv4 } = require('uuid'); // Thêm thư viện UUID

const DEFAULT_DATA_FILE = path.join(__dirname, 'node-data', 'default.json');

// Định nghĩa Block class bên trong file
class Block {
    constructor(timestamp, data, previousHash = '') {
        this.index = 0;
        this.timestamp = timestamp;
        // --- BẮT ĐẦU THÊM TRƯỜNG MỚI ---
        this.data = {
            uniqueId: data.uniqueId || uuidv4(), // uniqueId cho sản phẩm
            batchNumber: data.batchNumber || this.generateBatchNumber(data),
            gtin: data.gtin || this.generateGTIN(data),
            ...data
        };
        // --- KẾT THÚC THÊM TRƯỜNG MỚI ---
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        // ========== QUAN TRỌNG: Loại bỏ các field được thêm SAU KHI mining ==========
        // signature, publicKey, và qrCode được thêm AFTER mining
        // Nên hash chỉ tính từ data GỐC
        const dataForHash = {...this.data};
        delete dataForHash.signature;
        delete dataForHash.publicKey;
        delete dataForHash.qrCode;
        
        return crypto.createHash('sha256')
            .update(
                this.index + 
                this.timestamp + 
                this.previousHash + 
                JSON.stringify(dataForHash) +
                this.nonce
            )
            .digest('hex');
    }

    // Sinh batchNumber dựa trên tên sản phẩm và ngày (có thể tùy chỉnh chuẩn hóa theo GS1)
    generateBatchNumber(data) {
        // Tạo chuẩn BATCH-[14 số GTIN]-YYYYMMDD(-n nếu trùng)
        let gtin = data.gtin;
        if (!gtin) gtin = this.generateGTIN(data);
        gtin = (gtin+'').padStart(14,'0').slice(0,14);
        const dateObj = data.timestamp ? new Date(data.timestamp) : new Date();
        const datePart = dateObj.toISOString().slice(0,10).replace(/-/g, '');
        let candidate = `BATCH-${gtin}-${datePart}`;
        let index = 1;
        // Nếu this.chain chưa có, trả ngay batch đầu tiên
        const allBatches = (this.chain && Array.isArray(this.chain)) ? this.chain.map(b => b.data?.batchNumber || '') : [];
        while (allBatches.includes(candidate)) {
            candidate = `BATCH-${gtin}-${datePart}-${index++}`;
        }
        return candidate;
    }

    // Sinh GTIN giả lập (chuỗi số), trong thực tế lấy từ hệ thống quản lý barcode chuẩn quốc tế
    generateGTIN(data) {
        // Ghép tên + ngày + random short,
        if (!data.productName || !data.timestamp) return '999999' + Math.floor(Math.random()*1e6);
        const clean = data.productName.replace(/[^A-Z0-9]/gi,'').toUpperCase();
        const date = new Date(data.timestamp).getTime().toString().slice(-7);
        return ('8' + clean.charCodeAt(0) + date).slice(0,13).padEnd(13, '1');
    }

    // Mining: Tìm hash thỏa mãn difficulty (số 0 đầu tiên)
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

const instantiateBlock = (blockData) => {
    const block = Object.create(Block.prototype);
    block.index = blockData.index;
    block.timestamp = blockData.timestamp;
    block.data = blockData.data;
    block.previousHash = blockData.previousHash;
    block.nonce = blockData.nonce;
    block.hash = blockData.hash;
    return block;
};

class Blockchain {
    constructor(config = {}) {
        if (typeof config === 'number') {
            config = { difficulty: config };
        }

        const {
            difficulty = 4,
            dataFile = DEFAULT_DATA_FILE,
            initialChainData = null
        } = config;

        this.difficulty = difficulty; // Độ khó mining (số chữ số 0 đầu tiên)
        this.chain = [];
        this.pendingTransactions = []; // Giao dịch chờ được mine
        this.miningReward = 100; // Phần thưởng cho miner (optional, có thể dùng sau)
        this.dataFile = path.resolve(dataFile);
        this.initialChainData = initialChainData;

        // Khởi tạo Smart Contract
        this.smartContract = new SupplyChainContract();
        console.log('🤖 Smart Contract đã được khởi tạo');
        console.log('📋 Available roles:', Object.keys(this.smartContract.getAllRules()));
        
        this.loadBlockchain();
    }

    setDataFile(dataFile) {
        this.dataFile = path.resolve(dataFile || DEFAULT_DATA_FILE);
        this.ensureDataDirectory();
    }

    ensureDataDirectory() {
        const dir = path.dirname(this.dataFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Load blockchain từ file hoặc tạo mới
    loadBlockchain() {
        this.ensureDataDirectory();
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
                // Khôi phục chain từ file
                // QUAN TRỌNG: Preserve exact data từ file để hash không thay đổi
                this.chain = Array.isArray(data.chain) ? data.chain.map(instantiateBlock) : [];
                
                console.log(`✅ Đã load blockchain với ${this.chain.length} blocks`);

                // Validate blockchain sau khi load
                if (!this.isChainValid()) {
                    console.error('⚠️  CẢNH BÁO: Blockchain không hợp lệ sau khi load!');
                }
            } else {
                if (this.initialChainData && Array.isArray(this.initialChainData.chain)) {
                    console.log('📦 Không tìm thấy file, import dữ liệu chuỗi ban đầu...');
                    this.chain = this.initialChainData.chain.map(instantiateBlock);
                    this.pendingTransactions = this.initialChainData.pendingTransactions || [];
                    this.saveBlockchain();
                    console.log(`✅ Đã import blockchain với ${this.chain.length} blocks`);
                } else {
                    console.log('📝 Không tìm thấy blockchain, tạo mới...');
                    this.chain = [this.createGenesisBlock()];
                    this.saveBlockchain();
                }
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
            this.ensureDataDirectory();
            const data = {
                chain: this.getChainSnapshot(),
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

    getChainSnapshot() {
        return this.chain.map(block => this.serializeBlock(block));
    }

    serializeBlock(block) {
        return {
            index: block.index,
            timestamp: block.timestamp,
            data: block.data,
            previousHash: block.previousHash,
            nonce: block.nonce,
            hash: block.hash
        };
    }

    createGenesisBlock() {
        console.log('\n🌟 Tạo Genesis Block...');
        const genesisBlock = new Block(Date.now(), { 
            productName: "GENESIS", 
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
    isChainValid(chain = this.chain, { verbose = true } = {}) {
        const logError = (...args) => {
            if (verbose) console.error(...args);
        };

        if (!Array.isArray(chain) || chain.length === 0) {
            logError('❌ Chuỗi blockchain rỗng hoặc không hợp lệ');
            return false;
        }

        const genesisBlock = instantiateBlock(chain[0]);
        const realGenesisHash = genesisBlock.calculateHash();
        if (genesisBlock.hash !== realGenesisHash) {
            logError('❌ Genesis block không hợp lệ!');
            return false;
        }

        const target = Array(this.difficulty + 1).join('0');

        for (let i = 1; i < chain.length; i++) {
            const currentBlock = instantiateBlock(chain[i]);
            const previousBlock = instantiateBlock(chain[i - 1]);

            // Kiểm tra hash
            const calculatedHash = currentBlock.calculateHash();
            if (currentBlock.hash !== calculatedHash) {
                console.error(`❌ Block #${i} có hash không hợp lệ!`);
                return false;
            }

            // Kiểm tra liên kết
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.error(`❌ Block #${i} không liên kết đúng với block trước!`);
            const calculatedHash = currentBlock.calculateHash();
            if (currentBlock.hash !== calculatedHash) {
                logError(`❌ Block #${currentBlock.index} có hash không hợp lệ!`);
                logError(`   Hash hiện tại: ${currentBlock.hash}`);
                logError(`   Hash tính toán: ${calculatedHash}`);
                return false;
            }

            if (currentBlock.previousHash !== previousBlock.hash) {
                logError(`❌ Block #${currentBlock.index} không liên kết đúng với block trước!`);
                logError(`   Previous hash trong block: ${currentBlock.previousHash}`);
                logError(`   Hash của block trước: ${previousBlock.hash}`);
                return false;
            }

            if (currentBlock.hash.substring(0, this.difficulty) !== target) {
                logError(`❌ Block #${currentBlock.index} không đáp ứng difficulty ${this.difficulty}!`);
                logError(`   Hash: ${currentBlock.hash}`);
                return false;
            }
        }

        if (verbose) console.log('✅ Blockchain hợp lệ!');
        return true;
    }

    replaceChain(newChain) {
        if (!Array.isArray(newChain)) {
            return { success: false, reason: 'INVALID_FORMAT' };
        }

        if (newChain.length <= this.chain.length) {
            return { success: false, reason: 'CHAIN_NOT_LONGER' };
        }

        if (!this.isChainValid(newChain, { verbose: false })) {
            return { success: false, reason: 'CHAIN_INVALID' };
        }

        this.chain = newChain.map(instantiateBlock);
        this.pendingTransactions = [];
        this.saveBlockchain();
        console.log('🔄 Đã thay thế blockchain bằng chuỗi hợp lệ dài hơn từ peer');
        return { success: true };
    }

    addBlockFromNetwork(blockData) {
        try {
            if (!blockData) {
                return { success: false, reason: 'EMPTY_BLOCK' };
            }

            const incomingBlock = instantiateBlock(blockData);
            const latestBlock = this.getLatestBlock();

            if (incomingBlock.index <= latestBlock.index) {
                console.log(`ℹ️ Block #${incomingBlock.index} đã tồn tại hoặc cũ hơn. Bỏ qua.`);
                return { success: false, reason: 'BLOCK_ALREADY_EXISTS' };
            }

            if (incomingBlock.index !== latestBlock.index + 1) {
                console.warn(`⚠️ Nhận block #${incomingBlock.index} nhưng block hiện tại là #${latestBlock.index}. Có thể thiếu block.`);
                return { success: false, reason: 'OUT_OF_SYNC', expectedIndex: latestBlock.index + 1 };
            }

            if (incomingBlock.previousHash !== latestBlock.hash) {
                console.warn('⚠️ previousHash không khớp khi nhận block từ peer');
                return { success: false, reason: 'PREVIOUS_HASH_MISMATCH' };
            }

            const calculatedHash = incomingBlock.calculateHash();
            if (incomingBlock.hash !== calculatedHash) {
                console.warn('⚠️ Hash không hợp lệ cho block nhận từ peer');
                return { success: false, reason: 'HASH_MISMATCH' };
            }

            const target = Array(this.difficulty + 1).join('0');
            if (incomingBlock.hash.substring(0, this.difficulty) !== target) {
                console.warn('⚠️ Block nhận từ peer không đáp ứng difficulty');
                return { success: false, reason: 'INVALID_DIFFICULTY' };
            }

            this.chain.push(incomingBlock);
            this.saveBlockchain();
            console.log(`✅ Đã nhận và thêm block #${incomingBlock.index} từ peer`);
            return { success: true, block: incomingBlock };
        } catch (error) {
            console.error('❌ Lỗi khi thêm block từ peer:', error);
            return { success: false, reason: error.message };
        }
    }

    getProduct(batchNumber) {
        // Tìm kiếm CHÍNH XÁC batchNumber (phân biệt hoa thường)
        const searchTerm = batchNumber.trim();
        return this.chain
            .slice(1) // bỏ qua genesis block
            .filter(block => {
                if (!block.data.batchNumber) return false;
                const blockBatch = block.data.batchNumber.trim();
                return blockBatch === searchTerm;
            })
            .map(block => ({
                batchNumber: block.data.batchNumber,
                blockIndex: block.index,
                hash: block.hash,
                nonce: block.nonce,
                timestamp: block.timestamp,
                ...block.data
            }));
    }

    // Kiểm tra sản phẩm đã tồn tại chưa (phân biệt hoa thường)
    productExists(data) {
        const { productName, location, harvestDate, quantity, quality } = data;
        return this.chain.slice(1).some(block => {
            // So sánh tất cả thuộc tính chính
            const d = block.data;
            return d.productName === productName &&
                d.location === location &&
                d.harvestDate === harvestDate &&
                d.quantity === quantity &&
                (typeof quality === 'undefined' || d.quality === quality);
        });
    }

    // Kiểm tra sản phẩm đã được farmer tạo chưa (phân biệt hoa thường) - TÌM THEO BATCHNUMBER
    isProductInitializedByFarmer(batchNumber) {
        const searchTerm = batchNumber.trim();
        
        return this.chain
            .slice(1)
            .some(block => {
                if (!block.data.batchNumber) return false;
                const blockBatchNumber = block.data.batchNumber.trim();
                // Kiểm tra role từ block.data.role (chính) hoặc block.data.details.role (backup)
                const isFromFarmer = block.data.role === 'farmer' || 
                                   (block.data.details && block.data.details.role === 'farmer');
                return blockBatchNumber === searchTerm && isFromFarmer; // So sánh chính xác
            });
    }

    // Phương thức để lấy toàn bộ chuỗi (cho demo)
    getFullChain() {
        return this.chain;
    }

    // Lấy thống kê blockchain
    getBlockchainStats() {
        return {
            totalBlocks: this.chain.length,
            difficulty: this.difficulty,
            pendingTransactions: this.pendingTransactions.length,
            isValid: this.isChainValid(this.chain, { verbose: false }),
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

    // Tìm thông tin sản phẩm từ batchNumber
    getProductInfoByBatchNumber(batchNumber) {
        // Trả về thông tin block đầu tiên có batchNumber này
        const block = this.chain.find(b => b.data && b.data.batchNumber === batchNumber);
        if (!block || !block.data) return null;
        return {
            productName: block.data.productName,
            gtin: block.data.gtin,
            ...block.data
        };
    }

    // Kiểm tra trạng thái vận chuyển hiện tại của batch
    getShippingStatus(batchNumber) {
        const blocks = this.chain.filter(b => 
            b.data && 
            b.data.batchNumber === batchNumber && 
            b.data.role === 'shipper'
        );
        
        if (blocks.length === 0) return null;
        
        // Lấy block shipper mới nhất
        const latestShipperBlock = blocks[blocks.length - 1];
        return latestShipperBlock.data.status;
    }

    // Kiểm tra workflow có hợp lệ không
    canRoleUpdateBatch(batchNumber, role) {
        const blocks = this.chain.filter(b => b.data && b.data.batchNumber === batchNumber);
        
        if (blocks.length === 0) return { allowed: false, reason: 'Batch không tồn tại' };
        
        // Kiểm tra farmer đã tạo chưa
        const farmerBlock = blocks.find(b => b.data.role === 'farmer');
        if (!farmerBlock) return { allowed: false, reason: 'Farmer chưa tạo sản phẩm' };
        
        if (role === 'shipper') {
            // Shipper được cập nhật nhưng đã check ở ngoài (server.js)
            return { allowed: true };
        }
        
        if (role === 'factory') {
            // Factory chỉ được cập nhật khi shipper đã "delivered"
            const shippingStatus = this.getShippingStatus(batchNumber);
            console.log('🔍 Factory check - Shipping status:', shippingStatus);
            if (shippingStatus !== 'delivered') {
                return { allowed: false, reason: 'Shipper chưa giao hàng. Trạng thái hiện tại: "' + (shippingStatus || 'chưa vận chuyển') + '", cần "delivered"' };
            }
            return { allowed: true };
        }
        
        if (role === 'retailer') {
            // Retailer chỉ được cập nhật khi factory đã xử lý xong
            const factoryBlock = blocks.find(b => b.data.role === 'factory');
            if (!factoryBlock) {
                return { allowed: false, reason: 'Factory chưa xử lý sản phẩm' };
            }
            return { allowed: true };
        }
        
        return { allowed: true };
    }
}

// CUỐI FILE MyBlockchain.js
const blockchainInstance = new Blockchain();

module.exports = blockchainInstance;
module.exports.Blockchain = Blockchain;
module.exports.Block = Block;
module.exports.SimpleSmartContract = SimpleSmartContract;