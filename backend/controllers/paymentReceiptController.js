const { Op, fn, col } = require('sequelize');
const { PaymentReceipt, PaymentAllocation, Quotation, Client } = require('../models');

// Sales & Invoices > Payment Receipts. "Payment Receipt" (paymentType
// 'receipt') walks the user through allocating the money against that
// client's real unpaid invoices; "Client Advance" (paymentType 'advance')
// records it as pure advance with no allocation step. Every "unpaid
// invoice" figure shown to the user is computed live from real Invoice
// records (Quotation rows with docType='invoice') minus whatever has
// actually been allocated so far via PaymentAllocation — never a fabricated
// balance.

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function nextReceiptNo(count) {
  return `A${String(count + 1).padStart(5, '0')}`;
}

// @route GET /api/payment-receipts/next-number
exports.getNextNumber = async (req, res) => {
  try {
    const count = await PaymentReceipt.count({ where: { userId: req.user.id } });
    res.json({ success: true, receiptNo: nextReceiptNo(count) });
  } catch (err) {
    console.error('getNextNumber error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate receipt number' });
  }
};

// Computes, for every 'Sent' invoice belonging to this client, how much of
// its grandTotal has already been allocated across all of this partner's
// payment receipts, and returns only the ones still owing money.
// @route GET /api/payment-receipts/unpaid-invoices?clientId=
exports.getUnpaidInvoices = async (req, res) => {
  try {
    const clientId = req.query.clientId;
    if (!clientId) return res.json({ success: true, data: [] });

    const invoices = await Quotation.findAll({
      where: { userId: req.user.id, clientId, docType: 'invoice', status: 'Sent' },
      order: [['quotationDate', 'ASC']],
    });
    if (invoices.length === 0) return res.json({ success: true, data: [] });

    const allocated = await PaymentAllocation.findAll({
      attributes: ['invoiceId', [fn('SUM', col('amount')), 'total']],
      where: { invoiceId: invoices.map((i) => i.id) },
      group: ['invoiceId'],
    });
    const allocatedMap = new Map(allocated.map((a) => [a.invoiceId, Number(a.get('total')) || 0]));

    const data = invoices
      .map((inv) => {
        const paid = round2(allocatedMap.get(inv.id) || 0);
        const remaining = round2(Number(inv.grandTotal) - paid);
        return { invoiceId: inv.id, quotationNo: inv.quotationNo, quotationDate: inv.quotationDate, grandTotal: Number(inv.grandTotal), paid, remaining };
      })
      .filter((i) => i.remaining > 0.009);

    res.json({ success: true, data });
  } catch (err) {
    console.error('getUnpaidInvoices error:', err);
    res.status(500).json({ success: false, message: 'Failed to load unpaid invoices' });
  }
};

// @route GET /api/payment-receipts
exports.listPaymentReceipts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const { search, status, clientId, paymentType, dateFrom, dateTo } = req.query;

    const where = { userId: req.user.id };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (paymentType) where.paymentType = paymentType;
    if (dateFrom || dateTo) {
      where.receiptDate = {};
      if (dateFrom) where.receiptDate[Op.gte] = dateFrom;
      if (dateTo) where.receiptDate[Op.lte] = dateTo;
    }
    if (search) where.receiptNo = { [Op.like]: `%${search}%` };

    const { rows, count } = await PaymentReceipt.findAndCountAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'businessName', 'logoPath'] },
        { model: PaymentAllocation, as: 'allocations' },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({ success: true, data: rows.map((r) => r.toJSON()), total: count, page, limit, totalPages: Math.max(1, Math.ceil(count / limit)) });
  } catch (err) {
    console.error('listPaymentReceipts error:', err);
    res.status(500).json({ success: false, message: 'Failed to load payment receipts' });
  }
};

// @route GET /api/payment-receipts/stats
exports.getStats = async (req, res) => {
  try {
    const [total, draft] = await Promise.all([
      PaymentReceipt.count({ where: { userId: req.user.id } }),
      PaymentReceipt.count({ where: { userId: req.user.id, status: 'Draft' } }),
    ]);
    res.json({ success: true, total, draft });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ success: false, message: 'Failed to load stats' });
  }
};

// @route GET /api/payment-receipts/:id
exports.getPaymentReceipt = async (req, res) => {
  try {
    const receipt = await PaymentReceipt.findOne({
      where: { id: req.params.id, userId: req.user.id },
      include: [{ model: Client, as: 'client' }, { model: PaymentAllocation, as: 'allocations', include: [{ model: Quotation, as: 'invoice' }] }],
    });
    if (!receipt) return res.status(404).json({ success: false, message: 'Payment receipt not found' });
    res.json({ success: true, data: receipt.toJSON() });
  } catch (err) {
    console.error('getPaymentReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to load payment receipt' });
  }
};

