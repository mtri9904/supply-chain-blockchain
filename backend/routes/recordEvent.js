const express = require('express');
const router = express.Router();
const blockchain = require('../MyBlockchain'); // Dùng chung instance
const sql = require('mssql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Tạo thư mục uploads nếu chưa tồn tại
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Cấu hình Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file ảnh!'), false);
        }
    }
});

const dbConfig = {
  server: 'localhost',
  database: 'supply_chain_app',
  user: 'supply_chain_user',
  password: 'StrongPassword123!',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};
// 📦 API thêm sự kiện
router.post('/', async (req, res) => {
    try {
        const eventData = req.body;

        // ✅ Bước này: xác thực dữ liệu đầu vào, ví dụ
        if (!eventData.productId || !eventData.eventType) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin sự kiện hoặc sản phẩm'
            });
        }

        // 🟢 CHÈN ĐOẠN LOG CỦA BẠN NGAY TẠI ĐÂY
        console.log('📝 Event data to add to blockchain (FULL):', {
            productId: eventData.productId,
            eventType: eventData.eventType,
            imageUrl: eventData.imageUrl, // 🔥 kiểm tra imageUrl
            allData: eventData
        });

        // 🧱 Thêm vào blockchain
        const result = blockchain.addTransactionEvent(eventData);

        // 🟢 CHÈN LOG THỨ HAI Ở ĐÂY
        console.log('🔗 Blockchain result:', {
            success: result.success,
            eventData: result.eventData,
            imageUrlInBlockchain: result.eventData?.imageUrl // 🔥 kiểm tra lại imageUrl
        });

        res.json(result);

    } catch (error) {
        console.error('❌ Lỗi khi ghi sự kiện vào blockchain:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ khi ghi sự kiện vào blockchain',
            error: error.message
        });
    }
});
// ===========================xóa khi sai==================================
// API ghi sự kiện chuỗi cung ứng
router.post('/record-event', upload.single('image'), async (req, res) => {
    console.log('📨 Received POST /api/record-event');
    console.log('📦 Request body (FULL):', JSON.stringify(req.body, null, 2));
    console.log('🖼️ File info:', req.file);
    // Xử lý file nếu có
    let imageUrl = null;
    let thumbUrl = null;

    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
        // Ở đây sẽ thêm code tạo thumbnail sau
        thumbUrl = imageUrl; // Tạm thời dùng cùng URL
    }
    const { 
        productId, eventType, description, userId, username, location, notes, 
        quantity, quality, temperature, duration, price, customerType, 
        batchNumber, fromLocation, toLocation, seedType, area, yield, 
        waterSource, fertilizerType, harvestDate, saleDate 
    } = req.body;

    try {
        console.log('🔍 Connecting to database...');
        
        // 1. Kết nối database để lấy thông tin user
        await sql.connect(dbConfig);
        
        const userResult = await sql.query`
            SELECT username, role 
            FROM users 
            WHERE username = ${username} OR id = ${userId}
        `;

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.recordset[0];
        
        // 2. Tạo dữ liệu sự kiện ĐẦY ĐỦ
        const eventData = {
            // Thông tin cơ bản
            productId: productId ? productId.trim() : '',
            eventType: eventType || '',
            location: location || '',
            notes: notes || description || '',
            actor: user.username,
            role: user.role,
            timestamp: new Date().toISOString(),
            
            // Thông tin chi tiết
            quantity: quantity || null,
            quality: quality || null,
            temperature: temperature || null,
            duration: duration || null,
            price: price || null,
            customerType: customerType || null,
            batchNumber: batchNumber || null,
            fromLocation: fromLocation || null,
            toLocation: toLocation || null,
            seedType: seedType || null,
            area: area || null,
            yield: yield || null,
            waterSource: waterSource || null,
            fertilizerType: fertilizerType || null,
            harvestDate: harvestDate || null,
            saleDate: saleDate || null,
            imageUrl: imageUrl,
            thumbUrl: thumbUrl, 
            imageName: req.file ? req.file.originalname : null
        };

        console.log('📝 Event data to add to blockchain (FULL):', eventData);

        // 3. Thêm sự kiện vào blockchain
        console.log('⛓️ Adding to blockchain...');
        const result = blockchain.addTransactionEvent(eventData);
        console.log('🔗 Blockchain result:', result);

        if (!result.success) {
            throw new Error(result.error);
        }

        // 4. Trả kết quả
        console.log('✅ Successfully recorded event with ALL data');
        res.json({
            success: true,
            message: 'Sự kiện đã được ghi thành công lên blockchain!',
            blockIndex: result.blockIndex,
            transactionHash: result.transactionHash,
            timestamp: result.timestamp,
            eventData: result.eventData  // Trả về toàn bộ eventData
        });

    } catch (error) {
        console.error('❌ Error recording event:', error);
        res.status(500).json({ 
            error: 'Failed to record event', 
            details: error.message 
        });
    } finally {
        try {
            await sql.close();
        } catch (closeError) {
            console.error('❌ Error closing connection:', closeError);
        }
    }
});

// Xử lý lỗi Multer
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File quá lớn',
                details: 'Kích thước file tối đa là 5MB'
            });
        }
    }
    res.status(500).json({
        error: 'Upload failed',
        details: error.message
    });
});
 
// API lấy danh sách sự kiện theo productId
router.get('/product-events/:productId', async (req, res) => {
  const { productId } = req.params;

  try {
    // SỬA: Dùng getProduct thay vì getTransactionsByProduct
    const events = blockchain.getProduct(productId);
    
    res.json({
      success: true,
      productId: productId,
      events: events,
      totalEvents: events.length
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ 
      error: 'Failed to fetch events', 
      details: error.message 
    });
  }
});

const QRCode = require('qrcode');
// API lấy lịch sử sự kiện của user
router.get('/user-events/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const events = blockchain.getUserEvents(username);
    
    console.log(`🔍 Found ${events.length} events for user: ${username}`);
    
    // TẠO QR CODE CHO MỖI EVENT
    const eventsWithQR = await Promise.all(
      events.map(async (event) => {
        try {
          // Tạo URL để nhúng vào QR code
          const serverIP = process.env.SERVER_IP || 'localhost';
          const backendPort = process.env.BACKEND_PORT || '5000';
          const queryURL = `http://${serverIP}:${backendPort}/api/product-events/${event.productId}`;
          
          // console.log(`🔄 Generating QR for: ${event.productId}`);
          
          // Tạo QR code
          const qrCode = await QRCode.toDataURL(queryURL, {
            width: 200,
            margin: 1,
            color: {
              dark: '#1a237e',
              light: '#FFFFFF'
            }
          });
          
          // console.log(`✅ QR generated for: ${event.productId}`);
          
          return {
            ...event,
            qrCode: qrCode  // THÊM QR CODE
          };
        } catch (error) {
          console.error(`❌ Error generating QR for ${event.productId}:`, error.message);
          return event; // Trả về event không có QR nếu lỗi
        }
      })
    );
    
    res.json({
      success: true,
      username: username,
      events: eventsWithQR,  // TRẢ VỀ EVENTS ĐÃ CÓ QR
      totalEvents: eventsWithQR.length
    });

  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user events', 
      details: error.message 
    });
  }
});

module.exports = router;