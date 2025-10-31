const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const SupplyChainContract = require('./SmartContract');
const { v4: uuidv4 } = require('uuid'); // Thêm thư viện UUID

class Block {
    constructor(timestamp, data, previousHash = '') {
        this.index = 0; // Sẽ được set khi thêm vào chain
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
        this.nonce = 0; // Số dùng cho mining
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
        const target = Array(difficulty + 1).join("0"); // Tạo chuỗi "000..." theo difficulty
        
        console.log(`⛏️  Bắt đầu mining block #${this.index}...`);
        const startTime = Date.now();
        
        // Tìm nonce sao cho hash bắt đầu bằng số 0 theo difficulty
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
            
            // Log progress mỗi 100000 lần thử
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
    }
}

class Blockchain {
    constructor(difficulty = 4) {
        this.difficulty = difficulty; // Độ khó mining (số chữ số 0 đầu tiên)
        this.chain = [];
        this.pendingTransactions = []; // Giao dịch chờ được mine
        this.miningReward = 100; // Phần thưởng cho miner (optional, có thể dùng sau)
        this.dataFile = path.join(__dirname, 'blockchain_data.json');
        
        // Khởi tạo Smart Contract
        this.smartContract = new SupplyChainContract();
        console.log('🤖 Smart Contract đã được khởi tạo');
        console.log('📋 Available roles:', Object.keys(this.smartContract.getAllRules()));
        
        // Khởi tạo hoặc load blockchain từ file
        this.loadBlockchain();
    }

    // Load blockchain từ file hoặc tạo mới
    loadBlockchain() {
        try {
            if (fs.existsSync(this.dataFile)) {
                console.log('📂 Đang load blockchain từ file...');
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                
                // Khôi phục chain từ file
                // QUAN TRỌNG: Preserve exact data từ file để hash không thay đổi
                this.chain = data.chain.map(blockData => {
                    const block = Object.create(Block.prototype);
                    block.index = blockData.index;
                    block.timestamp = blockData.timestamp;
                    block.data = blockData.data; // Giữ nguyên data từ file, KHÔNG gọi constructor
                    block.previousHash = blockData.previousHash;
                    block.nonce = blockData.nonce;
                    block.hash = blockData.hash;
                    return block;
                });
                
                // Khôi phục pending transactions
                this.pendingTransactions = data.pendingTransactions || [];
                
                console.log(`✅ Đã load blockchain với ${this.chain.length} blocks`);
                
                // Validate blockchain sau khi load
                if (!this.isChainValid()) {
                    console.error('⚠️  CẢNH BÁO: Blockchain không hợp lệ sau khi load!');
                }
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

    // Lưu blockchain vào file
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

    // Thêm giao dịch vào pending (chờ mine) với Smart Contract validation
    addTransaction(transactionData) {
        // Validate với Smart Contract nếu có thông tin role và action
        if (transactionData.role && transactionData.action) {
            const validation = this.smartContract.validateTransaction(
                transactionData.role,
                transactionData.action,
                transactionData,
                transactionData.actor || 'unknown'
            );

            // Thêm thông tin validation vào transaction
            transactionData.smartContractValidation = validation;

            if (!validation.success) {
                throw new Error(`Smart Contract validation failed: ${validation.error}`);
            }
        }

        this.pendingTransactions.push(transactionData);
        console.log(`📝 Đã thêm giao dịch vào pending pool (${this.pendingTransactions.length} giao dịch chờ)`);
    }

    // Mine tất cả pending transactions thành 1 block
    minePendingTransactions() {
        if (this.pendingTransactions.length === 0) {
            console.log('⚠️  Không có giao dịch nào để mine');
            return null;
        }

        console.log(`\n⛏️  Bắt đầu mining ${this.pendingTransactions.length} giao dịch...`);
        
        const previousBlock = this.getLatestBlock();
        const newBlock = new Block(
            Date.now(),
            this.pendingTransactions[0], // Trong app này, 1 block = 1 transaction
            previousBlock.hash
        );
        
        newBlock.index = this.chain.length;
        newBlock.mineBlock(this.difficulty);
        
        this.chain.push(newBlock);
        
        // Xóa transaction đã được mine
        this.pendingTransactions.shift();
        
        // Lưu vào file
        this.saveBlockchain();
        
        return newBlock;
    }

    // Thêm block trực tiếp (có mining) với Smart Contract validation
    addBlock(newBlockData) {
        // Validate với Smart Contract nếu có thông tin role và action
        if (newBlockData.role && newBlockData.action && newBlockData.details) {
            const validation = this.smartContract.validateTransaction(
                newBlockData.role,
                newBlockData.action,
                newBlockData.details, // Validate dựa trên details thay vì newBlockData
                newBlockData.actor || 'unknown'
            );

            // Thêm thông tin validation vào block data
            newBlockData.smartContractValidation = validation;

            if (!validation.success) {
                throw new Error(`Smart Contract validation failed: ${validation.error}`);
            }
        }

        const previousBlock = this.getLatestBlock();
        const newBlock = new Block(
            Date.now(),
            newBlockData,
            previousBlock.hash
        );
        
        newBlock.index = this.chain.length;
        newBlock.mineBlock(this.difficulty);
        
        this.chain.push(newBlock);
        
        // Lưu vào file
        this.saveBlockchain();
        
        return newBlock;
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

            // Kiểm tra hash của block hiện tại
            const calculatedHash = currentBlock.calculateHash();
            if (currentBlock.hash !== calculatedHash) {
                console.error(`❌ Block #${i} có hash không hợp lệ!`);
                console.error(`   Hash hiện tại: ${currentBlock.hash}`);
                console.error(`   Hash tính toán: ${calculatedHash}`);
                return false;
            }

            // Kiểm tra liên kết với block trước
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.error(`❌ Block #${i} không liên kết đúng với block trước!`);
                console.error(`   Previous hash trong block: ${currentBlock.previousHash}`);
                console.error(`   Hash của block trước: ${previousBlock.hash}`);
                return false;
            }

            // Kiểm tra proof of work (hash phải bắt đầu bằng số 0 theo difficulty)
            const target = Array(this.difficulty + 1).join("0");
            if (currentBlock.hash.substring(0, this.difficulty) !== target) {
                console.error(`❌ Block #${i} không đáp ứng difficulty ${this.difficulty}!`);
                console.error(`   Hash: ${currentBlock.hash}`);
                return false;
            }
        }

        console.log('✅ Blockchain hợp lệ!');
        return true;
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
            isValid: this.isChainValid(),
            latestBlock: {
                index: this.getLatestBlock().index,
                hash: this.getLatestBlock().hash,
                timestamp: this.getLatestBlock().timestamp
            },
            smartContract: this.smartContract.getValidationStats()
        };
    }

    // Lấy Smart Contract instance
    getSmartContract() {
        return this.smartContract;
    }

    // Validate transaction với Smart Contract (không thêm vào blockchain)
    validateTransaction(role, action, data, actor) {
        return this.smartContract.validateTransaction(role, action, data, actor);
    }

    // Lấy validation history
    getValidationHistory(limit = 100) {
        return this.smartContract.getValidationHistory(limit);
    }

    // Lấy quyền hạn của role
    getRolePermissions(role) {
        return this.smartContract.getRolePermissions(role);
    }

    // Kiểm tra quyền hạn
    hasPermission(role, action) {
        return this.smartContract.hasPermission(role, action);
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

module.exports = { Block, Blockchain };