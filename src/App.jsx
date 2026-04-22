import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Lock, ShieldAlert, Download, Settings, Printer, Copy, CheckCircle, RefreshCw } from 'lucide-react';
import { PDFDocument } from 'pdf-lib-with-encrypt';
import { saveAs } from 'file-saver';
import './index.css';

function App() {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const fileInputRef = useRef(null);

  // Settings state
  const [settings, setSettings] = useState({
    passwordEnabled: false,
    passwordStr: '',
    preventPrinting: true,
    preventCopying: true,
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setIsComplete(false);
      } else {
        alert('Please upload a valid PDF file.');
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        setIsComplete(false);
      } else {
        alert('Please upload a valid PDF file.');
      }
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleProcess = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    
    try {
      // 1. Read the PDF file into an ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // 2. Load the PDF Document
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      // 3. Set metadata
      pdfDoc.setTitle(`Secured ${file.name}`);
      pdfDoc.setAuthor('SecurePDF Vault');
      pdfDoc.setProducer('Secure PDF Converter');
      pdfDoc.setCreator('SecurePDF Vault');
      
      // 4. Configure Encryption & Permissions
      const saveOptions = {
        useObjectStreams: false,
      };

      // Ensure some level of encryption if any security setting is active
      const ownerPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10); // Random owner password to enforce permissions
      
      saveOptions.userPassword = settings.passwordEnabled && settings.passwordStr ? settings.passwordStr : undefined;
      saveOptions.ownerPassword = ownerPassword;
      saveOptions.permissions = {
        printing: settings.preventPrinting ? undefined : 'highResolution',
        modifying: false,
        copying: !settings.preventCopying,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true, // "web accessibility works"
        documentAssembly: false,
      };

      // 5. Build and save the document
      const pdfBytes = await pdfDoc.save(saveOptions);
      
      // Trigger download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      saveAs(blob, `secured_${file.name}`);
      
      setIsComplete(true);
    } catch (err) {
      console.error('Error processing PDF:', err);
      alert('An error occurred during processing. Is the file already encrypted?');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setIsComplete(false);
    setSettings({
      passwordEnabled: false,
      passwordStr: '',
      preventPrinting: true,
      preventCopying: true,
    });
  };

  return (
    <div className="app-container" style={{ padding: '40px 20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }} className="animate-fade-in">
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '16px', borderRadius: '24px', background: 'rgba(59, 130, 246, 0.1)', marginBottom: '16px' }}>
          <ShieldAlert size={40} color="var(--accent-color)" />
        </div>
        <h1 style={{ fontSize: '3rem', fontWeight: '800', marginBottom: '12px', background: 'linear-gradient(135deg, #fff 0%, #94a3b8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SecurePDF Vault
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
          Upload your PDF to lock it down. Apply modern security standards natively in your browser. Complete privacy—no files ever leave your device.
        </p>
      </header>

      <main>
        {!file ? (
          <section 
            className="glass-panel animate-fade-in"
            style={{
              padding: '60px 40px',
              textAlign: 'center',
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--panel-border)'}`,
              backgroundColor: isDragging ? 'rgba(59, 130, 246, 0.05)' : 'var(--panel-bg)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
            />
            <div style={{ pointerEvents: 'none' }}>
              <UploadCloud size={64} color={isDragging ? 'var(--accent-color)' : 'var(--text-secondary)'} style={{ marginBottom: '20px', transition: 'all 0.3s' }} />
              <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Drag & Drop your PDF here</h2>
              <p style={{ color: 'var(--text-secondary)' }}>or click to browse from your device</p>
            </div>
          </section>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }} className="animate-fade-in">
            {/* Left Column: File Info & Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section className="glass-panel" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                  <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px' }}>
                    <FileText size={32} color="var(--accent-color)" />
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {file.name}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {isComplete ? (
                   <div style={{ marginTop: '30px' }} className="animate-fade-in">
                    <div style={{ padding: '20px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success-color)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                      <CheckCircle size={24} color="var(--success-color)" />
                      <span style={{ color: 'var(--success-color)', fontWeight: '500' }}>Your secure PDF has been downloaded!</span>
                    </div>
                    <button 
                      className="btn-primary" 
                      style={{ width: '100%', background: 'rgba(255, 255, 255, 0.1)', boxShadow: 'none' }}
                      onClick={resetAll}
                    >
                      <RefreshCw size={18} /> Process Another File
                    </button>
                  </div>
                ) : (
                  <button 
                    className={`btn-primary ${isProcessing ? 'animate-pulse-glow' : ''}`}
                    style={{ width: '100%', padding: '16px', fontSize: '1.1rem', marginTop: '10px' }}
                    onClick={handleProcess}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>Processing...</>
                    ) : (
                      <><ShieldAlert size={20} /> Lock & Download PDF</>
                    )}
                  </button>
                )}
              </section>
            </div>

            {/* Right Column: Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <section className="glass-panel" style={{ padding: '30px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', fontSize: '1.25rem' }}>
                  <Settings size={20} /> Security Settings
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Password Toggle */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Lock size={18} color="var(--text-secondary)" />
                        <span style={{ fontWeight: '500' }}>Require Password to Open</span>
                      </div>
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={settings.passwordEnabled} 
                          onChange={(e) => updateSetting('passwordEnabled', e.target.checked)}
                          disabled={isComplete}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                    {settings.passwordEnabled && (
                      <div className="animate-fade-in">
                        <input 
                          type="password" 
                          placeholder="Enter a strong password..." 
                          value={settings.passwordStr}
                          onChange={(e) => updateSetting('passwordStr', e.target.value)}
                          disabled={isComplete}
                        />
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                          Password is required to view the document. Web accessibility readers will still function with standard support if permissions allow.
                        </p>
                      </div>
                    )}
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '4px 0' }} />

                  {/* Printing Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Printer size={18} color="var(--text-secondary)" />
                      <span style={{ fontWeight: '500' }}>Prevent Printing</span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={settings.preventPrinting} 
                        onChange={(e) => updateSetting('preventPrinting', e.target.checked)}
                        disabled={isComplete}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  {/* Copying Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Copy size={18} color="var(--text-secondary)" />
                      <span style={{ fontWeight: '500' }}>Prevent Text/Image Copying</span>
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={settings.preventCopying} 
                        onChange={(e) => updateSetting('preventCopying', e.target.checked)}
                        disabled={isComplete}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '4px 0' }} />
                  
                  <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success-color)' }}></div>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      <strong>Web Accessibility Retained:</strong> Screen readers and assistive tools will still be able to parse structural document tags if original PDF supports it.
                    </span>
                  </div>

                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
