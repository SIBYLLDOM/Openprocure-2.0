const db = require('../config/db');

// ==================== ELIGIBLE USERS ====================
exports.getEligibleUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT name, email FROM users WHERE (role = 'pre-tender' OR role = 'Admin') AND status = 'Active'"
        );
        res.json(users);
    } catch (error) {
        console.error('Error fetching eligible users:', error);
        res.status(500).json({ error: 'Failed to fetch eligible users' });
    }
};

// ==================== MY WORKSPACE ROLE ====================
// Returns the current user's workspace role and assigned department IDs for a given tender
exports.getMyWorkspaceRole = async (req, res) => {
    try {
        const userId = req.user.id;
        const { tenderId } = req.params;

        // Get user email and global role
        const [userRows] = await db.query('SELECT email, role FROM users WHERE id = ?', [userId]);
        if (!userRows.length) return res.json({ role: null, departmentIds: [], isCreator: false });

        const userEmail = userRows[0].email;

        // System-level Admins (users.role = 'Admin') are always treated as workspace creators
        const isCreator = userRows[0].role === 'Admin';

        // Get workspace
        const [workspaceRows] = await db.query(
            'SELECT id FROM workspaces WHERE tender_id = ?', [tenderId]
        );
        if (!workspaceRows.length) return res.json({ role: null, departmentIds: [], isCreator });

        const workspaceId = workspaceRows[0].id;

        // Get employee record for this workspace
        const [empRows] = await db.query(
            `SELECT we.role, we.department_id 
             FROM workspace_employees we 
             WHERE we.workspace_id = ? AND we.email COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci`,
            [workspaceId, userEmail]
        );

        if (!empRows.length) return res.json({ role: null, departmentIds: [], isCreator });

        // A user can be in multiple depts — collect all dept IDs (some may be null)
        const role = empRows[0].role;
        const departmentIds = empRows
            .map(r => r.department_id)
            .filter(id => id !== null);

        res.json({ role, departmentIds, isCreator });
    } catch (error) {
        console.error('Error fetching workspace role:', error);
        res.status(500).json({ error: 'Failed to fetch workspace role' });
    }
};



// Helper function to get or create workspace
const getOrCreateWorkspace = async (tenderId) => {
    try {
        // Check if workspace exists
        const [existing] = await db.query(
            'SELECT id FROM workspaces WHERE tender_id = ?',
            [tenderId]
        );

        if (existing.length > 0) {
            return existing[0].id;
        }

        // Create new workspace
        const [result] = await db.query(
            'INSERT INTO workspaces (tender_id) VALUES (?)',
            [tenderId]
        );

        return result.insertId;
    } catch (error) {
        throw error;
    }
};

// ==================== DEPARTMENT MANAGEMENT ====================

// Get all departments for a workspace
exports.getDepartments = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [departments] = await db.query(
            `SELECT 
        d.*,
        COUNT(e.id) as employee_count
      FROM workspace_departments d
      LEFT JOIN workspace_employees e ON d.id = e.department_id
      WHERE d.workspace_id = ?
      GROUP BY d.id
      ORDER BY d.created_at DESC`,
            [workspaceId]
        );

        res.json(departments);
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
};

// Create a new department
exports.createDepartment = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { name, color, icon } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Department name is required' });
        }

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'INSERT INTO workspace_departments (workspace_id, name, color, icon) VALUES (?, ?, ?, ?)',
            [workspaceId, name, color || '#2563eb', icon || '📁']
        );

        const [newDept] = await db.query(
            'SELECT * FROM workspace_departments WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newDept[0]);
    } catch (error) {
        console.error('Error creating department:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Department name already exists in this workspace' });
        }
        res.status(500).json({ error: 'Failed to create department' });
    }
};

