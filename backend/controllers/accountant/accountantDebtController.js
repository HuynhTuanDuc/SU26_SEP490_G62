const accountantDebtRepository = require('../../repositories/accountant/accountantDebtRepository');

const getDebts = async (req, res) => {
    try {
        const {
            debt_type,    // 'customer' | 'driver'
            status,       // 'paid' | 'partial' | 'unpaid'
            customer,
            driver,
            page = 1,
            limit = 20,
        } = req.query;

        const result = await accountantDebtRepository.getAllDebts({
            debtType: debt_type || null,
            status: status || null,
            customerSearch: customer || null,
            driverSearch: driver || null,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });

        res.json(result);
    } catch (err) {
        console.error('Error fetching debts:', err);
        res.status(500).json({ error: 'Failed to fetch debts', details: err.message });
    }
};

const getDebtStats = async (req, res) => {
    try {
        const stats = await accountantDebtRepository.getDebtStats();
        res.json(stats);
    } catch (err) {
        console.error('Error fetching debt stats:', err);
        res.status(500).json({ error: 'Failed to fetch debt stats', details: err.message });
    }
};

// Nhóm công nợ theo người
const getDebtsGrouped = async (req, res) => {
    try {
        const {
            debt_type,
            status,
            customer,
            driver,
            page = 1,
            limit = 20,
        } = req.query;

        const result = await accountantDebtRepository.getDebtsGroupedByPerson({
            debtType: debt_type || null,
            status: status || null,
            customerSearch: customer || null,
            driverSearch: driver || null,
            page: Number(page) || 1,
            limit: Number(limit) || 20,
        });

        res.json(result);
    } catch (err) {
        console.error('Error fetching grouped debts:', err);
        res.status(500).json({ error: 'Failed to fetch grouped debts', details: err.message });
    }
};

// Chi tiết công nợ của một người
const getDebtsByPerson = async (req, res) => {
    try {
        const { personType, personId } = req.params;
        const { customer_ids } = req.query;

        if (!['customer', 'driver'].includes(personType)) {
            return res.status(400).json({ error: 'Invalid person type' });
        }

        // Nếu có customer_ids (nhiều customer gộp), lấy tất cả
        if (customer_ids) {
            const ids = customer_ids.split(',').map(Number).filter(Boolean);
            const debts = await accountantDebtRepository.getDebtsByCustomerIds(ids);
            return res.json({ debts });
        }

        const debts = await accountantDebtRepository.getDebtsByPerson(
            personType,
            Number(personId)
        );

        res.json({ debts });
    } catch (err) {
        console.error('Error fetching debts by person:', err);
        res.status(500).json({ error: 'Failed to fetch debts by person', details: err.message });
    }
};

module.exports = { getDebts, getDebtStats, getDebtsGrouped, getDebtsByPerson };
