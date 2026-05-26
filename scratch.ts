import { PDFDocument, PDFName, PDFNumber, PDFString, PDFArray, PDFDict } from 'pdf-lib';
import fs from 'fs';

async function test() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  page.drawText('Hello World');

  const ctx = pdfDoc.context;
  const pages = pdfDoc.getPages();

  // We want to wrap the content of each page with BDC / EMC
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const bdcStream = ctx.flateStream(new Uint8Array(Buffer.from('/P <</MCID 0>> BDC\n')));
    const emcStream = ctx.flateStream(new Uint8Array(Buffer.from('EMC\n')));

    const bdcRef = ctx.register(bdcStream);
    const emcRef = ctx.register(emcStream);

    const contents = p.node.get(PDFName.of('Contents'));
    let newContents = PDFArray.withContext(ctx);
    newContents.push(bdcRef);
    if (contents instanceof PDFArray) {
      for (let j = 0; j < contents.size(); j++) {
        newContents.push(contents.get(j));
      }
    } else {
      newContents.push(contents);
    }
    newContents.push(emcRef);

    p.node.set(PDFName.of('Contents'), newContents);
    p.node.set(PDFName.of('StructParents'), PDFNumber.of(i));
  }

  // Create ParentTree
  const numsArray = PDFArray.withContext(ctx);

  const sectRefs = [];
  const paragraphRefs = [];

  for (let i = 0; i < pages.length; i++) {
    const pageRef = pages[i].ref;

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
    paragraphRefs.push({ pageRef, tagRef: pTagRef });

    // For ParentTree, each StructParents needs an array of structurally elements (or just the element if there's one)
    // Wait, the PDF spec says for a page, the ParentTree maps StructParents index to an array of references to the structure elements
    const pageParentArray = PDFArray.withContext(ctx);
    pageParentArray.push(pTagRef);
    const pageParentArrayRef = ctx.register(pageParentArray);

    numsArray.push(PDFNumber.of(i));
    numsArray.push(pageParentArrayRef);

    const sect = ctx.obj({
      Type: PDFName.of('StructElem'),
      S: PDFName.of('Sect'),
      Pg: pageRef,
      K: pTagRef,
    });
    const sectRef = ctx.register(sect);

    const pDict = ctx.lookup(pTagRef);
    pDict.set(PDFName.of('P'), sectRef);

    sectRefs.push(sectRef);
  }

  const parentTree = ctx.obj({
    Nums: numsArray
  });
  const parentTreeRef = ctx.register(parentTree);

  const kArray = PDFArray.withContext(ctx);
  sectRefs.forEach(r => kArray.push(r));

  const docElem = ctx.obj({
    Type: PDFName.of('StructElem'),
    S: PDFName.of('Document'),
    K: kArray,
  });
  const docElemRef = ctx.register(docElem);

  sectRefs.forEach(ref => {
    const dict = ctx.lookup(ref);
    dict.set(PDFName.of('P'), docElemRef);
  });

  const roleMap = ctx.obj({
    Document: PDFName.of('Document'),
    Sect: PDFName.of('Sect'),
    P: PDFName.of('P')
  });

  const structTreeRoot = ctx.obj({
    Type: PDFName.of('StructTreeRoot'),
    K: docElemRef,
    RoleMap: roleMap,
    ParentTree: parentTreeRef,
    ParentTreeNextKey: PDFNumber.of(pages.length)
  });
  const structTreeRootRef = ctx.register(structTreeRoot);

  docElem.set(PDFName.of('P'), structTreeRootRef);

  pdfDoc.catalog.set(PDFName.of('StructTreeRoot'), structTreeRootRef);
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));

  const bytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', bytes);
  console.log('Done');
}
test().catch(console.error);
