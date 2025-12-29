import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./layouts/Layout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";

import WishlistDashboard from "./pages/WishlistDashboard";
import WishlistDetail from "./pages/WishlistDetail";
import SocialPage from "./pages/SocialPage";
import SettingsPage from "./pages/SettingsPage";
import FriendProfilePage from "./pages/FriendProfilePage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import PurchaseHistoryPage from "./pages/PurchaseHistoryPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="dashboard" element={<WishlistDashboard />} />
            <Route path="wishlists/:id" element={<WishlistDetail />} />
            <Route path="social" element={<SocialPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
            <Route path="purchase-history" element={<PurchaseHistoryPage />} />
            <Route path="users/:userId/wishlists" element={<WishlistDashboard />} />
            <Route path="users/:id/profile" element={<FriendProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
