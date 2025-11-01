-- Tạo database
CREATE DATABASE supply_chain_app;
GO

-- Sử dụng database vừa tạo
USE supply_chain_app;
GO

-- Tạo bảng users
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(50) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    role NVARCHAR(20) CHECK (role IN ('farmer', 'shipper', 'factory', 'retailer')) NOT NULL,
    created_at DATETIME DEFAULT GETDATE()
);
GO


-- Thêm 2 cột mới vào bảng users
ALTER TABLE users
ADD publicKey NVARCHAR(MAX) NULL,
    encryptedPrivateKey NVARCHAR(MAX) NULL;
GO

-- Xem cấu trúc bảng
SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users';

-- Xem dữ liệu (đang trống)
SELECT * FROM users;

-- Tạo login
CREATE LOGIN supply_chain_user WITH PASSWORD = 'StrongPassword123!';
GO

-- Chuyển sang database
USE supply_chain_app;
GO

-- Tạo user từ login cho mô phỏng mới
CREATE USER supply_chain_user FOR LOGIN supply_chain_user;
GO

-- Cấp quyền
ALTER ROLE db_owner ADD MEMBER supply_chain_user;
GO