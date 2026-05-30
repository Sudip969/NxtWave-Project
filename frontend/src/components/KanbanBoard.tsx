import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { CustomDialog } from './CustomDialog';

interface KanbanBoardProps {
  user: any;
  projectId: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
}

const COLUMNS = [
  { id: 'TODO', title: 'To Do', colorClass: 'todo' },
  { id: 'IN_PROGRESS', title: 'In Progress', colorClass: 'progress' },
  { id: 'IN_REVIEW', title: 'In Review', colorClass: 'review' },
  { id: 'DONE', title: 'Completed', colorClass: 'done' },
  { id: 'BLOCKED', title: 'Blocked', colorClass: 'blocked' }
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  user,
  projectId,
  refreshTrigger,
  triggerRefresh
}) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Project Scope details state
  const [project, setProject] = useState<any | null>(null);

  // Filters & Pagination State
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Active Selected Task for Modal details and transitions
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Inline editing states for managers/admins
  const [editStatus, setEditStatus] = useState('TODO');
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editDueDate, setEditDueDate] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [orgUsers, setOrgUsers] = useState<any[]>([]);

  // Dialog State & Helper
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogMessage, setDialogMessage] = useState('');
  const [dialogIsConfirm, setDialogIsConfirm] = useState(false);
  const [dialogConfirmAction, setDialogConfirmAction] = useState<(() => void) | null>(null);
  const [dialogType, setDialogType] = useState<'info' | 'warning' | 'danger' | 'success'>('info');

  const showMessage = (
    message: string,
    title = 'System Alert',
    type: 'info' | 'warning' | 'danger' | 'success' = 'info',
    isConfirm = false,
    onConfirm?: () => void
  ) => {
    setDialogTitle(title);
    setDialogMessage(message);
    setDialogType(type);
    setDialogIsConfirm(isConfirm);
    setDialogConfirmAction(() => () => {
      setDialogOpen(false);
      if (onConfirm) onConfirm();
    });
    setDialogOpen(true);
  };

  const isManagerOrAdmin = user.role === 'MANAGER' || user.role === 'ADMIN';

  // Fetch Project Details on change
  useEffect(() => {
    if (!projectId) return;
    const fetchProj = async () => {
      try {
        const res = await api.projects.list();
        const found = res.data.projects.find((p: any) => p.id === projectId);
        setProject(found || null);
      } catch (err) {
        console.error('Failed to load project details:', err);
      }
    };
    fetchProj();
  }, [projectId]);

  // Fetch Organization Users for assigning tasks
  useEffect(() => {
    if (isManagerOrAdmin) {
      const fetchOrgUsers = async () => {
        try {
          const res = await api.analytics.get();
          setOrgUsers(res.data.overdueTasksPerUser || []);
        } catch (e) {
          console.error('Failed to load org members:', e);
        }
      };
      fetchOrgUsers();
    }
  }, [isManagerOrAdmin]);

  // Load tasks on filter changes or refresh triggers
  useEffect(() => {
    if (!projectId) return;

    const fetchTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.tasks.list({
          projectId,
          priority: filterPriority || undefined,
          status: filterStatus || undefined,
          page,
          limit: 15 // Board layout capacity
        });
        setTasks(res.data.tasks);
        setTotalPages(res.data.pagination.totalPages);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve tasks');
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [projectId, filterPriority, filterStatus, page, refreshTrigger]);

  const handleTaskClick = async (taskId: string) => {
    setEditError(null);
    try {
      const res = await api.tasks.getById(taskId);
      const task = res.data.task;
      if (!task) {
        throw new Error('Task details not found.');
      }
      setSelectedTask(task);

      // Pre-populate editing states
      setEditTitle(task.title || '');
      setEditDesc(task.description || '');
      setEditPriority(task.priority || 'MEDIUM');
      setEditStatus(task.status || 'TODO');
      
      if (task.due_date) {
        const d = new Date(task.due_date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        setEditDueDate(`${yyyy}-${mm}-${dd}`);
      } else {
        setEditDueDate('');
      }
      setEditAssignee(task.assignee_id || '');
    } catch (err: any) {
      showMessage(err.message || 'Failed to fetch task details', 'Error', 'danger');
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setEditError(null);
    setTransitioning(true);

    try {
      const payload = {
        status: editStatus
      };

      await api.tasks.update(selectedTask.id, payload);

      // Close modal, reload board
      setSelectedTask(null);
      triggerRefresh();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update task details');
    } finally {
      setTransitioning(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    showMessage(
      'Are you sure you want to delete this task? This action cannot be undone.',
      'Delete Task',
      'danger',
      true,
      async () => {
        try {
          await api.tasks.delete(taskId);
          setSelectedTask(null);
          triggerRefresh();
        } catch (err: any) {
          showMessage(err.message || 'Failed to delete task', 'Error', 'danger');
        }
      }
    );
  };

  // Safe checks for rendering
  const renderColumnTasks = (statusId: string) => {
    return tasks
      .filter((t) => t.status === statusId)
      .map((task) => {
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'DONE';
        return (
          <div key={task.id} className="kanban-card" onClick={() => handleTaskClick(task.id)}>
            <div className="d-flex justify-content-between align-items-start mb-2">
              <span className={`badge bg-${getPriorityColor(task.priority)} fs-9`}>
                {task.priority}
              </span>
              {isOverdue && (
                <span className="badge bg-danger fs-9 animate-pulse">OVERDUE</span>
              )}
            </div>
            <h6 className="fw-semibold text-white mb-2 leading-md">{task.title}</h6>
            <p className="text-secondary fs-8 text-truncate mb-3">{task.description || 'No description provided.'}</p>
            <hr className="my-2 border-secondary opacity-10" />
            <div className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-1.5 fs-8 text-secondary">
                <i className="bi bi-person-circle"></i>
                <span className="text-truncate" style={{ maxWidth: '90px' }}>
                  {task.assignee_name || 'Unassigned'}
                </span>
              </div>
              {task.due_date && (
                <div className={`fs-8 ${isOverdue ? 'text-danger fw-semibold' : 'text-secondary'}`}>
                  <i className="bi bi-calendar-event me-1"></i>
                  {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
              )}
            </div>
          </div>
        );
      });
  };

  if (!projectId) {
    return (
      <div className="container-fluid py-5 text-center">
        <div className="glass-panel p-5 max-w-md mx-auto">
          <i className="bi bi-kanban fs-1 text-secondary opacity-50 mb-3 d-block"></i>
          <h5 className="text-white fw-bold">Select a project to load the board</h5>
          <p className="text-secondary mb-0">Use the workspace selector at the top to choose or build a project.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3">
      {/* Search & Board Filter Panel */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="glass-panel p-3 d-flex flex-wrap gap-3 align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex flex-column gap-1 text-start">
                <h5 className="mb-0 fw-bold glow-text-cyan d-flex align-items-center gap-2">
                  <i className="bi bi-kanban"></i> {project ? project.name : 'Kanban Workspace'}
                </h5>
                {project?.description && (
                  <span className="text-secondary fs-8 opacity-75 d-block" style={{ maxWidth: '600px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {project.description}
                  </span>
                )}
              </div>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <select className="form-select form-select-sm w-auto" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
              </select>
              <select className="form-select form-select-sm w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="TODO">TODO</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="IN_REVIEW">IN_REVIEW</option>
                <option value="DONE">DONE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
              <button className="btn btn-outline-light btn-sm px-2.5" onClick={() => { setFilterPriority(''); setFilterStatus(''); setPage(1); }}>
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger border-0 p-3 rounded-3">{error}</div>}

      {/* Board columns wrapper */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-cyan" role="status"></div>
          <p className="text-secondary mt-2">Loading tasks...</p>
        </div>
      ) : (
        <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3 row-cols-xl-5 mb-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="col">
              <div className="h-100">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold mb-0 text-white d-flex align-items-center gap-2">
                    <span className={`status-dot dot-${col.colorClass}`}></span>
                    {col.title}
                  </h6>
                  <span className="badge bg-secondary-subtle text-secondary px-2 py-1 fs-9 rounded-pill">
                    {tasks.filter((t) => t.status === col.id).length}
                  </span>
                </div>
                <div className="kanban-column">
                  {renderColumnTasks(col.id)}
                  {tasks.filter((t) => t.status === col.id).length === 0 && (
                    <div className="text-center py-5 text-secondary opacity-30 fs-8">Empty Column</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination control footer */}
      {totalPages > 1 && (
        <div className="row">
          <div className="col-12 d-flex justify-content-center gap-2">
            <button className="btn btn-outline-light btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
              <i className="bi bi-chevron-left"></i> Previous
            </button>
            <span className="text-secondary fs-7 align-self-center px-2">Page {page} of {totalPages}</span>
            <button className="btn btn-outline-light btn-sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
              Next <i className="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      )}

      {/* TASK DETAIL & STATE TRANSITIONS MODAL */}
      {selectedTask && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content glass-panel border border-secondary text-white p-4">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold glow-text-cyan">
                  <i className="bi bi-info-circle me-2"></i>
                  Task Details & Actions
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setSelectedTask(null)}></button>
              </div>
              <div className="modal-body py-3">
                <form onSubmit={handleUpdateTask} className="text-start">
                  {editError && (
                    <div className="alert alert-danger border-0 p-2.5 fs-7 mb-3">{editError}</div>
                  )}
                  
                  <div className="mb-3">
                    <h5 className="fw-bold text-white mb-2">{selectedTask.title}</h5>
                    <p className="text-secondary fs-7.5 mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                      {selectedTask.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="row g-3 mb-4">
                    <div className="col-6 text-start">
                      <span className="text-secondary d-block fs-8 mb-1">Priority</span>
                      <span className={`badge bg-${getPriorityColor(selectedTask.priority)} px-2.5 py-1.5 fs-8`}>
                        {selectedTask.priority}
                      </span>
                    </div>

                    <div className="col-6 text-start">
                      <span className="text-secondary d-block fs-8 mb-1">Due Date</span>
                      <span className="text-white fs-7.5 fw-medium">
                        {selectedTask.due_date 
                          ? new Date(selectedTask.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'No due date'}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 text-start">
                    <span className="text-secondary d-block fs-8 mb-1">Assignee</span>
                    <span className="text-white fs-7.5 fw-medium d-flex align-items-center gap-2">
                      <i className="bi bi-person-circle text-cyan fs-6"></i>
                      {selectedTask.assignee_name || 'Unassigned'}
                    </span>
                  </div>

                  {/* Status Dropdown */}
                  <div className="border border-secondary border-dashed p-3 rounded-3 mb-3 text-start" style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <h6 className="fw-bold mb-2.5 fs-7 glow-text-cyan d-flex align-items-center gap-2">
                      <i className="bi bi-arrow-left-right text-cyan"></i> Task Status
                    </h6>
                    <div className="d-flex align-items-center gap-3">
                      <div className="position-relative flex-grow-1" style={{ maxWidth: '240px' }}>
                        <select
                          className="form-select form-select-sm bg-dark-subtle border-secondary text-white fw-medium cursor-pointer"
                          style={{
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            borderColor: 'rgba(255,255,255,0.15)',
                            borderRadius: '6px'
                          }}
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          disabled={transitioning}
                        >
                          {COLUMNS.map((col) => (
                            <option key={col.id} value={col.id} className="bg-dark text-white">
                              {col.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      {transitioning && (
                        <div className="spinner-border spinner-border-sm text-cyan" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="modal-footer border-0 pt-3 px-0 d-flex justify-content-end">
                    <div></div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-light btn-sm px-3"
                        onClick={() => setSelectedTask(null)}
                        disabled={transitioning}
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        className="btn btn-glow-cyan btn-sm px-4"
                        disabled={transitioning}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Universal confirmation and alert dialog */}
      <CustomDialog
        isOpen={dialogOpen}
        title={dialogTitle}
        message={dialogMessage}
        isConfirm={dialogIsConfirm}
        confirmLabel={dialogIsConfirm ? 'Confirm' : 'OK'}
        cancelLabel="Cancel"
        type={dialogType}
        onConfirm={dialogConfirmAction || (() => setDialogOpen(false))}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
};

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'LOW': return 'secondary';
    case 'MEDIUM': return 'info';
    case 'HIGH': return 'danger';
    default: return 'light';
  }
};




