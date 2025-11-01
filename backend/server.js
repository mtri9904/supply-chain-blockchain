const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const QRCode = require('qrcode');
const blockchain = require('./MyBlockchain');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
        'http://localhost:5173',  // ⭐ THÊM PORT NÀY - Frontend đang chạy trên 5173
        'http://127.0.0.1:5173',  // ⭐ THÊM PORT NÀY
        'http://localhost:5500', 
        'http://127.0.0.1:5500', 
        'http://localhost:3000',
        `http://${wifiIP}:5173`,
        `http://${wifiIP}:5500`,  // IP WiFi tự động phát hiện (frontend)
        `http://${wifiIP}:5000`,  // IP WiFi tự động phát hiện (backend)
        `http://${wifiIP}:5500/supply-chain-blockchain/frontend`,  // Full path frontend
        'http://172.16.16.65:5173',
        'http://172.16.16.65:5500',  // IP cũ (backup)
        'http://172.16.16.65:5000',  // IP cũ backend (backup)
        'http://172.16.16.65:5500/supply-chain-blockchain/frontend',  // Full path cũ
        // Thêm các IP động từ biến môi trường
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:5173` : null,
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.SERVER_PORT || '5500'}` : null,
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.BACKEND_PORT || '5000'}` : null,
        process.env.SERVER_IP ? `http://${process.env.SERVER_IP}:${process.env.SERVER_PORT || '5500'}/supply-chain-blockchain/frontend` : null
    ].filter(Boolean), // Loại bỏ null values
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
    credentials: true
};

// Cấu hình multer để lưu ảnh
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        // Tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Tạo tên file unique: timestamp + random + extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'image-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        // Chỉ chấp nhận file ảnh
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file ảnh!'), false);
        }
    }
});

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Route gốc
app.get('/', (req, res) => {
  res.json({ message: 'Supply Chain Blockchain API' });
});

// Thêm route test - ĐẶT TRƯỚC app.use('/api', recordEventRoutes);
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Backend server is running!',
    timestamp: new Date().toISOString(),
    port: 5000
  });
});
// THÊM VÀO server.js
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});
// Thêm vào server.js
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'Test API is working!',
    timestamp: new Date().toISOString()
  });
});
// 🧩 API TEST: Ghi sự kiện vào blockchain trực tiếp
app.post('/api/record-event', (req, res) => {
  try {
    const eventData = req.body;

    if (!eventData.productId || !eventData.eventType) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin productId hoặc eventType'
      });
    }

    // 🔍 Log dữ liệu nhận được
    console.log('📝 Event data to add to blockchain (FULL):', {
      productId: eventData.productId,
      eventType: eventData.eventType,
      imageUrl: eventData.imageUrl,
      allData: eventData
    });

    // ⚙️ Ghi vào blockchain
    const result = blockchain.addTransactionEvent(eventData);

    // 🔗 Log kết quả
    console.log('🔗 Blockchain result:', {
      success: result.success,
      eventData: result.eventData,
      imageUrlInBlockchain: result.eventData?.imageUrl
    });

    res.json({
      success: true,
      message: 'Đã ghi sự kiện vào blockchain thành công',
      data: result
    });

  } catch (error) {
    console.error('❌ Lỗi khi ghi sự kiện vào blockchain:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi ghi sự kiện vào blockchain',
      error: error.message
    });
  }
});

// 📌 TEST ENDPOINT UPLOAD
app.get('/api/test-upload', (req, res) => {
    res.json({
        success: true,
        message: 'Upload endpoint is ready',
        uploadsDir: uploadsDir,
        uploadsExists: fs.existsSync(uploadsDir)
    });
});