// Update a department
exports.updateDepartment = async (req, res) => {
    try {
        const { tenderId, deptId } = req.params;
        const { name, color, icon } = req.body;

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'UPDATE workspace_departments SET name = ?, color = ?, icon = ? WHERE id = ? AND workspace_id = ?',
            [name, color, icon, deptId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }

        const [updated] = await db.query(
            'SELECT * FROM workspace_departments WHERE id = ?',
            [deptId]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating department:', error);
        res.status(500).json({ error: 'Failed to update department' });
    }
};

// Delete a department
exports.deleteDepartment = async (req, res) => {
    try {
        const { tenderId, deptId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'DELETE FROM workspace_departments WHERE id = ? AND workspace_id = ?',
            [deptId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }

        res.json({ message: 'Department deleted successfully' });
    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ error: 'Failed to delete department' });
    }
};

// ==================== EMPLOYEE MANAGEMENT ====================

// Get all employees for a workspace
exports.getEmployees = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [employees] = await db.query(
            `SELECT 
        e.*,
        d.name as department_name,
        d.color as department_color,
        d.icon as department_icon
      FROM workspace_employees e
      LEFT JOIN workspace_departments d ON e.department_id = d.id
      WHERE e.workspace_id = ?
      ORDER BY e.created_at DESC`,
            [workspaceId]
        );

        res.json(employees);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
};

// Create a new employee
exports.createEmployee = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { name, email, role, department_id } = req.body;

        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'INSERT INTO workspace_employees (workspace_id, department_id, name, email, role) VALUES (?, ?, ?, ?, ?)',
            [workspaceId, department_id || null, name, email, role || 'member']
        );

        const [newEmp] = await db.query(
            `SELECT 
        e.*,
        d.name as department_name,
        d.color as department_color
      FROM workspace_employees e
      LEFT JOIN workspace_departments d ON e.department_id = d.id
      WHERE e.id = ?`,
            [result.insertId]
        );

        res.status(201).json(newEmp[0]);
    } catch (error) {
        console.error('Error creating employee:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already exists in this workspace' });
        }
        res.status(500).json({ error: 'Failed to create employee' });
    }
};

// Update an employee
exports.updateEmployee = async (req, res) => {
    try {
        const { tenderId, empId } = req.params;
        const { name, email, role, department_id } = req.body;

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'UPDATE workspace_employees SET name = ?, email = ?, role = ?, department_id = ? WHERE id = ? AND workspace_id = ?',
            [name, email, role, department_id || null, empId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const [updated] = await db.query(
            `SELECT 
        e.*,
        d.name as department_name,
        d.color as department_color
      FROM workspace_employees e
      LEFT JOIN workspace_departments d ON e.department_id = d.id
      WHERE e.id = ?`,
            [empId]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Failed to update employee' });
    }
};

// Delete an employee
exports.deleteEmployee = async (req, res) => {
    try {
        const { tenderId, empId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'DELETE FROM workspace_employees WHERE id = ? AND workspace_id = ?',
            [empId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ message: 'Employee removed successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'Failed to delete employee' });
    }
};

// ==================== DEADLINE MANAGEMENT ====================

// Get all deadlines for a workspace
exports.getDeadlines = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [deadlines] = await db.query(
            `SELECT 
        *,
        DATEDIFF(deadline_date, CURDATE()) as days_remaining
      FROM workspace_deadlines
      WHERE workspace_id = ?
      ORDER BY deadline_date ASC`,
            [workspaceId]
        );

        res.json(deadlines);
    } catch (error) {
        console.error('Error fetching deadlines:', error);
        res.status(500).json({ error: 'Failed to fetch deadlines' });
    }
};

// Create a new deadline
exports.createDeadline = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { title, deadline_date, description, reminder_days } = req.body;

        if (!title || !deadline_date) {
            return res.status(400).json({ error: 'Title and deadline date are required' });
        }

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'INSERT INTO workspace_deadlines (workspace_id, title, deadline_date, description, reminder_days) VALUES (?, ?, ?, ?, ?)',
            [workspaceId, title, deadline_date, description || null, reminder_days || 3]
        );

        const [newDeadline] = await db.query(
            `SELECT 
        *,
        DATEDIFF(deadline_date, CURDATE()) as days_remaining
      FROM workspace_deadlines 
      WHERE id = ?`,
            [result.insertId]
        );

        res.status(201).json(newDeadline[0]);
    } catch (error) {
        console.error('Error creating deadline:', error);
        res.status(500).json({ error: 'Failed to create deadline' });
    }
};

