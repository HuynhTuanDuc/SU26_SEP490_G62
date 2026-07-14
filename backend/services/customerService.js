const customerRepository = require('../repositories/customerRepository');

const CUSTOMER_TYPES = ['individual', 'business'];

const normalizePayload = (payload = {}) => {
    const customerType = payload.customer_type;
    if (customerType && !CUSTOMER_TYPES.includes(customerType)) {
        throw new Error('Loại khách hàng không hợp lệ (individual/business)');
    }

    const phone = String(payload.phone || '').trim();
    if (!phone) throw new Error('Số điện thoại là bắt buộc');

    if (customerType === 'business' && !String(payload.company_name || '').trim()) {
        throw new Error('Tên công ty là bắt buộc với khách hàng doanh nghiệp');
    }
    if (customerType === 'individual' && !String(payload.full_name || '').trim()) {
        throw new Error('Tên khách hàng là bắt buộc với khách hàng cá nhân');
    }

    return {
        customerType: customerType || null,
        fullName: String(payload.full_name || '').trim() || null,
        companyName: String(payload.company_name || '').trim() || null,
        contactPerson: String(payload.contact_person || '').trim() || null,
        phone,
        email: String(payload.email || '').trim() || null,
        address: String(payload.address || '').trim() || null,
        taxCode: String(payload.tax_code || '').trim() || null,
        notes: String(payload.notes || '').trim() || null,
    };
};

const listCustomers = async (query) => customerRepository.listCustomers(query);

const getCustomerById = async (id) => {
    const customer = await customerRepository.getCustomerById(id);
    if (!customer) throw new Error('Khách hàng không tồn tại');
    return customer;
};

const createCustomer = async (payload) => {
    const normalized = normalizePayload({ ...payload, customer_type: payload.customer_type || 'individual' });

    const existing = await customerRepository.findByPhone(normalized.phone);
    if (existing) throw new Error('Số điện thoại này đã được đăng ký cho khách hàng khác');

    return customerRepository.createCustomer(normalized);
};

const updateCustomer = async (id, payload) => {
    const existing = await customerRepository.getCustomerById(id);
    if (!existing) throw new Error('Khách hàng không tồn tại');

    const normalized = normalizePayload({ ...existing, ...payload, customer_type: payload.customer_type || existing.customer_type });

    if (normalized.phone !== existing.phone) {
        const dup = await customerRepository.findByPhone(normalized.phone);
        if (dup && dup.id !== existing.id) throw new Error('Số điện thoại này đã được đăng ký cho khách hàng khác');
    }

    const updated = await customerRepository.updateCustomer(id, normalized);
    if (!updated) throw new Error('Không thể cập nhật khách hàng');
    return updated;
};

const deleteCustomer = async (id) => {
    const existing = await customerRepository.getCustomerById(id);
    if (!existing) throw new Error('Khách hàng không tồn tại');

    const orderCount = await customerRepository.countOrdersForCustomer(id);
    if (orderCount > 0) {
        throw new Error(`Không thể xóa: khách hàng đã có ${orderCount} đơn hàng trong hệ thống`);
    }

    await customerRepository.deleteCustomer(id);
    return { success: true };
};

module.exports = {
    CUSTOMER_TYPES,
    listCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
