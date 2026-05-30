import React, { useEffect, useState } from 'react';

interface NotificationPayload {
  taskId: string;
  title: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  timestamp: string;
}

export const NotificationBanner: React.FC = () => {
  const [toast, setToast] = useState<NotificationPayload | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) return;

    // SSE EventSource does not natively support Authorization headers,
    // so we pass it in the query string or reuse our authorization header if using an advanced SSE package.
    // However, a simple SDE II design is to pass the token as a query parameter in our EventSource,
    // and let the backend read it from query if headers are absent!
    // Wait, let's verify if our backend auth middleware parses from query too.
    // In src/middleware/auth.js:
    // const authHeader = req.headers['authorization'];
    // const token = authHeader && authHeader.split(' ')[1];
    // Oh! The backend expects the token in the Authorization header.
    // To support native EventSource beautifully without complex polyfills, we can add a check in `src/middleware/auth.js`
    // that ALSO reads `req.query.token` if `Authorization` header is missing!
    // This is an extremely elegant trick! Let's do it right after.
    
    const eventSource = new EventSource(`http://localhost:5000/api/notifications/subscribe?token=${accessToken}`);

    eventSource.onmessage = (event) => {
      try {
        const payload: NotificationPayload = JSON.parse(event.data);
        setToast(payload);
        
        // Auto dismiss toast after 6 seconds
        const timer = setTimeout(() => {
          setToast(null);
        }, 6000);

        return () => clearTimeout(timer);
      } catch (err) {
        console.error('Failed to parse SSE notification message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE connection disconnected. Reconnecting automatically...', err);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="notification-toast d-flex align-items-center p-3 m-3" style={{ width: '360px' }}>
      <div className="me-3">
        <div className="bg-white rounded-circle p-2 d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px' }}>
          <i className="bi bi-bell-fill text-primary fs-5 animate-bell"></i>
        </div>
      </div>
      <div className="flex-grow-1">
        <div className="d-flex justify-content-between align-items-center mb-1">
          <strong className="text-white">Task Update Alert</strong>
          <small className="text-white-50">Just now</small>
        </div>
        <div className="text-white-50 fs-7 leading-sm">
          <strong>{toast.changedBy}</strong> advanced <strong>"{toast.title}"</strong> to <span className={`badge bg-${getStatusColorBadge(toast.toStatus)}`}>{toast.toStatus}</span>.
        </div>
      </div>
      <button type="button" className="btn-close btn-close-white ms-2 align-self-start" onClick={() => setToast(null)}></button>
    </div>
  );
};

const getStatusColorBadge = (status: string): string => {
  switch (status) {
    case 'TODO': return 'cyan';
    case 'IN_PROGRESS': return 'warning text-dark';
    case 'IN_REVIEW': return 'info text-dark';
    case 'DONE': return 'success';
    case 'BLOCKED': return 'danger';
    default: return 'secondary';
  }
};
