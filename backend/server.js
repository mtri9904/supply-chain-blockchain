const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const QRCode = require('qrcode');
const { Blockchain } = require('./MyBlockchain');
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

        // Mã hóa password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Thêm user mới
        await pool.request()
            .input('username', sql.VarChar, username)
            .input('password_hash', sql.VarChar, hashedPassword)
            .input('role', sql.VarChar, role)
            .query('INSERT INTO users (username, password_hash, role) VALUES (@username, @password_hash, @role)');

        res.status(201).json({ message: 'Đăng ký thành công' });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// API đăng nhập
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const pool = await sql.connect(config);
        
        // Tìm user
        const result = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM users WHERE username = @username');

        const user = result.recordset[0];
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ message: 'Thông tin đăng nhập không đúng' });
        }

        // Tạo JWT token
        const token = jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, username: user.username, role: user.role });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ message: 'Lỗi server' });
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

        const { productId, location } = req.body;
        
        // Validate required fields
        if (!productId || !location) {
            console.log('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc',
                required: ['productId', 'location']
            });
        }

        // Kiểm tra xem người dùng có quyền ghi dữ liệu không
        if (!req.user || !req.user.role) {
            console.log('❌ Invalid user or role:', req.user);
            return res.status(403).json({
                success: false,
                message: 'Không có quyền ghi dữ liệu'
            });
        }

        const role = req.user.role; // Lấy role từ token thay vì từ request body

        // 🤖 SMART CONTRACT VALIDATION: Validate với Smart Contract
        // Xác định action dựa trên role thay vì dùng mặc định
        let action = req.body.action;
        if (!action) {
            // Tự động xác định action dựa trên role
            switch(role) {
                case 'farmer':
                    action = 'harvest'; // Farmer thực hiện harvest thay vì create_product
                    break;
                case 'shipper':
                    action = 'transport';
                    break;
                case 'factory':
                    action = 'process';
                    break;
                case 'retailer':
                    action = 'sell';
                    break;
                default:
                    action = 'create_product';
            }
        }
        
        console.log('🔍 Smart Contract validation input:', {
            role: role,
            action: action,
            data: req.body,
            actor: req.user.username
        });
        
        try {
            const validation = supplyChain.validateTransaction(role, action, req.body, req.user.username);
            
            if (!validation.success) {
                console.log('❌ Smart Contract validation failed:', validation.error);
                return res.status(400).json({
                    success: false,
                    message: 'Smart Contract validation failed',
                    error: validation.error,
                    smartContractValidation: validation
                });
            }

            console.log('✅ Smart Contract validation passed:', validation.message);
        } catch (validationError) {
            console.error('❌ Smart Contract validation error:', validationError);
            return res.status(500).json({
                success: false,
                message: 'Smart Contract validation error',
                error: validationError.message
            });
        }

        // ✅ VALIDATION MỚI: Kiểm tra sản phẩm đã được farmer tạo chưa
        // Farmer được tạo sản phẩm mới, các role khác chỉ được cập nhật sản phẩm đã có
        if (role !== 'farmer') {
            const productInitialized = supplyChain.isProductInitializedByFarmer(productId);
            
            if (!productInitialized) {
                console.log(`❌ Sản phẩm "${productId}" chưa được farmer tạo`);
                console.log(`🔍 Current user role: ${role}, username: ${req.user.username}`);
                console.log(`🔍 Session ID: ${req.sessionId || 'no-session'}`);
                
                return res.status(400).json({
                    success: false,
                    message: `Sản phẩm "${productId}" chưa tồn tại trong hệ thống`,
                    hint: 'Chỉ nông dân (farmer) mới có thể tạo sản phẩm mới. Các role khác chỉ được cập nhật sản phẩm đã có.',
                    action: 'Vui lòng kiểm tra lại mã sản phẩm hoặc yêu cầu farmer tạo sản phẩm trước.',
                    debug: {
                        currentRole: role,
                        currentUser: req.user.username,
                        sessionId: req.sessionId || 'no-session',
                        productExists: supplyChain.productExists(productId),
                        productInitializedByFarmer: supplyChain.isProductInitializedByFarmer(productId)
                    }
                });
            }
        } else {
            // Nếu là farmer, kiểm tra xem sản phẩm đã tồn tại chưa
            const productExists = supplyChain.productExists(productId);
            if (productExists) {
                console.log(`⚠️ Farmer đang cập nhật sản phẩm đã tồn tại: ${productId}`);
                // Không block, chỉ log warning - farmer có thể cập nhật sản phẩm của mình
            }
        }

        let status = '';

        // Tạo status dựa trên role và validate dữ liệu
        switch(role) {
            case 'farmer':
                if (!req.body.quantity || !req.body.quality) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin cho nông dân',
                        required: ['quantity', 'quality']
                    });
                }
                status = `Thu hoạch ${req.body.quantity}kg, Chất lượng: ${req.body.quality}`;
                break;

            case 'shipper':
                if (!req.body.status || !req.body.fromLocation || !req.body.toLocation) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin vận chuyển',
                        required: ['status', 'fromLocation', 'toLocation']
                    });
                }
                status = `Vận chuyển: ${req.body.status}, Từ: ${req.body.fromLocation}, Đến: ${req.body.toLocation}`;
                break;

            case 'factory':
                if (!req.body.processType || !req.body.batchNumber) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin sản xuất',
                        required: ['processType', 'batchNumber']
                    });
                }
                status = `Sản xuất: ${req.body.processType}, Lô: ${req.body.batchNumber}`;
                break;

            case 'retailer':
                if (!req.body.quantity || !req.body.price) {
                    return res.status(400).json({
                        message: 'Thiếu thông tin bán hàng',
                        required: ['quantity', 'price']
                    });
                }
                status = `Bán ${req.body.quantity}kg, Giá: ${req.body.price}VNĐ/kg`;
                break;

            default:
                return res.status(400).json({
                    message: 'Role không hợp lệ'
                });
        }

        const timestamp = new Date().toISOString();
        
        // Tạo QR Code cho sản phẩm TRƯỚC khi mining (chỉ cho farmer - lần tạo đầu tiên)
        let qrCodeData = null;
        if (role === 'farmer') {
            try {
                // Sử dụng IP WiFi tự động phát hiện và port backend
                const serverIP = process.env.SERVER_IP || wifiIP;
                const backendPort = process.env.BACKEND_PORT || '5000';
                const queryURL = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(productId)}`;
                
                // Tạo QR code dạng Data URL (base64)
                qrCodeData = await QRCode.toDataURL(queryURL, {
                    width: 300,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                console.log(`📱 Đã tạo QR Code cho sản phẩm: ${productId}`);
                console.log(`📱 URL trong QR: ${queryURL}`);
            } catch (qrError) {
                console.error('❌ Lỗi tạo QR code:', qrError);
            }
        }
        
        console.log(`\n⛏️  Mining block mới cho sản phẩm: ${productId}`);
        const startMining = Date.now();
        
        const newBlock = supplyChain.addBlock({
            productId,
            status,
            location,
            actor: req.user.username,
            timestamp,
            role: req.user.role,
            action: action,
            details: {
                ...req.body,
                role: req.user.role,
                recordedAt: timestamp
            },
            qrCode: qrCodeData // Lưu QR code vào block data
        });
        
        const miningTime = ((Date.now() - startMining) / 1000).toFixed(2);

        // Emit real-time event cho tất cả clients đang theo dõi sản phẩm này
        const eventData = {
            productId: productId,
            blockIndex: newBlock.index,
            blockHash: newBlock.hash,
            status: status,
            location: location,
            actor: req.user.username,
            role: req.user.role,
            timestamp: timestamp,
            qrCode: qrCodeData
        };
        
        // Broadcast đến clients đang theo dõi sản phẩm này
        const room = `product:${productId}`;
        const socketsInRoom = await global.io.in(room).fetchSockets();
        console.log(`📡 Số clients trong room '${room}':`, socketsInRoom.length);
        socketsInRoom.forEach(s => console.log(`  - Client: ${s.id}`));
        
        // Emit đến room cụ thể
        global.io.to(room).emit('blockchain:newBlock', eventData);
        console.log(`📡 Đã emit 'blockchain:newBlock' đến room: ${room}`);
        
        // EMIT ĐẾN TẤT CẢ CLIENTS (để test)
        global.io.emit('blockchain:newBlock', eventData);
        console.log(`📡 Đã emit 'blockchain:newBlock' đến TẤT CẢ CLIENTS (test)`);
        
        // Broadcast đến tất cả clients (cho dashboard tổng quan)
        global.io.emit('blockchain:update', {
            type: 'newBlock',
            productId: productId,
            blockIndex: newBlock.index
        });
        
        console.log(`📡 Đã emit 'blockchain:update' cho tất cả clients`);

        res.json({
            success: true,
            message: 'Thêm thông tin thành công và đã mine block',
            data: {
                blockIndex: newBlock.index,
                blockHash: newBlock.hash,
                nonce: newBlock.nonce,
                miningTime: `${miningTime}s`,
                timestamp,
                difficulty: supplyChain.difficulty,
                qrCode: qrCodeData, // QR code (chỉ có khi farmer tạo)
                productId: productId
            }
        });
    } catch (error) {
        console.error('Lỗi thêm record:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi xử lý dữ liệu',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
        });
    }
});

// API lấy lịch sử cập nhật của user
app.get('/api/user-history/:username', authenticateToken, (req, res) => {
    try {
        const { username } = req.params;
        if (!username) {
            return res.status(400).json({ message: 'Thiếu tên người dùng' });
        }

        // Kiểm tra người dùng chỉ có thể xem lịch sử của chính mình
        if (req.user.username !== username) {
            return res.status(403).json({ message: 'Không có quyền xem lịch sử của người khác' });
        }

        const userRecords = supplyChain.chain
            .slice(1) // Bỏ qua genesis block
            .filter(block => block.data && block.data.actor === username)
            .map(block => ({
                productId: block.data.productId,
                status: block.data.status,
                location: block.data.location,
                timestamp: block.timestamp || block.data.timestamp,
                details: block.data.details || {},
                qrCode: block.data.qrCode || null // Thêm QR code nếu có
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sắp xếp mới nhất lên đầu
        
        res.json(userRecords);
    } catch (error) {
        console.error('Lỗi lấy lịch sử user:', error);
        res.status(500).json({ message: 'Lỗi server: ' + error.message });
    }
});

// API lấy lịch sử sản phẩm
app.get('/api/history/:productId', (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({ message: 'Thiếu mã sản phẩm' });
        }

        const history = supplyChain.getProduct(productId);
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
        
        res.json({
            success: true,
            isValid,
            message: isValid ? 'Blockchain hợp lệ!' : 'Blockchain không hợp lệ!',
            stats: {
                totalBlocks: supplyChain.chain.length,
                difficulty: supplyChain.difficulty,
                latestBlockHash: supplyChain.getLatestBlock().hash
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

// API serve trang tra cứu sản phẩm (thay thế cho frontend)
app.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        if (!productId) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Lỗi - Supply Chain Blockchain</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                        .error { background: #ffebee; color: #c62828; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h1>❌ Lỗi</h1>
                        <p>Mã sản phẩm không hợp lệ</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Lấy lịch sử sản phẩm
        const history = supplyChain.getProduct(productId);
        if (!history || history.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Sản phẩm không tồn tại - Supply Chain Blockchain</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                        .not-found { background: #fff3e0; color: #ef6c00; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
                        .qr-code { margin: 20px 0; }
                        .qr-code img { max-width: 200px; height: auto; }
                    </style>
                </head>
                <body>
                    <div class="not-found">
                        <h1>🔍 Sản phẩm không tồn tại</h1>
                        <p>Mã sản phẩm: <strong>${productId}</strong></p>
                        <p>Không tìm thấy thông tin trong blockchain</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Tạo trang tra cứu sản phẩm
        const productInfo = history[0]; // Lấy thông tin đầu tiên
        const lastUpdate = history[history.length - 1]; // Lấy thông tin mới nhất
        
        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tra cứu sản phẩm ${productId} - Supply Chain Blockchain</title>
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
            <h1>🔍 Tra cứu sản phẩm</h1>
            <div class="product-id">${productId}</div>
        </div>
        
        <div class="content">
            <div class="info-card">
                <h3>📊 Thông tin sản phẩm</h3>
                <div class="info-row">
                    <span class="info-label">Mã sản phẩm:</span>
                    <span class="info-value">${productId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Trạng thái hiện tại:</span>
                    <span class="info-value">${lastUpdate.status || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Vị trí hiện tại:</span>
                    <span class="info-value">${lastUpdate.location || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Người cập nhật cuối:</span>
                    <span class="info-value">${lastUpdate.actor || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Thời gian cập nhật:</span>
                    <span class="info-value">${new Date(lastUpdate.timestamp).toLocaleString('vi-VN')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Số block trong chuỗi:</span>
                    <span class="info-value">${history.length}</span>
                </div>
            </div>

            <div class="timeline">
                <h3>📈 Lịch sử chuỗi cung ứng</h3>
                ${history.map((item, index) => `
                    <div class="timeline-item">
                        <div class="timeline-actor">${item.actor || 'Unknown'}</div>
                        <div class="timeline-time">${new Date(item.timestamp).toLocaleString('vi-VN')}</div>
                        <div class="timeline-status">${item.status || 'N/A'}</div>
                        ${item.location ? `<div style="color: #666; font-size: 0.9em; margin-top: 5px;">📍 ${item.location}</div>` : ''}
                    </div>
                `).join('')}
            </div>

            ${productInfo.qrCode ? `
            <div class="qr-section">
                <h3>📱 QR Code sản phẩm</h3>
                <div class="qr-code">
                    <img src="${productInfo.qrCode}" alt="QR Code cho sản phẩm ${productId}">
                </div>
                <p>Quét QR code này để chia sẻ thông tin sản phẩm</p>
            </div>
            ` : ''}
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
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Lỗi Server - Supply Chain Blockchain</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                    .error { background: #ffebee; color: #c62828; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px; }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Lỗi Server</h1>
                    <p>Không thể tải thông tin sản phẩm</p>
                </div>
            </body>
            </html>
        `);
    }
});

// API tạo QR code cho sản phẩm
app.get('/api/qrcode/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu mã sản phẩm'
            });
        }

        // Kiểm tra sản phẩm có tồn tại không
        const history = supplyChain.getProduct(productId);
        if (!history || history.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Sản phẩm "${productId}" không tồn tại trong blockchain`
            });
        }

        // URL để tra cứu (sử dụng IP WiFi tự động phát hiện và port backend)
        const serverIP = process.env.SERVER_IP || wifiIP;
        const backendPort = process.env.BACKEND_PORT || '5000';
        const queryURL = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(productId)}`;
        
        // Tạo QR code
        const qrCodeDataURL = await QRCode.toDataURL(queryURL, {
            width: 400,
            margin: 2,
            color: {
                dark: '#1a237e',
                light: '#FFFFFF'
            }
        });

        res.json({
            success: true,
            productId: productId,
            qrCode: qrCodeDataURL,
            url: queryURL,
            blockCount: history.length
        });
    } catch (error) {
        console.error('Lỗi tạo QR code:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi tạo QR code',
            error: error.message
        });
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