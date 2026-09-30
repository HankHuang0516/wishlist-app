import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/Button";
import { getUserLocale } from "../utils/localization";

export default function PrivacyPolicy() {
    const isZh = getUserLocale().startsWith("zh");
    const navigate = useNavigate();

    return (
        <div className="container mx-auto px-4 py-8 pb-24">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b mb-6 px-4 py-3 flex items-center shadow-sm">
                <Button variant="ghost" className="p-0 mr-4 h-auto hover:bg-transparent" onClick={() => navigate(-1)}>
                    <ArrowLeft className="w-6 h-6 text-gray-600" />
                </Button>
                <h1 className="text-lg font-bold text-muji-primary truncate">{isZh ? "隱私權政策" : "Privacy Policy"}</h1>
            </div>
            {isZh ? (
                <div className="prose prose-slate max-w-none text-muji-secondary space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">1. 適用範圍</h2>
                        <p>本政策說明 Wishlist.ai 網頁與 iOS、Android App 如何處理您使用願望清單、商品刊登、探索地圖及買賣聊天時的資料。您可以選擇不提供非必要資訊；部分功能需要帳號或您主動提供的內容才能運作。</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">2. 我們處理的資料</h2>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>帳號與個人資料：</strong>註冊及使用服務所需的手機號碼、密碼，以及您選填的姓名、電子郵件、地址、生日、頭像與個人資料可見性設定。密碼以雜湊方式儲存，不以明文保存。</li>
                            <li><strong>您建立的內容：</strong>願望、商品名稱與價格、描述、連結、上傳或拍攝的照片、刊登地點、聊天訊息、面交安排，以及檢舉或客服內容。</li>
                            <li><strong>位置：</strong>您可手動設定地區，或選擇授予使用期間的定位權限來找附近商品。公開地圖上的商品位置採概略座標；面交地點僅提供相關對話參與者查看，不作為公開地圖標記。</li>
                            <li><strong>技術與分析資料：</strong>為登入、安全、除錯與維運所需的 IP 位址、裝置／瀏覽器資訊、使用時間及服務日誌。網頁使用 Cookie 或本機儲存空間保持登入與設定，並透過 Google Analytics 分析頁面瀏覽及功能使用情形。</li>
                        </ul>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">3. 使用目的與 AI 處理</h2>
                        <p>我們使用上述資料提供帳號、願望比對、商品搜尋與地圖、刊登管理、聊天與面交安排、客服、安全防濫用及服務維運。當您使用圖片辨識或商品文案等 AI 功能時，相關照片與您提供的商品資訊可能交由 AI 處理服務分析，以產生建議；AI 結果可能有誤，刊登前請自行核對。</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">4. 公開範圍與服務供應商</h2>
                        <p>您刊登的商品資訊、照片及概略地圖位置會提供其他使用者瀏覽或分享。願望及個人資料依服務功能與您的可見性設定顯示；聊天與面交詳情不會作為公開刊登內容。我們不出售個人資料。為營運服務，必要資料可能由雲端託管、照片儲存（包括 Flickr）、AI 處理及其他技術供應商處理；依法要求或保護服務安全時亦可能揭露必要資料。請勿上傳不願分享或未取得權利的照片與個人資訊。</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">5. 權限與安全</h2>
                        <p>相機、照片選取和定位由您在使用相關功能時選擇授權；拒絕定位後仍可手動選擇地區。我們採取合理的安全措施，但網路傳輸及電子儲存無法保證絕對安全。</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">6. 保存、刪除與您的選擇</h2>
                        <p>資料在提供服務、安全與法律所需期間保存。您可以編輯或刪除自己的內容，並透過帳號設定或網頁提出刪除帳號要求。刪除後，資料庫內容與照片等外部儲存資產可能分階段清除；備份、安全紀錄及依法必須保存的資料可能在必要期間保留。其他對話參與者自己發送的訊息不會因您刪除帳號而一併刪除。</p>
                        <p><Link to="/account-deletion" className="underline">在網頁提出刪除帳號與相關資料的要求</Link>（不需重新安裝 App）。</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">7. 聯絡與政策更新</h2>
                        <p>若對資料處理、存取、更正或刪除有疑問，請透過<Link to="/support" className="underline">支援頁面</Link>聯絡我們。政策更新會公布於本頁，請定期查看。</p>
                    </section>
                    <div className="pt-6 text-sm text-gray-500">最後更新日期：2026-09-30</div>
                </div>
            ) : (
                <div className="prose prose-slate max-w-none text-muji-secondary space-y-6">
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">1. Scope</h2>
                        <p>This policy explains how the Wishlist.ai website and iOS and Android apps handle data when you use wishlists, listings, the discovery map, and buyer-seller chat. You may choose not to provide optional information; some features require an account or content you submit.</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">2. Data we process</h2>
                        <ul className="list-disc pl-5 mt-2 space-y-1">
                            <li><strong>Account and profile:</strong> Your phone number and password for registration and use, plus any name, email address, address, birthday, avatar, and profile visibility settings you choose to provide. Passwords are stored as hashes, not plaintext.</li>
                            <li><strong>Content you create:</strong> Wishes, listing titles and prices, descriptions, links, uploaded or captured photos, listing locations, chat messages, meetup arrangements, reports, and support requests.</li>
                            <li><strong>Location:</strong> You may select an area manually or optionally allow location access while using the app to find nearby items. Public map listings use approximate coordinates. Meetup locations are visible only to the relevant conversation participants, not as public map markers.</li>
                            <li><strong>Technical and analytics data:</strong> IP address, device/browser information, access times, and service logs needed for sign-in, security, troubleshooting, and operations. The website uses cookies or local storage for sign-in and preferences, and Google Analytics to analyze page views and feature use.</li>
                        </ul>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">3. Purposes and AI processing</h2>
                        <p>We use this data to provide accounts, wish matching, product search and maps, listing management, chat and meetup coordination, support, abuse prevention, and service operations. If you use image recognition or AI listing-copy features, relevant photos and product information you submit may be processed by AI service providers to generate suggestions. AI results can be wrong; please review them before publishing a listing.</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">4. Visibility and service providers</h2>
                        <p>Your published listings, photos, and approximate map locations may be viewed or shared by other users. Wishes and profile details appear according to service features and your visibility settings; chats and meetup details are not public listings. We do not sell personal data. Necessary data may be processed by cloud hosting, photo storage (including Flickr), AI processing, and other technical service providers. We may also disclose necessary data when required by law or to protect the service. Do not upload photos or personal information you lack the right to share.</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">5. Permissions and security</h2>
                        <p>You choose whether to allow camera, photo selection, and location access when using those features. If you decline location access, you can still select an area manually. We use reasonable safeguards, but no online transmission or electronic storage is completely secure.</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">6. Retention, deletion, and your choices</h2>
                        <p>We retain data for the time needed to provide the service, maintain safety, and meet legal obligations. You can edit or remove your content and request account deletion in account settings or on the website. Database content and externally stored photos may be removed in stages; backups, safety records, and legally required data may remain for the necessary period. Deleting your account does not delete messages sent by other conversation participants.</p>
                        <p><Link to="/account-deletion" className="underline">Request deletion of your account and related data on the web</Link> without reinstalling the app.</p>
                    </section>
                    <section>
                        <h2 className="text-xl font-semibold mb-3 text-muji-primary">7. Contact and updates</h2>
                        <p>For questions about processing, access, correction, or deletion, contact us through the <Link to="/support" className="underline">support page</Link>. Updates to this policy will be posted here; please review it periodically.</p>
                    </section>
                    <div className="pt-6 text-sm text-gray-500">Last updated: 2026-09-30</div>
                </div>
            )}
        </div>
    );
}
