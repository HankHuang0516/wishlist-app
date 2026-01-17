import { getUserLocale } from "../utils/localization";
import Header from "../components/Header";

export default function PrivacyPolicy() {
    const isZh = getUserLocale().startsWith('zh');

    if (isZh) {
        return (
            <div className="container mx-auto px-4 py-8 pb-24">
                <Header title="隱私權政策 (Privacy Policy)" />
                <div className="prose prose-slate max-w-none text-muji-secondary space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">1. 簡介</h2>
                        <p>
                            Wishlist.ai（以下簡稱「我們」）非常重視您的隱私。本隱私權政策說明我們如何收集、使用、揭露和保護您的個人資訊。
                            當您使用本服務時，即表示您同意本政策所述的資訊處理方式。
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">2. 我們收集的資訊</h2>
                        <p>我們可能收集以下類型的資訊：</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>帳戶資訊：</strong>當您註冊時，我們會收集您的電子郵件地址、使用者名稱和密碼（加密儲存）。</li>
                            <li><strong>使用數據：</strong>您在願望清單中儲存的商品連結、標題、價格等內容。</li>
                            <li><strong>設備與日誌資訊：</strong>您的 IP 地址、瀏覽器類型、訪問時間等系統日誌，用於維護系統安全與分析。</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">3. 資訊的使用</h2>
                        <p>我們使用收集的資訊來：</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li>提供、維護和改進我們的服務。</li>
                            <li>處理您的願望清單與商品資料抓取（可能使用第三方 AI 技術進行網頁內容分析）。</li>
                            <li>發送服務通知、更新或回應您的查詢。</li>
                            <li>防止欺詐與濫用行為。</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">4. 資訊的分享與揭露</h2>
                        <p>我們不會出售您的個人資訊。我們僅在以下情況下分享資訊：</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>服務供應商：</strong>我們可能與協助我們營運服務的第三方（如雲端託管、AI 分析服務）分享必要資訊，但他們受保密義務約束。</li>
                            <li><strong>法律要求：</strong>若法律要求或為了保護我們的權利、財產或安全，我們可能依法揭露資訊。</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">5. 資料安全</h2>
                        <p>
                            我們採取合理的技術和組織措施來保護您的資訊免受未經授權的訪問、使用或洩露。
                            然而，請注意，沒有任何網際網路傳輸或電子儲存方法是 100% 安全的。
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">6. Cookie 技術</h2>
                        <p>
                            我們使用 Cookie 和類似技術來識別您的登入狀態、記住您的偏好設定並分析使用流量。
                            您可以通過瀏覽器設定拒絕 Cookie，但這可能導致本服務部分功能無法正常運作。
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">7. 您的權利</h2>
                        <p>
                            您有權隨時訪問、更正或刪除您的個人資訊。
                            您可以通過帳戶設定進行操作，或聯繫我們要求協助刪除您的帳戶及相關數據。
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">8. 隱私權政策的變更</h2>
                        <p>
                            我們可能會不時更新本隱私權政策。更新後的版本將發佈在本頁面上。
                            建議您定期查閱本政策以了解最新的隱私保護措施。
                        </p>
                    </section>

                    <div className="pt-6 text-sm text-gray-500">
                        最後更新日期：2026-01-18
                    </div>
                </div>
            </div>
        );
    } else {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <h1 className="text-3xl font-bold mb-6 text-muji-primary">Privacy Policy</h1>
                <div className="prose prose-slate max-w-none text-muji-secondary space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">1. Introduction</h2>
                        <p>
                            Wishlist.ai ("we", "us", or "our") values your privacy. This Privacy Policy explains how we collect, use, disclose, and protect your personal information.
                            By using the Service, you agree to the information handling practices described in this policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">2. Information We Collect</h2>
                        <p>We may collect the following types of information:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Account Information:</strong> When you register, we collect your email address, username, and password (stored encrypted).</li>
                            <li><strong>Usage Data:</strong> The product links, titles, prices, and other content you save in your wishlists.</li>
                            <li><strong>Device & Log Information:</strong> Your IP address, browser type, visit time, and other system logs used for maintaining system security and analysis.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">3. Use of Information</h2>
                        <p>We use the collected information to:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li>Provide, maintain, and improve our services.</li>
                            <li>Process your wishlists and product data scraping (third-party AI technologies may be used for web content analysis).</li>
                            <li>Send service notifications, updates, or respond to your inquiries.</li>
                            <li>Prevent fraud and abusive behavior.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">4. Sharing and Disclosure</h2>
                        <p>We do not sell your personal information. We share information only under the following circumstances:</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Service Providers:</strong> We may share necessary information with third parties who assist us in operating the service (e.g., cloud hosting, AI analysis services), subject to confidentiality obligations.</li>
                            <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights, property, or safety.</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">5. Data Security</h2>
                        <p>
                            We implement reasonable technical and organizational measures to protect your information from unauthorized access, use, or disclosure.
                            However, please note that no method of transmission over the Internet or method of electronic storage is 100% secure.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">6. Cookies</h2>
                        <p>
                            We use Cookies and similar technologies to identify your login status, remember your preferences, and analyze usage traffic.
                            You can refuse Cookies through your browser settings, but this may cause some features of the Service to not function properly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">7. Your Rights</h2>
                        <p>
                            You have the right to access, correct, or delete your personal information at any time.
                            You can do this through your account settings or contact us to request assistance with deleting your account and related data.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">8. Changes to Privacy Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. The updated version will be posted on this page.
                            We encourage you to review this policy periodically to stay informed about our latest privacy protection measures.
                        </p>
                    </section>

                    <div className="pt-6 text-sm text-gray-500">
                        Last updated: 2026-01-18
                    </div>
                </div>
            </div>
        );
    }
}
