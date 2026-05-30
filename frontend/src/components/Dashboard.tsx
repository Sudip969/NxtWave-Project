import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface DashboardProps {
  user: any;
  selectedProjectId: string | null;
  onProjectChange: (id: string | null) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  selectedProjectId,
  onProjectChange,
  refreshTrigger,
  triggerRefresh
}) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);
  
  // Modals state
  const [showProjModal, setShowProjModal] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projError, setProjError] = useState<string | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskError, setTaskError] = useState<string | null>(null);

  const [orgUsers, setOrgUsers] = useState<any[]>([]);

  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN';

  // Fetch Projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoadingProjects(true);
        const res = await api.projects.list();
        setProjects(res.data.projects);
        
        // Auto select first project if none is active
        if (res.data.projects.length > 0 && !selectedProjectId) {
          onProjectChange(res.data.projects[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [refreshTrigger]);

  // Fetch Organization Users for assigning tasks
  useEffect(() => {
    if (isManagerOrAdmin) {
      const fetchOrgUsers = async () => {
        try {
          // Using our analytics endpoint or listing query is perfect, 
          // let's fetch analytics to grab the active users of the organization!
          const res = await api.analytics.get();
          setOrgUsers(res.data.overdueTasksPerUser);
        } catch (e) {
          console.error('Failed to load org members:', e);
        }
      };
      fetchOrgUsers();
    }
  }, [refreshTrigger, isManagerOrAdmin]);

  // Fetch Overall Metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Load tasks list to calculate counts
        const res = await api.tasks.list({
          projectId: selectedProjectId || undefined
        });
        
        const tasks = res.data.tasks;
        const total = tasks.length;
        const progress = tasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
        const completed = tasks.filter((t: any) => t.status === 'DONE').length;
        const blocked = tasks.filter((t: any) => t.status === 'BLOCKED').length;
        
        // Overdue calculation
        const now = new Date();
        const overdue = tasks.filter((t: any) => 
          t.due_date && new Date(t.due_date) < now && t.status !== 'DONE'
        ).length;

        setMetrics({ total, progress, completed, blocked, overdue });
      } catch (e) {
        console.error('Failed to load task metrics:', e);
      }
    };
    if (selectedProjectId) {
      fetchMetrics();
    }
  }, [selectedProjectId, refreshTrigger]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setProjError(null);
    try {
      const res = await api.projects.create({ name: projName, description: projDesc });
      setProjName('');
      setProjDesc('');
      setShowProjModal(false);
      triggerRefresh();
      onProjectChange(res.data.project.id);
    } catch (err: any) {
      setProjError(err.message);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaskError(null);
    try {
      if (!selectedProjectId) {
        throw new Error('Please select or create a project first');
      }

      await api.tasks.create({
        title: taskTitle,
        description: taskDesc,
        priority: taskPriority,
        dueDate: taskDueDate || undefined,
        projectId: selectedProjectId,
        assigneeId: taskAssignee || undefined
      });

      setTaskTitle('');
      setTaskDesc('');
      setTaskPriority('MEDIUM');
      setTaskDueDate('');
      setTaskAssignee('');
      setShowTaskModal(false);
      triggerRefresh();
    } catch (err: any) {
      setTaskError(err.message);
    }
  };

  return (
    <div className="container-fluid py-4">
      {/* Welcome banner */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="glass-panel p-4 d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h3 className="fw-bold mb-1">Welcome, {user.name}</h3>
              <p className="text-secondary mb-0">
                Organization: <span className="text-white fw-semibold">{user.organizationName}</span> | Role: <span className="badge bg-purple-glow text-white border border-purple">{user.role}</span>
              </p>
            </div>
            <div className="d-flex gap-2">
              {isManagerOrAdmin && (
                <>
                  <button className="btn btn-outline-light d-flex align-items-center gap-2" onClick={() => setShowProjModal(true)}>
                    <i className="bi bi-folder-plus"></i> New Project
                  </button>
                  <button className="btn btn-glow-cyan d-flex align-items-center gap-2" onClick={() => setShowTaskModal(true)} disabled={projects.length === 0}>
                    <i className="bi bi-plus-circle"></i> New Task
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Project Selector dropdown */}
      <div className="row mb-4">
        <div className="col-12 col-md-4">
          <div className="glass-panel p-3">
            <label className="form-label text-secondary fs-7 mb-2 fw-semibold">Select Project Workspace</label>
            {loadingProjects ? (
              <div className="spinner-border spinner-border-sm text-cyan" role="status"></div>
            ) : projects.length === 0 ? (
              <div className="text-muted fs-7">No active projects. Click "New Project" to start.</div>
            ) : (
              <select
                className="form-select border-0 text-white"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                value={selectedProjectId || ''}
                onChange={(e) => onProjectChange(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Project Description panel */}
        {selectedProjectId && projects.length > 0 && (
          <div className="col-12 col-md-8">
            <div className="glass-panel p-3 h-100 d-flex flex-column justify-content-center">
              <span className="text-secondary fs-7 fw-semibold mb-1">Project Scope:</span>
              <span className="text-white fs-6">
                {projects.find(p => p.id === selectedProjectId)?.description || 'No project description added yet.'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      {selectedProjectId && metrics && (
        <div className="row g-4 mb-4">
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="glass-panel p-4 d-flex justify-content-between align-items-center">
              <div>
                <div className="text-secondary fs-7 mb-1">Total Tasks</div>
                <h2 className="fw-bold mb-0">{metrics.total}</h2>
              </div>
              <div className="fs-1 text-info opacity-50"><i className="bi bi-list-task"></i></div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="glass-panel p-4 d-flex justify-content-between align-items-center border border-warning" style={{ borderColor: 'rgba(255, 193, 7, 0.2) !important' }}>
              <div>
                <div className="text-secondary fs-7 mb-1">In Progress</div>
                <h2 className="fw-bold mb-0 text-warning">{metrics.progress}</h2>
              </div>
              <div className="fs-1 text-warning opacity-50"><i className="bi bi-clock-history"></i></div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="glass-panel p-4 d-flex justify-content-between align-items-center border border-success" style={{ borderColor: 'rgba(25, 135, 84, 0.2) !important' }}>
              <div>
                <div className="text-secondary fs-7 mb-1">Completed</div>
                <h2 className="fw-bold mb-0 text-success">{metrics.completed}</h2>
              </div>
              <div className="fs-1 text-success opacity-50"><i className="bi bi-check2-circle"></i></div>
            </div>
          </div>
          <div className="col-12 col-sm-6 col-xl-3">
            <div className="glass-panel p-4 d-flex justify-content-between align-items-center border border-danger" style={{ borderColor: 'rgba(220, 53, 69, 0.3) !important' }}>
              <div>
                <div className="text-secondary fs-7 mb-1">Overdue Tasks</div>
                <h2 className="fw-bold mb-0 text-danger">{metrics.overdue}</h2>
              </div>
              <div className="fs-1 text-danger opacity-50"><i className="bi bi-calendar-x-fill animate-pulse"></i></div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showProjModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border border-secondary text-white p-4">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold glow-text-purple"><i className="bi bi-folder-plus me-2"></i>Create New Project</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowProjModal(false)}></button>
              </div>
              <form onSubmit={handleCreateProject}>
                <div className="modal-body py-3">
                  {projError && <div className="alert alert-danger border-0 p-2.5 fs-7">{projError}</div>}
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Project Name</label>
                    <input
                      type="text"
                      className="form-control"
                      value={projName}
                      onChange={(e) => setProjName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Description</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={projDesc}
                      onChange={(e) => setProjDesc(e.target.value)}
                    ></textarea>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-outline-light btn-sm px-3" onClick={() => setShowProjModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-glow-purple btn-sm px-4">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {showTaskModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border border-secondary text-white p-4">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold glow-text-cyan"><i className="bi bi-plus-circle me-2"></i>Create New Task</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowTaskModal(false)}></button>
              </div>
              <form onSubmit={handleCreateTask}>
                <div className="modal-body py-3">
                  {taskError && <div className="alert alert-danger border-0 p-2.5 fs-7">{taskError}</div>}
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Task Title</label>
                    <input
                      type="text"
                      className="form-control"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={taskDesc}
                      onChange={(e) => setTaskDesc(e.target.value)}
                    ></textarea>
                  </div>
                  <div className="row mb-3">
                    <div className="col-6">
                      <label className="form-label text-secondary fs-7">Priority</label>
                      <select className="form-select" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="form-label text-secondary fs-7">Due Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label text-secondary fs-7">Assignee</label>
                    <select className="form-select" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                      <option value="">-- Unassigned --</option>
                      {orgUsers.map((u) => (
                        <option key={u.user_id} value={u.user_id}>{u.user_name} ({u.user_email})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer border-0 pt-0">
                  <button type="button" className="btn btn-outline-light btn-sm px-3" onClick={() => setShowTaskModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-glow-cyan btn-sm px-4">Create</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
