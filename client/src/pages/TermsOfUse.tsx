// import { t } from "../utils/localization";

export default function TermsOfUse() {
    return (
        <div className="max-w-4xl mx-auto py-8">
            <h1 className="text-3xl font-bold mb-6 text-muji-primary">使用者條款 (Terms of Use)</h1>
            <div className="prose prose-slate max-w-none text-muji-secondary space-y-6">
                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">1. 同意條款</h2>
                    <p>
                        歡迎使用 Wishlist.ai（以下簡稱「本服務」）。本服務由 Wishlist.ai 團隊（以下簡稱「我們」）提供。
                        當您訪問或使用本服務時，即表示您已閱讀、理解並同意受本使用者條款（以下簡稱「本條款」）的約束。
                        如果您不同意本條款的任何部分，請勿使用本服務。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">2. 服務內容</h2>
                    <p>
                        Wishlist.ai 提供一個跨平台的願望清單管理工具，允許使用者儲存、管理和分享來自不同電子商務網站的商品連結。
                        我們致力於利用 AI 技術優化您的購物整理體驗。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">3. 使用者帳戶與安全</h2>
                    <p>
                        為了使用本服務的特定功能，您可能需要註冊帳戶。您同意提供真實、準確且完整的個人資料。
                        您有責任維護您帳戶密碼的機密性，並對您帳戶下的所有活動負責。
                        若發現帳戶有任何未經授權的使用，請立即通知我們。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">4. 使用者規範</h2>
                    <p>使用本服務時，您承諾絕不從事以下行為：</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>上傳、張貼或傳輸任何非法、有害、威脅、辱罵、騷擾、侵害他人隱私或智慧財產權的內容。</li>
                        <li>干擾或破壞本服務的運作、伺服器或網路。</li>
                        <li>試圖未經授權存取本服務的任何部分。</li>
                        <li>使用本服務進行任何違反法律法規的活動。</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">5. 智慧財產權</h2>
                    <p>
                        本服務及其原始內容（不包括使用者提供的內容）、功能和設計均為 Wishlist.ai 及其授權人的財產，
                        受著作權、商標和其他智慧財產權法律的保護。
                    </p>
                    <p className="mt-2">
                        您在願望清單中儲存的商品連結及相關公開資訊（如商品圖片、標題），其原始智慧財產權歸屬於原購物網站或原作者。
                        本服務僅為了便利使用者整理而進行合理的索引與展示。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">6. 免責聲明</h2>
                    <p>
                        本服務按「現狀」和「現有」基礎提供。我們不對服務的可用性、準確性、可靠性或特定用途的適用性作出的任何保證。
                        對於因使用或無法使用本服務而導致的任何直接、間接、附帶或後果性損害，我們概不負責。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">7. 條款修改</h2>
                    <p>
                        我們保留隨時修改本條款的權利。修改後的條款將公佈於本頁面。
                        您在條款修改後繼續使用本服務，即視為您已接受修改後的條款。
                    </p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-3 text-muji-primary">8. 聯絡我們</h2>
                    <p>
                        如果您對本條款有任何疑問，請透過本服務內的「意見回饋」功能或相關聯絡方式與我們聯繫。
                    </p>
                </section>

                <div className="pt-6 text-sm text-gray-500">
                    最後更新日期：{new Date().toISOString().split('T')[0]}
                </div>
            </div>
        </div>
    );
}
