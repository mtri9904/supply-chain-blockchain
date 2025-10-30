const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const QRCode = require('qrcode');
const { Blockchain } = require('./MyBlockchain');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const NodeRSA = require('node-rsa');
require('dotenv').config();

// Tự động phát hiện IP mạng WiFi
function getWiFiIP() {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const [name, addresses] of Object.entries(interfaces)) {
        for (const address of addresses) {
            if (address.family === 'IPv4' && !address.internal) {
                if (name.toLowerCase().includes('wi-fi') || 
                    name.toLowerCase().includes('wireless') ||
                    name.toLowerCase().includes('wlan')) {
                    return address.address;
                }
            }
        }
    }
    return 'localhost'; // Fallback
}

const wifiIP = getWiFiIP();
console.log(`🌐 Phát hiện IP WiFi: ${wifiIP}`);

// Cấu hình CORS chi tiết (cho phép cả localhost và IP)
const corsOptions = {
    origin: [
        'http://localhost:5500', 
        'http://127.0.0.1:5500', 
        'http://localhost:3000',
        `http://${wifiIP}:5500`,  // IP WiFi tự động phát hiện (frontend)
        `http://${wifiIP}:5000`,  // IP WiFi tự động phát hiện (backend)
        `http://${wifiIP}:5500/supply-chain-blockchain/frontend`,  // Full path frontend
        'http://172.16.16.65:5500',  // IP cũ (backup)
        'http://172.16.16.65:5000',  // IP cũ backend (backup)
        'http://172.16.16.65:5500/supply-chain-blockchain/frontend',  // Full path cũ
        // Thêm các IP động từ biến môi trường
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.SERVER_PORT || '5500'}` : null,
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.BACKEND_PORT || '5000'}` : null,
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.SERVER_PORT || '5500'}/supply-chain-blockchain/frontend` : null
    ].filter(Boolean), // Loại bỏ null values
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
    credentials: true
};

// Hàm để log chi tiết request
const logRequest = (req) => {
    console.log(`
🔍 Request Details:
- URL: ${req.method} ${req.url}
- Headers: ${JSON.stringify(req.headers)}
- Body: ${JSON.stringify(req.body)}
- Query: ${JSON.stringify(req.query)}
- Params: ${JSON.stringify(req.params)}
`);
};

const app = express();
const httpServer = http.createServer(app);

// Thiết lập Socket.IO với CORS
const io = new Server(httpServer, {
    cors: corsOptions
});

// Biến global để truy cập io từ các routes
global.io = io;

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🔌 Client kết nối:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client ngắt kết nối:', socket.id);
    });
    
    // Client có thể subscribe vào sản phẩm cụ thể
    socket.on('subscribe:product', (productId) => {
        const room = `product:${productId}`;
        socket.join(room);
        console.log(`📦 Client ${socket.id} đã join room: ${room}`);
        console.log(`📦 Rooms của client ${socket.id}:`, Array.from(socket.rooms));
    });
    
    socket.on('unsubscribe:product', (productId) => {
        socket.leave(`product:${productId}`);
        console.log(`📦 Client ${socket.id} bỏ theo dõi sản phẩm: ${productId}`);
    });
});

// Middleware để log tất cả requests
app.use((req, res, next) => {
    console.log(`\n📝 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(cors(corsOptions));

// Custom response handler
app.use((req, res, next) => {
    const originalJson = res.json;
    res.json = function(data) {
        console.log(`\n📤 Response for ${req.method} ${req.url}:`, data);
        return originalJson.call(this, data);
    };
    next();
});

app.use(express.json());

// Middleware xử lý lỗi JSON parsing
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
        return res.status(400).json({
            message: 'Dữ liệu không đúng định dạng JSON',
            details: err.message
        });
    }
    next(err);
});

// Khởi tạo blockchain với difficulty = 4 (4 chữ số 0 đầu tiên)
// Có thể thay đổi difficulty: 2 = dễ (vài giây), 4 = trung bình (10-30s), 5 = khó (1-2 phút)
const supplyChain = new Blockchain(4);
console.log('✅ Blockchain đã khởi tạo với Proof of Work (difficulty = 4)');

// Cấu hình SQL Server
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

// Kết nối SQL Server
async function connectToDatabase() {
    try {
        await sql.connect(config);
        console.log('✅ Đã kết nối SQL Server thành công');
    } catch (err) {
        console.error('❌ Lỗi kết nối SQL Server:', err);
        throw err;
    }
}

// Gọi hàm kết nối khi khởi động server
connectToDatabase();

// Store để quản lý active sessions
const activeSessions = new Map();

