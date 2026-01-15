export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-6 text-muji-primary">隱私權政策 (Privacy Policy)</h1>
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
                    最後更新日期：{new Date().toISOString().split('T')[0]}
                </div>
            </div>
        </div>
    );
}
