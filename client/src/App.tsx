import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./layouts/Layout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";

import WishlistDashboard from "./pages/WishlistDashboard";
import WishlistDetail from "./pages/WishlistDetail";
import SocialPage from "./pages/SocialPage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsSettingsPage from "./pages/NotificationsSettingsPage";
import FriendProfilePage from "./pages/FriendProfilePage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import PurchaseHistoryPage from "./pages/PurchaseHistoryPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import EmailVerification from "./pages/EmailVerification";
import ResetPassword from "./pages/ResetPassword";
import TermsOfUse from "./pages/TermsOfUse";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ApiDocsPage from "./pages/ApiDocsPage";
import ApiShowcasePage from "./pages/ApiShowcasePage";
import ChangelogPage from "./pages/ChangelogPage";
import { AuthProvider } from "./context/AuthContext";

import NotFound from "./pages/NotFound";
import OfflineBanner from "./components/OfflineBanner";

// Separate component to handle route changes
function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('config', 'G-3E3LMNH9JR', {
        page_path: location.pathname + location.search,
      });
      console.log(`[GA] Tracked page view: ${location.pathname}${location.search}`);
    }
  }, [location]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <AuthProvider>
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="terms" element={<TermsOfUse />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="verify-email" element={<EmailVerification />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="dashboard" element={<WishlistDashboard />} />
            <Route path="wishlists/:id" element={<WishlistDetail />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="api-docs" element={<ApiDocsPage />} />
            <Route path="api-showcase" element={<ApiShowcasePage />} />
            <Route path="changelog" element={<ChangelogPage />} />
            <Route path="settings/notifications" element={<NotificationsSettingsPage />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
            <Route path="purchase-history" element={<PurchaseHistoryPage />} />
            <Route path="users/:userId/wishlists" element={<WishlistDashboard />} />
            <Route path="users/:id/profile" element={<FriendProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
