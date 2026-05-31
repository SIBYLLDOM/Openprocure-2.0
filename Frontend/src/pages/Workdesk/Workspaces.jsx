import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, CheckCircle2, Circle, Plus, Upload, FolderOpen, BarChart3, MessageSquare, LayoutDashboard, Users, X, Download, Trash2, ShoppingCart, Tag, Edit2, Wand2, Settings, BrainCog } from 'lucide-react';


import WorkspaceOverview from "./WorkspaceOverview";
import WorkspaceTasks from "./WorkspaceTasks";
import WorkspaceDocuments from "./WorkspaceDocuments";
import WorkspaceAnalytics from "./WorkspaceAnalytics";
import WorkspaceProducts from "./WorkspaceProducts";
import WorkspaceSettings from "./WorkspaceSettings";
import GenerateTasksModal from "./GenerateTasksModal";




const TenderWorkspace = () => {
  // Capture the wildcard path, which corresponds to the full tender ID (e.g. GEM/2025/B/xxxx)
  const { "*": tenderId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('workspace');
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [tenderData, setTenderData] = useState(null);
  // Current user's role in this workspace ('admin', 'member', 'viewer') and their assigned dept IDs
  const [myWorkspaceRole, setMyWorkspaceRole] = useState(null);
  const [myDeptIds, setMyDeptIds] = useState([]);
  const [isCreator, setIsCreator] = useState(false);

  // files: persisted uploaded files per dept
  const [files, setFiles] = useState({});
  // tasks persisted per dept (now flat array from backend)
  const [tasks, setTasks] = useState([]);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '', description: '', deadline: '', assigned_users: [], tag: 'step'
  });
  const [deptUsers, setDeptUsers] = useState([]);
  const [remarksModal, setRemarksModal] = useState({ open: false, taskId: null, remarks: '' });

  // Admin = workspace 'admin' role OR the user who created this tender
  const isAdminRole = myWorkspaceRole === 'admin' || isCreator;

  const [showGenModal, setShowGenModal] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);

  // Environment variables needed for fetching
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const JSON_SERVER_URL = import.meta.env.VITE_JSON_SERVER_URL || 'http://192.168.1.3:5006';

  const loadWorkspace = async () => {
    if (!tenderId) return;

    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    // 0. Fetch current user's workspace role + assigned dept IDs
    try {
      const roleRes = await fetch(`${API_BASE_URL}/workspaces/my-role/${encodeURIComponent(cleanTenderId)}`, { headers });
      if (roleRes.ok) {
        const roleData = await roleRes.json();
        setMyWorkspaceRole(roleData.role);
        setMyDeptIds(roleData.departmentIds || []);
        setIsCreator(roleData.isCreator || false);
      }
    } catch (err) {
      console.error('Error fetching workspace role:', err);
    }

    // 1. Fetch Departments
    let currentDepts = [];
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/departments`, { headers });
      if (res.ok) {
        currentDepts = await res.json();
        setDepartments(currentDepts);
      }
    } catch (err) {
      console.error('Error fetching departments:', err);
    }

    // 2. Fetch Tender Data (Robust Logic)
    let json = null;
    let dbDetailUrl = null;
    try {
      console.log('[Workspaces] Attempting DB fetch for:', cleanTenderId);
      const dbRes = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanTenderId)}`, { headers });
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        if (dbData.success && dbData.data) {
          if (dbData.data.detail_url) dbDetailUrl = dbData.data.detail_url;
          if (dbData.data.json_data) {
            if (typeof dbData.data.json_data === 'string') {
              try { json = JSON.parse(dbData.data.json_data); }
              catch (e) { console.error('Failed to parse json_data:', e); }
            } else {
              json = dbData.data.json_data;
            }
          }
        }
      }
    } catch (e) { console.warn('DB fetch failed', e); }

    if (!json) {
      // Fallback Step 2
      try {
        const pathRes = await fetch(`${API_BASE_URL}/tenders/${encodeURIComponent(cleanTenderId)}/documents/path`, { headers });
        if (pathRes.ok) {
          const pathData = await pathRes.json();
          if (pathData.json_path) {
            let jsonPath = pathData.json_path.replace(/^"|"$/g, '');
            if (/^[a-zA-Z]:/.test(jsonPath) || jsonPath.includes('\\')) {
              jsonPath = `${JSON_SERVER_URL}/${jsonPath.split(/[/\\]/).pop()}`;
            }
            const jsonRes = await fetch(jsonPath);
            if (jsonRes.ok) json = await jsonRes.json();
          }
        }
      } catch (e) { }
    }

    if (!json) {
      // Fallback Step 3
      try {
        let res = await fetch(`${JSON_SERVER_URL}/${tenderId}`);
        if (!res.ok) res = await fetch(`${JSON_SERVER_URL}/${tenderId.replace(/\//g, '_')}`);
        if (res.ok) json = await res.json();
      } catch (e) { }
    }

    if (dbDetailUrl) {
      if (!json) json = { links: [] };
      if (!json.links) json.links = [];
      if (!json.links.some(l => l.uri === dbDetailUrl)) {
        json.links.unshift({ uri: dbDetailUrl, text: "Bid Document" });
      }
    }

    if (json) setTenderData(json);

    // 3. Fetch Tasks from Backend
    let currentTasks = [];
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks`, { headers });
      if (res.ok) {
        currentTasks = await res.json();
        setTasks(currentTasks);
      }
    } catch (e) { console.error('Error fetching tasks:', e); }

    // 4. Auto-create tasks if needed
    if (currentTasks.length === 0 && json?.pages) {
      let documentRequired = "N/A";
      json.pages.forEach(page => {
        page.tables?.forEach(table => {
          table.forEach(([key, value]) => {
            if (key?.toLowerCase().includes("document required")) {
              documentRequired = value;
            }
          });
        });
      });

      if (documentRequired !== "N/A") {
        const docs = documentRequired.split(',')
          .map(d => d.trim())
          .filter(d => d && !d.toLowerCase().includes("eligibility for exemption must be uploaded"));
        const operationsDept = currentDepts.find(d => d.name === 'Operations');
        const targetDeptId = operationsDept ? operationsDept.id : (currentDepts[0]?.id || 1); // Default to ID 1 if no depts, but we usually have depts by now.

        // If departments list is somehow empty (race condition or first load), we might fail to assign correct dept.
        // But strict requirement suggests we should handle it.
        if (targetDeptId) {
          console.log('Auto-creating tasks for docs:', docs);
          for (const doc of docs) {
            try {
              await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  department_id: targetDeptId,
                  title: `Upload ${doc}`,
                  status: 'not-done',
                  tags: ['doc']
                })
              });
            } catch (e) { console.error('Failed to create task:', e); }
          }
          // Refresh tasks
          try {
            const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks`, { headers });
            if (res.ok) setTasks(await res.json());
          } catch (e) { }
        }
      }
    }

    // 5. Fetch persisted workdesk documents for this tender
    try {
      const docsRes = await fetch(
        `${API_BASE_URL}/workdesk-docs/${encodeURIComponent(cleanTenderId)}`,
        { headers }
      );
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        const docs = docsData.data || [];
        // Group by dept name → dept id using currentDepts
        const filesByDept = {};
        docs.forEach(doc => {
          const dept = currentDepts.find(d => d.name === doc.workspace_dept);
          if (!dept) return;
          if (!filesByDept[dept.id]) filesByDept[dept.id] = [];
          filesByDept[dept.id].push({
            id: doc.id,
            name: doc.document_name,
            size: '',
            uploadedAt: new Date(doc.created_at).toLocaleDateString(),
            description: doc.description || '',
            tags: doc.category ? [doc.category] : [],
            file_path: doc.file_path,
            uploader: doc.uploader_name || 'System'
          });
        });
        setFiles(filesByDept);
      }
    } catch (e) { console.error('Error fetching workdesk documents:', e); }
  };

  React.useEffect(() => { loadWorkspace(); }, [tenderId, API_BASE_URL, JSON_SERVER_URL]);

  // tempUploads holds files chosen via input but not yet 'uploaded' (per dept)
  // structure: { [deptId]: [ { tempId, file, name, size, selectedAt, description:'', tags:'' } ] }
  const [tempUploads, setTempUploads] = useState({});

  // Fetch department users when a department is selected (for Admin task assignment)
  React.useEffect(() => {
    if (selectedDepartment && isAdminRole) {
      const fetchDeptUsers = async () => {
        try {
          const cleanTenderId = tenderId.replace(/_/g, '/');
          const token = localStorage.getItem('token');
          const res = await fetch(
            `${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/departments/${selectedDepartment.id}/users`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (res.ok) {
            setDeptUsers(await res.json());
          }
        } catch (e) { console.error('Error fetching dept users:', e); }
      };
      fetchDeptUsers();
    }
  }, [selectedDepartment, isAdminRole, tenderId, API_BASE_URL]);

  const handleDepartmentClick = (dept) => {
    setSelectedDepartment(dept);
    if (!files[dept.id]) {
      setFiles(prev => ({ ...prev, [dept.id]: [] }));
    }
    // Tasks are now a flat array, so no need to initialize per dept here
    // if (!tasks[dept.id]) {
    //   setTasks(prev => ({ ...prev, [dept.id]: [] }));
    // }
    if (!tempUploads[dept.id]) {
      setTempUploads(prev => ({ ...prev, [dept.id]: [] }));
    }
  };

  // When user selects files from input, store them in tempUploads for that dept (and allow description/tags before final upload)
  const handleFileSelect = (e, deptId) => {
    const selected = Array.from(e.target.files).map(file => ({
      tempId: Date.now() + Math.random(),
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(2) + ' KB',
      selectedAt: new Date().toLocaleDateString(),
      description: '',
      tags: '' // comma-separated tags string
    }));

    setTempUploads(prev => ({
      ...prev,
      [deptId]: [...(prev[deptId] || []), ...selected]
    }));

    // clear the input value so same file can be selected again if needed
    e.target.value = null;
  };

  // confirm upload of a single temp file — POST to backend
  const handleConfirmUpload = async (deptId, tempId) => {
    const tempList = tempUploads[deptId] || [];
    const item = tempList.find(t => t.tempId === tempId);
    if (!item) return;

    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    const dept = departments.find(d => d.id === deptId);

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('workspace_dept', dept?.name || '');
    formData.append('description', item.description || '');
    formData.append('category', item.tags || '');
    // business_unit left as default 'Other' unless you want to add a field for it

    try {
      const res = await fetch(
        `${API_BASE_URL}/workdesk-docs/${encodeURIComponent(cleanTenderId)}/upload`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
      );
      if (res.ok) {
        const { data } = await res.json();
        const uploadedFile = {
          id: data.id,
          name: data.document_name,
          size: item.size,
          uploadedAt: new Date(data.created_at).toLocaleDateString(),
          description: data.description || '',
          tags: data.category ? [data.category] : [],
          file_path: data.file_path,
          uploader: data.uploader_name || 'System'
        };
        setFiles(prev => ({ ...prev, [deptId]: [...(prev[deptId] || []), uploadedFile] }));
      } else {
        alert('Upload failed: ' + res.statusText);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Upload failed. See console.');
    }

    // Remove from staging regardless
    setTempUploads(prev => ({ ...prev, [deptId]: prev[deptId].filter(t => t.tempId !== tempId) }));
  };

  // upload all temp files for dept sequentially
  const handleConfirmUploadAll = async (deptId) => {
    const tempList = tempUploads[deptId] || [];
    if (tempList.length === 0) return;
    for (const item of tempList) {
      await handleConfirmUpload(deptId, item.tempId);
    }
  };

  // on-change handlers for description/tags in tempUploads
  const updateTempUploadField = (deptId, tempId, field, value) => {
    setTempUploads(prev => ({
      ...prev,
      [deptId]: (prev[deptId] || []).map(item =>
        item.tempId === tempId ? { ...item, [field]: value } : item
      )
    }));
  };

  // Delete a persisted file — call backend and update local state
  const handleAnalyzeDocument = async (docId) => {
    try {
      setIsAnalyzingFile(true);
      setAnalysisResult(null);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/workdesk-docs/analyze/${docId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) throw new Error('AI Analysis failed.');
      const data = await res.json();
      setAnalysisResult(data.feedback);
    } catch (err) {
      console.error(err);
      alert('Failed to analyze document: ' + err.message);
    } finally {
      setIsAnalyzingFile(false);
    }
  };
  const deleteFile = async (deptId, fileId) => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${API_BASE_URL}/workdesk-docs/doc/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Delete error:', err);
    }
    setFiles(prev => ({ ...prev, [deptId]: prev[deptId].filter(file => file.id !== fileId) }));
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/workdesk-docs/download/${fileId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file.');
    }
  };

  const handleAddTask = async (deptId) => {
    if (newTaskForm.title.trim() && deptId) {
      const cleanTenderId = tenderId.replace(/_/g, '/');
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            department_id: deptId,
            title: newTaskForm.title,
            description: newTaskForm.description,
            deadline: newTaskForm.deadline || null,
            assigned_users: newTaskForm.assigned_users,
            status: 'not-done',
            tags: [newTaskForm.tag]
          })
        });
        if (res.ok) {
          const addedTask = await res.json();
          setTasks(prev => [...prev, addedTask]);
          setNewTaskForm({ title: '', description: '', deadline: '', assigned_users: [], tag: 'step' });
        } else {
          console.error('Failed to add task:', res.statusText);
        }
      } catch (err) {
        console.error('Error adding task:', err);
      }
    }
  };

  const handleTaskToggle = async (taskId, task) => {
    const newStatus = task.status === 'done' ? 'not-done' : 'done';
    // Optimistic
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      const cleanTenderId = tenderId.replace(/_/g, '/');
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Failed to update task');
    } catch (e) {
      console.error(e);
      // Revert
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: task.status } : t));
      alert("Failed to update task status. Changes reverted.");
    }
  };

  const deleteTask = async (taskId) => {
    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setTasks(prev => prev.filter(task => task.id !== taskId));
      } else {
        console.error('Failed to delete task:', res.statusText);
      }
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  // Ask for remarks and submit task completion
  const confirmTaskDone = async () => {
    const { taskId, remarks } = remarksModal;
    if (!taskId) return;

    // Optimistic
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done', remarks } : t));

    try {
      const cleanTenderId = tenderId.replace(/_/g, '/');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'done', remarks })
      });
      if (!res.ok) throw new Error('Failed to update task');
    } catch (e) {
      console.error(e);
      // Revert if failed (to not-done)
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'not-done', remarks: null } : t));
      alert("Failed to update task status. Changes reverted.");
    }
    setRemarksModal({ open: false, taskId: null, remarks: '' });
  };

  // ---- Task Edit Modal ----
  const [editTaskModal, setEditTaskModal] = useState(null); // null or { id, title, tag, description, deadline, assigned_users, department_id }

  const openEditTaskModal = (task) => {
    setEditTaskModal({
      id: task.id,
      title: task.title || '',
      tag: task.tags && task.tags.length > 0 ? task.tags[0] : 'step',
      description: task.description || '',
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      assigned_users: Array.isArray(task.assigned_users) ? task.assigned_users : [],
      department_id: task.department_id
    });
  };

  const saveEditTaskModal = async () => {
    if (!editTaskModal || !editTaskModal.title.trim()) return;
    const { id: taskId, title, tag, description, deadline, assigned_users, department_id } = editTaskModal;
    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ title, tags: [tag], description, deadline: deadline || null, assigned_users, department_id })
      });
      if (res.ok) {
        const updatedTask = await res.json();
        setTasks(prev => prev.map(t => t.id === taskId ? updatedTask : t));
        setEditTaskModal(null);
      }
    } catch (err) { console.error('Error updating task:', err); }
  };

  // ---- Task Complete Modal ----
  const [completeModal, setCompleteModal] = useState(null); // null or { taskId, remarks, confirmed }

  const openCompleteModal = (taskId) => {
    setCompleteModal({ taskId, remarks: '', confirmed: false });
  };

  const submitCompleteModal = async () => {
    if (!completeModal || !completeModal.confirmed) return;
    const { taskId, remarks } = completeModal;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'done', remarks } : t));
    try {
      const cleanTenderId = tenderId.replace(/_/g, '/');
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: 'done', remarks })
      });
      if (!res.ok) throw new Error('Failed');
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === completeModal.taskId ? { ...t, status: 'not-done', remarks: null } : t));
      alert('Failed to mark task as done. Please try again.');
    }
    setCompleteModal(null);
  };


  // ---------------- DOC GENERATION WIZARD ----------------
  const [isDocWizardOpen, setIsDocWizardOpen] = useState(false);
  const [docWizardStep, setDocWizardStep] = useState(1); // 1: Select Task, 2: Editor
  const [selectedTaskForDoc, setSelectedTaskForDoc] = useState(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const openDocWizard = (deptId) => {
    setIsDocWizardOpen(true);
    setDocWizardStep(1);
    setSelectedTaskForDoc(null);
    setGeneratedContent('');
  };

  const handleDocTaskSelect = (task) => {
    // Navigate to the full page document editor
    // We encode the tenderId if needed, though react-router handles URL params well.
    // tenderId here is "GEM/..." from splat, we might need to double check path matching
    // Route is /workspace/:tenderId/doc-editor/:taskId
    // Workspaces is at /workspace/* so tenderId is the * part.
    // If we simply use navigate, we should be careful about relative paths.
    // The App.jsx route is /workspace/:tenderId/doc-editor/:taskId
    // Workspaces "tenderId" from splat is "GEM/2025/..."

    // We need to match the route definition in App.jsx
    // Wait, App.jsx defines /workspace/* for Workspaces.
    // AND /workspace/:tenderId/doc-editor/:taskId separately.
    // So we need to construct the full path.
    const encodedId = encodeURIComponent(tenderId);
    navigate(`/workspace/${encodedId}/doc-editor/${task.id}`);
  };

  const generateAIContent = async () => {
    if (!selectedTaskForDoc) return;
    setIsGenerating(true);
    // SIMULATED GPT CALL
    // In a real app, you'd call: await fetch('/api/generate-doc', { task: selectedTaskForDoc.title })
    setTimeout(() => {
      setGeneratedContent(`
<h1>${selectedTaskForDoc.title}</h1>
<p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
<hr/>
<h2>1. Introduction</h2>
<p>This document addresses the requirements for <em>${selectedTaskForDoc.title}</em>. Based on the tender analysis, the following points are critical.</p>
<h2>2. Details</h2>
<ul>
  <li>Requirement A: Compliant</li>
  <li>Requirement B: Pending Review</li>
  <li>Timeline: Immediate</li>
</ul>
<h2>3. Conclusion</h2>
<p>Generated by AI Assistant.</p>
      `);
      setIsGenerating(false);
    }, 1500);
  };

  const saveGeneratedDoc = () => {
    if (!selectedTaskForDoc || !selectedDepartment) return;

    const newFile = {
      id: Date.now(),
      name: `${selectedTaskForDoc.title}.html`, // Saving as HTML for now
      size: '2 KB',
      uploadedAt: new Date().toLocaleDateString(),
      description: `Generated from task: ${selectedTaskForDoc.title}`,
      tags: ['generated', 'doc']
    };

    setFiles(prev => ({
      ...prev,
      [selectedDepartment.id]: [...(prev[selectedDepartment.id] || []), newFile]
    }));

    setIsDocWizardOpen(false);
  };

  const renderWorkspace = () => {
    if (selectedDepartment) {
      const departmentTasks = tasks.filter(task => task.department_id === selectedDepartment.id);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '8px',
                background: selectedDepartment.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                {selectedDepartment.icon}
              </div>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>{selectedDepartment.name}</h2>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>Department Management</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedDepartment(null)}
              style={{
                padding: '0.5rem',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <X style={{ width: '1.5rem', height: '1.5rem', color: '#6b7280' }} />
            </button>
          </div>

          {/* File Management */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderOpen style={{ width: '1.25rem', height: '1.25rem', color: '#2563eb' }} />
                File Management
              </h3>
              <button
                onClick={() => openDocWizard(selectedDepartment.id)}
                style={{
                  padding: '0.65rem 1rem',
                  background: '#7c3aed',
                  color: 'white',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: 'none',
                  marginRight: '1rem'
                }}
              >
                <Wand2 size={16} /> Generate Doc
              </button>

              <label style={{
                padding: '0.65rem 1rem',
                background: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'background 0.2s',
                border: 'none'
              }}
                onMouseEnter={(e) => e.target.style.background = '#1e40af'}
                onMouseLeave={(e) => e.target.style.background = '#2563eb'}>
                <Upload style={{ width: '1rem', height: '1rem' }} />
                Select Files
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e, selectedDepartment.id)}
                />
              </label>
            </div>

            {/* TEMP UPLOAD AREA: show selected files with description & tags inputs and Upload buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              {(tempUploads[selectedDepartment.id] || []).length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#374151' }}>{tempUploads[selectedDepartment.id].length} file(s) selected</p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleConfirmUploadAll(selectedDepartment.id)}
                        style={{
                          padding: '0.6rem 0.9rem',
                          background: '#2563eb',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#1e40af'}
                        onMouseLeave={(e) => e.target.style.background = '#2563eb'}
                      >
                        Upload All
                      </button>
                    </div>
                  </div>

                  {(tempUploads[selectedDepartment.id] || []).map(item => (
                    <div key={item.tempId} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                        <FileText style={{ width: '1.25rem', height: '1.25rem', color: '#2563eb', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: '500', color: '#1f2937', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>{item.size} • {item.selectedAt}</p>

                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              placeholder="Description"
                              value={item.description}
                              onChange={(e) => updateTempUploadField(selectedDepartment.id, item.tempId, 'description', e.target.value)}
                              style={{
                                flex: 2,
                                minWidth: '200px',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '0.9rem'
                              }}
                            />
                            <input
                              type="text"
                              placeholder="Tags (comma separated)"
                              value={item.tags}
                              onChange={(e) => updateTempUploadField(selectedDepartment.id, item.tempId, 'tags', e.target.value)}
                              style={{
                                flex: 1,
                                minWidth: '160px',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #e5e7eb',
                                borderRadius: '6px',
                                fontSize: '0.9rem'
                              }}
                            />
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <button
                                onClick={() => handleConfirmUpload(selectedDepartment.id, item.tempId)}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  background: '#059669',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontWeight: 600,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem'
                                }}
                                onMouseEnter={(e) => e.target.style.background = '#047857'}
                                onMouseLeave={(e) => e.target.style.background = '#059669'}
                              >
                                <Upload style={{ width: '0.9rem', height: '0.9rem' }} /> Upload
                              </button>
                              <button
                                onClick={() => setTempUploads(prev => ({ ...prev, [selectedDepartment.id]: prev[selectedDepartment.id].filter(t => t.tempId !== item.tempId) }))}
                                style={{
                                  padding: '0.45rem 0.6rem',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => e.target.style.background = '#ffffff'}
                                onMouseLeave={(e) => e.target.style.background = 'transparent'}
                              >
                                <X style={{ width: '1rem', height: '1rem', color: '#6b7280' }} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {files[selectedDepartment.id]?.length > 0 ? (
                files[selectedDepartment.id].map(file => (
                  <div key={file.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      <FileText style={{ width: '1.25rem', height: '1.25rem', color: '#2563eb', flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: '500', color: '#1f2937', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                          {file.size ? `${file.size} • ` : ''}{file.uploadedAt} • <span style={{ color: '#4b5563', fontWeight: 500 }}>Uploaded by {file.uploader || 'System'}</span>
                        </p>
                        {file.description && <p style={{ fontSize: '0.85rem', color: '#374151', margin: '0.5rem 0 0 0' }}><strong>Description:</strong> {file.description}</p>}
                        {file.tags?.length > 0 && (
                          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {file.tags.map((t, idx) => (
                              <span key={idx} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderRadius: '999px', background: '#eef2ff', color: '#3730a3' }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        title="AI Analysis (Compliance Check)"
                        onClick={() => handleAnalyzeDocument(file.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#f5f3ff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#ede9fe'}
                        onMouseLeave={(e) => e.target.style.background = '#f5f3ff'}>
                        <BrainCog style={{ width: '1.2rem', height: '1.2rem', color: '#7c3aed' }} />
                      </button>
                      <button
                        onClick={() => handleDownload(file.id, file.name)}
                        style={{
                          padding: '0.5rem',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#ffffff'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                        <Download style={{ width: '1rem', height: '1rem', color: '#6b7280' }} />
                      </button>
                      <button
                        onClick={() => deleteFile(selectedDepartment.id, file.id)}
                        style={{
                          padding: '0.5rem',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#ffffff'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                        <Trash2 style={{ width: '1rem', height: '1rem', color: '#dc2626' }} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0', margin: 0 }}>No files uploaded yet</p>
              )}
            </div>
          </div>

          {/* Task Management */}
          <div style={{ background: '#ffffff', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 style={{ width: '1.25rem', height: '1.25rem', color: '#059669' }} />
              Task Management
            </h3>

            {isAdminRole && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={newTaskForm.title}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Task Title..."
                    style={{ flex: 1, minWidth: '200px', padding: '0.65rem 1rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.95rem' }}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTask(selectedDepartment.id)}
                  />
                  <select
                    value={newTaskForm.tag}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, tag: e.target.value }))}
                    style={{ padding: '0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', cursor: 'pointer' }}
                  >
                    <option value="step">Step</option>
                    <option value="doc">Doc</option>
                    <option value="request">Request</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Task Description (Optional)..."
                  rows={2}
                  style={{ width: '100%', padding: '0.65rem 1rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical' }}
                />

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={newTaskForm.deadline}
                    onChange={(e) => setNewTaskForm(prev => ({ ...prev, deadline: e.target.value }))}
                    style={{ padding: '0.65rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', flex: 1, minWidth: '150px' }}
                  />

                  {deptUsers.length > 0 && (
                    <div style={{ flex: 2, minWidth: '200px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.5rem 0.75rem', background: 'white', maxHeight: '100px', overflowY: 'auto' }}>
                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assign To</p>
                      {deptUsers.map(u => (
                        <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer', padding: '0.15rem 0' }}>
                          <input
                            type="checkbox"
                            checked={newTaskForm.assigned_users.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewTaskForm(prev => ({ ...prev, assigned_users: [...prev.assigned_users, u.id] }));
                              } else {
                                setNewTaskForm(prev => ({ ...prev, assigned_users: prev.assigned_users.filter(id => id !== u.id) }));
                              }
                            }}
                            style={{ accentColor: '#2563eb' }}
                          />
                          {u.name} <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({u.role})</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => handleAddTask(selectedDepartment.id)}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      height: '44px'
                    }}>
                    <Plus size={16} /> Add Task
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {departmentTasks.length > 0 ? (
                departmentTasks.map(task => (
                  <div key={task.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#f8fafc'}>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: 0, paddingBottom: '0.25rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontWeight: '600',
                          fontSize: '0.95rem',
                          color: task.status === 'done' ? '#6b7280' : '#1f2937',
                          textDecoration: task.status === 'done' ? 'line-through' : 'none',
                          margin: '0 0 0.25rem 0',
                          wordBreak: 'break-word',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          {task.status === 'done' && <CheckCircle2 size={16} color="#16a34a" />}
                          {task.title}
                        </p>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Added: {new Date(task.createdAt).toLocaleDateString()}</span>
                          {task.deadline && (
                            <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, background: '#fee2e2', padding: '0.15rem 0.4rem', borderRadius: '4px', border: '1px solid #fca5a5' }}>
                              Due: {new Date(task.deadline).toLocaleDateString()}
                            </span>
                          )}
                          {task.tags && task.tags.length > 0 && task.tags.map((tag, idx) => (
                            <span key={idx} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                              {tag.toUpperCase()}
                            </span>
                          ))}
                        </div>

                        {task.description && (
                          <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0.5rem 0 0 0', fontStyle: 'italic', background: '#f9fafb', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                            {task.description}
                          </p>
                        )}

                        {task.assigned_users && typeof task.assigned_users === 'object' && task.assigned_users.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                            <Users size={14} style={{ color: '#4f46e5', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 600 }}>Assigned To:</span>
                            {task.assigned_users.map((uid) => {
                              const user = deptUsers.find(u => u.id === uid);
                              return (
                                <span key={uid} style={{ background: '#e0e7ff', color: '#4338ca', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, border: '1px solid #c7d2fe' }}>
                                  {user ? user.name : `User #${uid}`}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {task.remarks && (
                          <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderLeft: '4px solid #22c55e', borderRadius: '4px' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#166534' }}><strong>Completion Remarks:</strong> {task.remarks}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Icon Actions Container */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start', background: 'white', padding: '0.3rem', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>

                      {/* Complete IconButton */}
                      {task.status !== 'done' && (
                        <button
                          title="Mark as Completed"
                          onClick={() => openCompleteModal(task.id)}
                          style={{
                            padding: '0.5rem',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.transform = 'scale(1.05)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.transform = 'scale(1)' }}
                        >
                          <CheckCircle2 size={18} color="#16a34a" />
                        </button>
                      )}

                      {/* Edit IconButton */}
                      <button
                        title="Edit Task"
                        onClick={() => openEditTaskModal(task)}
                        style={{
                          padding: '0.5rem',
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.transform = 'scale(1.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <Edit2 size={18} color="#2563eb" />
                      </button>

                      {/* Delete IconButton */}
                      <button
                        title="Delete Task"
                        onClick={() => deleteTask(task.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.transform = 'scale(1.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <Trash2 size={18} color="#dc2626" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0', margin: 0 }}>No tasks added yet</p>
              )}
            </div>
          </div>



          {/* ---------------- DOC GENERATOR WIZARD MODAL ---------------- */}
          {
            isDocWizardOpen && selectedDepartment && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999
              }}>
                <div style={{
                  background: 'white', width: '800px', height: '600px', borderRadius: '12px',
                  display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                }}>
                  {/* Header */}
                  <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>
                      {docWizardStep === 1 ? 'Select a Task to Generate Doc' : 'AI Document Editor'}
                    </h2>
                    <button onClick={() => setIsDocWizardOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X /></button>
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', background: '#f9fafb' }}>
                    {docWizardStep === 1 ? (
                      // STEP 1: SELECT TASK
                      <div style={{ display: 'grid', gap: '1rem' }}>
                        {/* Static Options */}
                        <div
                          onClick={() => {
                            const encodedId = encodeURIComponent(tenderId);
                            navigate(`/workspace/${encodedId}/rep-editor`);
                          }}
                          style={{
                            padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0',
                            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#16a34a'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#bbf7d0'}
                        >
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>Representation Letter</p>
                            <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#15803d' }}>Generate official representation letter</p>
                          </div>
                          <div style={{ background: '#dcfce7', color: '#166534', padding: '5px 10px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600 }}>
                            Template
                          </div>
                        </div>

                        {/* Dynamic Tasks */}
                        {tasks.filter(t => t.department_id === selectedDepartment.id && t.tags?.includes('doc')).length > 0 ? (
                          tasks
                            .filter(t => t.department_id === selectedDepartment.id && t.tags?.includes('doc'))
                            .map(task => (
                              <div key={task.id}
                                onClick={() => handleDocTaskSelect(task)}
                                style={{
                                  padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb',
                                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                              >
                                <div>
                                  <p style={{ margin: 0, fontWeight: 600 }}>{task.title}</p>
                                  <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: '#666' }}>ID: {task.id}</p>
                                </div>
                                <div style={{ background: '#eef2ff', color: '#4f46e5', padding: '5px 10px', borderRadius: '20px', fontSize: '0.8rem' }}>
                                  Doc Task
                                </div>
                              </div>
                            ))
                        ) : (
                          <div style={{ textAlign: 'center', color: '#666', padding: '1rem', border: '1px dashed #ccc', borderRadius: '8px' }}>
                            No specific doc tasks found. Select "Representation Letter" above or add a task with 'doc' tag.
                          </div>
                        )}
                      </div>
                    ) : (
                      // STEP 2: EDITOR
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>Editing: {selectedTaskForDoc?.title}</span>
                          <button
                            onClick={generateAIContent} disabled={isGenerating}
                            style={{
                              background: isGenerating ? '#cbd5e1' : '#7c3aed', color: 'white', border: 'none',
                              padding: '0.5rem 1rem', borderRadius: '6px', cursor: isGenerating ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}
                          >
                            <Wand2 size={16} /> {isGenerating ? 'Generating...' : 'Generate with AI'}
                          </button>
                        </div>
                        <textarea
                          value={generatedContent}
                          onChange={(e) => setGeneratedContent(e.target.value)}
                          style={{
                            flex: 1, padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb',
                            fontSize: '1rem', lineHeight: '1.6', fontFamily: 'monospace', resize: 'none'
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    {docWizardStep === 2 && (
                      <>
                        <button onClick={() => setDocWizardStep(1)} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }}>Back</button>
                        <button onClick={saveGeneratedDoc} style={{ padding: '0.5rem 1rem', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Save Document</button>
                      </>
                    )}
                    {docWizardStep === 1 && (
                      <button onClick={() => setIsDocWizardOpen(false)} style={{ padding: '0.5rem 1rem', background: '#ccc', color: 'black', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                    )}
                  </div>
                </div>
              </div>
            )
          }
        </div >
      );
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {visibleDepartments.map((dept) => (
          <div
            key={dept.id}
            onClick={() => handleDepartmentClick(dept)}
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: '1px solid transparent'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.08)';
            }}>
            <div style={{ height: '4px', background: dept.color }}></div>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '10px',
                  background: dept.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s'
                }}>
                  {dept.icon}
                </div>
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', margin: '0 0 1rem 0' }}>{dept.name}</h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 style={{ width: '1rem', height: '1rem', color: '#059669' }} />
                  <span>{tasks.filter(task => task.department_id === dept.id).length || 0} tasks</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <FileText style={{ width: '1rem', height: '1rem', color: '#2563eb' }} />
                  <span>{files[dept.id]?.length || 0} files</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <WorkspaceOverview
            departments={departments}
            tasks={tasks}
            files={files}
          />
        );

      case 'workspace':
        return renderWorkspace();
      case 'task':
        return (
          <WorkspaceTasks
            departments={departments}
            tasks={tasks}
            onToggleStatus={handleTaskToggle}
            onGenerateClick={() => setShowGenModal(true)}
          />
        );

      case 'products':
        return <WorkspaceProducts tenderId={tenderId} />;

      case 'documents':
        return <WorkspaceDocuments links={tenderData?.links || []} />;

      case 'analytics':
        return <WorkspaceAnalytics />;

      case 'settings':
        return <WorkspaceSettings tenderId={tenderId} />;

      default:
        return renderWorkspace();
    }
  };

  // Only admin-role users in the workspace can access Settings

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'workspace', label: 'Workspace', icon: FolderOpen },
    { id: 'task', label: 'Tasks', icon: CheckCircle2 },
    { id: 'products', label: 'Products', icon: ShoppingCart },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ...(isAdminRole ? [{ id: 'settings', label: 'Settings', icon: Settings }] : [])
  ];

  // Filter visible departments: admin sees all, others see only their assigned depts
  const visibleDepartments = isAdminRole || myDeptIds.length === 0
    ? departments
    : departments.filter(d => myDeptIds.includes(d.id));

  // AI Generate Tasks — calls the backend endpoint which uses gpt-oss:120b-cloud
  const handleGenerateTasks = async () => {
    if (!tenderId) return;
    setIsGeneratingTasks(true);
    const cleanTenderId = tenderId.replace(/_/g, '/');
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    // Package context for the backend AI prompt
    const payload = {
      deadline: tenderData?.end_date || tenderData?.bidEndDate || null,
      milestones: {
        start: tenderData?.start_date || tenderData?.e_published_date || null,
        opening: tenderData?.opening_date || null
      },
      documents: (tenderData?.links || []).map(l => ({ title: l.text || l.uri.split('/').pop(), uri: l.uri })),
      existingTasks: tasks.map(t => ({ id: t.id, title: t.title, department_id: t.department_id, status: t.status }))
    };

    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/generate-tasks`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert('AI generation failed: ' + (data.error || 'Unknown error'));
        return;
      }

      // Refresh task list from server
      const tasksRes = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(cleanTenderId)}/tasks`, { headers });
      if (tasksRes.ok) setTasks(await tasksRes.json());

      setShowGenModal(false);
      alert(`✅ ${data.message}`);
    } catch (err) {
      console.error('[handleGenerateTasks] Error:', err);
      alert('Failed to generate tasks. Check the console.');
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  return (
    <>
      <div style={{ minHeight: '100vh', background: '#f3f6fb' }}>
        <GenerateTasksModal
          isOpen={showGenModal}
          onClose={() => setShowGenModal(false)}
          onGenerate={handleGenerateTasks}
          isGenerating={isGeneratingTasks}
        />
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
          {/* Sidebar */}
          <div style={{
            width: '100%',
            maxWidth: '16rem',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            minHeight: '100vh'
          }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
              <h1 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                margin: 0
              }}>
                Tender Hub
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>{tenderId || 'Project Management'}</p>
            </div>

            <nav style={{ padding: '1rem' }}>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setSelectedDepartment(null);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      marginBottom: '0.5rem',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: isActive ? '#2563eb' : 'transparent',
                      color: isActive ? '#ffffff' : '#1f2937',
                      fontWeight: isActive ? '600' : '500',
                      fontSize: '0.95rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.target.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.target.style.background = 'transparent';
                    }}>
                    <Icon style={{ width: '1.25rem', height: '1.25rem' }} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div style={{ flex: 1, padding: '2rem', minWidth: 0 }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
              {renderContent()}
            </div>
          </div>
        </div>

        {/* ---- EDIT TASK MODAL ---- */}
        {editTaskModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', width: '500px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>Edit Task</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Title</label>
                <input type="text" value={editTaskModal.title} onChange={e => setEditTaskModal(prev => ({ ...prev, title: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Category / Tag</label>
                  <select value={editTaskModal.tag} onChange={e => setEditTaskModal(prev => ({ ...prev, tag: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }}>
                    <option value="step">Step</option><option value="doc">Doc</option><option value="request">Request</option><option value="urgent">Urgent</option>
                  </select>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Deadline</label>
                  <input type="date" value={editTaskModal.deadline} onChange={e => setEditTaskModal(prev => ({ ...prev, deadline: e.target.value }))} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem' }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Description</label>
                <textarea value={editTaskModal.description} onChange={e => setEditTaskModal(prev => ({ ...prev, description: e.target.value }))} rows={2} style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Assigned Department Users</label>
                <div style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.5rem 0.75rem', maxHeight: '120px', overflowY: 'auto', background: '#f9fafb' }}>
                  {deptUsers.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', padding: '0.25rem 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editTaskModal.assigned_users.includes(u.id)} onChange={e => {
                        if (e.target.checked) setEditTaskModal(p => ({ ...p, assigned_users: [...p.assigned_users, u.id] }));
                        else setEditTaskModal(p => ({ ...p, assigned_users: p.assigned_users.filter(id => id !== u.id) }));
                      }} />
                      {u.name} <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>({u.email})</span>
                    </label>
                  ))}
                  {deptUsers.length === 0 && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>No users loaded.</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={() => setEditTaskModal(null)} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button onClick={saveEditTaskModal} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* ---- COMPLETE TASK MODAL ---- */}
        {completeModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ background: 'white', padding: '1.75rem', borderRadius: '12px', width: '450px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#166534' }}>
                <CheckCircle2 size={24} />
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1f2937' }}>Mark Task as Done</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>Remarks / Summary (Optional)</label>
                <textarea
                  value={completeModal.remarks}
                  onChange={e => setCompleteModal(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="E.g. Uploaded the pricing sheets..."
                  rows={2}
                  style={{ padding: '0.65rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <input
                  type="checkbox"
                  id="confirmComplete"
                  checked={completeModal.confirmed}
                  onChange={e => setCompleteModal(prev => ({ ...prev, confirmed: e.target.checked }))}
                  style={{ marginTop: '0.2rem', accentColor: '#dc2626', width: '1.2rem', height: '1.2rem' }}
                />
                <label htmlFor="confirmComplete" style={{ fontSize: '0.85rem', color: '#991b1b', margin: 0, cursor: 'pointer', lineHeight: '1.4' }}>
                  <strong>Confirmation Verification:</strong> By checking this box, I confirm that I have fully completed this task and validated my work. I understand this action notifies the team.
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button onClick={() => setCompleteModal(null)} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>Cancel</button>
                <button
                  onClick={submitCompleteModal}
                  disabled={!completeModal.confirmed}
                  style={{
                    padding: '0.5rem 1rem',
                    background: completeModal.confirmed ? '#16a34a' : '#86efac',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: completeModal.confirmed ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    transition: 'background 0.2s'
                  }}>
                  Confirm Completion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---- AI ANALYSIS MODAL ---- */}
        {(isAnalyzingFile || analysisResult) && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ background: 'white', padding: '2rem', borderRadius: '16px', width: '700px', maxWidth: '90%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #f1f5f9', pb: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ padding: '0.5rem', background: '#f5f3ff', borderRadius: '8px' }}>
                    <BrainCog size={24} color="#7c3aed" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
                    AI Document Analysis
                  </h3>
                </div>
                {!isAnalyzingFile && (
                  <button onClick={() => setAnalysisResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={24} /></button>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                {isAnalyzingFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
                    <div style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <p style={{ marginTop: '1.5rem', color: '#4b5563', fontWeight: 500 }}>The AI is carefully reviewing your document content...</p>
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Comparing with tender requirements and other bid files</p>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', color: '#374151', lineHeight: '1.6', fontSize: '1rem' }}>
                    {analysisResult && analysisResult.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} style={{ color: '#dc2626' }}>{part}</strong> : part)}
                  </div>
                )}
              </div>

              {!isAnalyzingFile && (
                <div style={{ marginTop: '1.5rem', pt: '1rem', borderTop: '1px solid #f1f5f9', textAlign: 'right' }}>
                  <button onClick={() => setAnalysisResult(null)} style={{ padding: '0.6rem 1.5rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.2)' }}>
                    Close Report
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .sidebar { width: 100% !important; min-height: auto !important; }
        }
      `}</style>
      </div>
    </>
  );
};

export default TenderWorkspace;
