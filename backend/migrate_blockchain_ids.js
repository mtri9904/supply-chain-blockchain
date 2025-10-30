const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const blockchainFile = path.join(__dirname, 'blockchain_data.json');
function generateBatchNumber(data) {
    if (!data.productId || !data.timestamp) return 'BATCH-' + Date.now();
    const cleanName = data.productId.replace(/\s+/g, '').toUpperCase();
    const datePart = new Date(data.timestamp).toISOString().slice(0,10).replace(/-/g, '');
    return `BATCH-${cleanName}-${datePart}`;
}
function generateGTIN(data) {
    if (!data.productId || !data.timestamp) return '999999' + Math.floor(Math.random()*1e6);
    const clean = data.productId.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const date = new Date(data.timestamp).getTime().toString().slice(-7);
    return ('8' + clean.charCodeAt(0) + date).slice(0,13).padEnd(13, '1');
}

function migrate() {
    const blockchain = JSON.parse(fs.readFileSync(blockchainFile, 'utf8'));
    let uniqueMap = {};
    for (let i = 0; i < blockchain.chain.length; i++) {
        const block = blockchain.chain[i];
        if(block.index === 0) continue; // GENESIS
        // Thêm/gán trường uniqueId, batchNumber, gtin nếu chưa có
        if(!block.data.uniqueId) block.data.uniqueId = uuidv4();
        if(!block.data.batchNumber) block.data.batchNumber = generateBatchNumber(block.data);
        if(!block.data.gtin) block.data.gtin = generateGTIN(block.data);
    }
    fs.writeFileSync(blockchainFile, JSON.stringify(blockchain, null, 2), 'utf8');
    console.log('Migration hoàn tất: Đã gán uniqueId, batchNumber, gtin cho mỗi sản phẩm!');
}

migrate();
