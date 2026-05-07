// Deploy pipeline test - Claude Code only - May 5 2026
import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { OrgRoleProvider } from "@/hooks/useOrgRole";
import RootRedirect from "./components/RootRedirect";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLoading from "./components/PageLoading";
import { useOrgRole } from "./hooks/useOrgRole";

// Lazy load page components
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const MasterCalendar = lazy(() => import("./pages/MasterCalendar"));
const BullList = lazy(() => import("./pages/BullList"));

const BullChat = lazy(() => import("./pages/BullChat"));
const SemenOrderDetail = lazy(() => import("./pages/SemenOrderDetail"));
const Billable = lazy(() => import("./pages/Billable"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const Companies = lazy(() => import("./pages/Companies"));
const ReInventory = lazy(() => import("./pages/ReInventory"));
const TankDetail = lazy(() => import("./pages/TankDetail"));

const ReceiveShipment = lazy(() => import("./pages/ReceiveShipment"));
const ReceiveShipmentPreview = lazy(() => import("./pages/ReceiveShipmentPreview"));
const OperationsDashboard = lazy(() => import("./pages/OperationsDashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const PackTank = lazy(() => import("./pages/PackTank"));
const PackDetail = lazy(() => import("./pages/PackDetail"));
const UnpackTank = lazy(() => import("./pages/UnpackTank"));
const ProjectBilling = lazy(() => import("./pages/ProjectBilling"));
const ImportBulls = lazy(() => import("./pages/admin/ImportBulls"));
const Planning = lazy(() => import("./pages/Planning"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    }
  }
});

// AdminRoute: Checks both authentication and admin role
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useOrgRole();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)" }}
      >
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (role !== "admin" && role !== "owner") {
    return <Navigate to="/operations?tab=projects" replace />;
  }

  return <ProtectedRoute>{children}</ProtectedRoute>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OrgRoleProvider>
          <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                {/* Public routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/accept-invite" element={<AcceptInvite />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />

                {/* Root: public landing or redirect to dashboard */}
                <Route path="/" element={<RootRedirect />} />

                {/* Protected routes */}
                <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                <Route path="/operations" element={<ProtectedRoute><OperationsDashboard /></ProtectedRoute>} />
                <Route path="/project/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
                <Route path="/project/:id/billing" element={<ProtectedRoute><ProjectBilling /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><MasterCalendar /></ProtectedRoute>} />
                <Route path="/bulls" element={<ProtectedRoute><BullList /></ProtectedRoute>} />
                <Route path="/semen-orders/:id" element={<ProtectedRoute><SemenOrderDetail /></ProtectedRoute>} />
                <Route path="/billable" element={<ProtectedRoute><Billable /></ProtectedRoute>} />
                <Route path="/bull-report" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/chat" element={<ProtectedRoute><BullChat /></ProtectedRoute>} />
                <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
                <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
                <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
                <Route path="/tanks" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/tanks/:id" element={<ProtectedRoute><TankDetail /></ProtectedRoute>} />
                <Route path="/tanks/:tankId/reinventory" element={<ProtectedRoute><ReInventory /></ProtectedRoute>} />
                <Route path="/tank-fills" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/tanks-out" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/semen-inventory" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/receive-shipment" element={<ProtectedRoute><ReceiveShipment /></ProtectedRoute>} />
                <Route path="/receive-shipment/preview/:id" element={<ProtectedRoute><ReceiveShipmentPreview /></ProtectedRoute>} />
                <Route path="/receive-shipment/:id" element={<ProtectedRoute><ReceiveShipment /></ProtectedRoute>} />
                <Route path="/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />
                <Route path="/pack-tank" element={<ProtectedRoute><PackTank /></ProtectedRoute>} />
                <Route path="/pack/:id" element={<ProtectedRoute><PackDetail /></ProtectedRoute>} />
                <Route path="/unpack/:packId" element={<ProtectedRoute><UnpackTank /></ProtectedRoute>} />
                <Route path="/admin/import-bulls" element={<AdminRoute><ImportBulls /></AdminRoute>} />
                <Route path="/planning" element={<ProtectedRoute><Planning /></ProtectedRoute>} />

                {/* Redirects */}
                <Route path="/dashboard" element={<Navigate to="/operations?tab=projects" replace />} />
                <Route path="/inventory-hub" element={<Navigate to="/operations" replace />} />
                <Route path="/inventory-dashboard" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/tanks-dashboard" element={<Navigate to="/operations?tab=inventory" replace />} />
                <Route path="/packs" element={<Navigate to="/operations?tab=projects" replace />} />
                <Route path="/unpacks" element={<Navigate to="/operations?tab=projects" replace />} />
                <Route path="/shipments" element={<Navigate to="/operations?tab=orders" replace />} />
                <Route path="/inventory-log" element={<Navigate to="/operations?tab=log" replace />} />
                <Route path="/semen-orders" element={<Navigate to="/operations?tab=orders" replace />} />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </OrgRoleProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
