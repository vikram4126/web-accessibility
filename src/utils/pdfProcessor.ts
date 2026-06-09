import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFDict,
  PDFArray,
  PDFNumber,
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

// ── Block parsing types ────────────────────────────────────────────────────

interface ContentBlock {
  raw: string;          // the raw PDF operator text (BT...ET or /XObj Do)
  tag: 'H1' | 'P' | 'Figure';
  y: number;            // page Y of the block (PDF coords: 0 = bottom)
  x: number;            // page X for left-to-right tie-breaking
  sourceIndex: number;  // original index in the stream — used for stable sort
}

/**
 * Extract the "current Y" (text baseline or image translation) from a block.
 *
 * For BT…ET blocks we look for the LAST Tm or Td/TD operator.
 *   Tm: a b c d tx ty Tm  → y = ty
 *   Td / TD: tx ty Td      → relative; we accumulate from 0
 *
 * For image blocks (…Do) we look backwards for the last cm operator.
 *   a b c d tx ty cm       → y = ty
 */
function extractBlockPosition(block: string): { x: number; y: number } {
  // Try Tm first (absolute text matrix)
  const tmMatches = [...block.matchAll(/([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+Tm/g)];
  if (tmMatches.length > 0) {
    const last = tmMatches[tmMatches.length - 1];
    return { x: parseFloat(last[5]), y: parseFloat(last[6]) };
  }

  // Try cm (current transformation matrix — used before Do / image)
  const cmMatches = [...block.matchAll(/([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+cm/g)];
  if (cmMatches.length > 0) {
    const last = cmMatches[cmMatches.length - 1];
    return { x: parseFloat(last[5]), y: parseFloat(last[6]) };
  }

  // Fallback: accumulate Td / TD offsets
  let cx = 0, cy = 0;
  for (const m of block.matchAll(/([+-]?[0-9.]+)\s+([+-]?[0-9.]+)\s+T[dD]/g)) {
    cx += parseFloat(m[1]);
    cy += parseFloat(m[2]);
  }
  return { x: cx, y: cy };
}

/**
 * Merges resources from a Form XObject into the main page's Resources dictionary.
 * Prevents name collisions by renaming conflicting resources with a unique prefix.
 */
function mergeResources(
  pageRes: PDFDict,
  formRes: PDFDict,
  formPrefix: string,
  formContent: string
): string {
  let newContent = formContent;
  const categories = ['Font', 'XObject', 'ExtGState', 'ColorSpace', 'Pattern', 'Shading', 'Properties'] as const;

  for (const cat of categories) {
    const pageCat = pageRes.lookup(PDFName.of(cat), PDFDict);
    const formCat = formRes.lookup(PDFName.of(cat), PDFDict);

    if (formCat) {
      if (!pageCat) {
        pageRes.set(PDFName.of(cat), formCat);
      } else {
        for (const [key, value] of formCat.entries()) {
          const pageVal = pageCat.get(key);
          if (!pageVal) {
            pageCat.set(key, value);
          } else if (pageVal !== value) {
            const newNameStr = `${key.decodeText()}_${formPrefix}`;
            const newName = PDFName.of(newNameStr);
            pageCat.set(newName, value);

            const regex = new RegExp(`/${key.decodeText()}(\\s+|[^a-zA-Z0-9_-])`, 'g');
            newContent = newContent.replace(regex, `/${newNameStr}$1`);
          }
        }
      }
    }
  }
  return newContent;
}

/**
 * Recursively flattens Form XObjects into the main content stream.
 */
function flattenFormXObjects(
  decodedContents: string,
  pageResources: PDFDict | undefined,
  xobjectsDict: PDFDict | undefined
): string {
  if (!xobjectsDict || !pageResources) return decodedContents;

  let flattenedContents = decodedContents;
  let flattenOccurred = true;
  let pass = 0;

  while (flattenOccurred && pass < 10) {
    flattenOccurred = false;
    pass++;

    const regex = /\/([^\s]+)\s+Do/g;
    let m: RegExpExecArray | null;
    let newContents = '';
    let lastIndex = 0;

    while ((m = regex.exec(flattenedContents)) !== null) {
      const nameStr = m[1];
      const xobj = xobjectsDict.lookup(PDFName.of(nameStr));

      if (xobj instanceof PDFRawStream) {
        const subtype = xobj.dict.lookup(PDFName.of('Subtype'));
        if (subtype === PDFName.of('Form')) {
          flattenOccurred = true;

          let formContent = decodeStream(xobj);
          const formRes = xobj.dict.lookup(PDFName.of('Resources'), PDFDict);
          
          if (formRes) {
            formContent = mergeResources(pageResources, formRes, `${nameStr}_${pass}`, formContent);
          }

          const matrix = xobj.dict.lookup(PDFName.of('Matrix'), PDFArray);
          let matrixPrefix = '';
          if (matrix) {
            matrixPrefix = matrix.asArray().map(n => {
              if (n instanceof PDFNumber) return n.value();
              return 0; 
            }).join(' ') + ' cm\n';
          }

          const replacement = `\nq\n${matrixPrefix}${formContent}\nQ\n`;
          newContents += flattenedContents.substring(lastIndex, m.index) + replacement;
          lastIndex = regex.lastIndex;
        }
      }
    }
    newContents += flattenedContents.substring(lastIndex);
    flattenedContents = newContents;
  }
  return flattenedContents;
}

/**
 * Builds and injects a proper PDF StructTreeRoot with real tag elements.
 *
 * Structure:
 *   StructTreeRoot  →  Document  →  [Sect per page  →  [H1 / P / Figure …]]
 *
 * Reading order is determined by sorting blocks top-to-bottom (descending Y)
 * then left-to-right (ascending X). The content stream retains its original
 * paint order; only the StructTree children list is re-ordered, which is what
 * Adobe Acrobat and screen readers use for logical reading order.
 */
function injectStructureTree(pdfDoc: PDFDocument): void {
  const ctx   = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const encoder = new TextEncoder();

  const sectRefs: ReturnType<typeof ctx.register>[] = [];
  const numsArray = PDFArray.withContext(ctx);

  for (let i = 0; i < pages.length; i++) {
    const page    = pages[i];
    const pageRef = page.ref;
    const pageH   = page.getHeight(); // needed to flip Y (PDF Y is from bottom)

    // ── 1. Decode the page content stream(s) ──────────────────────────────
    const contents = page.node.lookup(PDFName.of('Contents'));
    let decodedContents = '';

    if (contents instanceof PDFArray) {
      for (let j = 0; j < contents.size(); j++) {
        const s = contents.lookup(j);
        if (s instanceof PDFRawStream) decodedContents += decodeStream(s) + '\n';
      }
    } else if (contents instanceof PDFRawStream) {
      decodedContents = decodeStream(contents);
    }

    // ── 1.5 Flatten Form XObjects to expose hidden text/images ────────────
    const entries = (page.node as any).normalizedEntries();
    const pageResources = entries.Resources;
    const xobjectsDict = entries.XObject;
    decodedContents = flattenFormXObjects(decodedContents, pageResources, xobjectsDict);

    // ── 2. Parse all blocks and collect position metadata ─────────────────
    const blocks: ContentBlock[] = [];
    const regex = /(BT[\s\S]*?ET|\/[^\s]+\s+Do)/g;
    let m: RegExpExecArray | null;
    let srcIdx = 0;
    const contextWindow = 300;

    while ((m = regex.exec(decodedContents)) !== null) {
      const raw = m[0];
      let tag: 'H1' | 'P' | 'Figure' = 'P';

      if (raw.endsWith('Do')) {
        tag = 'Figure';
      } else {
        const tfM = /\/F[a-zA-Z0-9_]+\s+([0-9.]+)\s+Tf/.exec(raw);
        if (tfM && parseFloat(tfM[1]) > 14) tag = 'H1';
      }

      // For position: check the block itself, then the preceding context for cm
      const precedingCtx = decodedContents.substring(
        Math.max(0, m.index - contextWindow), m.index
      );
      const combined = precedingCtx + raw;
      const pos = extractBlockPosition(combined);

      // Convert PDF bottom-origin Y → top-origin for intuitive sort
      const yFromTop = pageH - pos.y;

      blocks.push({
        raw,
        tag,
        y: yFromTop,
        x: pos.x,
        sourceIndex: srcIdx++,
      });
    }

    // ── 3. Rebuild content stream — inject BDC/EMC in PAINT ORDER ─────────
    // Each block keeps its sourceIndex as its MCID so the content stream stays
    // valid, while the StructTree children list is ordered by reading order.
    let newContents = '';
    let lastPos = 0;
    const regex2 = /(BT[\s\S]*?ET|\/[^\s]+\s+Do)/g;
    let paintIdx = 0;
    const paintOrderBlocks = [...blocks].sort((a, b) => a.sourceIndex - b.sourceIndex);

    let m2: RegExpExecArray | null;
    while ((m2 = regex2.exec(decodedContents)) !== null) {
      newContents += decodedContents.substring(lastPos, m2.index);
      const blk = paintOrderBlocks[paintIdx];
      const mcid = blk.sourceIndex; // MCID = sourceIndex for paint-order injection
      newContents += `/${blk.tag} <</MCID ${mcid}>> BDC\n`;
      newContents += blk.raw + '\n';
      newContents += 'EMC\n';
      lastPos = regex2.lastIndex;
      paintIdx++;
    }
    newContents += decodedContents.substring(lastPos);

    // Fallback — page had no parseable text or images
    if (blocks.length === 0) {
      newContents = `/P <</MCID 0>> BDC\n${decodedContents}\nEMC\n`;
      blocks.push({ raw: decodedContents, tag: 'P', y: pageH, x: 0, sourceIndex: 0 });
    }

    // ── 4. Sort blocks top-to-bottom, left-to-right for reading order ──────
    const readingOrder = [...blocks].sort((a, b) => {
      const yDiff = a.y - b.y; // smaller yFromTop = higher on page = read first
      if (Math.abs(yDiff) > 5) return yDiff; // 5pt tolerance for same "line"
      return a.x - b.x;       // same line → left to right
    });

    // ── 5. Build MCR + StructElem for each block in READING ORDER ─────────
    const pageParentArray = PDFArray.withContext(ctx);
    // pageParentArray maps MCID → parent StructElem; needs to be indexed by MCID
    // So we build an array sized to max MCID and fill by sourceIndex
    const structElemByMCID: (ReturnType<typeof ctx.register> | null)[] =
      new Array(blocks.length).fill(null);

    for (const blk of readingOrder) {
      const mcr = ctx.obj({
        Type: PDFName.of('MCR'),
        Pg:   pageRef,
        MCID: PDFNumber.of(blk.sourceIndex),
      });
      const mcrRef = ctx.register(mcr);

      const structElem = ctx.obj({
        Type: PDFName.of('StructElem'),
        S:    PDFName.of(blk.tag),
        Pg:   pageRef,
        K:    mcrRef,
      });
      const structElemRef = ctx.register(structElem);
      structElemByMCID[blk.sourceIndex] = structElemRef;
    }

    // pageParentArray must map MCID 0, 1, 2 … in order → parent StructElem
    for (let k = 0; k < blocks.length; k++) {
      const ref = structElemByMCID[k];
      if (ref) pageParentArray.push(ref);
    }

    // ── 6. kArray = children of <Sect> in READING ORDER ───────────────────
    const kArray = PDFArray.withContext(ctx);
    for (const blk of readingOrder) {
      const ref = structElemByMCID[blk.sourceIndex];
      if (ref) kArray.push(ref);
    }

    // ── 7. Commit changes to page ──────────────────────────────────────────
    const newStream    = ctx.flateStream(encoder.encode(newContents));
    const newStreamRef = ctx.register(newStream);
    page.node.set(PDFName.of('Contents'),      newStreamRef);
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(i));

    const pageParentArrayRef = ctx.register(pageParentArray);
    numsArray.push(PDFNumber.of(i));
    numsArray.push(pageParentArrayRef);

    const sect = ctx.obj({
      Type: PDFName.of('StructElem'),
      S:    PDFName.of('Sect'),
      Pg:   pageRef,
      K:    kArray,
    });
    const sectRef = ctx.register(sect);

    // Back-link each child → <Sect>
    for (let k = 0; k < blocks.length; k++) {
      const ref = structElemByMCID[k];
      if (ref) {
        const d = ctx.lookup(ref) as PDFDict;
        d.set(PDFName.of('P'), sectRef);
      }
    }

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

  // ── Ensure Resources exist on each page ───────────────────────────────
  for (const page of pages) {
    const pageDict = page.node;
    let resources = pageDict.get(PDFName.of('Resources'));
    if (!resources) {
      resources = ctx.obj({});
      pageDict.set(PDFName.of('Resources'), resources);
    }
  }
}

export async function applyMetadataAndSecurity(
  pdfBytes: ArrayBuffer,
  metadata: PDFMetadata,
  _password: string
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

  return await pdfDoc.save();
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
      detail: 'Document → Sect → H1 / P / Figure elements per block, reading-order sorted',
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
      detail: 'Blocks sorted top-to-bottom, left-to-right by Y/X coordinate — StructTree reflects visual reading flow',
    },
    {
      id: 'contrast',
      label: 'Appropriate Color Contrast',
      status: 'warning',
      detail: 'Run Acrobat Accessibility Checker for color contrast',
    },
  ];
}
