const fs = require('fs');
const filePath = 'Backend/src/controllers/workspace.controller.js';
let content = fs.readFileSync(filePath, 'utf8');

const newEndpoint = `
// ==================== WORKSPACE OVERVIEW ANALYTICS ====================

exports.getWorkspaceOverview = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const bidNumber = tenderId.replace(/_/g, "/");
        const workspaceId = await getOrCreateWorkspace(tenderId);

        // 1. Tender Details
        let tenderDetails = {
            id: tenderId,
            status: 'N/A',
            deadline: 'N/A',
            budget: 'N/A',
            title: 'N/A'
        };

        // Try gem_tenders
        const [gemRows] = await db.query(
            "SELECT items, end_date, bid_value FROM gem_tenders WHERE bid_number = ?",
            [bidNumber]
        );
        if (gemRows.length > 0) {
            tenderDetails.title = gemRows[0].items || 'N/A';
            tenderDetails.deadline = gemRows[0].end_date || 'N/A';
            tenderDetails.budget = gemRows[0].bid_value || 'N/A';
        } else {
            // Try open tenders
            const [openRows] = await db.query(
                "SELECT tender_title, closing_date FROM open_tender_details WHERE tender_id = ?",
                [bidNumber.replace(/\\//g, "_")]
            );
            if (openRows.length > 0) {
                tenderDetails.title = openRows[0].tender_title || 'N/A';
                tenderDetails.deadline = openRows[0].closing_date || 'N/A';
            }
        }

        // Get status from tender_status_history
        const [statusRows] = await db.query(
            "SELECT status FROM tender_status_history WHERE bid_number = ? ORDER BY created_date DESC LIMIT 1",
            [bidNumber]
        );
        if (statusRows.length > 0) {
            tenderDetails.status = statusRows[0].status;
        }

        // 2. Summary Items
        // Total Departments
        const [deptCountRows] = await db.query(
            "SELECT COUNT(DISTINCT department_id) as count FROM workspace_employees WHERE workspace_id = ?",
            [workspaceId]
        );
        const totalDepartments = deptCountRows[0].count || 0;

        // Total Tasks & Completed Tasks
        const [taskInfoRows] = await db.query(
            "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed FROM workspace_tasks WHERE workspace_id = ?",
            [workspaceId]
        );
        const totalTasks = taskInfoRows[0].total || 0;
        const completedTasks = taskInfoRows[0].completed || 0;

        // Total Files
        const [fileCountRows] = await db.query(
            "SELECT COUNT(*) as count FROM workdesk_documents WHERE bid_no = ?",
            [bidNumber]
        );
        const totalFiles = fileCountRows[0].count || 0;

        // 3. File Distribution by Department (using dept/department column)
        const [fileDistRows] = await db.query(
            "SELECT department as name, COUNT(*) as value FROM workdesk_documents WHERE bid_no = ? GROUP BY department",
            [bidNumber]
        );
        
        // 4. Monthly Task Trend
        const [taskTrendRows] = await db.query(
            "SELECT DATE_FORMAT(created_at, '%b') as month, COUNT(*) as tasks FROM workspace_tasks WHERE workspace_id = ? GROUP BY month ORDER BY MIN(created_at) ASC",
            [workspaceId]
        );

        // 5. Performance Metrics
        const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        res.json({
            tenderDetails,
            summary: {
                totalDepartments,
                totalTasks,
                totalFiles,
                workspaceStatus: tenderDetails.status === 'proceed' ? 'Active' : tenderDetails.status || 'Pending'
            },
            taskTrend: taskTrendRows.length > 0 ? taskTrendRows : [{ month: 'Current', tasks: totalTasks }],
            fileSummary: fileDistRows,
            performance: {
                taskCompletionRate: \`\${taskCompletionRate}%\`,
                fileUploads: totalFiles
            }
        });

    } catch (error) {
        console.error('Error fetching workspace overview:', error);
        res.status(500).json({ error: 'Failed to fetch workspace overview' });
    }
};

`;

content += '\n' + newEndpoint;
fs.writeFileSync(filePath, content, 'utf8');
console.log('Overview endpoint added to controller.');
