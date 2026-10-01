const express = require('express');
const router = express.Router();
const workspaceController = require('../controllers/workspace.controller');
const auth = require('../middlewares/auth.middleware');

// Eligible Users Route
router.get('/eligible-users', workspaceController.getEligibleUsers);

// Global Command Center Stats
router.get('/command-center', workspaceController.getCommandCenterStats);

// My Workspace Role Route (authenticated)
router.get(/^\/my-role\/(.+)$/, auth, (req, res, next) => {
    req.params.tenderId = req.params[0];
    next();
}, workspaceController.getMyWorkspaceRole);

// Workspace Overview Analytics Route
router.get(/^\/(.+)\/overview$/, auth, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    next();
}, workspaceController.getWorkspaceOverview);


// Middleware to map regex capture group to named parameters for controllers
const extractTenderId = (req, res, next) => {
    // Regex routes populate req.params[0], [1] etc.
    // We map the first capture group to tenderId
    if (req.params[0]) {
        req.params.tenderId = req.params[0];
    }
    next();
};

// Department Routes
router.get(/^\/(.+)\/departments$/, extractTenderId, workspaceController.getDepartments);
router.post(/^\/(.+)\/departments$/, extractTenderId, workspaceController.createDepartment);
router.put(/^\/(.+)\/departments\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.deptId = req.params[1];
    next();
}, workspaceController.updateDepartment);
router.delete(/^\/(.+)\/departments\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.deptId = req.params[1];
    next();
}, workspaceController.deleteDepartment);
router.get(/^\/(.+)\/departments\/([^\/]+)\/users$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.deptId = req.params[1];
    next();
}, workspaceController.getDepartmentUsers);

// Employee Routes
router.get(/^\/(.+)\/employees$/, extractTenderId, workspaceController.getEmployees);
router.post(/^\/(.+)\/employees$/, extractTenderId, workspaceController.createEmployee);
router.put(/^\/(.+)\/employees\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.empId = req.params[1];
    next();
}, workspaceController.updateEmployee);
router.delete(/^\/(.+)\/employees\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.empId = req.params[1];
    next();
}, workspaceController.deleteEmployee);

// Deadline Routes
router.get(/^\/(.+)\/deadlines$/, extractTenderId, workspaceController.getDeadlines);
router.post(/^\/(.+)\/deadlines$/, extractTenderId, workspaceController.createDeadline);
router.put(/^\/(.+)\/deadlines\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.deadlineId = req.params[1];
    next();
}, workspaceController.updateDeadline);
router.delete(/^\/(.+)\/deadlines\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.deadlineId = req.params[1];
    next();
}, workspaceController.deleteDeadline);

// Task Routes
router.get(/^\/(.+)\/tasks$/, extractTenderId, workspaceController.getTasks);
router.post(/^\/(.+)\/tasks$/, extractTenderId, workspaceController.createTask);
router.put(/^\/(.+)\/tasks\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.taskId = req.params[1];
    next();
}, workspaceController.updateTask);
router.delete(/^\/(.+)\/tasks\/([^\/]+)$/, (req, res, next) => {
    if (req.params[0]) req.params.tenderId = req.params[0];
    if (req.params[1]) req.params.taskId = req.params[1];
    next();
}, workspaceController.deleteTask);

// AI Generate Tasks Route
router.post(/^\/(.+)\/generate-tasks$/, extractTenderId, workspaceController.generateTasks);

module.exports = router;
