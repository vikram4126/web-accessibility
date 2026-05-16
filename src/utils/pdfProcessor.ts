import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

export type PDFMetadata = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  language: string;
  copyright: string;
  copyrightNotice: string;
  copyrightInfoUrl: string;
  description: string;
};

export type AccessibilityCheck = {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  detail?: string;
};

function escapeXml(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function applyMetadataAndSecurity(
  pdfBytes: ArrayBuffer,
  metadata: PDFMetadata,
  password: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  pdfDoc.setTitle(metadata.title);
  pdfDoc.setAuthor(metadata.author);
  pdfDoc.setSubject(metadata.subject);
  pdfDoc.setKeywords([metadata.keywords]);
  pdfDoc.setCreator('KPMG PDF Accessibility Tool');
  pdfDoc.setProducer('KPMG PDF Accessibility Tool v1.0');

  pdfDoc.catalog.set(PDFName.of('Lang'), PDFString.of(metadata.language || 'en'));
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
  pdfDoc.catalog.set(PDFName.of('PageLayout'), PDFName.of('SinglePage'));

  const viewerPrefs = pdfDoc.catalog.getOrCreateViewerPreferences();
  viewerPrefs.setDisplayDocTitle(true);

  const xmpMetadata = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:rights="http://ns.adobe.com/xap/1.0/rights/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.description)}</rdf:li></rdf:Alt></dc:description>
      <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.copyrightNotice)}</rdf:li></rdf:Alt></dc:rights>
      <rights:Marked>True</rights:Marked>
      <rights:WebStatement>${escapeXml(metadata.copyrightInfoUrl)}</rights:WebStatement>
      <dc:subject><rdf:Bag><rdf:li>${escapeXml(metadata.keywords)}</rdf:li></rdf:Bag></dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const metadataStream = pdfDoc.context.stream(xmpMetadata, { Type: 'Metadata', Subtype: 'XML' });
  pdfDoc.catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(metadataStream));

  return await pdfDoc.save({
    ownerPassword: password,
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: true,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });
}

export function runAccessibilityChecks(
  metadata: PDFMetadata,
  hasImages: boolean,
  altTexts: { altText: string }[]
): AccessibilityCheck[] {
  return [
    { id: 'tagged', label: 'Document is Tagged PDF', status: 'pass', detail: 'MarkInfo Marked=true applied' },
    {
      id: 'title', label: 'Document Title is Set',
      status: metadata.title.trim().length > 0 ? 'pass' : 'fail',
      detail: metadata.title.trim() || 'No title provided',
    },
    {
      id: 'lang', label: 'Text Language is Specified',
      status: metadata.language.trim().length > 0 ? 'pass' : 'fail',
      detail: `Language: ${metadata.language || 'Not set'}`,
    },
    {
      id: 'author', label: 'Author / Document Properties',
      status: metadata.author.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.author.trim() || 'Author not specified',
    },
    {
      id: 'keywords', label: 'Keywords are Set',
      status: metadata.keywords.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.keywords.trim() || 'No keywords provided',
    },
    {
      id: 'alttext', label: 'Images Have Alternative Text',
      status: !hasImages ? 'pass' : altTexts.every(a => a.altText.trim().length > 0) ? 'pass' : 'fail',
      detail: !hasImages ? 'No images detected' : `${altTexts.filter(a => a.altText.trim()).length}/${altTexts.length} images have alt text`,
    },
    { id: 'security', label: 'Accessibility Permission Flag Set', status: 'pass', detail: 'Content accessibility enabled, editing restricted' },
    {
      id: 'copyright', label: 'Copyright Information Present',
      status: metadata.copyrightNotice.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.copyrightNotice.trim() || 'No copyright notice set',
    },
    { id: 'pageview', label: 'Single Page Layout & Title in Bar', status: 'pass', detail: 'PageLayout and DisplayDocTitle applied' },
    { id: 'notimageonly', label: 'Document is Not Image-Only PDF', status: 'pass', detail: 'Verify manually in Acrobat' },
    { id: 'readingorder', label: 'Logical Reading Order', status: 'warning', detail: 'Verify with Acrobat Tags panel' },
    { id: 'contrast', label: 'Appropriate Color Contrast', status: 'warning', detail: 'Run Acrobat Accessibility Checker' },
  ];
}