// Middleware xác thực JWT với session tracking
const authenticateToken = (req, res, next) => {
    try {
        console.log('\n🔒 Authenticating request');
        const authHeader = req.headers['authorization'];
        const sessionId = req.headers['x-session-id']; // Session ID từ frontend
        console.log('Authorization header:', authHeader);
        console.log('Session ID:', sessionId);

        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            console.log('❌ No token found');
            return res.status(401).json({
                success: false,
                message: 'Không tìm thấy token'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET is not set');
            return res.status(500).json({
                success: false,
                message: 'Lỗi cấu hình server'
            });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                console.log('❌ Invalid token:', err.message);
                return res.status(403).json({
                    success: false,
                    message: 'Token không hợp lệ hoặc đã hết hạn'
                });
            }
            
            // Kiểm tra session conflict nếu có sessionId
            if (sessionId && activeSessions.has(sessionId)) {
                const existingSession = activeSessions.get(sessionId);
                if (existingSession.username !== user.username || existingSession.role !== user.role) {
                    console.log('⚠️ Session conflict detected:', {
                        sessionId,
                        existing: existingSession,
                        current: { username: user.username, role: user.role }
                    });
                    // Không block request, chỉ log warning
                }
            }
            
            // Cập nhật session info
            if (sessionId) {
                activeSessions.set(sessionId, {
                    username: user.username,
                    role: user.role,
                    lastActivity: Date.now()
                });
            }
            
            console.log('✅ Valid token. User:', {
                username: user.username,
                role: user.role,
                sessionId: sessionId || 'no-session'
            });
            req.user = user;
            req.sessionId = sessionId;
            next();
        });
    } catch (error) {
        console.error('❌ Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi xác thực',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
        });
    }
};

// API đăng ký
app.post('/register', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        // Validate input
        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin: username, password, và role' });
        }

        // Validate role
        const validRoles = ['farmer', 'shipper', 'factory', 'retailer'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ 
                message: 'Role không hợp lệ. Role phải là một trong các giá trị: farmer, shipper, factory, retailer' 
            });
        }

        const pool = await sql.connect(config);
        
        // Kiểm tra username đã tồn tại
        const checkUser = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM users WHERE username = @username');
        
        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ message: 'Username đã tồn tại' });
        }

        // ========== TẠO CẶP KHÓA RSA ==========
        console.log('🔐 Tạo cặp khóa RSA cho user:', username);
        const key = new NodeRSA({b: 2048}); // 2048-bit key
        const publicKey = key.exportKey('public');
        const privateKey = key.exportKey('private');
        
        // ========== MÃ HÓA PRIVATE KEY BẰNG PASSWORD ==========
        const algorithm = 'aes-256-cbc';
        const keyBuffer = crypto.scryptSync(password, 'salt', 32); // Derive key từ password
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
        
        let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
        encryptedPrivateKey += cipher.final('hex');
        encryptedPrivateKey = iv.toString('hex') + ':' + encryptedPrivateKey; // Lưu kèm IV
        
        console.log('✅ Đã mã hóa private key');

        // Mã hóa password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Thêm user mới VÀ KHÓA
        await pool.request()
            .input('username', sql.VarChar, username)
            .input('password_hash', sql.VarChar, hashedPassword)
            .input('role', sql.VarChar, role)
            .input('publicKey', sql.NVarChar(sql.MAX), publicKey)
            .input('encryptedPrivateKey', sql.NVarChar(sql.MAX), encryptedPrivateKey)
            .query('INSERT INTO users (username, password_hash, role, publicKey, encryptedPrivateKey) VALUES (@username, @password_hash, @role, @publicKey, @encryptedPrivateKey)');

        res.status(201).json({ 
            message: 'Đăng ký thành công',
            publicKey: publicKey // Trả về public key luôn
        });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ message: 'Lỗi server: ' + error.message });
    }
});

// API đăng nhập
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const pool = await sql.connect(config);
        
        // Tìm user VÀ KHÓA
        const result = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM users WHERE username = @username');

        const user = result.recordset[0];
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ message: 'Thông tin đăng nhập không đúng' });
        }

        // ========== GIẢI MÃ PRIVATE KEY ==========
        let privateKey = null;
        if (user.encryptedPrivateKey && user.publicKey) {
            try {
                console.log('🔓 Giải mã private key cho user:', username);
                const algorithm = 'aes-256-cbc';
                const keyBuffer = crypto.scryptSync(password, 'salt', 32);
                
                // Tách IV và encrypted data
                const parts = user.encryptedPrivateKey.split(':');
                const iv = Buffer.from(parts[0], 'hex');
                const encryptedData = parts[1];
                
                const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
                privateKey = decipher.update(encryptedData, 'hex', 'utf8');
                privateKey += decipher.final('utf8');
                
                console.log('✅ Đã giải mã private key thành công');
            } catch (decryptError) {
                console.error('❌ Lỗi giải mã private key:', decryptError.message);
                // Không trả về lỗi, chỉ log. User vẫn đăng nhập được nhưng không có privateKey
            }
        }

        // Tạo JWT token
        const token = jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Trả về TOKEN, USER INFO, VÀ PRIVATE KEY
        res.json({ 
            token, 
            user: {
                username: user.username, 
                role: user.role,
                publicKey: user.publicKey || null
            },
            privateKey: privateKey // Private key đã giải mã
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ message: 'Lỗi server: ' + error.message });
    }
});

