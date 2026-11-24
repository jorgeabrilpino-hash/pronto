import { createBrowserRouter, type RouteObject } from 'react-router';
import { Landing } from '@/features/auth/Landing';
import { Register } from '@/features/auth/Register';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { MyCode } from '@/features/code/MyCode';
import { Funds } from '@/features/funds/Funds';
import { Placeholder } from './Placeholder';

export const routeTable: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/registro', element: <Register /> },
  { path: '/e/:code', element: <Placeholder title="Empresa" /> },
  { path: '/red', element: <Placeholder title="Pronto en la red" /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/fondos', element: <Funds /> },
      { path: '/app', element: <Placeholder title="Inicio" /> },
      { path: '/facturas/nueva', element: <Placeholder title="Nueva factura" /> },
      { path: '/cobrar/:id', element: <Placeholder title="Por cobrar" /> },
      { path: '/pagar/:id', element: <Placeholder title="Por pagar" /> },
      { path: '/pagar/:id/oferta', element: <Placeholder title="Nueva oferta" /> },
      { path: '/comprobante/:offerId', element: <Placeholder title="Comprobante" /> },
      { path: '/mi-codigo', element: <MyCode /> },
      { path: '/contactos', element: <Placeholder title="Contactos" /> },
      { path: '/ajustes', element: <Placeholder title="Ajustes" /> },
    ],
  },
  { path: '*', element: <Placeholder title="No encontrada" /> },
];

export const router = createBrowserRouter(routeTable);
