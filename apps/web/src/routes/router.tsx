import { createBrowserRouter } from 'react-router';
import { Placeholder } from './Placeholder';

export const routeTable = [
  { path: '/', element: <Placeholder title="Pronto" /> },
  { path: '/registro', element: <Placeholder title="Registro" /> },
  { path: '/fondos', element: <Placeholder title="Fondos" /> },
  { path: '/app', element: <Placeholder title="Inicio" /> },
  { path: '/facturas/nueva', element: <Placeholder title="Nueva factura" /> },
  { path: '/cobrar/:id', element: <Placeholder title="Por cobrar" /> },
  { path: '/pagar/:id', element: <Placeholder title="Por pagar" /> },
  { path: '/pagar/:id/oferta', element: <Placeholder title="Nueva oferta" /> },
  { path: '/comprobante/:offerId', element: <Placeholder title="Comprobante" /> },
  { path: '/mi-codigo', element: <Placeholder title="Mi código" /> },
  { path: '/contactos', element: <Placeholder title="Contactos" /> },
  { path: '/e/:code', element: <Placeholder title="Empresa" /> },
  { path: '/red', element: <Placeholder title="Pronto en la red" /> },
  { path: '/ajustes', element: <Placeholder title="Ajustes" /> },
  { path: '*', element: <Placeholder title="No encontrada" /> },
];

export const router = createBrowserRouter(routeTable);
