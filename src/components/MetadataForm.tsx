import React from 'react';
import { FileText, ChevronRight, Image, Loader } from 'lucide-react';
import type { PDFMetadata } from '../utils/pdfProcessor';
import type { ImageAltText } from '../utils/altTextGenerator';
import './MetadataForm.css';

interface Props {
  file: File;
  metadata: PDFMetadata;
  onChange: (meta: PDFMetadata) => void;
  images: ImageAltText[];
  extracting: boolean;
  onAltTextChange: (index: number, altText: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const FIELDS: { key: keyof PDFMetadata; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'title',            label: 'Document Title',        placeholder: 'e.g. KPMG Annual Report 2024' },
  { key: 'author',           label: 'Author / Organization', placeholder: 'e.g. KPMG India' },
  { key: 'subject',          label: 'Subject / Audit Type',  placeholder: 'e.g. Financial Audit' },
  { key: 'description',      label: 'Description',           placeholder: 'Brief description of the document...', multiline: true },
  { key: 'keywords',         label: 'Keywords',              placeholder: 'audit, KPMG, finance, compliance' },
  { key: 'language',         label: 'Language',              placeholder: 'en' },
  { key: 'copyright',        label: 'Copyright Status',      placeholder: 'Copyright Protected' },
  { key: 'copyrightNotice',  label: 'Copyright Notice',      placeholder: '© 2024 KPMG India. All rights reserved.', multiline: true },
  { key: 'copyrightInfoUrl', label: 'Copyright Info URL',    placeholder: 'https://kpmg.com/in/copyright' },
];

export default function MetadataForm({ file, metadata, onChange, images, extracting, onAltTextChange, onSubmit, onBack }: Props) {
  const set = (key: keyof PDFMetadata, value: string) => onChange({ ...metadata, [key]: value });

  return (
    <div className="metadata-page fade-in">
      <div className="meta-topbar">
        <button className="btn-secondary" onClick={onBack}>← Back</button>
        <div className="file-info-pill">
          <FileText size={14} />
          <span>{file.name}</span>
          <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
        </div>
      </div>

      <h2 className="meta-title">Document Metadata</h2>
      <p className="meta-subtitle">Fill in the accessibility metadata. KPMG defaults are pre-filled.</p>

      <div className="meta-grid">
        {FIELDS.map(f => (
          <div key={f.key} className={`form-group ${f.multiline ? 'full-width' : ''}`}>
            <label className="label" htmlFor={`field-${f.key}`}>{f.label}</label>
            {f.multiline ? (
              <textarea id={`field-${f.key}`} className="input-field" placeholder={f.placeholder}
                value={metadata[f.key]} onChange={e => set(f.key, e.target.value)} />
            ) : (
              <input id={`field-${f.key}`} className="input-field" placeholder={f.placeholder}
                value={metadata[f.key]} onChange={e => set(f.key, e.target.value)} />
            )}
          </div>
        ))}

        {/* Security info */}
        <div className="full-width security-notice card2">
          <p className="security-title">🔒 Security Settings (Auto-Applied)</p>
          <ul className="security-list">
            <li>Owner password: <code>KPMG1234$</code></li>
            <li>Printing: High Resolution ✓</li>
            <li>Editing: Restricted ✓</li>
            <li>Content copying: Enabled ✓</li>
            <li>Accessibility content: Enabled ✓</li>
          </ul>
        </div>

        {/* Image Alt-Text Section — fully local, no external API */}
        <div className="full-width alttext-section">
          <div className="alttext-header">
            <Image size={16} className="alttext-icon" />
            <div>
              <p className="security-title">🖼 Image Alt-Text
                {extracting && <span className="extracting-tag"><Loader size={11} className="spin" /> Scanning...</span>}
                {!extracting && images.length > 0 && <span className="found-tag">{images.length} image(s) found</span>}
                {!extracting && images.length === 0 && <span className="none-tag">No images found</span>}
              </p>
              <p className="alttext-desc">Enter descriptive alt-text for each image below. Processed locally — no external API.</p>
            </div>
          </div>

          {extracting && (
            <div className="extracting-state">
              <Loader size={20} className="spin accent" />
              <span>Scanning PDF for images...</span>
            </div>
          )}

          {!extracting && images.length > 0 && (
            <div className="images-grid">
              {images.map((img, i) => (
                <div key={i} className="image-alt-item card2">
                  {img.thumbnailDataUrl && (
                    <img
                      src={img.thumbnailDataUrl}
                      alt={`Page ${img.pageIndex + 1} preview`}
                      className="page-thumb"
                    />
                  )}
                  <div className="image-alt-content">
                    <label className="label" htmlFor={`alt-${i}`}>
                      Image {i + 1} — Page {img.pageIndex + 1}
                    </label>
                    <input
                      id={`alt-${i}`}
                      className="input-field"
                      placeholder="Enter descriptive alt-text (max 125 chars)..."
                      maxLength={125}
                      value={img.altText}
                      onChange={e => onAltTextChange(i, e.target.value)}
                    />
                    {img.altText && (
                      <span className="alt-char-count">{img.altText.length}/125</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!extracting && images.length === 0 && (
            <p className="no-images-msg">✅ No images detected — alt-text step not required.</p>
          )}
        </div>
      </div>

      <div className="meta-actions">
        <button className="btn-primary" onClick={onSubmit} id="start-processing-btn" disabled={extracting}>
          {extracting ? 'Scanning...' : 'Start Processing'} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
