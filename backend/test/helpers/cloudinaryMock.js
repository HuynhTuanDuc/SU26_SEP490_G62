/**
 * GIỮ LẠI CHO TƯƠNG THÍCH — dưới Jest, module 'cloudinary' đã được mock toàn cục qua
 * moduleNameMapper (jest.config.js → cloudinaryJestMock.js), vì cơ chế patch Module._load
 * cũ không hoạt động với module registry riêng của Jest.
 *
 * installCloudinaryMock() vì thế thành no-op, giữ nguyên chữ ký để các file API test
 * đang gọi nó không phải sửa.
 */
function installCloudinaryMock() {
    return function uninstallCloudinaryMock() {};
}

module.exports = { installCloudinaryMock };
