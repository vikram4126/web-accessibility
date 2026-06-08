export type ImageAltText = {
  pageIndex: number;
  imageIndex: number;
  altText: string;
  thumbnailDataUrl?: string;
};

// Renders each PDF page to a canvas and extracts image regions as thumbnails.
// Uses a LOCAL worker — no external CDN calls.
export async function extractImagesFromPDF(file: File): Promise<ImageAltText[]> {
  const images: ImageAltText[] = [];
  try {
    const pdfjsLib = await import('pdfjs-dist');
    // Point to our locally-hosted worker — no external network calls
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const limit = Math.min(pdf.numPages, 15);

    for (let pageIdx = 0; pageIdx < limit; pageIdx++) {
      const page = await pdf.getPage(pageIdx + 1);
      const ops  = await page.getOperatorList();

      // Collect unique image XObject names on this page
      const imgNames = new Set<string>();
      for (let i = 0; i < ops.fnArray.length; i++) {
        // OPS.paintImageXObject = 85
        if (ops.fnArray[i] === 85 && ops.argsArray[i]?.[0]) {
          imgNames.add(ops.argsArray[i][0] as string);
        }
      }

      if (imgNames.size === 0) continue;

      // Render the full page at low scale to get a thumbnail
      const viewport   = page.getViewport({ scale: 0.5 });
      const canvas     = document.createElement('canvas');
      canvas.width     = viewport.width;
      canvas.height    = viewport.height;
      const ctx        = canvas.getContext('2d')!;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);

      for (const _name of imgNames) {
        images.push({
          pageIndex: pageIdx,
          imageIndex: images.length,
          altText: '',
          thumbnailDataUrl,
        });
      }
    }
  } catch (err) {
    console.warn('Image extraction warning:', err);
  }
  return images;
}
