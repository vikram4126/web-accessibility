import React from 'react';
import { Upload, FileText, Zap } from 'lucide-react';
import './UploadZone.css';

interface Props {
  onFileSelected: (file: File) => void;
}

export default function UploadZone({ onFileSelected }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') onFileSelected(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div className="upload-page fade-in">
      {/* Header */}
      <div className="upload-header">
        <div className="kpmg-logo">
          <img src="/kpmg-logo.svg" alt="KPMG" className="kpmg-logo-img" />
          <div className="logo-divider" />
          <span className="logo-subtitle">PDF Accessibility Tool</span>
        </div>
        <div className="header-badge badge badge-info">
          <Zap size={11} /> Automated
        </div>
      </div>

      {/* Hero */}
      <div className="hero-section">
        <div className="hero-glow" />
        <div className="hero-content">
          <h1 className="hero-title">
            Make Your PDFs<br />
            <span className="gradient-text">Web Accessible</span>
          </h1>
          <p className="hero-subtitle">
            Auto-tag structure · AI alt-text · Metadata · Security · Accessibility report
          </p>
        </div>

        {/* Drop Zone */}
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload PDF file"
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          id="pdf-upload-zone"
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            onChange={handleChange}
            style={{ display: 'none' }}
            id="pdf-file-input"
          />
          <div className="drop-icon">
            <Upload size={36} strokeWidth={1.5} />
          </div>
          <p className="drop-title">
            {dragging ? 'Drop your PDF here' : 'Drag & drop your PDF'}
          </p>
          <p className="drop-subtitle">or click to browse</p>
          <div className="drop-format-badge">
            <FileText size={12} /> PDF files only
          </div>
        </div>

        {/* Steps */}
        <div className="steps-row">
          {[
            { num: '01', label: 'Upload PDF' },
            { num: '02', label: 'Fill Metadata' },
            { num: '03', label: 'Auto-Process' },
            { num: '04', label: 'Download' },
          ].map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-num">{s.num}</div>
              <div className="step-label">{s.label}</div>
              {i < 3 && <div className="step-arrow">›</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
