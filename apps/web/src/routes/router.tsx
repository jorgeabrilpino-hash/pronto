import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { Connect } from '@/features/auth/Connect';
import { Register } from '@/features/auth/Register';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { TestAccount } from '@/features/auth/TestAccount';
import { Welcome } from '@/features/auth/Welcome';
import { MyCode } from '@/features/code/MyCode';
import { CompanyPage } from '@/features/company/CompanyPage';
import { Contacts } from '@/features/company/Contacts';
import { Settings } from '@/features/company/Settings';
import { Funds } from '@/features/funds/Funds';
import { Home } from '@/features/home/Home';
import { HowItWorks } from '@/features/info/HowItWorks';
import { NewInvoice } from '@/features/invoices/new/NewInvoice';
import { PayableDetail } from '@/features/invoices/PayableDetail';
import { ReceivableDetail } from '@/features/invoices/ReceivableDetail';
import { NetworkPage } from '@/features/network/NetworkPage';
import { NewOffer } from '@/features/offers/NewOffer';
import { Receipt } from '@/features/offers/Receipt';
import { Placeholder } from './Placeholder';

export const routeTable: RouteObject[] = [
  { path: '/', element: <Welcome /> },
  { path: '/registro', element: <Register /> },
  { path: '/entrar', element: <Connect /> },
  { path: '/cuenta-prueba', element: <TestAccount /> },
  { path: '/como-funciona', element: <HowItWorks /> },
  { path: '/e/:code', element: <CompanyPage /> },
  { path: '/red', element: <NetworkPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/fondos', element: <Funds /> },
      { path: '/app', element: <Home /> },
      { path: '/facturas', element: <Placeholder title="Facturas" root /> },
      { path: '/actividad', element: <Placeholder title="Actividad" root /> },
      { path: '/perfil', element: <Settings /> },
      { path: '/facturas/nueva', element: <NewInvoice /> },
      { path: '/cobrar/:id', element: <ReceivableDetail /> },
      { path: '/pagar/:id', element: <PayableDetail /> },
      { path: '/pagar/:id/oferta', element: <NewOffer /> },
      { path: '/comprobante/:offerId', element: <Receipt /> },
      { path: '/mi-codigo', element: <MyCode /> },
      { path: '/contactos', element: <Contacts /> },
      { path: '/ajustes', element: <Navigate to="/perfil" replace /> },
    ],
  },
  { path: '*', element: <Placeholder title="No encontrada" /> },
];

export const router = createBrowserRouter(routeTable);
