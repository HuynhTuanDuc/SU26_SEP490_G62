const accountantPaymentRepository = require('../../repositories/accountant/accountantPaymentRepository');

/**
 * Preview phân bổ thanh toán - xem trước sẽ chia tiền vào đâu
 * POST /accountant/debts/payment/preview
 */
const previewAllocation = async (req, res) => {
    try {
        const { personType, personId, amount } = req.body;

        // Validate
        if (!['customer', 'driver'].includes(personType)) {
            return res.status(400).json({ error: 'personType must be "customer" or "driver"' });
        }
        if (!personId || isNaN(Number(personId))) {
            return res.status(400).json({ error: 'Invalid personId' });
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount: must be > 0' });
        }

        const result = await accountantPaymentRepository.previewAllocation(
            personType,
            Number(personId),
            Number(amount)
        );

        res.json(result);
    } catch (err) {
        console.error('Error previewing allocation:', err);
        res.status(500).json({ error: 'Failed to preview allocation', details: err.message });
    }
};

/**
 * Phân bổ thanh toán - ghi thu tiền và tự động chia vào các khoản nợ
 * POST /accountant/debts/payment/allocate
 */
const allocatePayment = async (req, res) => {
    try {
        const { personType, personId, amount, paymentMethod, notes } = req.body;

        // Validate
        if (!['customer', 'driver'].includes(personType)) {
            return res.status(400).json({ error: 'personType must be "customer" or "driver"' });
        }
        if (!personId || isNaN(Number(personId))) {
            return res.status(400).json({ error: 'Invalid personId' });
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount: must be > 0' });
        }
        if (paymentMethod && !['cash', 'bank_transfer', 'offset'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid paymentMethod' });
        }

        const result = await accountantPaymentRepository.allocatePayment(personType, Number(personId), {
            amount: Number(amount),
            paymentMethod: paymentMethod || 'cash',
            notes: notes || '',
            createdBy: req.user?.userId || 1,
        });

        res.json(result);
    } catch (err) {
        console.error('Error allocating payment:', err);
        const status = err.message.includes('vượt quá') ? 400 : 500;
        res.status(status).json({ error: 'Failed to allocate payment', details: err.message });
    }
};

/**
 * Ghi thu cho 1 shipment cụ thể
 * POST /accountant/debts/payment/by-shipment
 */
const paymentByShipment = async (req, res) => {
    try {
        const { shipmentId, amount, paymentMethod, notes } = req.body;

        // Validate
        if (!shipmentId || isNaN(Number(shipmentId))) {
            return res.status(400).json({ error: 'Invalid shipmentId' });
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount: must be > 0' });
        }
        if (paymentMethod && !['cash', 'bank_transfer', 'offset'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid paymentMethod' });
        }

        const result = await accountantPaymentRepository.recordPaymentByShipment(Number(shipmentId), {
            amount: Number(amount),
            paymentMethod: paymentMethod || 'cash',
            notes: notes || '',
            createdBy: req.user?.userId || 1,
        });

        res.json(result);
    } catch (err) {
        console.error('Error recording payment by shipment:', err);
        const status = err.message.includes('not found') ? 404 :
                       err.message.includes('vượt quá') ? 400 : 500;
        res.status(status).json({ error: 'Failed to record payment', details: err.message });
    }
};

/**
 * Ghi thu cho 1 debt cụ thể
 * POST /accountant/debts/payment/by-debt
 */
const paymentByDebt = async (req, res) => {
    try {
        const { debtId, amount, paymentMethod, notes } = req.body;

        // Validate
        if (!debtId || isNaN(Number(debtId))) {
            return res.status(400).json({ error: 'Invalid debtId' });
        }
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount: must be > 0' });
        }
        if (paymentMethod && !['cash', 'bank_transfer', 'offset'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid paymentMethod' });
        }

        const result = await accountantPaymentRepository.recordPaymentByDebt(Number(debtId), {
            amount: Number(amount),
            paymentMethod: paymentMethod || 'cash',
            notes: notes || '',
            createdBy: req.user?.userId || 1,
        });

        res.json(result);
    } catch (err) {
        console.error('Error recording payment by debt:', err);
        const status = err.message.includes('not found') ? 404 :
                       err.message.includes('vượt quá') ? 400 : 500;
        res.status(status).json({ error: 'Failed to record payment', details: err.message });
    }
};

module.exports = {
    previewAllocation,
    allocatePayment,
    paymentByShipment,
    paymentByDebt,
};