// API thêm sự kiện mới vào blockchain
app.post('/api/record', authenticateToken, async (req, res) => {
    try {
        console.log('\n📦 Processing new record request:');
        logRequest(req);

        // Validate request body
        if (!req.body || Object.keys(req.body).length === 0) {
            console.log('❌ Empty request body');
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu gửi lên trống'
            });
        }

        // ========== VERIFY SIGNATURE (HYBRID MODEL) ==========
        let actualData = req.body;
        let signature = null;
        let senderPublicKey = null;
        
        // Check if payload contains signature (new format with digital signature)
        if (req.body.data && req.body.signature && req.body.publicKey) {
            console.log('🔐 Phát hiện giao dịch có chữ ký số - Bắt đầu verify...');
            
            actualData = req.body.data;
            signature = req.body.signature;
            senderPublicKey = req.body.publicKey;
            
            // Verify signature bằng NodeRSA
            try {
                const key = new NodeRSA();
                key.importKey(senderPublicKey, 'public');
                
                const dataString = JSON.stringify(actualData);
                const isValid = key.verify(
                    Buffer.from(dataString, 'utf8'),
                    Buffer.from(signature, 'hex'),
                    'utf8',
                    'hex'
                );
                
                if (!isValid) {
                    console.log('❌ Chữ ký không hợp lệ!');
                    return res.status(400).json({
                        success: false,
                        message: 'Chữ ký số không hợp lệ. Giao dịch bị từ chối!',
                        error: 'INVALID_SIGNATURE'
                    });
                }
                
                console.log('✅ Chữ ký hợp lệ! Giao dịch được chấp nhận.');
                
                // (Tùy chọn) Verify xem publicKey có khớp với user trong DB không
                try {
                    const pool = await sql.connect(config);
                    const userRecord = await pool.request()
                        .input('username', sql.VarChar, req.user.username)
                        .query('SELECT publicKey FROM users WHERE username = @username');
                    
                    if (userRecord.recordset.length > 0 && userRecord.recordset[0].publicKey) {
                        const dbPublicKey = userRecord.recordset[0].publicKey;
                        if (dbPublicKey !== senderPublicKey) {
                            console.log('⚠️ Public key không khớp với DB! Nghi vấn giả mạo.');
                            return res.status(400).json({
                                success: false,
                                message: 'Public key không khớp với tài khoản. Giao dịch bị từ chối!',
                                error: 'PUBLIC_KEY_MISMATCH'
                            });
                        }
                        console.log('✅ Public key khớp với DB.');
                    }
                } catch (dbError) {
                    console.error('⚠️ Không thể verify public key với DB:', dbError.message);
                    // Không block transaction, chỉ warning
                }
                
            } catch (verifyError) {
                console.error('❌ Lỗi khi verify signature:', verifyError);
                return res.status(400).json({
                    success: false,
                    message: 'Không thể xác minh chữ ký số',
                    error: verifyError.message
                });
            }
        } else {
            console.log('⚠️ Giao dịch KHÔNG có chữ ký số (old format hoặc user chưa có keypair)');
            // Cho phép giao dịch cũ vẫn hoạt động (backward compatible)
        }

        // Lấy role từ token
        const role = req.user.role;
        
        const { productName, batchNumber, location } = actualData;

        // Farmer phải nhập productName+location, các role khác chỉ cần batchNumber+location
        if (role === 'farmer') {
            if (!productName || !location) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc',
                    required: ['productName', 'location']
                });
            }
        } else {
            if (!batchNumber || !location) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc',
                    required: ['batchNumber', 'location']
                });
            }
        }

        // --- Định nghĩa/action ---
        let action = actualData.action;
        if (!action) {
            switch(role) {
                case 'farmer': action = 'harvest'; break;
                case 'shipper': action = 'transport'; break;
                case 'factory': action = 'process'; break;
                case 'retailer': action = 'sell'; break;
                default: action = 'create_product';
            }
        }

        // Validate & lookup theo batchNumber (với non-farmer)
        let productInfo = null;
        if (role !== 'farmer') {
            productInfo = batchNumber && supplyChain.getProductInfoByBatchNumber(batchNumber);
            if (!productInfo) {
                return res.status(400).json({
                    success: false,
                    message: `batchNumber '${batchNumber}' không tồn tại trong blockchain. Hãy nhập đúng batchNumber!`
                });
            }
            
            // Kiểm tra nếu shipper đã delivered thì không cho cập nhật nữa
            if (role === 'shipper') {
                const currentStatus = supplyChain.getShippingStatus(batchNumber);
                if (currentStatus === 'delivered') {
                    return res.status(400).json({
                        success: false,
                        message: 'Không thể cập nhật: Đơn hàng đã giao xong rồi!',
                        hint: 'Batch này đã hoàn tất vận chuyển'
                    });
                }
            }
            
            // Kiểm tra workflow
            const workflowCheck = supplyChain.canRoleUpdateBatch(batchNumber, role);
            if (!workflowCheck.allowed) {
                return res.status(400).json({
                    success: false,
                    message: `Không thể cập nhật: ${workflowCheck.reason}`,
                    hint: 'Vui lòng đợi bước trước hoàn thành'
                });
            }
        }

        console.log('🔍 Smart Contract validation input:', {
            role,
            action,
            data: actualData,
            actor: req.user.username
        });
        try {
            const validation = supplyChain.validateTransaction(role, action, actualData, req.user.username);
            if (!validation.success) {
                console.log('❌ Smart Contract validation failed:', validation.error);
                return res.status(400).json({
                    success: false,
                    message: 'Smart Contract validation failed',
                    error: validation.error
                });
            }
        } catch (validationError) {
            console.error('❌ Smart Contract validation error:', validationError);
            return res.status(500).json({
                success: false,
                message: 'Smart Contract validation error',
                error: validationError.message
            });
        }

        // Nếu là farmer, kiểm tra tồn tại productId (nhưng vẫn cho phép cập nhật!)
        if (role === 'farmer') {
            const exists = supplyChain.productExists(productName); // Changed from productId to productName
            if (exists) {
                console.log(`⚠️ Farmer đang cập nhật sản phẩm đã tồn tại: ${productName}`);
            }
        }

        // Status processing (giữ logic cũ cho các role)
        let status = '';
        switch(role) {
            case 'farmer':
                if (!actualData.quantity || !actualData.quality) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin cho nông dân',
                        required: ['quantity', 'quality']
                    });
                }
                status = `Thu hoạch: ${actualData.quantity}kg, Loại: ${actualData.quality}`;
                break;
            case 'shipper':
                if (!actualData.fromLocation || !actualData.toLocation || !actualData.status) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin vận chuyển',
                        required: ['fromLocation', 'toLocation', 'status']
                    });
                }
                // Map status sang tiếng Việt
                const statusMap = {
                    'pickup': 'Đã lấy hàng',
                    'intransit': 'Đang vận chuyển',
                    'delivered': 'Đã giao hàng'
                };
                const vnStatus = statusMap[actualData.status] || actualData.status;
                status = `${vnStatus} - Từ: ${actualData.fromLocation} → ${actualData.toLocation}`;
                break;
            case 'factory':
                if (!actualData.processType || !actualData.batchNumber) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin sản xuất',
                        required: ['processType', 'batchNumber']
                    });
                }
                status = `Sản xuất: ${actualData.processType}, Lô: ${actualData.batchNumber}`;
                break;
            case 'retailer':
                if (!actualData.quantity || !actualData.price) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin bán hàng',
                        required: ['quantity', 'price']
                    });
                }
                status = `Bán: ${actualData.quantity}kg, Giá ${actualData.price}`;
                break;
        }

        // Mining/thêm block: farmer theo productId, còn lại theo batchNumber
        const timestamp = Date.now();
        let dataForBlock;
        if (role === 'farmer') {
            dataForBlock = {
                productName, // Changed from productId to productName
                location,
                status,
                actor: req.user.username,
                timestamp,
                role: req.user.role,
                ...actualData // Dùng actualData thay vì req.body
            };
        } else {
            dataForBlock = {
                batchNumber,
                productName: productInfo ? productInfo.productName : (actualData.productName || null), // để hiển thị nếu có
                location,
                status,
                actor: req.user.username,
                timestamp,
                role: req.user.role,
                ...actualData // Dùng actualData thay vì req.body
            };
        }
        
        // ========== THÊM SIGNATURE VÀO BLOCK (NẾU CÓ) ==========
        if (signature && senderPublicKey) {
            dataForBlock.signature = signature;
            dataForBlock.publicKey = senderPublicKey;
            console.log('🔐 Đã thêm chữ ký số vào block data');
        }
        
        const newBlock = supplyChain.addBlock(dataForBlock);

        // Sau khi thêm block, nếu chưa có trường qrCode thì sinh và cập nhật vào block ngay
        if (newBlock && !newBlock.data.qrCode && newBlock.data.batchNumber) {
            try {
                const serverIP = process.env.SERVER_IP || wifiIP;
                const backendPort = process.env.BACKEND_PORT || '5000';
                const url = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(newBlock.data.batchNumber)}`;
                const qrCode = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a237e', light: '#FFFFFF' }});
                newBlock.data.qrCode = qrCode;
                // Lưu lại chuỗi để bất kỳ ai truy lịch sử sau này đều có QR
                supplyChain.saveBlockchain();
            } catch (err) { /* bơ lỗi tạo QR cho block không ảnh hưởng logic */ }
        }

        // Emit realtime với batchNumber
        const eventData = {
            batchNumber: dataForBlock.batchNumber,
            productName: dataForBlock.productName, // Changed from productId to productName
            blockIndex: newBlock.index,
            blockHash: newBlock.hash,
            status,
            location,
            actor: req.user.username,
            timestamp,
            qrCode: dataForBlock.qrCode || null
        };
        const room = dataForBlock.batchNumber ? `product:${dataForBlock.batchNumber}` : undefined;
        if (room) {
            global.io.in(room).emit('blockchain:update', eventData);
        }
        global.io.emit('blockchain:update', { type: 'newBlock', batchNumber: dataForBlock.batchNumber, blockIndex: newBlock.index });

        res.json({
            success: true,
            message: 'Thêm thông tin thành công và đã mine block',
            data: {
                blockIndex: newBlock.index,
                blockHash: newBlock.hash,
                nonce: newBlock.nonce,
                miningTime: `${((Date.now() - timestamp) / 1000).toFixed(2)}s`,
                timestamp,
                difficulty: supplyChain.difficulty,
                qrCode: newBlock.data.qrCode || null, // trả đúng QR vừa sinh (sau update block)
                batchNumber: newBlock.data.batchNumber,
                productName: newBlock.data.productName
            }
        });
    } catch (error) {
        console.error('Lỗi thêm record:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message
        });
    }
});

// API lấy lịch sử cập nhật của user
app.get('/api/user-history/:username', authenticateToken, async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) {
            return res.status(400).json({ message: 'Thiếu tên người dùng' });
        }

        // Kiểm tra người dùng chỉ có thể xem lịch sử của chính mình
        if (req.user.username !== username) {
            return res.status(403).json({ message: 'Không có quyền xem lịch sử của người khác' });
        }

        const userRecords = await Promise.all(supplyChain.chain
            .slice(1) // Bỏ qua genesis block
            .filter(block => block.data && block.data.actor === username)
            .map(async block => {
                let qrCode = block.data.qrCode || null;
                let batchNum = block.data.batchNumber;
                // Nếu là block của farmer không có batchNumber nhưng có productName,
                // tìm block đầu cùng productName để lấy batchNumber
                if (!batchNum && block.data.productName) {
                    const batchBlock = supplyChain.chain.find(b => b.data && b.data.productName === block.data.productName && b.data.batchNumber);
                    if (batchBlock) batchNum = batchBlock.data.batchNumber;
                }
                // Nếu vẫn chưa có QR code mà đã xác định batchNumber, sinh QR cho batch này
                if (!qrCode && batchNum) {
                    try {
                        const serverIP = process.env.SERVER_IP || wifiIP;
                        const backendPort = process.env.BACKEND_PORT || '5000';
                        const url = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(batchNum)}`;
                        qrCode = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1a237e', light: '#FFFFFF' }});
                    } catch(err) { qrCode = null; }
                }
                return {
                    productName: block.data.productName,
                    batchNumber: batchNum || block.data.batchNumber,
                    status: block.data.status,
                    location: block.data.location,
                    timestamp: block.timestamp || block.data.timestamp,
                    role: block.data.role,
                    actor: block.data.actor,
                    details: block.data.details || {},
                    qrCode: qrCode,
                    // Thêm thông tin vận chuyển nếu có
                    fromLocation: block.data.fromLocation,
                    toLocation: block.data.toLocation,
                    transportStatus: block.data.status
                };
            })
        );
        userRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(userRecords);
    } catch (error) {
        console.error('Lỗi lấy lịch sử user:', error);
        res.status(500).json({ message: 'Lỗi server: ' + error.message });
    }
});