// API upload ảnh - ĐÃ CÓ NHƯNG CẦN ĐẢM BẢO HOẠT ĐỘNG
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Không có file ảnh được upload'
            });
        }

        console.log('📸 Ảnh đã được upload:', {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Tạo URL để truy cập ảnh
        const imageUrl = `/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            message: 'Upload ảnh thành công!',
            imageUrl: imageUrl,
            filename: req.file.filename,
            originalName: req.file.originalname
        });

    } catch (error) {
        console.error('❌ Lỗi upload ảnh:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi upload ảnh',
            error: error.message
        });
    }
});
// 📌 ROUTE PHỤC VỤ FILE ẢNH TĨNH
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// THÊM: Xử lý lỗi Multer cụ thể
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File quá lớn',
                details: 'Kích thước file tối đa là 5MB'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Field không đúng',
                details: 'Field name phải là "image"'
            });
        }
    }
    next(error);
});
// // Hàm để log chi tiết request
// const logRequest = (req) => {
//     console.log(`
// 🔍 Request Details:
// - URL: ${req.method} ${req.url}
// - Headers: ${JSON.stringify(req.headers)}
// - Body: ${JSON.stringify(req.body)}
// - Query: ${JSON.stringify(req.query)}
// - Params: ${JSON.stringify(req.params)}
// `);
// };



const httpServer = http.createServer(app);
// Import routes
const recordEventRoutes = require('./routes/recordEvent');
// Use routes
app.use('/api', recordEventRoutes);
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


// Custom response handler
// app.use((req, res, next) => {
//     const originalJson = res.json;
//     res.json = function(data) {
//         console.log(`\n📤 Response for ${req.method} ${req.url}:`, data);
//         return originalJson.call(this, data);
//     };
//     next();
// });

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
const supplyChain = blockchain;
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

// Route hiển thị giao diện chi tiết sản phẩm
app.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        
        console.log(`📱 Hiển thị giao diện cho sản phẩm: ${productId}`);
        
        const history = supplyChain.getProduct(productId);
        
        if (!history || history.length === 0) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Không tìm thấy sản phẩm</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                        }
                        .error { 
                            background: white;
                            padding: 40px;
                            border-radius: 15px;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                            text-align: center;
                            max-width: 500px;
                            width: 100%;
                        }
                        .error h1 { 
                            color: #d32f2f; 
                            margin-bottom: 15px;
                            font-size: 24px;
                        }
                        .error p { 
                            color: #666;
                            line-height: 1.5;
                        }
                    </style>
                </head>
                <body>
                    <div class="error">
                        <h1>❌ Không tìm thấy sản phẩm</h1>
                        <p>Mã sản phẩm "<strong>${productId}</strong>" không tồn tại trong hệ thống blockchain.</p>
                    </div>
                </body>
                </html>
            `);
        }

        // Sắp xếp events theo thời gian (mới nhất đầu tiên)
        const sortedEvents = history.sort((a, b) => b.blockIndex - a.blockIndex);
        
        let eventsHTML = '';
        sortedEvents.forEach(event => {
            const timestamp = new Date(event.timestamp).toLocaleString('vi-VN');
            console.log('🔍 Event data:', {
                blockIndex: event.blockIndex,
                eventType: event.eventType,
                hasImageUrl: !!event.imageUrl,
                imageUrl: event.imageUrl,
                allKeys: Object.keys(event)
            });
            // Tạo HTML cho từng trường thông tin
            let detailsHTML = '';
            
            // Thông tin cơ bản
            const basicFields = [
                { label: 'Địa điểm', value: event.location },
                { label: 'Người thực hiện', value: event.actor },
                { label: 'Vai trò', value: event.role },
                { label: 'Loại sự kiện', value: event.eventType }
            ];
            
            basicFields.forEach(field => {
                if (field.value) {
                    detailsHTML += `<p><strong>${field.label}:</strong> ${field.value}</p>`;
                }
            });
            
            // Thông tin chi tiết
            const detailFields = [
                { label: 'Số lượng', value: event.quantity, unit: 'kg' },
                { label: 'Chất lượng', value: event.quality },
                { label: 'Nhiệt độ', value: event.temperature, unit: '°C' },
                { label: 'Thời gian', value: event.duration, unit: 'phút' },
                { label: 'Giá', value: event.price, unit: 'VNĐ' },
                { label: 'Loại khách hàng', value: event.customerType },
                { label: 'Số lô', value: event.batchNumber },
                { label: 'Điểm đi', value: event.fromLocation },
                { label: 'Điểm đến', value: event.toLocation },
                { label: 'Loại giống', value: event.seedType },
                { label: 'Diện tích', value: event.area, unit: 'm²' },
                { label: 'Năng suất', value: event.yield, unit: 'kg/m²' },
                { label: 'Nguồn nước', value: event.waterSource },
                { label: 'Loại phân bón', value: event.fertilizerType }
            ];
            
            detailFields.forEach(field => {
                if (field.value) {
                    const unit = field.unit ? ` ${field.unit}` : '';
                    detailsHTML += `<p><strong>${field.label}:</strong> ${field.value}${unit}</p>`;
                }
            });
            
            // Ghi chú
            if (event.notes) {
                detailsHTML += `<p><strong>Ghi chú:</strong> ${event.notes}</p>`;
            }
            if (event.imageUrl && event.imageUrl !== 'null' && event.imageUrl !== 'undefined') {
                const safeImageUrl = event.imageUrl.replace(/'/g, "\\'");
                
                detailsHTML += `
                    <div style="margin-top: 15px; text-align: center;">
                        <button class="image-button" 
                                onclick="showImagePopup('${safeImageUrl}')"
                                style="background: #1a237e; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 14px; margin-top: 10px;">
                            🖼️ Xem Hình Ảnh
                        </button>
                    </div>
                `;
            }
            
            eventsHTML += `
                <div class="event-item">
                    <div class="event-header">
                        <span class="block-number">Block #${event.blockIndex}</span>
                        <span class="timestamp">${timestamp}</span>
                    </div>
                    <div class="event-details">
                        ${detailsHTML || '<p><em>Không có thông tin chi tiết</em></p>'}                   
                    </div>
                </div>
            `;
        });

        const html = `
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Lịch sử sản phẩm - ${productId}</title>
                <style>
                    * { 
                        margin: 0; 
                        padding: 0; 
                        box-sizing: border-box; 
                    }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        padding: 20px;
                        line-height: 1.6;
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        overflow: hidden;
                        position: relative;
                        z-index: 1;
                    }
                    .header {
                        background: #1a237e;
                        color: white;
                        padding: 25px;
                        text-align: center;
                    }
                    .header h1 {
                        font-size: 24px;
                        margin-bottom: 10px;
                    }
                    .header p {
                        opacity: 0.9;
                        font-size: 14px;
                    }
                    .product-info {
                        background: #e3f2fd;
                        padding: 25px;
                        text-align: center;
                        border-bottom: 2px solid #bbdefb;
                    }
                    .product-info h2 {
                        color: #1a237e;
                        margin-bottom: 15px;
                        font-size: 20px;
                    }
                    .stats {
                        display: flex;
                        justify-content: center;
                        gap: 30px;
                        margin-top: 15px;
                        flex-wrap: wrap;
                    }
                    .stat-item {
                        text-align: center;
                        min-width: 100px;
                    }
                    .stat-number {
                        font-size: 24px;
                        font-weight: bold;
                        color: #1a237e;
                    }
                    .stat-label {
                        font-size: 12px;
                        color: #666;
                        margin-top: 5px;
                    }
                    .events-section {
                        padding: 25px;
                    }
                    .events-title {
                        color: #1a237e;
                        margin-bottom: 20px;
                        text-align: center;
                        font-size: 20px;
                        border-bottom: 2px solid #e3f2fd;
                        padding-bottom: 10px;
                    }
                    .event-item {
                        background: #f8f9fa;
                        border-left: 4px solid #1a237e;
                        padding: 20px;
                        margin-bottom: 20px;
                        border-radius: 8px;
                        transition: transform 0.2s ease, box-shadow 0.2s ease;
                    }
                    .event-item:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                    }
                    .event-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                        // CSS hình ảnh 
                    .image-modal {
                        display: none;
                        position: fixed;
                        z-index: 9999;
                        left: 0;
                        top: 0;
                        width: 100%;
                        height: 100%;
                        background-color: rgba(0,0,0,0.9);
                        animation: fadeIn 0.3s;
                    }

                    .image-modal-content {
                        margin: auto;
                        display: block;
                        max-width: 90%;
                        max-height: 90%;
                        margin-top: 2%;
                        border-radius: 10px;
                        box-shadow: 0 0 20px rgba(0,0,0,0.5);
                        animation: zoomIn 0.3s;
                    }

                    .image-modal-close {
                        position: absolute;
                        top: 20px;
                        right: 35px;
                        color: #f1f1f1;
                        font-size: 40px;
                        font-weight: bold;
                        cursor: pointer;
                        transition: 0.3s;
                        z-index: 10000;
                    }

                    .image-modal-close:hover {
                        color: #bbb;
                    }

                    .image-modal-caption {
                        margin: auto;
                        display: block;
                        width: 80%;
                        max-width: 700px;
                        text-align: center;
                        color: #ccc;
                        padding: 10px 0;
                        height: 150px;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    @keyframes zoomIn {
                        from { transform: scale(0.8); opacity: 0; }
                        to { transform: scale(1); opacity: 1; }
                    }

                    .image-button {
                        background: #1a237e;
                        color: white;
                        border: none;
                        padding: 8px 15px;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 12px;
                        margin-top: 10px;
                        transition: background 0.3s;
                    }

                    .image-button:hover {
                        background: #283593;
                    }
                    .block-number {
                        background: #1a237e;
                        color: white;
                        padding: 6px 12px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: bold;
                    }
                    .timestamp {
                        color: #666;
                        font-size: 12px;
                        font-weight: 500;
                    }
                    .event-details p {
                        margin-bottom: 8px;
                        color: #333;
                        line-height: 1.5;
                    }
                    .event-details strong {
                        color: #1a237e;
                        min-width: 120px;
                        display: inline-block;
                    }
                    .event-details em {
                        color: #999;
                        font-style: italic;
                    }
                    .footer {
                        text-align: center;
                        padding: 20px;
                        background: #f5f5f5;
                        color: #666;
                        font-size: 12px;
                        border-top: 1px solid #e0e0e0;
                    }
                    /* Mobile Responsive */
                    @media (max-width: 600px) {
                        body {
                            padding: 10px;
                        }
                        .container {
                            border-radius: 10px;
                        }
                        .header {
                            padding: 20px 15px;
                        }
                        .header h1 {
                            font-size: 20px;
                        }
                        .product-info {
                            padding: 20px 15px;
                        }
                        .product-info h2 {
                            font-size: 18px;
                        }
                        .stats {
                            gap: 20px;
                        }
                        .stat-item {
                            min-width: 80px;
                        }
                        .stat-number {
                            font-size: 20px;
                        }
                        .events-section {
                            padding: 20px 15px;
                        }
                        .events-title {
                            font-size: 18px;
                        }
                        .event-item {
                            padding: 15px;
                            margin-bottom: 15px;
                        }
                        .event-header {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                        }
                        .event-details p {
                            font-size: 14px;
                        }
                        .event-details strong {
                            min-width: 100px;
                            font-size: 13px;
                        }
                    }
                    @media (max-width: 400px) {
                        .stats {
                            flex-direction: column;
                            gap: 15px;
                        }
                        .stat-item {
                            min-width: auto;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📦 Supply Chain Blockchain</h1>
                        <p>Lịch sử truy xuất nguồn gốc</p>
                    </div>
                    
                    <div class="product-info">
                        <h2>Mã sản phẩm: <span style="color: #1a237e;">${productId}</span></h2>
                        <div class="stats">
                            <div class="stat-item">
                                <div class="stat-number">${history.length}</div>
                                <div class="stat-label">SỰ KIỆN</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-number">#${sortedEvents[0].blockIndex}</div>
                                <div class="stat-label">BLOCK MỚI NHẤT</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-number">${sortedEvents.length}</div>
                                <div class="stat-label">TỔNG SỐ</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="events-section">
                        <h3 class="events-title">📋 Lịch sử sự kiện</h3>
                        ${eventsHTML || '<div class="event-item"><p><em>Chưa có sự kiện nào được ghi nhận</em></p></div>'}
                    </div>
                    
                    <div class="footer">
                        <p>🔒 Dữ liệu được bảo mật bằng Blockchain - Quét mã QR để xem thông tin</p>
                        <p style="margin-top: 5px; font-size: 11px; opacity: 0.7;">© 2025 Supply Chain Blockchain System</p>
                    </div>
                </div>
                <div id="imageModal" class="image-modal">
                    <span class="image-modal-close">&times;</span>
                    <img class="image-modal-content" id="modalImage">
                    <div id="modalCaption" class="image-modal-caption"></div>
                </div>
                <script>
// Hàm hiển thị popup ảnh
function showImagePopup(imageUrl) {
    // Tạo overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:9999; display:flex; justify-content:center; align-items:center;';
    
    // Tạo ảnh
    const img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = 'max-width:90%; max-height:90%; border-radius:10px; box-shadow:0 0 20px rgba(0,0,0,0.5);';
    
    // Tạo nút đóng
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = 'position:absolute; top:20px; right:30px; background:none; border:none; color:white; font-size:40px; cursor:pointer; z-index:10000;';
    
    // Sự kiện đóng
    closeBtn.onclick = function() {
        document.body.removeChild(overlay);
    };
    
    overlay.onclick = function(e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    };
    
    // Thêm vào DOM
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    
    // Đóng bằng phím ESC
    document.addEventListener('keydown', function closeOnEsc(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(overlay);
            document.removeEventListener('keydown', closeOnEsc);
        }
    });
}
</script>
            </body>
            </html>
        `;

        res.send(html);

    } catch (error) {
        console.error('❌ Lỗi hiển thị giao diện sản phẩm:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Lỗi</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .error { 
                        background: white;
                        padding: 40px;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        text-align: center;
                        max-width: 500px;
                        width: 100%;
                    }
                    .error h1 { 
                        color: #d32f2f; 
                        margin-bottom: 15px;
                    }
                    .error p { 
                        color: #666;
                        line-height: 1.5;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h1>❌ Có lỗi xảy ra</h1>
                    <p>${error.message}</p>
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

        console.log(`🔍 Kiểm tra sản phẩm: ${productId}`);
        
        const history = supplyChain.getProduct(productId);
        
        if (!history || history.length === 0) {
            return res.status(404).json({
                success: false,
                message: `Sản phẩm "${productId}" không tồn tại trong blockchain`
            });
        }

        const serverIP = process.env.SERVER_IP || wifiIP || '172.16.16.105';
        const backendPort = process.env.BACKEND_PORT || '5000';
        
        // 🔥 SỬA: Trỏ đến giao diện HTML thay vì API JSON
        const productURL = `http://${serverIP}:${backendPort}/product/${encodeURIComponent(productId)}`;
        
        // console.log(`🔄 Tạo QR code cho giao diện: ${productURL}`);
        
        const qrCodeDataURL = await QRCode.toDataURL(productURL, {
            width: 400,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        console.log(`✅ QR code created successfully`);
        
        res.json({
            success: true,
            productId: productId,
            qrCode: qrCodeDataURL,
            url: productURL,  // URL giao diện mới
            blockCount: history.length,
            scanNote: "Quét mã này từ điện thoại để xem lịch sử sản phẩm"
        });
    } catch (error) {
        console.error('❌ Lỗi tạo QR code:', error);
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
        const permissions = supplyChain.smartContract.getRolePermissions(role);        
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

// Thêm route test cơ bản
app.get('/', (req, res) => {
  res.json({ message: 'Backend server is running!' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    corsConfig: corsOptions.origin
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