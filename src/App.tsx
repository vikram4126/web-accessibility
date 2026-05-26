import React, { useState, useCallback, useEffect } from 'react';
import './index.css';
import UploadZone from './components/UploadZone';
import MetadataForm from './components/MetadataForm';
import ProcessingView from './components/ProcessingView';
import AccessibilityReport from './components/AccessibilityReport';
import { applyMetadataAndSecurity, runAccessibilityChecks } from './utils/pdfProcessor';
import type { PDFMetadata, AccessibilityCheck } from './utils/pdfProcessor';
import { extractImagesFromPDF } from './utils/altTextGenerator';
import type { ImageAltText } from './utils/altTextGenerator';

type AppStage = 'upload' | 'metadata' | 'processing' | 'report';
type ProcessingStep = { id: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; detail?: string; };

const DEFAULT_METADATA: PDFMetadata = {
  title: '',
  author: 'KPMG India',
  subject: 'Audit',
  description: '',
  keywords: 'KPMG, audit, compliance, finance',
  language: 'en',
  copyright: 'Copyright Protected',
  copyrightNotice: '© 2024 KPMG India. All rights reserved.',
  copyrightInfoUrl: 'https://kpmg.com/in/en/home/misc/copyright.html',
};

const OWNER_PASSWORD = 'KPMG1234$';

const INIT_STEPS: ProcessingStep[] = [
  { id: 'load',     label: 'Loading PDF document',             status: 'pending' },
  { id: 'images',   label: 'Detecting images in pages',        status: 'pending' },
  { id: 'metadata', label: 'Applying accessibility metadata',  status: 'pending' },
  { id: 'tagging',  label: 'Setting Tagged PDF structure',     status: 'pending' },
  { id: 'security', label: 'Applying security & permissions',  status: 'pending' },
  { id: 'checks',   label: 'Running accessibility validation', status: 'pending' },
  { id: 'export',   label: 'Exporting processed PDF',          status: 'pending' },
];

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export default function App() {
  const [stage, setStage]                 = useState<AppStage>('upload');
  const [file, setFile]                   = useState<File | null>(null);
  const [metadata, setMetadata]           = useState<PDFMetadata>(DEFAULT_METADATA);
  const [images, setImages]               = useState<ImageAltText[]>([]);
  const [extracting, setExtracting]       = useState(false);
  const [steps, setSteps]                 = useState<ProcessingStep[]>(INIT_STEPS);
  const [stepLabel, setStepLabel]         = useState('');
  const [checks, setChecks]               = useState<AccessibilityCheck[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);

  const setStep = (id: string, status: ProcessingStep['status'], detail?: string) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));

  // Auto-extract images as soon as file is selected
  useEffect(() => {
    if (!file) return;
    setExtracting(true);
    setImages([]);
    extractImagesFromPDF(file)
      .then(found => { setImages(found); setExtracting(false); })
      .catch(() => setExtracting(false));
  }, [file]);

  const handleFileSelected = (f: File) => {
    setFile(f);
    setMetadata(prev => ({ ...prev, title: f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ') }));
    setStage('metadata');
  };

  const handleAltTextChange = (index: number, altText: string) => {
    setImages(prev => prev.map((img, i) => i === index ? { ...img, altText } : img));
  };

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setStage('processing');
    setSteps(INIT_STEPS.map(s => ({ ...s, status: 'pending' as const })));

    try {
      // 1. Load
      setStepLabel('Loading PDF document...');
      setStep('load', 'running');
      const arrayBuffer = await file.arrayBuffer();
      await delay(400);
      setStep('load', 'done', `${(file.size / 1024).toFixed(0)} KB loaded`);

      // 2. Images (already extracted, just report)
      setStepLabel('Processing images...');
      setStep('images', 'running');
      await delay(300);
      const filledAlt = images.filter(img => img.altText.trim().length > 0).length;
      setStep('images', 'done',
        images.length === 0 ? 'No images found' :
        `${images.length} image(s) · ${filledAlt} with alt-text`
      );

      // 3. Metadata
      setStepLabel('Applying metadata...');
      setStep('metadata', 'running');
      await delay(400);
      setStep('metadata', 'done', `Title: "${metadata.title}" | Lang: ${metadata.language}`);

      // 4. Tagging
      setStepLabel('Setting Tagged PDF structure...');
      setStep('tagging', 'running');
      await delay(300);
      setStep('tagging', 'done', 'StructTreeRoot, MarkInfo, RoleMap, Lang, PageLayout, XMP applied');

      // 5. Security + full PDF write
      setStepLabel('Applying security settings...');
      setStep('security', 'running');
      const processedBytes = await applyMetadataAndSecurity(arrayBuffer, metadata, OWNER_PASSWORD);
      setStep('security', 'done', 'Owner password set · High-res printing · Accessibility enabled');

      // 6. Accessibility checks
      setStepLabel('Running accessibility checks...');
      setStep('checks', 'running');
      await delay(400);
      const results = runAccessibilityChecks(metadata, images.length > 0, images);
      setChecks(results);
      const passCount = results.filter(c => c.status === 'pass').length;
      setStep('checks', 'done', `${passCount}/${results.length} checks passed`);

      // 7. Export
      setStepLabel('Exporting PDF...');
      setStep('export', 'running');
      await delay(300);
      setProcessedBlob(new Blob([processedBytes], { type: 'application/pdf' }));
      setStep('export', 'done', 'Ready for download');

      setStepLabel('Complete!');
      await delay(700);
      setStage('report');

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error(err);
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s));
      setStepLabel(`Error: ${msg}`);
    }
  }, [file, metadata, images]);

  const handleReset = () => {
    setFile(null);
    setMetadata(DEFAULT_METADATA);
    setImages([]);
    setSteps(INIT_STEPS);
    setChecks([]);
    setProcessedBlob(null);
    setStage('upload');
  };

  return (
    <main>
      {stage === 'upload' && <UploadZone onFileSelected={handleFileSelected} />}
      {stage === 'metadata' && file && (
        <MetadataForm
          file={file}
          metadata={metadata}
          onChange={setMetadata}
          images={images}
          extracting={extracting}
          onAltTextChange={handleAltTextChange}
          onSubmit={handleProcess}
          onBack={() => setStage('upload')}
        />
      )}
      {stage === 'processing' && <ProcessingView steps={steps} currentStep={stepLabel} />}
      {stage === 'report' && (
        <AccessibilityReport
          checks={checks}
          fileName={file?.name || 'document.pdf'}
          processedBlob={processedBlob}
          onReset={handleReset}
        />
      )}
    </main>
  );
}