// ==================== TASK MANAGEMENT ====================

// Get all tasks for a workspace
exports.getTasks = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [tasks] = await db.query(
            `SELECT t.*, d.name as department_name, d.color as department_color 
             FROM workspace_tasks t
             JOIN workspace_departments d ON t.department_id = d.id
             WHERE t.workspace_id = ?
             ORDER BY t.created_at DESC`,
            [workspaceId]
        );
        res.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
};

// Create a new task
exports.createTask = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { department_id, title, status, tags, description, deadline, assigned_users } = req.body;

        if (!department_id || !title) {
            return res.status(400).json({ error: 'Department and Title are required' });
        }

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const assignedUsersJson = assigned_users ? JSON.stringify(assigned_users) : JSON.stringify([]);

        const [result] = await db.query(
            'INSERT INTO workspace_tasks (workspace_id, department_id, title, status, tags, description, deadline, assigned_users) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [workspaceId, department_id, title, status || 'not-done', JSON.stringify(tags || []), description || null, deadline || null, assignedUsersJson]
        );

        const [newTask] = await db.query(
            `SELECT t.*, d.name as department_name, d.color as department_color 
             FROM workspace_tasks t
             JOIN workspace_departments d ON t.department_id = d.id
             WHERE t.id = ?`,
            [result.insertId]
        );

        res.status(201).json(newTask[0]);
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
};

