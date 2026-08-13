"use client";

interface ActionButtonProps {
  action: string;
  runningAction: string | null;
  label: string;
  runningLabel: string;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  onRun: (action: string) => void;
}

export function ActionButton({
  action,
  runningAction,
  label,
  runningLabel,
  className = "btn",
  disabled = false,
  disabledReason,
  onRun
}: ActionButtonProps) {
  const isRunning = runningAction === action;
  const isLocked =
    runningAction !== null && !isRunning;

  return (
    <button
      type="button"
      className={`${className}${
        isRunning ? " btn-loading" : ""
      }`}
      disabled={isRunning || isLocked || disabled}
      title={
        isRunning
          ? runningLabel
          : disabledReason
      }
      aria-busy={isRunning}
      onClick={() => onRun(action)}
    >
      {isRunning ? (
        <>
          <span
            className="btn-spinner"
            aria-hidden="true"
          />
          {runningLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