// API lấy lịch sử sản phẩm THEO BATCHNUMBER
app.get('/api/history/:batchNumber', (req, res) => {
    try {
        const { batchNumber } = req.params;
        if (!batchNumber) {
            return res.status(400).json({ message: 'Thiếu batch number' });
        }

        const history = supplyChain.getProduct(batchNumber);
        if (!history || history.length === 0) {
            return res.json([]);
        }
        res.json(history);
    } catch (error) {
        console.error('Lỗi lấy lịch sử:', error);
        res.status(500).json({ message: 'Lỗi server: ' + error.message });
    }
});

// API xem toàn bộ blockchain (cho demo)
app.get('/api/full-chain', (req, res) => {
    res.json(supplyChain.getFullChain());
});

// API lấy thống kê blockchain
app.get('/api/blockchain/stats', (req, res) => {
    try {
        const stats = supplyChain.getBlockchainStats();
        
        // ========== THÊM THỐNG KÊ CHỮ KÝ SỐ ==========
        let signedBlocks = 0;
        let unsignedBlocks = 0;
        
        supplyChain.chain.forEach(block => {
            if (block.data && block.data.signature && block.data.publicKey) {
                signedBlocks++;
            } else if (block.index !== 0) { // Bỏ qua Genesis block
                unsignedBlocks++;
            }
        });
        
        stats.signedBlocks = signedBlocks;
        stats.unsignedBlocks = unsignedBlocks;
        stats.signaturePercentage = supplyChain.chain.length > 1 
            ? Math.round((signedBlocks / (supplyChain.chain.length - 1)) * 100) 
            : 0;
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Lỗi lấy stats:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy thống kê blockchain',
            error: error.message
        });
    }
});

