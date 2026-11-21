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
        { href: volverA, target: '_self', title: 'Volver a dent-view', className: 'flex items-center gap-2 text-white' },
        React.createElement('span', { className: 'text-lg font-semibold' }, 'dent-view'),
        React.createElement('span', { className: 'text-sm opacity-70' }, '← Volver')
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
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        omitQuotationForMultipartRequest: true,
        bulkDataURI: { enabled: true, relativeResolution: 'studies' },
      },
    },
  ],
};
