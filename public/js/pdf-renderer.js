(function () {
  if (typeof pdfjsLib === 'undefined') return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  async function renderPdf(container) {
    var pdf = await pdfjsLib.getDocument(container.dataset.pdfSrc).promise;
    var w = container.clientWidth || 800;
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: w / base.width });
      var canvas = document.createElement('canvas');
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.cssText = 'width:100%;display:block;margin-bottom:0.5rem;';
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  }

  document.querySelectorAll('.pdf-viewer').forEach(renderPdf);
})();