// API validate blockchain
app.get('/api/blockchain/validate', (req, res) => {
    try {
        console.log('\n🔍 Yêu cầu validate blockchain từ client...');
        const isValid = supplyChain.isChainValid();
        
        // ========== KIỂM TRA CHỮ KÝ SỐ (TÙY CHỌN) ==========
        let signatureWarnings = [];
        let verifiedSignatures = 0;
        let invalidSignatures = 0;
        
        for (let i = 1; i < supplyChain.chain.length; i++) {
            const block = supplyChain.chain[i];
            
            if (block.data && block.data.signature && block.data.publicKey) {
                try {
                    const NodeRSA = require('node-rsa');
                    const key = new NodeRSA();
                    key.importKey(block.data.publicKey, 'public');
                    
                    // Tạo lại data để verify (loại bỏ signature và publicKey)
                    const dataToVerify = {...block.data};
                    delete dataToVerify.signature;
                    delete dataToVerify.publicKey;
                    
                    const dataString = JSON.stringify(dataToVerify);
                    const isSignatureValid = key.verify(
                        Buffer.from(dataString, 'utf8'),
                        Buffer.from(block.data.signature, 'hex'),
                        'utf8',
                        'hex'
                    );
                    
                    if (isSignatureValid) {
                        verifiedSignatures++;
                    } else {
                        invalidSignatures++;
                        signatureWarnings.push(`Block #${i}: Chữ ký không hợp lệ`);
                    }
                } catch (err) {
                    signatureWarnings.push(`Block #${i}: Lỗi verify signature - ${err.message}`);
                }
            }
        }
        
        res.json({
            success: true,
            isValid,
            message: isValid ? 'Blockchain hợp lệ!' : 'Blockchain không hợp lệ!',
            stats: {
                totalBlocks: supplyChain.chain.length,
                difficulty: supplyChain.difficulty,
                latestBlockHash: supplyChain.getLatestBlock().hash,
                verifiedSignatures,
                invalidSignatures,
                signatureWarnings
            }
        });
    } catch (error) {
        console.error('Lỗi validate:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi kiểm tra blockchain',
            error: error.message
        });
    }
});

