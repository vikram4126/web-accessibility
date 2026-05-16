import React from 'react';
import { CheckCircle, XCircle, Loader, Clock } from 'lucide-react';
import './ProcessingView.css';

type ProcessingStep = { id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string; };

interface Props {
  steps: ProcessingStep[];
  currentStep: string;
}

const icons = {
  pending: <Clock size={16} className="step-icon muted" />,
  running: <Loader size={16} className="step-icon spin accent" />,
  done: <CheckCircle size={16} className="step-icon success" />,
  error: <XCircle size={16} className="step-icon danger" />,
};

export default function ProcessingView({ steps, currentStep }: Props) {
  const doneCount = steps.filter(s => s.status === 'done').length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="processing-page fade-in">
      <div className="processing-card card">
        <div className="processing-header">
          <div className="processing-spinner">
            <svg viewBox="0 0 80 80" className="spinner-svg">
              <circle cx="40" cy="40" r="34" strokeWidth="4" fill="none"
                stroke="rgba(255,255,255,0.08)" />
              <circle cx="40" cy="40" r="34" strokeWidth="4" fill="none"
                stroke="url(#grad)" strokeDasharray={`${progress * 2.138} 1000`}
                strokeLinecap="round" transform="rotate(-90 40 40)" />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#00338d" />
                  <stop offset="100%" stopColor="#00b8f1" />
                </linearGradient>
              </defs>
            </svg>
            <div className="spinner-percent">{progress}%</div>
          </div>
          <div>
            <h2 className="processing-title">Processing PDF</h2>
            <p className="processing-subtitle">{currentStep || 'Initializing...'}</p>
          </div>
        </div>

        <div className="progress-bar-wrap">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-label">{doneCount}/{steps.length} steps</span>
        </div>

        <div className="steps-list">
          {steps.map(step => (
            <div key={step.id} className={`step-row ${step.status}`}>
              {icons[step.status]}
              <div className="step-content">
                <span className="step-name">{step.label}</span>
                {step.detail && <span className="step-detail">{step.detail}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
