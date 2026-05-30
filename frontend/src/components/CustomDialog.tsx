import React from 'react';

interface CustomDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  isConfirm?: boolean; // if true, show both Cancel and Confirm; if false, show only OK
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  type?: 'info' | 'warning' | 'danger' | 'success';
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  title = 'System Message',
  message,
  isConfirm = false,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  type = 'info'
}) => {
  if (!isOpen) return null;

  const getTypeColor = () => {
    switch (type) {
      case 'danger':
        return 'text-danger';
      case 'warning':
        return 'text-warning';
      case 'success':
        return 'text-success';
      default:
        return 'text-cyan';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return 'bi-exclamation-octagon-fill';
      case 'warning':
        return 'bi-exclamation-triangle-fill';
      case 'success':
        return 'bi-check-circle-fill';
      default:
        return 'bi-info-circle-fill';
    }
  };

  return (
    <div
      className="modal show d-block"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000
      }}
      role="dialog"
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '400px' }}>
        <div
          className="modal-content glass-panel border border-secondary text-white p-4"
          style={{
            background: 'rgba(20, 20, 30, 0.85)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
            borderRadius: '12px'
          }}
        >
          <div className="modal-header border-0 pb-2 d-flex align-items-center gap-2">
            <i className={`bi ${getIcon()} fs-4 ${getTypeColor()}`}></i>
            <h5 className={`modal-title fw-bold mb-0 ${getTypeColor()}`}>{title}</h5>
          </div>
          <div className="modal-body py-3 border-0">
            <p className="text-secondary-subtle fs-7 mb-0 leading-md text-start" style={{ whiteSpace: 'pre-wrap' }}>
              {message}
            </p>
          </div>
          <div className="modal-footer border-0 pt-3 d-flex justify-content-end gap-2">
            {isConfirm && (
              <button
                type="button"
                className="btn btn-outline-light btn-sm px-3"
                onClick={onCancel}
                style={{ borderRadius: '6px' }}
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              className={`btn btn-${type === 'danger' ? 'danger' : 'glow-cyan'} btn-sm px-4`}
              onClick={onConfirm}
              style={{ borderRadius: '6px' }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