// API lấy block cụ thể theo index
app.get('/api/blockchain/block/:index', (req, res) => {
    try {
        const index = parseInt(req.params.index);
        
        if (isNaN(index) || index < 0 || index >= supplyChain.chain.length) {
            return res.status(404).json({
                success: false,
                message: `Block #${req.params.index} không tồn tại`
            });
        }
        
        const block = supplyChain.chain[index];
        res.json({
            success: true,
            data: block
        });
    } catch (error) {
        console.error('Lỗi lấy block:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy thông tin block',
            error: error.message
        });
    }
});

// API reset blockchain (chỉ dùng cho demo/testing)
app.post('/api/blockchain/reset', authenticateToken, (req, res) => {
    try {
        // Chỉ cho phép reset nếu có quyền (có thể thêm role check)
        console.log('\n🔄 Reset blockchain...');
        
        // Xóa file blockchain
        const fs = require('fs');
        const path = require('path');
        const dataFile = path.join(__dirname, 'blockchain_data.json');
        
        if (fs.existsSync(dataFile)) {
            fs.unlinkSync(dataFile);
            console.log('🗑️  Đã xóa file blockchain cũ');
        }
        
        // Tạo blockchain mới
        supplyChain.chain = [supplyChain.createGenesisBlock()];
        supplyChain.pendingTransactions = [];
        supplyChain.saveBlockchain();
        
        res.json({
            success: true,
            message: 'Đã reset blockchain thành công',
            data: {
                totalBlocks: supplyChain.chain.length,
                genesisBlock: supplyChain.chain[0]
            }
        });
    } catch (error) {
        console.error('Lỗi reset blockchain:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi reset blockchain',
            error: error.message
        });
    }
});

