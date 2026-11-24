import { createBrowserRouter, type RouteObject } from 'react-router';
import { Landing } from '@/features/auth/Landing';
import { Register } from '@/features/auth/Register';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { MyCode } from '@/features/code/MyCode';
import { CompanyPage } from '@/features/company/CompanyPage';
import { Contacts } from '@/features/company/Contacts';
import { Settings } from '@/features/company/Settings';
import { Funds } from '@/features/funds/Funds';
import { Home } from '@/features/home/Home';
import { NewInvoice } from '@/features/invoices/new/NewInvoice';
import { PayableDetail } from '@/features/invoices/PayableDetail';
import { ReceivableDetail } from '@/features/invoices/ReceivableDetail';
import { NetworkPage } from '@/features/network/NetworkPage';
import { NewOffer } from '@/features/offers/NewOffer';
import { Receipt } from '@/features/offers/Receipt';
import { Placeholder } from './Placeholder';

export const routeTable: RouteObject[] = [
  { path: '/', element: <Landing /> },
  { path: '/registro', element: <Register /> },
  { path: '/e/:code', element: <CompanyPage /> },
  { path: '/red', element: <NetworkPage /> },
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
      { path: '/contactos', element: <Contacts /> },
      { path: '/ajustes', element: <Settings /> },
    ],
  },
  { path: '*', element: <Placeholder title="No encontrada" /> },
];

export const router = createBrowserRouter(routeTable);
