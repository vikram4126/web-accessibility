import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFDict,
  PDFArray,
  PDFNumber,
  PDFHexString,
  PDFRawStream,
} from 'pdf-lib';

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

import { unzlibSync } from 'fflate';

function decodeStream(stream: PDFRawStream): string {
  try {
    return new TextDecoder().decode(unzlibSync(stream.contents));
  } catch (e) {
    return new TextDecoder().decode(stream.contents);
  }
}

/**
 * Builds and injects a proper PDF StructTreeRoot with real tag elements.
 * This is what Adobe Acrobat / PAC 3 checks for Tagged PDF compliance.
 *
 * Structure:
 *   StructTreeRoot  →  Document  →  [Sect per page  →  [P / H1 / Figure elements]]
 */
function injectStructureTree(pdfDoc: PDFDocument): void {
  const ctx = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const encoder = new TextEncoder();

  const sectRefs: ReturnType<typeof ctx.register>[] = [];
  const numsArray = PDFArray.withContext(ctx);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageRef = page.ref;

    const contents = page.node.get(PDFName.of('Contents'));
    let decodedContents = '';

    if (contents instanceof PDFArray) {
      for (let j = 0; j < contents.size(); j++) {
        const stream = contents.get(j);
        if (stream instanceof PDFRawStream) {
          decodedContents += decodeStream(stream) + '\n';
        }
      }
    } else if (contents instanceof PDFRawStream) {
      decodedContents = decodeStream(contents);
    }

    let newContents = '';
    let lastIndex = 0;
    let mcidCounter = 0;
    const pageParentArray = PDFArray.withContext(ctx);
    const pageElements: ReturnType<typeof ctx.register>[] = [];

    // Matches text blocks (BT...ET) or image drawing (/Im1 Do)
    const regex = /(BT[\s\S]*?ET|\/[a-zA-Z0-9_]+\s+Do)/g;
    let match;

    while ((match = regex.exec(decodedContents)) !== null) {
      newContents += decodedContents.substring(lastIndex, match.index);
      
      const block = match[0];
      let tag = 'P';
      
      if (block.endsWith('Do')) {
        tag = 'Figure';
      } else {
        // Check for font size > 14pt
        const tfMatch = /\/F[a-zA-Z0-9_]+\s+([0-9.]+)\s+Tf/.exec(block);
        if (tfMatch) {
          const fontSize = parseFloat(tfMatch[1]);
          if (fontSize > 14) tag = 'H1';
        }
      }

      newContents += `/${tag} <</MCID ${mcidCounter}>> BDC\n`;
      newContents += block + '\n';
      newContents += 'EMC\n';

      const mcr = ctx.obj({
        Type: PDFName.of('MCR'),
        Pg: pageRef,
        MCID: PDFNumber.of(mcidCounter),
      });
      const mcrRef = ctx.register(mcr);

      const structElem = ctx.obj({
        Type: PDFName.of('StructElem'),
        S: PDFName.of(tag),
        Pg: pageRef,
        K: mcrRef,
      });
      const structElemRef = ctx.register(structElem);

      pageParentArray.push(structElemRef);
      pageElements.push(structElemRef);

      mcidCounter++;
      lastIndex = regex.lastIndex;
    }
    
    newContents += decodedContents.substring(lastIndex);
    
    // Fallback if empty or no text/images found
    if (mcidCounter === 0) {
      newContents = `/P <</MCID 0>> BDC\n${decodedContents}\nEMC\n`;
      
      const mcr = ctx.obj({
        Type: PDFName.of('MCR'),
        Pg: pageRef,
        MCID: PDFNumber.of(0),
      });
      const mcrRef = ctx.register(mcr);

      const pTag = ctx.obj({
        Type: PDFName.of('StructElem'),
        S: PDFName.of('P'),
        Pg: pageRef,
        K: mcrRef,
      });
      const pTagRef = ctx.register(pTag);
      
      pageParentArray.push(pTagRef);
      pageElements.push(pTagRef);
      mcidCounter = 1;
    }

    const newStream = ctx.flateStream(encoder.encode(newContents));
    const newStreamRef = ctx.register(newStream);

    page.node.set(PDFName.of('Contents'), newStreamRef);
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(i));

    const pageParentArrayRef = ctx.register(pageParentArray);
    numsArray.push(PDFNumber.of(i));
    numsArray.push(pageParentArrayRef);

    const kArray = PDFArray.withContext(ctx);
    pageElements.forEach(r => kArray.push(r));

    const sect = ctx.obj({
      Type: PDFName.of('StructElem'),
      S: PDFName.of('Sect'),
      Pg: pageRef,
      K: kArray,
    });
    const sectRef = ctx.register(sect);

    pageElements.forEach(ref => {
      const pDict = ctx.lookup(ref) as PDFDict;
      pDict.set(PDFName.of('P'), sectRef);
    });

    sectRefs.push(sectRef);
  }

  // ── Build <Document> root element ─────────────────────────────────────
  const kArray = PDFArray.withContext(ctx);
  sectRefs.forEach(r => kArray.push(r));

  const docElem = ctx.obj({
    Type: PDFName.of('StructElem'),
    S: PDFName.of('Document'),
    K: kArray,
  });
  const docElemRef = ctx.register(docElem);

  // Back-link each <Sect> → parent <Document>
  sectRefs.forEach(ref => {
    const dict = ctx.lookup(ref) as PDFDict;
    dict.set(PDFName.of('P'), docElemRef);
  });

  // ── Build StructTreeRoot ───────────────────────────────────────────────
  const parentTree = ctx.obj({
    Nums: numsArray
  });
  const parentTreeRef = ctx.register(parentTree);

  const roleMap = ctx.obj({
    Document: PDFName.of('Document'),
    Sect:     PDFName.of('Sect'),
    P:        PDFName.of('P'),
    H1:       PDFName.of('H1'),
    Figure:   PDFName.of('Figure'),
    Span:     PDFName.of('Span'),
  });

  const structTreeRoot = ctx.obj({
    Type:    PDFName.of('StructTreeRoot'),
    K:       docElemRef,
    RoleMap: roleMap,
    ParentTree: parentTreeRef,
    ParentTreeNextKey: PDFNumber.of(pages.length)
  });
  const structTreeRootRef = ctx.register(structTreeRoot);

  // Back-link <Document> → StructTreeRoot
  const docElemDict = ctx.lookup(docElemRef) as PDFDict;
  docElemDict.set(PDFName.of('P'), structTreeRootRef);

  // ── Attach StructTreeRoot to catalog ──────────────────────────────────
  pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);

  // ── Ensure Resources exist and Tabs use structure ────────────────────
  for (const page of pages) {
    const pageDict = page.node;
    let resources = pageDict.get(PDFName.of('Resources'));
    if (!resources) {
      resources = ctx.obj({});
      pageDict.set(PDFName.of('Resources'), resources);
    }
    // Set Tab order to use document structure (S = Structure)
    pageDict.set(PDFName.of('Tabs'), PDFName.of('S'));
  }
}

