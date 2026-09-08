const fs = require('fs');
const {
  GemTender, TenderStatusEntry, PartnerProfile, PartnerContact,
  WorkspaceDepartment, WorkspaceTask, WorkspaceDeadline, WorkspaceDocument, WorkspaceMyDoc, WorkspaceDocPrepSession,
} = require('../models');
const { ollamaChat, parseJsonResponse, isOllamaAvailable } = require('../utils/ollamaClient');
const { helpers } = require('./tenderController');
const { fromUrlId, parseGemJsonData } = helpers;

// Clone of the automation site's Tender Hub (/workspace/:tenderId) — the
// container that opens when a partner clicks "Open Workspace" from Active
// Workspaces. Every table here is scoped to (user_id, bid_number): unlike
// the original (one shared internal workspace per tender, visible to all
// Meril staff), each partner tenant gets their own private hub for a
// tender, consistent with every other feature in this portal.

function bidFromReq(req) { return fromUrlId(req.params.bidNumber); }

// @route GET /api/workspace/:bidNumber/overview
exports.getOverview = async (req, res) => {
  try {
    const bidNumber = bidFromReq(req);
    const userId = req.user.id;

    const [tender, statusHistory, departments, tasks, documents, myDocs] = await Promise.all([
      GemTender.findOne({ where: { bidNumber } }),
      TenderStatusEntry.findAll({ where: { userId, bidNumber }, order: [['createdAt', 'DESC']] }),
      WorkspaceDepartment.count({ where: { userId, bidNumber } }),
      WorkspaceTask.findAll({ where: { userId, bidNumber } }),
      WorkspaceDocument.count({ where: { userId, bidNumber } }),
      WorkspaceMyDoc.count({ where: { userId, bidNumber } }),
    ]);

    if (!tender) return res.status(404).json({ success: false, message: 'Tender not found' });

    const latestStatus = statusHistory[0]?.status || null;
    const tasksDone = tasks.filter((t) => t.status === 'done').length;

    // Timeline — merged, sorted events. The original built this server-side
    // across many internal tables (approvals, doc-prep, uploads); here it's
    // this partner's own status-change log plus task/document creations.
    const timeline = [
      ...statusHistory.map((s) => ({ type: 'status', label: `Marked "${s.status}"`, detail: s.remarks, at: s.createdAt })),
      ...tasks.map((t) => ({ type: 'task', label: `Task created: ${t.title}`, detail: t.status, at: t.createdAt })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 30);

    res.json({
      success: true,
      data: {
        tender: {
          bidNumber: tender.bidNumber,
          title: tender.items,
          department: tender.department,
          dept: tender.dept,
          state: tender.state,
          endDate: tender.endDate,
          bidValue: tender.bidValue,
          status: latestStatus,
        },
        summary: {
          departments,
          totalTasks: tasks.length,
          tasksDone,
          documents,
          myDocs,
        },
        timeline,
      },
    });
  } catch (err) {
    console.error('getOverview error:', err);
    res.status(500).json({ success: false, message: 'Failed to load overview' });
  }
};

// ---- Departments ----

exports.listDepartments = async (req, res) => {
  try {
    const departments = await WorkspaceDepartment.findAll({ where: { userId: req.user.id, bidNumber: bidFromReq(req) }, order: [['name', 'ASC']] });
    res.json({ success: true, data: departments.map((d) => d.toJSON()) });
  } catch (err) {
    console.error('listDepartments error:', err);
    res.status(500).json({ success: false, message: 'Failed to load departments' });
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    const dept = await WorkspaceDepartment.create({ userId: req.user.id, bidNumber: bidFromReq(req), name: name.trim() });
    res.json({ success: true, data: dept.toJSON() });
  } catch (err) {
    console.error('createDepartment error:', err);
    res.status(500).json({ success: false, message: 'Failed to create department' });
  }
};

exports.renameDepartment = async (req, res) => {
  try {
    const dept = await WorkspaceDepartment.findOne({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    dept.name = (req.body.name || dept.name).trim();
    await dept.save();
    res.json({ success: true, data: dept.toJSON() });
  } catch (err) {
    console.error('renameDepartment error:', err);
    res.status(500).json({ success: false, message: 'Failed to update department' });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const userId = req.user.id;
    const bidNumber = bidFromReq(req);
    const dept = await WorkspaceDepartment.findOne({ where: { id: req.params.id, userId, bidNumber } });
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    await WorkspaceTask.update({ departmentId: null }, { where: { userId, bidNumber, departmentId: dept.id } });
    await dept.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('deleteDepartment error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete department' });
  }
};

// ---- Tasks ----

exports.listTasks = async (req, res) => {
  try {
    const tasks = await WorkspaceTask.findAll({ where: { userId: req.user.id, bidNumber: bidFromReq(req) }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: tasks.map((t) => t.toJSON()) });
  } catch (err) {
    console.error('listTasks error:', err);
    res.status(500).json({ success: false, message: 'Failed to load tasks' });
  }
};

exports.createTask = async (req, res) => {
  try {
    const { title, departmentId, dueDate, assignedContactId } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
    const task = await WorkspaceTask.create({
      userId: req.user.id, bidNumber: bidFromReq(req), title: title.trim(),
      departmentId: departmentId || null, dueDate: dueDate || null, assignedContactId: assignedContactId || null,
    });
    res.json({ success: true, data: task.toJSON() });
  } catch (err) {
    console.error('createTask error:', err);
    res.status(500).json({ success: false, message: 'Failed to create task' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const task = await WorkspaceTask.findOne({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    const { title, status, dueDate, departmentId, assignedContactId } = req.body;
    if (title !== undefined) task.title = title;
    if (status !== undefined) task.status = status;
    if (dueDate !== undefined) task.dueDate = dueDate || null;
    if (departmentId !== undefined) task.departmentId = departmentId || null;
    if (assignedContactId !== undefined) task.assignedContactId = assignedContactId || null;
    await task.save();
    res.json({ success: true, data: task.toJSON() });
  } catch (err) {
    console.error('updateTask error:', err);
    res.status(500).json({ success: false, message: 'Failed to update task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const deleted = await WorkspaceTask.destroy({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteTask error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete task' });
  }
};

// ---- Deadlines ----

exports.listDeadlines = async (req, res) => {
  try {
    const deadlines = await WorkspaceDeadline.findAll({ where: { userId: req.user.id, bidNumber: bidFromReq(req) }, order: [['dueDate', 'ASC']] });
    res.json({ success: true, data: deadlines.map((d) => d.toJSON()) });
  } catch (err) {
    console.error('listDeadlines error:', err);
    res.status(500).json({ success: false, message: 'Failed to load deadlines' });
  }
};

exports.createDeadline = async (req, res) => {
  try {
    const { title, dueDate } = req.body;
    if (!title?.trim() || !dueDate) return res.status(400).json({ success: false, message: 'Title and due date are required' });
    const deadline = await WorkspaceDeadline.create({ userId: req.user.id, bidNumber: bidFromReq(req), title: title.trim(), dueDate });
    res.json({ success: true, data: deadline.toJSON() });
  } catch (err) {
    console.error('createDeadline error:', err);
    res.status(500).json({ success: false, message: 'Failed to create deadline' });
  }
};

exports.deleteDeadline = async (req, res) => {
  try {
    const deleted = await WorkspaceDeadline.destroy({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Deadline not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteDeadline error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete deadline' });
  }
};

// ---- Documents (partner-uploaded, alongside the official scraped ones) ----

exports.listDocuments = async (req, res) => {
  try {
    const docs = await WorkspaceDocument.findAll({ where: { userId: req.user.id, bidNumber: bidFromReq(req) }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: docs.map((d) => d.toJSON()) });
  } catch (err) {
    console.error('listDocuments error:', err);
    res.status(500).json({ success: false, message: 'Failed to load documents' });
  }
};

exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const doc = await WorkspaceDocument.create({
      userId: req.user.id, bidNumber: bidFromReq(req),
      name: req.file.originalname, filePath: req.file.path, fileSize: req.file.size, mimeType: req.file.mimetype,
    });
    res.json({ success: true, data: doc.toJSON() });
  } catch (err) {
    console.error('uploadDocument error:', err);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const doc = await WorkspaceDocument.findOne({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!doc || !fs.existsSync(doc.filePath)) return res.status(404).json({ success: false, message: 'File not found' });
    res.download(doc.filePath, doc.name);
  } catch (err) {
    console.error('downloadDocument error:', err);
    res.status(500).json({ success: false, message: 'Download failed' });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const doc = await WorkspaceDocument.findOne({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!doc) return res.status(404).json({ success: false, message: 'File not found' });
    if (fs.existsSync(doc.filePath)) fs.unlink(doc.filePath, () => {});
    await doc.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error('deleteDocument error:', err);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
};

// ---- My Docs ----

exports.listMyDocs = async (req, res) => {
  try {
    const docs = await WorkspaceMyDoc.findAll({ where: { userId: req.user.id, bidNumber: bidFromReq(req) }, order: [['updatedAt', 'DESC']] });
    res.json({ success: true, data: docs.map((d) => d.toJSON()) });
  } catch (err) {
    console.error('listMyDocs error:', err);
    res.status(500).json({ success: false, message: 'Failed to load documents' });
  }
};

exports.createMyDoc = async (req, res) => {
  try {
    const doc = await WorkspaceMyDoc.create({ userId: req.user.id, bidNumber: bidFromReq(req), title: req.body.title || 'Untitled document', content: '' });
    res.json({ success: true, data: doc.toJSON() });
  } catch (err) {
    console.error('createMyDoc error:', err);
    res.status(500).json({ success: false, message: 'Failed to create document' });
  }
};

exports.updateMyDoc = async (req, res) => {
  try {
    const doc = await WorkspaceMyDoc.findOne({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const { title, content } = req.body;
    if (title !== undefined) doc.title = title || 'Untitled document';
    if (content !== undefined) doc.content = content;
    await doc.save();
    res.json({ success: true, data: doc.toJSON() });
  } catch (err) {
    console.error('updateMyDoc error:', err);
    res.status(500).json({ success: false, message: 'Failed to save document' });
  }
};

exports.deleteMyDoc = async (req, res) => {
  try {
    const deleted = await WorkspaceMyDoc.destroy({ where: { id: req.params.id, userId: req.user.id, bidNumber: bidFromReq(req) } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Document not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteMyDoc error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete document' });
  }
};

// ---- Doc Prep ----

async function getOrCreateSession(userId, bidNumber) {
  const [session] = await WorkspaceDocPrepSession.findOrCreate({
    where: { userId, bidNumber },
    defaults: { userId, bidNumber, status: 'idle', annexures: [] },
  });
  return session;
}

exports.getDocPrepSession = async (req, res) => {
  try {
    const session = await getOrCreateSession(req.user.id, bidFromReq(req));
    const ollamaReady = await isOllamaAvailable();
    res.json({ success: true, data: session.toJSON(), ollamaReady });
  } catch (err) {
    console.error('getDocPrepSession error:', err);
    res.status(500).json({ success: false, message: 'Failed to load Doc Prep session' });
  }
};

const ANNEXURE_SYSTEM_PROMPT = `You are a GeM tender documentation specialist. Given a tender's technical specifications and category, list every standard supporting document/annexure a bidder typically must submit for this kind of tender (e.g. Manufacturer Authorization Certificate, Compliance Statement, Technical Compliance Sheet, Undertaking of Authenticity, Past Performance Certificate — tailor to what's actually relevant here).
Output ONLY a JSON array: [{"name": "<document name>", "description": "<one-sentence description of what it must contain>"}]
Return 4-10 realistic items. No markdown, no explanation.`;

// @route POST /api/workspace/:bidNumber/doc-prep/analyze
exports.analyzeDocPrep = async (req, res) => {
  try {
    const bidNumber = bidFromReq(req);
    const session = await getOrCreateSession(req.user.id, bidNumber);

    const tender = await GemTender.findOne({ where: { bidNumber } });
    if (!tender) return res.status(404).json({ success: false, message: 'Tender not found' });

    session.status = 'processing';
    await session.save();

    const tenderJson = tender.toJSON();
    const parsed = tenderJson.jsonData ? parseGemJsonData(tenderJson.jsonData) : null;
    const techSpecsText = parsed?.techSpecTables?.length
      ? JSON.stringify(parsed.techSpecTables).slice(0, 6000)
      : (tenderJson.items || '');

    const userMsg = `Tender Item: ${tenderJson.items || ''}
Department: ${tenderJson.dept || ''}
Sub Category: ${tenderJson.subCat || ''}
Technical Specifications: ${techSpecsText}`;

    const raw = await ollamaChat(ANNEXURE_SYSTEM_PROMPT, userMsg);
    const list = parseJsonResponse(raw);
    if (!Array.isArray(list)) throw new Error('Could not parse annexure list from the model response');

    const annexures = list.map((item, i) => ({
      id: `ann_${Date.now()}_${i}`,
      name: item.name || `Document ${i + 1}`,
      description: item.description || '',
      status: 'pending',
      draftContent: null,
    }));

    session.annexures = annexures;
    session.status = 'done';
    session.errorMessage = null;
    await session.save();

    res.json({ success: true, data: session.toJSON() });
  } catch (err) {
    console.error('analyzeDocPrep error:', err);
    const session = await getOrCreateSession(req.user.id, bidFromReq(req));
    session.status = 'error';
    session.errorMessage = err.message;
    await session.save();
    res.status(500).json({ success: false, message: err.message || 'Analysis failed — is Ollama running with a model pulled?' });
  }
};

const DRAFT_SYSTEM_PROMPT = `You are drafting a formal tender-support document on behalf of a bidding company for submission with a GeM bid. Write complete, professional, ready-to-use document text (not a template with blanks) based on the company and tender details given. Output plain text only, no markdown formatting, no commentary — just the document body starting with a title line.`;

// @route POST /api/workspace/:bidNumber/doc-prep/:annexureId/draft
exports.draftAnnexure = async (req, res) => {
  try {
    const bidNumber = bidFromReq(req);
    const session = await getOrCreateSession(req.user.id, bidNumber);
    const annexures = session.annexures || [];
    const annexure = annexures.find((a) => a.id === req.params.annexureId);
    if (!annexure) return res.status(404).json({ success: false, message: 'Annexure not found' });

    const [tender, profile] = await Promise.all([
      GemTender.findOne({ where: { bidNumber } }),
      PartnerProfile.findOne({ where: { userId: req.user.id } }),
    ]);

    const companyInfo = profile?.companyInfo || {};
    const address = profile?.registeredAddress || {};
    const addressLine = [address.line1, address.city, address.state, address.pincode].filter(Boolean).join(', ');

    const userMsg = `Document to draft: ${annexure.name}
Purpose: ${annexure.description}

Company: ${companyInfo.legalName || companyInfo.tradeName || 'The Bidder'}
Company Address: ${addressLine}
Tender: ${tender?.bidNumber || bidNumber} — ${tender?.items || ''}
Buyer Department: ${tender?.department || ''}`;

    const raw = await ollamaChat(DRAFT_SYSTEM_PROMPT, userMsg, { json: false, numPredict: 4096 });
    annexure.draftContent = raw.trim();
    annexure.status = 'drafted';
    session.annexures = [...annexures];
    session.changed('annexures', true);
    await session.save();

    res.json({ success: true, data: annexure });
  } catch (err) {
    console.error('draftAnnexure error:', err);
    res.status(500).json({ success: false, message: err.message || 'Drafting failed — is Ollama running with a model pulled?' });
  }
};

// @route PATCH /api/workspace/:bidNumber/doc-prep/:annexureId
exports.updateAnnexureStatus = async (req, res) => {
  try {
    const session = await getOrCreateSession(req.user.id, bidFromReq(req));
    const annexures = session.annexures || [];
    const annexure = annexures.find((a) => a.id === req.params.annexureId);
    if (!annexure) return res.status(404).json({ success: false, message: 'Annexure not found' });
    if (req.body.status) annexure.status = req.body.status;
    if (req.body.draftContent !== undefined) annexure.draftContent = req.body.draftContent;
    session.annexures = [...annexures];
    session.changed('annexures', true);
    await session.save();
    res.json({ success: true, data: annexure });
  } catch (err) {
    console.error('updateAnnexureStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update annexure' });
  }
};

// @route GET /api/workspace/:bidNumber/doc-prep/:annexureId/export
// Ships the draft as a .doc — Word opens an HTML payload served with a
// msword content-type just fine, which avoids pulling in a docx-generation
// dependency for what's still an early version of this feature.
exports.exportAnnexure = async (req, res) => {
  try {
    const session = await getOrCreateSession(req.user.id, bidFromReq(req));
    const annexure = (session.annexures || []).find((a) => a.id === req.params.annexureId);
    if (!annexure?.draftContent) return res.status(404).json({ success: false, message: 'No draft available to export' });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><pre style="font-family:Calibri,sans-serif;white-space:pre-wrap;">${annexure.draftContent.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body></html>`;
    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${annexure.name.replace(/[^a-z0-9]/gi, '_')}.doc"`);
    res.send(html);
  } catch (err) {
    console.error('exportAnnexure error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};

// @route POST /api/workspace/:bidNumber/doc-prep/reset
exports.resetDocPrep = async (req, res) => {
  try {
    const session = await getOrCreateSession(req.user.id, bidFromReq(req));
    session.status = 'idle';
    session.annexures = [];
    session.errorMessage = null;
    await session.save();
    res.json({ success: true, data: session.toJSON() });
  } catch (err) {
    console.error('resetDocPrep error:', err);
    res.status(500).json({ success: false, message: 'Reset failed' });
  }
};

// ---- Settings: team reference (Setup-Profile contacts) ----

exports.listTeam = async (req, res) => {
  try {
    const profile = await PartnerProfile.findOne({ where: { userId: req.user.id }, include: [{ model: PartnerContact, as: 'contacts' }] });
    res.json({ success: true, data: (profile?.contacts || []).map((c) => c.toJSON()) });
  } catch (err) {
    console.error('listTeam error:', err);
    res.status(500).json({ success: false, message: 'Failed to load team' });
  }
};