// ----- SỬA: TRA CỨU THEO batchNumber THAY CHO PRODUCTID ------
// Hiển thị lịch sử chuỗi cung ứng theo batchNumber
app.get('/product/:batchNumber', async (req, res) => {
    try {
        const { batchNumber } = req.params;

        if (!batchNumber) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head><meta charset="UTF-8"><title>Lỗi</title></head>
                <body><h1>❌ Thiếu batchNumber</h1></body></html>
            `);
        }

        // Lấy lịch sử chuỗi cung ứng của batch đó
        const history = supplyChain.getProduct(batchNumber);
        if (!history || history.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head><meta charset="UTF-8"><title>BATCH không tồn tại</title></head>
                <body><h1>🔍 Không tìm thấy batch: ${batchNumber}</h1><p>Không có thông tin chuỗi cung ứng.</p></body></html>
            `);
        }
        const productInfo = history[0]; // Block đầu tiên
        const lastUpdate = history[history.length - 1]; // Block mới nhất
        // (copy phần render UI như cũ)
        // ... Keep the existing HTML rendering code, just swap productId -> batchNumber appropriately ...
        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tra cứu batch ${batchNumber} - Supply Chain Blockchain</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1a237e 0%, #3949ab 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header .product-id {
            font-size: 1.2em;
            opacity: 0.9;
            background: rgba(255,255,255,0.2);
            padding: 8px 16px;
            border-radius: 20px;
            display: inline-block;
        }
        .content {
            padding: 30px;
        }
        .info-card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #1a237e;
        }
        .info-card h3 {
            color: #1a237e;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            font-weight: 600;
            color: #555;
        }
        .info-value {
            color: #333;
        }
        .timeline {
            margin-top: 30px;
        }
        .timeline h3 {
            color: #1a237e;
            margin-bottom: 20px;
            font-size: 1.3em;
        }
        .timeline-item {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
            position: relative;
            margin-left: 20px;
        }
        .timeline-item::before {
            content: '';
            position: absolute;
            left: -20px;
            top: 20px;
            width: 10px;
            height: 10px;
            background: #1a237e;
            border-radius: 50%;
        }
        .timeline-item::after {
            content: '';
            position: absolute;
            left: -15px;
            top: 30px;
            width: 2px;
            height: calc(100% + 10px);
            background: #e0e0e0;
        }
        .timeline-item:last-child::after {
            display: none;
        }
        .timeline-actor {
            font-weight: 600;
            color: #1a237e;
        }
        .timeline-time {
            color: #666;
            font-size: 0.9em;
        }
        .timeline-status {
            margin-top: 5px;
            color: #333;
        }
        .qr-section {
            text-align: center;
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .qr-code {
            margin: 20px 0;
        }
        .qr-code img {
            max-width: 200px;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            background: #f8f9fa;
        }
        @media (max-width: 600px) {
            .container { margin: 10px; }
            .header h1 { font-size: 2em; }
            .content { padding: 20px; }
            .info-row { flex-direction: column; }
            .info-label { margin-bottom: 5px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Tra cứu batchNumber</h1>
            <div class="product-id">${batchNumber}</div>
        </div>
        <div class="content">
            <div class="info-card">
                            <h3>📊 Thông tin batch</h3>
                <div class="info-row"><span class="info-label">Batch Number:</span><span class="info-value">${batchNumber}</span></div>
                <div class="info-row"><span class="info-label">Tên sản phẩm:</span><span class="info-value">${productInfo.productName || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Trạng thái hiện tại:</span><span class="info-value">${lastUpdate.status || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Vị trí hiện tại:</span><span class="info-value">${lastUpdate.location || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Người cập nhật cuối:</span><span class="info-value">${lastUpdate.actor || 'N/A'}</span></div>
                <div class="info-row"><span class="info-label">Thời gian cập nhật:</span><span class="info-value">${new Date(lastUpdate.timestamp).toLocaleString('vi-VN')}</span></div>
                <div class="info-row"><span class="info-label">Số block trong chuỗi:</span><span class="info-value">${history.length}</span></div>
            </div>
            <div class="timeline">
                <h3>📈 Lịch sử chuỗi cung ứng</h3>
                ${history.map((item, index) => {
                    // Map trạng thái sang tiếng Việt
                    const statusVNMap = {
                        'pickup': 'Đã lấy hàng',
                        'intransit': 'Đang vận chuyển',
                        'delivered': 'Đã giao hàng'
                    };
                    
                    let displayStatus = item.status || 'N/A';
                    
                    // Nếu là shipper, check trong status text có chứa các từ khóa
                    if (item.role === 'shipper' && item.status) {
                        // Tìm status code từ item
                        for (const [code, vnText] of Object.entries(statusVNMap)) {
                            if (item.status.includes(code) || (item.details && item.details.status === code)) {
                                // Extract from/to location từ status string
                                const parts = item.status.split('-');
                                if (parts.length > 1) {
                                    displayStatus = vnText + ' -' + parts.slice(1).join('-');
                                } else {
                                    displayStatus = vnText;
                                }
                                break;
                            }
                        }
                    }
                    
                    return `
                    <div class="timeline-item">
                        <div class="timeline-actor">${item.actor || 'Unknown'} - ${item.role || 'N/A'}</div>
                        <div class="timeline-time">${new Date(item.timestamp).toLocaleString('vi-VN')}</div>
                        <div class="timeline-status">${displayStatus}</div>
                        ${item.batchNumber ? `<div style="color: #0277bd; font-size: 0.9em; margin-top: 3px;">🏷️ Batch: ${item.batchNumber}</div>` : ''}
                        ${item.location ? `<div style="color: #666; font-size: 0.9em; margin-top: 5px;">📍 ${item.location}</div>` : ''}
                    </div>
                    `;
                }).join('')}
            </div>
            ${(productInfo.qrCode ? `
            <div class="qr-section">
                <h3>📱 QR Code sản phẩm</h3>
                <div class="qr-code">
                    <img src="${productInfo.qrCode}" alt="QR Code cho batch ${batchNumber}">
                </div>
                <p>Quét QR code này để chia sẻ thông tin batch</p>
            </div>
            ` : '')}
        </div>
        <div class="footer">
            <p>Supply Chain Blockchain System</p>
            <p>Thời gian tra cứu: ${new Date().toLocaleString('vi-VN')}</p>
        </div>
    </div>
</body>
</html>
        `;
        res.send(html);
    } catch (error) {
        console.error('Lỗi serve trang tra cứu:', error);
        res.status(500).send('<h1>❌ Không thể tải thông tin batch</h1>');
    }
});

// Tạo QR code cho batch (không tạo cho productId nữa!)
app.get('/api/qrcode/:batchNumber', async (req, res) => {
    try {
        const { batchNumber } = req.params;
        if (!batchNumber) {
            return res.status(400).json({ success: false, message: 'Thiếu batch number' });
        }
        const history = supplyChain.getProduct(batchNumber);
        if (!history || history.length === 0) {
            return res.status(404).json({ success: false, message: `Batch '${batchNumber}' không tồn tại trong blockchain` });
        }
        // URL cho batch
        const serverIP = process.env.SERVER_IP || wifiIP;
        const backendPort = process.env.BACKEND_PORT || '5000';
        const queryURL = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(batchNumber)}`;
        // Tạo QR code
        const qrCodeDataURL = await QRCode.toDataURL(queryURL, {
            width: 400,
            margin: 2,
            color: { dark: '#1a237e', light: '#FFFFFF' }
        });
        res.json({
            success: true,
            batchNumber: batchNumber,
            qrCode: qrCodeDataURL,
            url: queryURL,
            blockCount: history.length
        });
    } catch (error) {
        console.error('Lỗi tạo QR code:', error);
        res.status(500).json({ success: false, message: 'Lỗi tạo QR code', error: error.message });
    }
});

// API test kết nối SQL Server
app.get('/test-db', async (req, res) => {
    try {
        console.log('\n🔍 Testing database connection...');
        const pool = await sql.connect(config);
        console.log('✅ Connected to database');

        console.log('📊 Querying user count...');
        const result = await pool.request().query('SELECT COUNT(*) as count FROM users');
        console.log('Query result:', result.recordset[0]);

        res.json({
            success: true,
            message: 'Kết nối SQL Server thành công',
            data: {
                userCount: result.recordset[0].count,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Database error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi kết nối database',
            error: process.env.NODE_ENV === 'development' ? {
                message: error.message,
                code: error.code,
                state: error.state
            } : 'Internal Server Error'
        });
    }
});

// 🤖 SMART CONTRACT API ENDPOINTS

// API lấy thông tin Smart Contract
app.get('/api/smart-contract/info', (req, res) => {
    try {
        const smartContract = supplyChain.getSmartContract();
        res.json({
            success: true,
            data: {
                rules: smartContract.getAllRules(),
                validationStats: smartContract.getValidationStats()
            }
        });
    } catch (error) {
        console.error('Lỗi lấy thông tin Smart Contract:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy thông tin Smart Contract',
            error: error.message
        });
    }
});

// API lấy quyền hạn của role
app.get('/api/smart-contract/permissions/:role', (req, res) => {
    try {
        const { role } = req.params;
        const permissions = supplyChain.getRolePermissions(role);
        
        res.json({
            success: true,
            data: {
                role: role,
                permissions: permissions,
                hasPermissions: permissions.length > 0
            }
        });
    } catch (error) {
        console.error('Lỗi lấy quyền hạn:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy quyền hạn',
            error: error.message
        });
    }
});

// API kiểm tra quyền hạn
app.get('/api/smart-contract/check-permission/:role/:action', (req, res) => {
    try {
        const { role, action } = req.params;
        const hasPermission = supplyChain.hasPermission(role, action);
        
        res.json({
            success: true,
            data: {
                role: role,
                action: action,
                hasPermission: hasPermission,
                message: hasPermission ? 
                    `Role '${role}' có quyền thực hiện '${action}'` : 
                    `Role '${role}' KHÔNG có quyền thực hiện '${action}'`
            }
        });
    } catch (error) {
        console.error('Lỗi kiểm tra quyền hạn:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi kiểm tra quyền hạn',
            error: error.message
        });
    }
});

// API validate transaction (không thêm vào blockchain)
app.post('/api/smart-contract/validate', (req, res) => {
    try {
        const { role, action, data, actor } = req.body;
        
        if (!role || !action || !data) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc',
                required: ['role', 'action', 'data']
            });
        }

        const validation = supplyChain.validateTransaction(role, action, data, actor || 'unknown');
        
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Lỗi validate transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi validate transaction',
            error: error.message
        });
    }
});

