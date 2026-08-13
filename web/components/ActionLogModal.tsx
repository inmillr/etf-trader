"use client";

interface ActionLogModalProps {
  open: boolean;
  title: string;
  lines: string[];
  success: boolean;
  onClose: () => void;
}

export function ActionLogModal({
  open,
  title,
  lines,
  success,
  onClose
}: ActionLogModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-log-title"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="modal-header">
          <div>
            <h2 id="action-log-title">{title}</h2>
            <p className="muted">
              {success
                ? "Completed successfully"
                : "Completed with errors"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        <pre
          className={`action-log ${
            success ? "action-log-success" : "action-log-error"
          }`}
        >
          {lines.join("\n")}
        </pre>

        <p className="muted modal-footer-note">
          Close this dialog to continue using the
          automation panel.
        </p>
      </div>
    </div>
  );
}