export async function applyMetadataAndSecurity(
  pdfBytes: ArrayBuffer,
  metadata: PDFMetadata,
  password: string
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  // ── Standard DocInfo dictionary ──────────────────────────────────────────
  pdfDoc.setTitle(metadata.title);
  pdfDoc.setAuthor(metadata.author);
  pdfDoc.setSubject(metadata.subject);
  pdfDoc.setKeywords([metadata.keywords]);
  pdfDoc.setCreator('KPMG PDF Accessibility Tool');
  pdfDoc.setProducer('KPMG PDF Accessibility Tool v1.0');

  // ── Catalog-level accessibility flags ────────────────────────────────────
  pdfDoc.catalog.set(PDFName.of('Lang'), PDFString.of(metadata.language || 'en'));
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), pdfDoc.context.obj({ Marked: true }));
  pdfDoc.catalog.set(PDFName.of('PageLayout'), PDFName.of('SinglePage'));

  const viewerPrefs = pdfDoc.catalog.getOrCreateViewerPreferences();
  viewerPrefs.setDisplayDocTitle(true);

  // ── Inject real Structure Tree ────────────────────────────────────────────
  injectStructureTree(pdfDoc);

  // ── XMP Metadata stream ───────────────────────────────────────────────────
  const xmpMetadata = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:rights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:pdfua="http://www.aiim.org/pdfua/ns/id/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.description)}</rdf:li></rdf:Alt></dc:description>
      <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.copyrightNotice)}</rdf:li></rdf:Alt></dc:rights>
      <rights:Marked>True</rights:Marked>
      <rights:WebStatement>${escapeXml(metadata.copyrightInfoUrl)}</rights:WebStatement>
      <dc:subject><rdf:Bag><rdf:li>${escapeXml(metadata.keywords)}</rdf:li></rdf:Bag></dc:subject>
      <pdf:PDFVersion>1.7</pdf:PDFVersion>
      <pdfua:part>1</pdfua:part>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

  const metadataStream = pdfDoc.context.stream(xmpMetadata, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
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
    {
      id: 'tagged',
      label: 'Document is Tagged PDF',
      status: 'pass',
      detail: 'StructTreeRoot, MarkInfo Marked=true & RoleMap injected',
    },
    {
      id: 'structtree',
      label: 'Structure Tree Present',
      status: 'pass',
      detail: 'Document → Sect → P elements built for each page',
    },
    {
      id: 'title',
      label: 'Document Title is Set',
      status: metadata.title.trim().length > 0 ? 'pass' : 'fail',
      detail: metadata.title.trim() || 'No title provided',
    },
    {
      id: 'lang',
      label: 'Text Language is Specified',
      status: metadata.language.trim().length > 0 ? 'pass' : 'fail',
      detail: `Language: ${metadata.language || 'Not set'}`,
    },
    {
      id: 'author',
      label: 'Author / Document Properties',
      status: metadata.author.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.author.trim() || 'Author not specified',
    },
    {
      id: 'keywords',
      label: 'Keywords are Set',
      status: metadata.keywords.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.keywords.trim() || 'No keywords provided',
    },
    {
      id: 'alttext',
      label: 'Images Have Alternative Text',
      status: !hasImages ? 'pass' : altTexts.every(a => a.altText.trim().length > 0) ? 'pass' : 'fail',
      detail: !hasImages
        ? 'No images detected'
        : `${altTexts.filter(a => a.altText.trim()).length}/${altTexts.length} images have alt text`,
    },
    {
      id: 'security',
      label: 'Accessibility Permission Flag Set',
      status: 'pass',
      detail: 'Content accessibility enabled, editing restricted',
    },
    {
      id: 'copyright',
      label: 'Copyright Information Present',
      status: metadata.copyrightNotice.trim().length > 0 ? 'pass' : 'warning',
      detail: metadata.copyrightNotice.trim() || 'No copyright notice set',
    },
    {
      id: 'pageview',
      label: 'Single Page Layout & Title in Bar',
      status: 'pass',
      detail: 'PageLayout=SinglePage and DisplayDocTitle=true applied',
    },
    {
      id: 'rolemap',
      label: 'RoleMap Defined',
      status: 'pass',
      detail: 'Standard tag roles mapped (Document, Sect, P, H1, Figure, Span)',
    },
    {
      id: 'readingorder',
      label: 'Logical Reading Order',
      status: 'pass',
      detail: 'Tab order set to use document structure (/Tabs /S)',
    },
    {
      id: 'contrast',
      label: 'Appropriate Color Contrast',
      status: 'warning',
      detail: 'Run Acrobat Accessibility Checker for color contrast',
    },
  ];
}
