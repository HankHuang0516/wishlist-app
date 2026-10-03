import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./layouts/Layout";
import { AuthProvider } from "./context/AuthContext";
import OfflineBanner from "./components/OfflineBanner";
import { createLazyPage } from "./components/LazyPage";
import { Analytics } from "./utils/analytics";
import WebUpdateProvider from './context/WebUpdateContext';
import WebAppInstallProvider from './context/WebAppInstallContext';

const SourceLeadMapPage = createLazyPage(() => import('./pages/SourceLeadMapPage'));
const Home = createLazyPage(() => import('./pages/Home'));
const Login = createLazyPage(() => import('./pages/Login'));
const Register = createLazyPage(() => import('./pages/Register'));
const WishlistDashboard = createLazyPage(() => import('./pages/WishlistDashboard'));
const WishlistDetail = createLazyPage(() => import('./pages/WishlistDetail'));
const SocialPage = createLazyPage(() => import('./pages/SocialPage'));
const SettingsPage = createLazyPage(() => import('./pages/SettingsPage'));
const NotificationsSettingsPage = createLazyPage(() => import('./pages/NotificationsSettingsPage'));
const FriendProfilePage = createLazyPage(() => import('./pages/FriendProfilePage'));
const ChangePasswordPage = createLazyPage(() => import('./pages/ChangePasswordPage'));
const PurchaseHistoryPage = createLazyPage(() => import('./pages/PurchaseHistoryPage'));
const ForgotPasswordPage = createLazyPage(() => import('./pages/ForgotPasswordPage'));
const ResendVerification = createLazyPage(() => import('./pages/ResendVerification'));
const EmailVerification = createLazyPage(() => import('./pages/EmailVerification'));
const ResetPassword = createLazyPage(() => import('./pages/ResetPassword'));
const TermsOfUse = createLazyPage(() => import('./pages/TermsOfUse'));
const PrivacyPolicy = createLazyPage(() => import('./pages/PrivacyPolicy'));
const SupportPage = createLazyPage(() => import('./pages/SupportPage'));
const PartnerInquiryPage = createLazyPage(() => import('./pages/PartnerInquiryPage'));
const PartnerPage = createLazyPage(() => import('./pages/PartnerPage'));
const ApiDocsPage = createLazyPage(() => import('./pages/ApiDocsPage'));
const ApiShowcasePage = createLazyPage(() => import('./pages/ApiShowcasePage'));
const ChangelogPage = createLazyPage(() => import('./pages/ChangelogPage'));
const ListingBatchPage = createLazyPage(() => import('./pages/ListingBatchPage'));
const PublicListingPage = createLazyPage(() => import('./pages/PublicListingPage'));
const AccountDeletionPage = createLazyPage(() => import('./pages/AccountDeletionPage'));
const MyListingsPage = createLazyPage(() => import('./pages/MyListingsPage'));
const ExplorePage = createLazyPage(() => import('./pages/ExplorePage'));
const ListingReportsPage = createLazyPage(() => import('./pages/ListingReportsPage'));
const ChatPage = createLazyPage(() => import('./pages/ChatPage'));
const WishesPage = createLazyPage(() => import('./pages/WishesPage'));
const NotFound = createLazyPage(() => import('./pages/NotFound'));

// Separate component to handle route changes
function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    Analytics.logPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <RouteTracker />
      <WebAppInstallProvider><WebUpdateProvider><AuthProvider>
        <OfflineBanner />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="terms" element={<TermsOfUse />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="partners/inquiry" element={<PartnerInquiryPage />} />
            <Route path="partners" element={<PartnerPage />} />
            <Route path="account-deletion" element={<AccountDeletionPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="resend-verification" element={<ResendVerification />} />
            <Route path="verify-email" element={<EmailVerification />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="dashboard" element={<WishlistDashboard />} />
            <Route path="wishes" element={<WishesPage />} />
            <Route path="source-leads" element={<SourceLeadMapPage />} />
            <Route path="sell" element={<ListingBatchPage />} />
            <Route path="my-listings" element={<MyListingsPage />} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="reports" element={<ListingReportsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="listings/:id" element={<PublicListingPage />} />
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
      </AuthProvider></WebUpdateProvider></WebAppInstallProvider>
    </BrowserRouter>
  );
}

export default App;