// API lấy lịch sử validation
app.get('/api/smart-contract/validation-history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = supplyChain.getValidationHistory(limit);
        
        res.json({
            success: true,
            data: {
                history: history,
                total: history.length,
                limit: limit
            }
        });
    } catch (error) {
        console.error('Lỗi lấy lịch sử validation:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy lịch sử validation',
            error: error.message
        });
    }
});

// API lấy thống kê Smart Contract
app.get('/api/smart-contract/stats', (req, res) => {
    try {
        const smartContract = supplyChain.getSmartContract();
        const stats = smartContract.getValidationStats();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Lỗi lấy thống kê Smart Contract:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi lấy thống kê Smart Contract',
            error: error.message
        });
    }
});

// API tra cứu truy vết: uniqueId (ưu tiên), batchNumber, gtin, productId
app.get('/api/product-history', async (req, res) => {
    const { uniqueId, batchNumber, gtin, productName } = req.query; // Changed from productId to productName
    let history = [];
    // Ưu tiên truy theo uniqueId → batchNumber → gtin → productName
    if (uniqueId) {
        history = supplyChain.chain.slice(1).filter(b => b.data && b.data.uniqueId === uniqueId);
    } else if (batchNumber) {
        history = supplyChain.chain.slice(1).filter(b => b.data && b.data.batchNumber === batchNumber);
    } else if (gtin) {
        history = supplyChain.chain.slice(1).filter(b => b.data && b.data.gtin === gtin);
    } else if (productName) {
        history = supplyChain.chain.slice(1).filter(b => b.data && b.data.productName === productName);
    }
    res.json(Array.isArray(history) && history.length > 0 ? history.map(b => ({
        blockIndex: b.index,
        hash: b.hash,
        timestamp: b.timestamp,
        ...b.data
    })) : []);
});

// Handle 404 - Đặt sau tất cả các route
app.use((req, res, next) => {
    res.status(404).json({ message: 'API endpoint không tồn tại' });
});

// Error handler middleware - Luôn đặt cuối cùng
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(err.status || 500).json({
        message: 'Lỗi server',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy tại:`);
    console.log(`   - Local: http://localhost:${PORT}`);
    console.log(`   - Network: http://${wifiIP}:${PORT}`);
    console.log(`🔌 WebSocket server đã sẵn sàng cho real-time updates`);
    console.log(`📱 Để truy cập từ điện thoại, sử dụng: http://${wifiIP}:${PORT}`);
});