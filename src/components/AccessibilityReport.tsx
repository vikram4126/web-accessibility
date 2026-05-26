import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, Download, RefreshCw } from 'lucide-react';
import type { AccessibilityCheck } from '../utils/pdfProcessor';
import './AccessibilityReport.css';

interface Props {
  checks: AccessibilityCheck[];
  fileName: string;
  processedBlob: Blob | null;
  onReset: () => void;
}

export default function AccessibilityReport({ checks, fileName, processedBlob, onReset }: Props) {
  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warning').length;

  const score = Math.round((passCount / checks.length) * 100);

  const handleDownload = () => {
    if (!processedBlob) return;
    const url = URL.createObjectURL(processedBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    // ensure the filename ends with .pdf correctly even if the original name didn't have it
    const baseName = fileName.toLowerCase().endsWith('.pdf') ? fileName.slice(0, -4) : fileName;
    a.download = `${baseName}_accessible.pdf`;
    document.body.appendChild(a);
    a.click();
    
    // In macOS/Safari, removing the anchor synchronously causes the browser to ignore the 'download' attribute
    // and instead download the blob URL directly, resulting in a file named with a UUID and no extension.
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  const scoreColor = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="report-page fade-in">
      {/* Score Header */}
      <div className="report-header card">
        <div className="score-circle" style={{ '--score-color': scoreColor } as React.CSSProperties}>
          <svg viewBox="0 0 120 120" className="score-svg">
            <circle cx="60" cy="60" r="50" strokeWidth="8" fill="none" stroke="rgba(255,255,255,0.06)" />
            <circle cx="60" cy="60" r="50" strokeWidth="8" fill="none"
              stroke={scoreColor}
              strokeDasharray={`${score * 3.14159} 1000`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dasharray 1s ease' }}
            />
          </svg>
          <div className="score-value">
            <span className="score-num" style={{ color: scoreColor }}>{score}</span>
            <span className="score-unit">/ 100</span>
          </div>
        </div>
        <div className="score-summary">
          <h2 className="report-title">Accessibility Report</h2>
          <p className="report-filename">{fileName}</p>
          <div className="score-badges">
            <div className="score-badge pass"><CheckCircle size={13} /> {passCount} Passed</div>
            <div className="score-badge warn"><AlertTriangle size={13} /> {warnCount} Warning</div>
            <div className="score-badge fail"><XCircle size={13} /> {failCount} Failed</div>
          </div>
          {score >= 80 && (
            <p className="score-message success-msg">✅ Excellent! Ready for final QA in Acrobat.</p>
          )}
          {score < 80 && score >= 60 && (
            <p className="score-message warn-msg">⚠️ Good progress — review warnings before finalizing.</p>
          )}
          {score < 60 && (
            <p className="score-message fail-msg">❌ Issues found — resolve failures before distributing.</p>
          )}
        </div>
      </div>

      {/* Checks List */}
      <div className="checks-grid">
        {checks.map(check => (
          <div key={check.id} className={`check-item card2 status-${check.status}`}>
            <div className="check-icon">
              {check.status === 'pass' && <CheckCircle size={18} className="c-success" />}
              {check.status === 'warning' && <AlertTriangle size={18} className="c-warning" />}
              {check.status === 'fail' && <XCircle size={18} className="c-danger" />}
            </div>
            <div className="check-content">
              <span className="check-label">{check.label}</span>
              {check.detail && <span className="check-detail">{check.detail}</span>}
            </div>
            <div className={`badge badge-${check.status === 'pass' ? 'success' : check.status === 'fail' ? 'danger' : 'warning'}`}>
              {check.status.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Manual QA Note */}
      <div className="qa-notice card2">
        <p className="qa-title">🔍 Final Manual QA Required in Adobe Acrobat</p>
        <ul className="qa-list">
          <li>Verify reading order with Tags panel</li>
          <li>Check color contrast using Accessibility Checker</li>
          <li>Review AI-generated alt-text for accuracy</li>
          <li>Add bookmarks for documents &gt; 20 pages</li>
          <li>Tag unmarked links via Find Element panel</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="report-actions">
        <button className="btn-secondary" onClick={onReset} id="process-another-btn">
          <RefreshCw size={15} /> Process Another PDF
        </button>
        <button
          className="btn-success"
          onClick={handleDownload}
          disabled={!processedBlob}
          id="download-pdf-btn"
        >
          <Download size={15} /> Download Accessible PDF
        </button>
      </div>
    </div>
  );
}
