const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'backend/src/controllers/workspace.controller.js');

const newCode = `

// ==================== AI GENERATE TASKS ====================

exports.generateTasks = async (req, res) => {
    try {
        const { tenderId } = req.params;
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
        const deptList = deptRows.map(d => 'ID=' + d.id + ': ' + d.name).join(', ');
        const prompt = [
            'You are a professional tender bid coordinator. Given the tender below, generate a practical list of 8-12 tasks that the team needs to complete to prepare a winning bid. Each task should be specific and actionable.',
            '',
            'Tender: "' + tenderTitle + '"',
            '',
            'Departments available (use ONLY these IDs): ' + deptList,
            '',
            'Return ONLY a valid JSON array (no markdown, no code blocks) like:',
            '[{"title": "Review Technical Specifications","description": "Carefully go through all technical specs.","department_id": <one of the dept IDs>,"tags": ["Doc"],"deadline_days": 3}]',
            'Tags must be one of: Step, Doc, Request, Urgent. deadline_days is number of days from today the task should be due.'
        ].join('\\n');

        // 4. Call gpt-oss:120b-cloud
        const API_KEY = process.env.OPENAI_API_KEY;
        if (!API_KEY) return res.status(500).json({ error: 'AI API key not configured (OPENAI_API_KEY).' });

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: 'gpt-oss:120b-cloud',
                messages: [
                    { role: 'system', content: 'You are a professional tender bid coordinator. Always respond with valid JSON only.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
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
        let generatedTasks;
        try {
            const cleaned = rawContent.replace(/\`\`\`json[\\n]?|[\\n]?\`\`\`/g, '').trim();
            generatedTasks = JSON.parse(cleaned);
            if (!Array.isArray(generatedTasks)) throw new Error('Expected array');
        } catch (e) {
            console.error('[generateTasks] Parse error:', rawContent);
            return res.status(500).json({ error: 'Failed to parse AI response as task list.', raw: rawContent });
        }

        // 6. Bulk-insert tasks
        const today = new Date();
        const insertedTasks = [];
        for (const task of generatedTasks) {
            const deptMatch = deptRows.find(d => d.id === task.department_id);
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

        res.json({ success: true, message: 'Generated ' + insertedTasks.length + ' tasks successfully.', tasks: insertedTasks });

    } catch (error) {
        console.error('[generateTasks] Error:', error);
        res.status(500).json({ error: 'Failed to generate tasks', details: error.message });
    }
};
`;

fs.appendFileSync(controllerPath, newCode, 'utf8');
console.log('Done: generateTasks appended to workspace.controller.js');