function computeRecords(paymentRecords) {
  return (paymentRecords || []).map((r) => {
    const amountReceived = Number(r.amountReceived) || 0;
    const tdsPercent = Number(r.tdsPercent) || 0;
    const tdsAmount = round2((amountReceived * tdsPercent) / 100);
    const transactionCharge = Number(r.transactionCharge) || 0;
    const netAmount = round2(amountReceived - tdsAmount - transactionCharge);
    return { ...r, amountReceived, tdsPercent, tdsAmount, transactionCharge, netAmount };
  });
}

async function applyAllocations(receiptId, allocations, userId) {
  await PaymentAllocation.destroy({ where: { paymentReceiptId: receiptId } });
  const clean = (allocations || []).filter((a) => a.invoiceId && Number(a.amount) > 0);
  if (!clean.length) return 0;

  const invoices = await Quotation.findAll({ where: { id: clean.map((a) => a.invoiceId), userId, docType: 'invoice' } });
  const validIds = new Set(invoices.map((i) => i.id));

  let total = 0;
  const rows = [];
  for (const a of clean) {
    if (!validIds.has(a.invoiceId)) continue;
    const amount = round2(Number(a.amount));
    total += amount;
    rows.push({ paymentReceiptId: receiptId, invoiceId: a.invoiceId, amount });
  }
  if (rows.length) await PaymentAllocation.bulkCreate(rows);
  return round2(total);
}

// @route POST /api/payment-receipts
exports.createPaymentReceipt = async (req, res) => {
  try {
    const body = req.body;
    const paymentType = body.paymentType === 'advance' ? 'advance' : 'receipt';
    const paymentRecords = computeRecords(body.paymentRecords);
    const totalReceived = round2(paymentRecords.reduce((s, r) => s + r.netAmount, 0));

    const count = await PaymentReceipt.count({ where: { userId: req.user.id } });
    const receipt = await PaymentReceipt.create({
      userId: req.user.id,
      receiptNo: body.receiptNo || nextReceiptNo(count),
      paymentType,
      clientId: body.clientId || null,
      receivedFrom: body.receivedFrom || null,
      receiptDate: body.receiptDate,
      currency: body.currency || 'INR',
      paymentRecords,
      totalReceived,
      totalAllocated: 0,
      advanceAmount: totalReceived,
      notes: body.notes || null,
      status: body.status === 'Draft' ? 'Draft' : (body.status || 'Saved'),
    });

    const totalAllocated = paymentType === 'advance' ? 0 : await applyAllocations(receipt.id, body.allocations, req.user.id);
    receipt.totalAllocated = totalAllocated;
    receipt.advanceAmount = round2(totalReceived - totalAllocated);
    await receipt.save();

    res.json({ success: true, data: receipt.toJSON() });
  } catch (err) {
    console.error('createPaymentReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to create payment receipt' });
  }
};

// @route PATCH /api/payment-receipts/:id
exports.updatePaymentReceipt = async (req, res) => {
  try {
    const receipt = await PaymentReceipt.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!receipt) return res.status(404).json({ success: false, message: 'Payment receipt not found' });

    const body = req.body;
    const FIELDS = ['receiptNo', 'clientId', 'receivedFrom', 'receiptDate', 'currency', 'notes', 'status'];
    for (const f of FIELDS) if (body[f] !== undefined) receipt[f] = body[f] || null;
    if (body.paymentType !== undefined) receipt.paymentType = body.paymentType === 'advance' ? 'advance' : 'receipt';

    if (body.paymentRecords !== undefined) {
      const paymentRecords = computeRecords(body.paymentRecords);
      receipt.paymentRecords = paymentRecords;
      receipt.totalReceived = round2(paymentRecords.reduce((s, r) => s + r.netAmount, 0));
    }

    const totalAllocated = receipt.paymentType === 'advance' ? 0 : await applyAllocations(receipt.id, body.allocations, req.user.id);
    receipt.totalAllocated = totalAllocated;
    receipt.advanceAmount = round2(Number(receipt.totalReceived) - totalAllocated);

    await receipt.save();
    res.json({ success: true, data: receipt.toJSON() });
  } catch (err) {
    console.error('updatePaymentReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to update payment receipt' });
  }
};

// @route DELETE /api/payment-receipts/:id
exports.deletePaymentReceipt = async (req, res) => {
  try {
    const receipt = await PaymentReceipt.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!receipt) return res.status(404).json({ success: false, message: 'Payment receipt not found' });
    await PaymentAllocation.destroy({ where: { paymentReceiptId: receipt.id } });
    await receipt.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('deletePaymentReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete payment receipt' });
  }
};
