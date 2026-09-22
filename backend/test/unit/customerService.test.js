/**
 * L1 Unit Test — customerService
 * Trọng tâm: chuẩn hoá payload theo loại khách (cá nhân/doanh nghiệp), chống trùng
 * số điện thoại, và chặn xoá khách đã phát sinh đơn.
 */
jest.mock('../../repositories/customerRepository');

const customerRepository = require('../../repositories/customerRepository');
const customerService = require('../../services/customerService');

const KHACH_CA_NHAN = {
    id: 1, customer_type: 'individual', full_name: 'Lê Thị Hoa', phone: '0912345678',
    company_name: null, contact_person: null, email: null, address: null, tax_code: null, notes: null,
};

beforeEach(() => jest.clearAllMocks());

describe('customerService.createCustomer', () => {
    beforeEach(() => {
        customerRepository.findByPhone.mockResolvedValue(null);
        customerRepository.createCustomer.mockResolvedValue({ id: 1 });
    });

    it('TC-UNIT-CustomerService-001 — creates an individual customer from a normalised payload', async () => {
        await customerService.createCustomer({
            full_name: '  Lê Thị Hoa  ', phone: '  0912345678  ', email: '  hoa@mail.com ',
        });

        expect(customerRepository.createCustomer).toHaveBeenCalledWith(expect.objectContaining({
            customerType: 'individual',
            fullName: 'Lê Thị Hoa',
            phone: '0912345678',
            email: 'hoa@mail.com',
        }));
    });

    it('TC-UNIT-CustomerService-002 — defaults to individual when no customer type is given', async () => {
        await customerService.createCustomer({ full_name: 'Nguyễn A', phone: '0900000000' });

        expect(customerRepository.createCustomer).toHaveBeenCalledWith(
            expect.objectContaining({ customerType: 'individual' }),
        );
    });

    it('TC-UNIT-CustomerService-003 — requires a company name for a business customer', async () => {
        await expect(customerService.createCustomer({
            customer_type: 'business', phone: '0900000000', company_name: '   ',
        })).rejects.toThrow('Tên công ty là bắt buộc với khách hàng doanh nghiệp');

        expect(customerRepository.createCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-004 — requires a full name for an individual customer', async () => {
        await expect(customerService.createCustomer({
            customer_type: 'individual', phone: '0900000000', full_name: '',
        })).rejects.toThrow('Tên khách hàng là bắt buộc với khách hàng cá nhân');

        expect(customerRepository.createCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-005 — rejects a customer type outside the catalogue', async () => {
        await expect(customerService.createCustomer({
            customer_type: 'vip', phone: '0900000000', full_name: 'A',
        })).rejects.toThrow('Loại khách hàng không hợp lệ (individual/business)');

        expect(customerRepository.createCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-006 — rejects a missing phone number', async () => {
        await expect(customerService.createCustomer({ full_name: 'A', phone: '   ' }))
            .rejects.toThrow('Số điện thoại là bắt buộc');

        expect(customerRepository.createCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-007 — rejects a phone number already registered to another customer', async () => {
        customerRepository.findByPhone.mockResolvedValue({ id: 9 });

        await expect(customerService.createCustomer({ full_name: 'A', phone: '0912345678' }))
            .rejects.toThrow('Số điện thoại này đã được đăng ký cho khách hàng khác');

        expect(customerRepository.createCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-008 — creates a business customer once the company name is supplied', async () => {
        await customerService.createCustomer({
            customer_type: 'business', phone: '0900000000', company_name: 'Công ty ABC', tax_code: ' 0101 ',
        });

        expect(customerRepository.createCustomer).toHaveBeenCalledWith(expect.objectContaining({
            customerType: 'business', companyName: 'Công ty ABC', taxCode: '0101', fullName: null,
        }));
    });
});

describe('customerService.updateCustomer', () => {
    beforeEach(() => {
        customerRepository.getCustomerById.mockResolvedValue({ ...KHACH_CA_NHAN });
        customerRepository.updateCustomer.mockResolvedValue({ ...KHACH_CA_NHAN, full_name: 'Lê Thị Hoa B' });
        customerRepository.findByPhone.mockResolvedValue(null);
    });

    it('TC-UNIT-CustomerService-009 — skips the duplicate check when the phone number is unchanged', async () => {
        await customerService.updateCustomer(1, { full_name: 'Lê Thị Hoa B' });

        expect(customerRepository.findByPhone).not.toHaveBeenCalled();
        expect(customerRepository.updateCustomer).toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-010 — rejects switching to a phone number owned by another customer', async () => {
        customerRepository.findByPhone.mockResolvedValue({ id: 9 });

        await expect(customerService.updateCustomer(1, { phone: '0988888888' }))
            .rejects.toThrow('Số điện thoại này đã được đăng ký cho khách hàng khác');

        expect(customerRepository.updateCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-011 — allows the update when the duplicate phone belongs to the same customer', async () => {
        customerRepository.findByPhone.mockResolvedValue({ id: 1 });

        await customerService.updateCustomer(1, { phone: '0988888888' });

        expect(customerRepository.updateCustomer).toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-012 — rejects updating a customer that does not exist', async () => {
        customerRepository.getCustomerById.mockResolvedValue(null);

        await expect(customerService.updateCustomer(99, { full_name: 'X' }))
            .rejects.toThrow('Khách hàng không tồn tại');

        expect(customerRepository.updateCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-013 — reports failure when the repository returns no updated row', async () => {
        customerRepository.updateCustomer.mockResolvedValue(null);

        await expect(customerService.updateCustomer(1, { full_name: 'X' }))
            .rejects.toThrow('Không thể cập nhật khách hàng');
    });
});

describe('customerService.deleteCustomer', () => {
    beforeEach(() => {
        customerRepository.getCustomerById.mockResolvedValue({ ...KHACH_CA_NHAN });
        customerRepository.deleteCustomer.mockResolvedValue(undefined);
    });

    it('TC-UNIT-CustomerService-014 — deletes a customer that has no orders yet', async () => {
        customerRepository.countOrdersForCustomer.mockResolvedValue(0);

        const result = await customerService.deleteCustomer(1);

        expect(customerRepository.deleteCustomer).toHaveBeenCalledWith(1);
        expect(result).toEqual({ success: true });
    });

    it('TC-UNIT-CustomerService-015 — blocks deletion of a customer with orders and states how many', async () => {
        customerRepository.countOrdersForCustomer.mockResolvedValue(4);

        await expect(customerService.deleteCustomer(1))
            .rejects.toThrow('Không thể xóa: khách hàng đã có 4 đơn hàng trong hệ thống');

        expect(customerRepository.deleteCustomer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-CustomerService-016 — rejects deleting a customer that does not exist', async () => {
        customerRepository.getCustomerById.mockResolvedValue(null);

        await expect(customerService.deleteCustomer(99)).rejects.toThrow('Khách hàng không tồn tại');

        expect(customerRepository.countOrdersForCustomer).not.toHaveBeenCalled();
    });
});

describe('customerService.getCustomerById', () => {
    it('TC-UNIT-CustomerService-017 — raises an error instead of returning null when the customer is not found', async () => {
        customerRepository.getCustomerById.mockResolvedValue(null);

        await expect(customerService.getCustomerById(99)).rejects.toThrow('Khách hàng không tồn tại');
    });
});
