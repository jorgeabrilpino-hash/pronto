import { createBrowserRouter, type RouteObject } from 'react-router';
import { Landing } from '@/features/auth/Landing';
import { Register } from '@/features/auth/Register';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { MyCode } from '@/features/code/MyCode';
import { Funds } from '@/features/funds/Funds';
import { Home } from '@/features/home/Home';
import { NewInvoice } from '@/features/invoices/new/NewInvoice';
import { PayableDetail } from '@/features/invoices/PayableDetail';
import { ReceivableDetail } from '@/features/invoices/ReceivableDetail';
import { NewOffer } from '@/features/offers/NewOffer';
import { Receipt } from '@/features/offers/Receipt';
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
      { path: '/app', element: <Home /> },
      { path: '/facturas/nueva', element: <NewInvoice /> },
      { path: '/cobrar/:id', element: <ReceivableDetail /> },
      { path: '/pagar/:id', element: <PayableDetail /> },
      { path: '/pagar/:id/oferta', element: <NewOffer /> },
      { path: '/comprobante/:offerId', element: <Receipt /> },
      { path: '/mi-codigo', element: <MyCode /> },
      { path: '/contactos', element: <Placeholder title="Contactos" /> },
      { path: '/ajustes', element: <Placeholder title="Ajustes" /> },
    ],
  },
  { path: '*', element: <Placeholder title="No encontrada" /> },
];

export const router = createBrowserRouter(routeTable);
