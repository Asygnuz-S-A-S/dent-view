/** @type {AppTypes.Config} */

// Config del visor de dent-view. Se sirve en /visor/ detrás de Caddy, mismo origen que web y /dicom-web
// (la cookie de sesión viaja sola). Sin dicomlocal / dicomjson / dicomwebproxy, sin ?customization= ni configUrl.

// "Volver": el viewer abre desde dent-view (/estudios, /informes…) o desde /resultados/<token> (paciente/doctor).
// document.referrer conserva esa página de origen; si no es del mismo origen, se vuelve a /estudios.
const volverA = (() => {
  try {
    const r = new URL(document.referrer);
    return r.origin === window.location.origin && !r.pathname.startsWith('/visor') ? r.pathname + r.search : '/estudios';
  } catch (e) {
    return '/estudios';
  }
})();

// Móvil/tableta (< 1024 px, igual que el parche del visor): el logo se reduce a "←" y no se muestra el tour de
// bienvenida (sus globos tapan la imagen). El tour se marca como ya visto; en escritorio no cambia nada.
const style = document.createElement('style');
style.textContent =
  '@media (max-width: 1023px) { .dv-solo-escritorio { display: none !important; } ' +
  '.dv-logo { min-width: 40px; min-height: 40px; justify-content: center; } .dv-flecha { font-size: 1.5rem !important; opacity: 1 !important; } }';
document.head.appendChild(style);
try {
  if (window.matchMedia('(max-width: 1023px)').matches) {
    const vistos = JSON.parse(localStorage.getItem('shownTours')) || [];
    if (!vistos.includes('basicViewerTour')) localStorage.setItem('shownTours', JSON.stringify([...vistos, 'basicViewerTour']));
  }
} catch (e) {
  // localStorage no disponible: el tour se muestra como en upstream.
}

window.config = {
  name: 'config/dent-view.js',
  routerBasename: '/visor',
  // Idioma por defecto (parche viewer/patches/0001-dent-view-es.patch): ignora el idioma del navegador;
  // ?lng= o la elección guardada en Preferencias siguen mandando. Claves faltantes caen a en-US.
  defaultLanguage: 'es',
  extensions: [],
  modes: [],
  customizationService: {},
  // Sin el diálogo "investigational use" de OHIF.
  investigationalUseDialog: { option: 'never' },
  // Marca en el encabezado: nombre de dent-view y enlace para volver (se llega por enlace normal, no SPA de OHIF).
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement(
        'a',
        {
          href: volverA,
          target: '_self',
          title: 'Volver a dent-view',
          'aria-label': 'Volver a dent-view',
          className: 'dv-logo flex items-center gap-2 text-white',
        },
        React.createElement('span', { className: 'dv-solo-escritorio text-lg font-semibold' }, 'dent-view'),
        React.createElement('span', { className: 'dv-flecha text-sm opacity-70' }, '←'),
        React.createElement('span', { className: 'dv-solo-escritorio text-sm opacity-70' }, 'Volver')
      );
    },
  },
  showStudyList: false, // la lista de estudios vive en dent-view; QIDO sin UID está bloqueado
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,
  maxNumRequests: { interaction: 100, thumbnail: 5, prefetch: 25 },
  showErrorDetails: 'production',
  defaultDataSourceName: 'dicomweb',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'dent-view',
        name: 'dent-view',
        qidoRoot: '/dicom-web',
        wadoRoot: '/dicom-web',
        wadoUriRoot: '/dicom-web',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        // 'rendered': JPEG de ~50 KB desde Orthanc en vez de bajar el DICOM completo por miniatura (requiere ?accept= en acceso.ts).
        thumbnailRendering: 'rendered',
        // 'fetch': GET con cookie del endpoint /rendered (la estrategia por defecto pide multipart y Orthanc responde 400).
        thumbnailRequestStrategy: 'fetch',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: { enabled: true, relativeResolution: 'studies' },
      },
    },
  ],
};
