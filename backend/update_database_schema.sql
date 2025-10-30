-- Cập nhật bảng users để thêm public key và encrypted private key
USE SupplyChainDB;
GO

-- Thêm 2 cột mới vào bảng users
ALTER TABLE users
ADD publicKey NVARCHAR(MAX) NULL,
    encryptedPrivateKey NVARCHAR(MAX) NULL;
GO

-- Kiểm tra cấu trúc bảng
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'users';
GO

