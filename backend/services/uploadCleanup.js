const cloudinary = require('../config/cloudinary');

/**
 * Xoá file vừa upload lên Cloudinary.
 *
 * Dùng khi một ảnh đã được multer đẩy lên nhưng sau đó bị từ chối (hóa đơn không hợp
 * lệ, validate thất bại): không xoá thì Cloudinary tích dần file rác không có gì tham
 * chiếu tới.
 *
 * Không bao giờ ném lỗi — dọn rác thất bại không được làm hỏng phản hồi cho người dùng.
 */
const deleteUploadedFile = async (publicId) => {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.warn('[upload] Không xoá được file Cloudinary:', publicId, err.message);
    }
};

/**
 * public_id của một ảnh Cloudinary từ URL giao hàng của nó.
 *
 * multer-storage-cloudinary chỉ trả public_id ngay lúc tải lên; về sau trong DB chỉ còn URL
 * (vd bill_pics). Dạng URL: .../image/upload/[biến đổi/]v<số>/<public_id>.<đuôi>. URL không
 * đúng dạng đó (không phải Cloudinary, không có số phiên bản) → null, và nơi gọi bỏ qua việc
 * xoá — thà để sót một tệp còn hơn đoán sai public_id rồi xoá nhầm tệp khác.
 */
const publicIdFromUrl = (url) => {
    const match = /\/image\/upload\/(?:[^?#]*?\/)?v\d+\/([^?#]+?)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i.exec(String(url ?? ''));
    return match ? decodeURIComponent(match[1]) : null;
};

/** Xoá tệp Cloudinary theo URL. Không bao giờ ném lỗi, cùng lý do với deleteUploadedFile. */
const deleteUploadedUrl = async (url) => deleteUploadedFile(publicIdFromUrl(url));

module.exports = { deleteUploadedFile, deleteUploadedUrl, publicIdFromUrl };