// Update a task
exports.updateTask = async (req, res) => {
    try {
        const { tenderId, taskId } = req.params;
        const { title, status, tags, department_id, description, deadline, assigned_users, remarks } = req.body;
        console.log(`[UPDATE TASK] ID: ${taskId}, Body:`, req.body);
        const workspaceId = await getOrCreateWorkspace(tenderId);

        // Build dynamic update query
        let fields = [];
        let params = [];
        if (title !== undefined) { fields.push('title = ?'); params.push(title); }
        if (status !== undefined) { fields.push('status = ?'); params.push(status); }
        if (tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(tags)); }
        if (department_id !== undefined) { fields.push('department_id = ?'); params.push(department_id); }
        if (description !== undefined) { fields.push('description = ?'); params.push(description); }
        if (deadline !== undefined) { fields.push('deadline = ?'); params.push(deadline); }
        if (assigned_users !== undefined) { fields.push('assigned_users = ?'); params.push(JSON.stringify(assigned_users)); }
        if (remarks !== undefined) { fields.push('remarks = ?'); params.push(remarks); }

        if (fields.length === 0) return res.json({ message: 'No changes' });

        params.push(taskId);
        params.push(workspaceId);

        const [result] = await db.query(
            `UPDATE workspace_tasks SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`,
            params
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found' });

        const [updated] = await db.query(
            `SELECT t.*, d.name as department_name, d.color as department_color 
             FROM workspace_tasks t
             JOIN workspace_departments d ON t.department_id = d.id
             WHERE t.id = ?`,
            [taskId]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
};

// Delete a task
exports.deleteTask = async (req, res) => {
    try {
        const { tenderId, taskId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'DELETE FROM workspace_tasks WHERE id = ? AND workspace_id = ?',
            [taskId, workspaceId]
        );

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Task not found' });

        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
};

// Update a deadline
exports.updateDeadline = async (req, res) => {
    try {
        const { tenderId, deadlineId } = req.params;
        const { title, deadline_date, description, status, reminder_days } = req.body;

        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'UPDATE workspace_deadlines SET title = ?, deadline_date = ?, description = ?, status = ?, reminder_days = ? WHERE id = ? AND workspace_id = ?',
            [title, deadline_date, description, status, reminder_days, deadlineId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Deadline not found' });
        }

        const [updated] = await db.query(
            `SELECT 
        *,
        DATEDIFF(deadline_date, CURDATE()) as days_remaining
      FROM workspace_deadlines 
      WHERE id = ?`,
            [deadlineId]
        );

        res.json(updated[0]);
    } catch (error) {
        console.error('Error updating deadline:', error);
        res.status(500).json({ error: 'Failed to update deadline' });
    }
};

// Delete a deadline
exports.deleteDeadline = async (req, res) => {
    try {
        const { tenderId, deadlineId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [result] = await db.query(
            'DELETE FROM workspace_deadlines WHERE id = ? AND workspace_id = ?',
            [deadlineId, workspaceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Deadline not found' });
        }

        res.json({ message: 'Deadline deleted successfully' });
    } catch (error) {
        console.error('Error deleting deadline:', error);
        res.status(500).json({ error: 'Failed to delete deadline' });
    }
};

// ==================== WORKSPACE USERS ====================

// Get users assigned to a specific department in a workspace
exports.getDepartmentUsers = async (req, res) => {
    try {
        const { tenderId, deptId } = req.params;
        const workspaceId = await getOrCreateWorkspace(tenderId);

        const [users] = await db.query(
            `SELECT id, name, email, role 
             FROM workspace_employees 
             WHERE workspace_id = ? AND (department_id = ? OR role = 'admin')`,
            [workspaceId, deptId]
        );

        res.json(users);
    } catch (error) {
        console.error('Error fetching department users:', error);
        res.status(500).json({ error: 'Failed to fetch department users' });
    }
};


// ==================== WORKSPACE OVERVIEW ANALYTICS ====================

exports.getWorkspaceOverview = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const bidNumber = tenderId.replace(/_/g, "/");
        const workspaceId = await getOrCreateWorkspace(tenderId);

        // 1. Tender Details
        let tenderDetails = {
            id: tenderId,
            status: 'Pending',
            deadline: null,
            budget: null,
            title: 'Unknown Tender'
        };

        // Try gem_tenders
        const [gemRows] = await db.query(
            "SELECT items, end_date, bid_value FROM gem_tenders WHERE bid_number = ?",
            [bidNumber]
        );
        if (gemRows.length > 0) {
            tenderDetails.title = gemRows[0].items || 'N/A';
            tenderDetails.deadline = gemRows[0].end_date || null;
            tenderDetails.budget = gemRows[0].bid_value || 'N/A';
        } else {
            // Try open tenders
            const [openRows] = await db.query(
                "SELECT tender_title, closing_date FROM open_tender_details WHERE tender_id = ?",
                [bidNumber.replace(/\//g, "_")]
            );
            if (openRows.length > 0) {
                tenderDetails.title = openRows[0].tender_title || 'N/A';
                tenderDetails.deadline = openRows[0].closing_date || null;
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
        // Total Departments - count from workspace_departments table
        const [deptCountRows] = await db.query(
            "SELECT COUNT(*) as count FROM workspace_departments WHERE workspace_id = ?",
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

        // 3. File Distribution by Department (using workspace_dept)
        const [fileDistRows] = await db.query(
            "SELECT workspace_dept as name, COUNT(*) as value FROM workdesk_documents WHERE bid_no = ? GROUP BY workspace_dept",
            [bidNumber]
        );

        // 4. Daily Task Trend
        const [taskTrendRows] = await db.query(
            "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as dateStr, DATE_FORMAT(created_at, '%d %b') as date, COUNT(*) as tasks FROM workspace_tasks WHERE workspace_id = ? GROUP BY dateStr, date ORDER BY dateStr ASC",
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
            taskTrend: taskTrendRows.length > 0 ? taskTrendRows : [{ date: 'Today', tasks: totalTasks }],
            fileSummary: fileDistRows.length > 0 ? fileDistRows : [],
            performance: {
                taskCompletionRate: `${taskCompletionRate}%`,
                fileUploads: totalFiles
            }
        });

    } catch (error) {
        console.error('Error fetching workspace overview:', error);
        res.status(500).json({ error: 'Failed to fetch workspace overview' });
    }
};



// ==================== AI GENERATE TASKS ====================

exports.generateTasks = async (req, res) => {
    try {
        const { tenderId } = req.params;
        const { deadline, milestones, documents, existingTasks } = req.body || {};
        const bidNumber = tenderId.replace(/_/g, '/');
        const workspaceId = await getOrCreateWorkspace(tenderId);

        // 1. Gather tender context
        let tenderTitle = bidNumber;
        const [gemRows] = await db.query('SELECT items FROM gem_tenders WHERE bid_number = ?', [bidNumber]);
        if (gemRows.length > 0) tenderTitle = gemRows[0].items || bidNumber;

        // 2. Gather departments
        const [deptRows] = await db.query(
            'SELECT id, name FROM workspace_departments WHERE workspace_id = ?', [workspaceId]
        );
        if (deptRows.length === 0) {
            return res.status(400).json({ error: 'No departments found. Please create departments first.' });
        }

        // 3. Build prompt
        const validDeptRows = deptRows.filter(d => d.name?.toLowerCase() !== 'unknown');
        const deptList = validDeptRows.map(d => 'ID=' + d.id + ': ' + d.name).join(', ');

        let docsContext = documents?.length ? documents.map(d => d.title).join(', ') : 'None attached';
        let existingTasksContext = existingTasks?.length
            ? existingTasks.map(t => {
                const dName = deptRows.find(d => d.id == t.department_id)?.name || '';
                const displayDept = !t.department_id || dName.toLowerCase() === 'unknown' ? 'NONE (Needs Assignment)' : t.department_id;
                return `- ID: ${t.id} | Title: ${t.title} | Dept ID: ${displayDept}`;
            }).join('\n')
            : 'No existing tasks';

        console.log('--- DBG PROMPT CONTEXT ---');
        console.log(existingTasksContext);
        console.log('--------------------------');

        const prompt = [
            'You are a professional tender bid coordinator.',
            `Tender Profile: "${tenderTitle}"`,
            `Absolute Bid Deadline: ${deadline || 'Unknown'}`,
            `Milestones: Start Date=${milestones?.start || 'Unknown'}, Opening Date=${milestones?.opening || 'Unknown'}`,
            `Tender Documents Available for Reference: ${docsContext}`,
            '',
            `Existing Tasks in the System:`,
            existingTasksContext,
            '',
            'Departments available (use ONLY these IDs): ' + deptList,
            '',
            'Return ONLY a valid JSON object (no markdown, no code blocks) with EXACTLY this structure:',
            '{',
            '  "new_tasks": [{"title": "Actionable task", "description": "Details", "department_id": <dept ID>, "tags": ["Doc"], "deadline_days": 3}],',
            '  "assign_existing": [{"task_id": <ID>, "department_id": <dept ID>}]',
            '}',
            'Rules:',
            '1. "new_tasks" must contain 5-10 specific steps to win this bid. CRITICAL: DO NOT duplicate Existing Tasks.',
            '2. "assign_existing" MUST contain valid department assignments for any Existing Tasks that have Dept ID: NONE (Needs Assignment).',
            '3. Tags must be one of: Step, Doc, Request, Urgent. "deadline_days" is number of days from TODAY to completion. Strongly respect the Absolute Bid Deadline.'
        ].join('\n');

        // 4. Call GPT
        const API_KEY = process.env.OPENAI_API_KEY;
        if (!API_KEY) return res.status(500).json({ error: 'AI API key not configured (OPENAI_API_KEY).' });

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a professional tender bid coordinator. Always respond with valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 3000
            })
        });

        if (!aiResponse.ok) {
            const errData = await aiResponse.json();
            console.error('[generateTasks] AI API error:', errData);
            return res.status(500).json({ error: 'AI API call failed', details: errData });
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices[0].message.content;

        // 5. Parse AI response
        let aiOutput;
        try {
            const cleaned = rawContent.replace(/```json[\n]?|[\n]?```/g, '').trim();
            aiOutput = JSON.parse(cleaned);
            if (!aiOutput.new_tasks) throw new Error('Missing new_tasks array');
        } catch (e) {
            console.error('[generateTasks] Parse error:', rawContent);
            return res.status(500).json({ error: 'Failed to parse AI response as JSON object.', raw: rawContent });
        }

        const generatedTasks = Array.isArray(aiOutput.new_tasks) ? aiOutput.new_tasks : [];
        const assignments = Array.isArray(aiOutput.assign_existing) ? aiOutput.assign_existing : [];

        // 5a. Update existing tasks
        let assignmentsUpdated = 0;
        for (const assignment of assignments) {
            if (assignment.task_id && assignment.department_id) {
                const deptMatch = deptRows.find(d => d.id == assignment.department_id);
                if (deptMatch) {
                    await db.query('UPDATE workspace_tasks SET department_id = ? WHERE id = ? AND workspace_id = ?',
                        [deptMatch.id, assignment.task_id, workspaceId]);
                    assignmentsUpdated++;
                }
            }
        }

        // 6. Bulk-insert new tasks
        const today = new Date();
        const insertedTasks = [];
        for (const task of generatedTasks) {
            const deptMatch = deptRows.find(d => d.id == task.department_id);
            const deptId = deptMatch ? deptMatch.id : deptRows[0].id;
            const deadline = new Date(today);
            deadline.setDate(today.getDate() + (Number(task.deadline_days) || 7));
            const deadlineStr = deadline.toISOString().split('T')[0];

            const [result] = await db.query(
                'INSERT INTO workspace_tasks (workspace_id, department_id, title, description, tags, deadline, status, assigned_users) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [workspaceId, deptId, task.title, task.description || null, JSON.stringify(task.tags || []), deadlineStr, 'not-done', JSON.stringify([])]
            );
            insertedTasks.push({ id: result.insertId, ...task, department_id: deptId, deadline: deadlineStr });
        }

        res.json({
            success: true,
            message: `Generated ${insertedTasks.length} new tasks. Assigned departments to ${assignmentsUpdated} existing tasks.`,
            tasks: insertedTasks
        });

    } catch (error) {
        console.error('[generateTasks] Error:', error);
        res.status(500).json({ error: 'Failed to generate tasks', details: error.message });
    }
};


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
                [bidNumber.replace(/\//g, "_")]
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

        // 3. File Distribution by Department (using workspace_dept column)
        const [fileDistRows] = await db.query(
            "SELECT workspace_dept as name, COUNT(*) as value FROM workdesk_documents WHERE bid_no = ? GROUP BY workspace_dept",
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
                taskCompletionRate: `${taskCompletionRate}%`,
                fileUploads: totalFiles
            }
        });

    } catch (error) {
        console.error('Error fetching workspace overview:', error);
        res.status(500).json({ error: 'Failed to fetch workspace overview' });
    }
};


// GET /api/workspaces/command-center
exports.getCommandCenterStats = async (req, res) => {
    try {
        // 1. KPI DATA
        // Active Tenders: unique bid_no from workdesk_documents
        const [tenderRows] = await db.query("SELECT COUNT(DISTINCT bid_no) as count FROM workdesk_documents");
        const activeTendersCount = tenderRows[0].count || 0;

        // Tasks Stats
        const [taskStatsRows] = await db.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'not-done' THEN 1 ELSE 0 END) as pending
            FROM workspace_tasks
        `);
        const totalTasks = taskStatsRows[0].total || 0;
        const completedTasks = taskStatsRows[0].completed || 0;
        const pendingTasks = taskStatsRows[0].pending || 0;
        const efficiency = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const kpiData = {
            activeTenders: { value: activeTendersCount, change: 5, trend: 'up', label: 'Active Tenders', color: 'blue' },
            totalTasks: { value: totalTasks, change: 8, trend: 'up', label: 'Total Tasks', color: 'purple' },
            completed: { value: completedTasks, change: 12, trend: 'up', label: 'Completed', color: 'green' },
            pending: { value: pendingTasks, change: -2, trend: 'down', label: 'Pending', color: 'amber' },
            efficiency: { value: efficiency, change: 4, trend: 'up', label: 'Efficiency', color: 'teal', suffix: '%' }
        };

        // 2. ALERTS
        const [overdueRows] = await db.query("SELECT COUNT(*) as count FROM workspace_tasks WHERE deadline < NOW() AND status != 'done'");
        const [riskRows] = await db.query("SELECT COUNT(*) as count FROM workspace_tasks WHERE deadline BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 DAY) AND status != 'done'");

        const alerts = [
            { type: 'Overdue Tasks', count: overdueRows[0].count || 0, severity: 'high', icon: 'AlertTriangle' },
            { type: 'Deadline Risk', count: riskRows[0].count || 0, severity: 'medium', icon: 'Clock' },
            { type: 'Low Performance', count: 0, severity: 'low', icon: 'TrendingDown' }
        ];

        // 3. DEPARTMENT PERFORMANCE
        const [deptPerfRows] = await db.query(`
            SELECT 
                d.name,
                SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.status = 'not-done' THEN 1 ELSE 0 END) as pending,
                COUNT(t.id) as total
            FROM workspace_departments d
            LEFT JOIN workspace_tasks t ON d.id = t.department_id
            GROUP BY d.id, d.name
        `);
        const deptData = deptPerfRows.map(d => ({
            name: d.name,
            completed: parseInt(d.completed) || 0,
            pending: parseInt(d.pending) || 0,
            total: parseInt(d.total) || 0,
            efficiency: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0
        }));

        // 4. EMPLOYEE LEADERBOARD
        const [empRows] = await db.query(`
            SELECT 
                e.id,
                e.name,
                d.name as dept,
                COUNT(t.id) as tasksTotal,
                SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as tasksDone
            FROM workspace_employees e
            JOIN workspace_departments d ON e.department_id = d.id
            LEFT JOIN workspace_tasks t ON JSON_CONTAINS(COALESCE(t.assigned_users, '[]'), CAST(e.id AS JSON))
            GROUP BY e.id, e.name, d.name
            ORDER BY tasksDone DESC
            LIMIT 10
        `);

        const employeeLeaderboard = empRows.map(e => {
            const tasksTotal = parseInt(e.tasksTotal) || 0;
            const tasksDone = parseInt(e.tasksDone) || 0;
            const eff = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
            return {
                id: e.id,
                name: e.name,
                initials: e.name.split(' ').map(n => n[0]).join('').toUpperCase(),
                role: 'Team Member',
                dept: e.dept,
                status: 'online',
                tasksTotal,
                tasksDone,
                efficiency: eff,
                points: tasksDone * 50,
                streak: Math.min(tasksDone, 5),
                avatar: 'blue',
                trend: 'up',
                thisMonth: [eff - 10, eff - 5, eff - 2, eff]
            };
        });

        // 5. ACTIVE TENDERS
        const [activeTendersRows] = await db.query(`
            SELECT 
                w.tender_id as id,
                COALESCE(g.items, CONCAT('Tender ', w.tender_id)) as name,
                (SELECT COUNT(*) FROM workspace_tasks WHERE workspace_id = w.id) as totalTasks,
                (SELECT COUNT(*) FROM workspace_tasks WHERE workspace_id = w.id AND status = 'done') as completedTasks
            FROM workspaces w
            LEFT JOIN gem_tenders g ON w.tender_id = g.bid_number COLLATE utf8mb4_unicode_ci
            LIMIT 10
        `);

        const activeTenders = activeTendersRows.map(t => {
            const total = parseInt(t.totalTasks) || 0;
            const done = parseInt(t.completedTasks) || 0;
            return {
                id: t.id,
                name: t.name,
                progress: total > 0 ? Math.round((done / total) * 100) : 0,
                deadline: 'TBD',
                status: done === total && total > 0 ? 'Completed' : 'Active',
                priority: 'Medium'
            };
        });

        res.json({
            kpiData,
            alerts,
            deptData,
            employeeLeaderboard,
            activeTenders
        });

    } catch (err) {
        console.error('getCommandCenterStats error:', err);
        res.status(500).json({ error: 'Failed to fetch command center stats' });
    }
};
