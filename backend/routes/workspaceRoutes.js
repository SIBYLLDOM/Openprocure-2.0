const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workspaceController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/workspaceUploadMiddleware');

router.use(protect);

router.get('/:bidNumber/overview', ctrl.getOverview);

router.get('/:bidNumber/departments', ctrl.listDepartments);
router.post('/:bidNumber/departments', ctrl.createDepartment);
router.patch('/:bidNumber/departments/:id', ctrl.renameDepartment);
router.delete('/:bidNumber/departments/:id', ctrl.deleteDepartment);

router.get('/:bidNumber/tasks', ctrl.listTasks);
router.post('/:bidNumber/tasks', ctrl.createTask);
router.patch('/:bidNumber/tasks/:id', ctrl.updateTask);
router.delete('/:bidNumber/tasks/:id', ctrl.deleteTask);

router.get('/:bidNumber/deadlines', ctrl.listDeadlines);
router.post('/:bidNumber/deadlines', ctrl.createDeadline);
router.delete('/:bidNumber/deadlines/:id', ctrl.deleteDeadline);

router.get('/:bidNumber/documents', ctrl.listDocuments);
router.post('/:bidNumber/documents', upload.single('file'), ctrl.uploadDocument);
router.get('/:bidNumber/documents/:id/download', ctrl.downloadDocument);
router.delete('/:bidNumber/documents/:id', ctrl.deleteDocument);

router.get('/:bidNumber/mydocs', ctrl.listMyDocs);
router.post('/:bidNumber/mydocs', ctrl.createMyDoc);
router.patch('/:bidNumber/mydocs/:id', ctrl.updateMyDoc);
router.delete('/:bidNumber/mydocs/:id', ctrl.deleteMyDoc);

router.get('/:bidNumber/doc-prep', ctrl.getDocPrepSession);
router.post('/:bidNumber/doc-prep/analyze', ctrl.analyzeDocPrep);
router.post('/:bidNumber/doc-prep/reset', ctrl.resetDocPrep);
router.post('/:bidNumber/doc-prep/:annexureId/draft', ctrl.draftAnnexure);
router.get('/:bidNumber/doc-prep/:annexureId/export', ctrl.exportAnnexure);
router.patch('/:bidNumber/doc-prep/:annexureId', ctrl.updateAnnexureStatus);

router.get('/:bidNumber/team', ctrl.listTeam);

module.exports = router;
